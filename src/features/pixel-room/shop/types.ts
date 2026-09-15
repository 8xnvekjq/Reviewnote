// Pixel World Phase 1 — 공유 계약(Contract). 3개 Worker(Economy/Avatar/Shop UX)가 전부 이 파일의
// 타입을 그대로 import해서 쓴다 — 각자 다른 PixelItem 모양을 새로 만들지 않는다. 이 파일 자체는
// Integration Lead(메인 Claude)가 소유한다: 공유 타입을 바꿔야 하면 여기를 고쳐서 전체에 다시
// 전달하고, Worker가 임의로 이 파일을 고치지 않는다(단, Worker A는 카탈로그 상수 파일은 소유함 —
// 아래 PIXEL_CATALOG 참고).

export type PixelItemCategory = 'avatar' | 'furniture';

// 아바타 아이템의 슬롯 — 기존 sprites.tsx의 레이어 키와 1:1 대응(furniture는 슬롯 개념이 없으므로
// 별도 카테고리로 취급). 'top'은 기존 model.ts의 SHIRTS를 대체/확장하는 개념이다.
export type PixelAvatarSlot = 'top' | 'bottom' | 'shoes' | 'hair' | 'eyes';

// 렌더링(sprites.tsx)이 실제로 행을 선택하는 레이어 키 — PixelAvatarSlot(상점에서 파는 장착
// 슬롯) + 'skin'. 피부색은 구매/소유 대상이 아닌 무료 기본 appearance라 PixelItem/카탈로그에는
// 전혀 등장하지 않지만, "assetKey 문자열 -> 아틀라스 행" 조회 매커니즘은 다른 슬롯과 완전히
// 동일하게 재사용한다(appearanceRows.ts의 AVATAR_ROW_BY_SLOT에 'skin' 항목을 추가하는 식).
export type AppearanceLayerKey = PixelAvatarSlot | 'skin';

export interface PixelItem {
  itemId: string;         // 안정적인 카탈로그 키, 예: 'top_sage', 'furniture_bed'. 절대 재사용/변경 금지(구매 기록의 외래키가 됨)
  category: PixelItemCategory;
  slot: PixelAvatarSlot | 'furniture';
  price: number;          // 화면 표시용. 실제 가격 판정은 항상 서버(구매 RPC)가 카탈로그에서 직접 조회 — 클라이언트는 price를 파라미터로 넘기지 않는다
  assetKey: string;       // avatar: 기존 sprite row 선택 키(예: model.ts의 SHIRTS 값과 동일한 문자열). furniture: 기존 FurnitureType 문자열
  displayName: string;    // 학생에게 보이는 한글 이름
  tier: 1 | 2 | 3;        // 가격대 표시/정렬용(1=공용가, 2=중가, 3=목표가) — UI가 굳이 구분해서 보여줄 필요는 없음, 정렬 키 정도로만 사용
  stackable: false;       // v1에는 전부 false(1인당 1개만 소유). 나중에 필요해지면 타입을 넓힌다 — 지금 미리 만들지 않는다
}

// 서버에 저장되는 "무엇을 장착했는가/어떤 기본 외형인가" — 다른 학생/향후 광장이 읽게 될 공개
// 데이터. 닉네임/이메일/username 등 개인식별정보는 절대 포함하지 않는다 — userId로만 join해서 쓴다.
//
// top/bottom/shoes/hair: 장착 아이템(구매·소유 필요) — item_id를 카탈로그의 assetKey로 변환한 값.
// skin/eyes: 무료 기본 appearance(구매·소유 개념 없음, 가격·희귀도 없음) — pixel_avatar_equipment의
// skin_tone/eye_color 컬럼 값을 그대로 담는다(카탈로그 조회 없이 pass-through). eyes는 예전엔
// "장착 가능하지만 아무도 안 파는" 슬롯이었는데, 실제로 판 적이 없어 의미를 그대로 재사용했다 —
// 서버 pixel_avatar_equipment.eyes(구식, FK로 item_id만 허용) 컬럼과는 별개로 새 eye_color
// 컬럼에서 값을 가져온다.
export interface PublicAvatarAppearance {
  top: string | null;     // assetKey 또는 null(기본값)
  bottom: string | null;
  shoes: string | null;
  hair: string | null;
  eyes: string | null;    // 무료 눈동자색 키(예: 'sky') 또는 null(기본값 navy)
  skin: string | null;    // 무료 피부색 키(예: 'porcelain') 또는 null(기본값 tan)
}

// 구매 RPC 응답 모양(정확한 RPC 이름/파라미터는 Worker A가 구현하되, 반환 모양은 이 shape를 따른다)
export type PurchasePixelItemResult =
  | { ok: true; itemId: string; newBalance: number }
  | { ok: false; reason: 'insufficient_balance' | 'already_owned' | 'not_found' | 'unknown'; message: string };
