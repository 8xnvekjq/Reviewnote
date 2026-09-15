# Pixel World Phase 1 콘텐츠 보강 — PR #71

2026-09-14. 기존 CC0 PNG만 사용. 외부 에셋·새 그림·의존성·DB 스키마 변경 없음.
라이선스와 원본은 [기존 에셋 문서](pixel-room-assets.md)에 기록되어 있다.

## 실제 에셋 감사

캐릭터 46개 PNG 및 interior/decorations/walls atlas 3개를 조사했다.
Front의 모든 변형을 기본 캐릭터와 합성해 확대 확인하고, 선정한 10개 아바타 상품은
Walk 4방향 × 4프레임 = 160개 합성으로 위치·비어 있는 레이어 여부를 검증했다.
Idle/Walk는 같은 32×32 프레임, 같은 행 인덱스를 사용한다.

- tops 29행: 단색 티셔츠 외에 넥타이, 줄무늬, 리본, 조끼, 민소매가 실제로 있다.
  **이전 코드 주석의 “0–20행은 모두 색상만 다름”은 잘못된 분류였다.**
- bottoms 14행: 기본 반바지형 외에 8행부터 긴 바지 형태.
- shoes 10행: 5색 × 두 실루엣. 차이가 작아서 저가 상품 하나만 선정했다.
- hair 25행: 5스타일 × 5색. 기본 스타일 외 4스타일을 같은 갈색으로 선정해 형태 차이를 강조했다.
- eyes 4행과 body 5행은 각각 눈 색·피부색 차이다. 상품 수를 늘리기 위해 판매하지 않았다.
- **모자·안경은 저장된 캐릭터 에셋에 없다. 구현하거나 판매하지 않았다.**

## 추가 아바타 상품 10개

| 상품 | slot / assetKey | 원본 행(0부터) | 가격 |
|---|---|---:|---:|
| 동글 양갈래 번 | hair / buns | 5 | 150P |
| 차분한 단발 | hair / bob | 10 | 120P |
| 찰랑 긴 머리 | hair / long | 15 | 180P |
| 옆으로 넘긴 머리 | hair / swept | 20 | 120P |
| 단정한 넥타이 셔츠 | top / necktie | 8 | 80P |
| 마린 스트라이프 | top / stripe | 11 | 80P |
| 브라운 니트 조끼 | top / vest | 17 | 120P |
| 시원한 민소매 | top / sleeveless | 25 | 50P |
| 일자 데님 팬츠 | bottom / denim | 8 | 80P |
| 블랙 로우 슈즈 | shoes / low | 7 | 30P |

기존 top_sage/top_blue는 구매 기록과 연결된 ID·외형을 유지하고 각각 25P로 조정했다.
최종 아바타 상품 12개. 기본 무료 착장은 상품 수에서 제외한다.

## 추가 가구 6개

모두 `assets/interior/source-17655392.png`의 미사용 영역이다.
가구 이름은 그림을 보고 붙인 앱 표시명이며, 원작자가 제공한 개별 이름 메타데이터는 없다.

| 가구 | x,y,w,h (원본 pixel) | 바닥 점유 | 가격 |
|---|---|---|---:|
| 레이스 원형 테이블 | 48,0,48,32 | 3×2 | 150P |
| 레트로 TV 장식장 | 192,48,32,32 | 2×1 | 200P |
| 작은 바다 수조 | 161,160,47,32 | 3×1 | 600P |
| 여행자의 지구본 | 80,176,16,32 | 1×1 | 120P |
| 키 큰 초록 식물 | 192,112,16,48 | 1×1 | 80P |
| 격자 갓 스탠드 | 208,128,16,32 | 1×1 | 100P |

수조는 옆 커튼의 끝 픽셀을 제외했으며, 지구본은 나란한 색상 변형 중 하나만 표시한다.
큰 수조만 600P 목표 상품으로 지정했다. 기존 가구는 화분25/칠판40/의자50/책장80/책상120/침대200P.
최종 가구 12개, 전체 **24개 상품**. 기존 구매자의 ownership/price_paid는 변경하지 않는다.

## UI / 저장

- 색상칩 대신 현재 장착에 해당 상품을 합성한 실제 미리보기. 헤어·상의·하의·신발·가구 분류.
- 옷장에서 부위별 기본 착장/보유 상품 선택과 앞·뒷모습 확인. 이름·칭호 방 안 표시는 제거했다.
  기존 칭호 데이터와 다른 화면의 칭호 시스템은 유지한다.
- purchase_pixel_item → equip_pixel_item → 서버 장착 재조회 → PublicAvatarAppearance 렌더.
  네트워크 확인 전 낙관적 외형을 저장하지 않는다. 구매/장착 중 중복 입력을 잠근다.
- 기존 서버 top/bottom/shoes/hair/eyes 슬롯 사용. 새 public appearance 형식이나 프로필은 만들지 않았다.
- ownership/equipment/가격은 서버. x/y 배치만 계정별 localStorage. 보유하지 않은 로컬 가구는
  렌더·이동 충돌·재배치 권한을 만들지 않는다. 코드가 지원하지 않는 서버 상품은 표시하지 않는다.
- 코드/이미지의 기존 lazy 경계를 유지한다. 새 PNG나 게임 엔진을 추가하지 않았다.

## 서버 반영 및 관리자 지급

ReviewNote 프로젝트 `wcvkmdvrowljypueucwx`에 데이터 마이그레이션 2개 적용:

- `20260913150704_pixel_world_visual_catalog`: 24개 카탈로그 upsert.
- `20260913150710_pixel_world_admin_preview_credit`: private.app_admins에 등록된 지정 관리자
  한 명의 profiles.point_adjustment에 +1000. 변경 행 1개를 강제하며 마이그레이션 이력으로 재실행을 차단.

확인된 관리자 잔액: bonus_points 39, point_adjustment -1→999, **38P→1038P**.
다른 학생 행에 대한 UPDATE는 없다. 테스트 구매는 롤백하므로 이 지급액을 소비하지 않는다.

## 검증과 재현

- `node --experimental-strip-types --test tests/pixelShop/*.test.ts tests/pixel-room/model.test.ts`: 19개 통과.
- `tests/pixelShop/server-roundtrip.sql`: 실제 DB/RPC에서 24개 상품 구매, 중복 무차감,
  아바타 부위별 장착 저장, 다른 슬롯 거부, 직접 장착 UPDATE 거부를 확인. 전부 ROLLBACK.
  RLS가 0행 UPDATE로 거부하는 경우도 검사한다.
- `tests/pixelShop/browser.mjs`: 실제 React 컴포넌트 + 명시적인 REST 테스트 응답으로
  390×844, 800×1280, 1440×1000에서 4부위 구매·장착·새로고침 유지, 새 가구 6개 구매·배치·복원,
  A/B 분리, 이름판 제거, 가로 overflow 없음, 종료 후 오답노트 복귀 확인.
  이것은 실제 로그인한 학생 브라우저 테스트가 아니며, 서버 동작은 위 SQL로 별도 검증했다.
- `npx tsc -b`, `npm run build`, 변경 TS/TSX/MJS 파일 oxlint 검사.

브라우저 실행: Vite를 127.0.0.1:5174에서 실행하고 설치된 Playwright 경로를 PLAYWRIGHT_PATH로 지정한 뒤
`node --experimental-strip-types tests/pixelShop/browser.mjs` 실행. UI_OUTPUT으로 스크린샷 폴더 지정 가능.
테스트용 잔액은 로컬 fixture의 `testBalance` 쿼리에서만 사용하며 프로덕션 앱에는 포함되지 않는다.

PR은 OPEN으로 유지한다. merge/production deploy는 실행하지 않는다.

## 후속 작업 — 전체 오픈 + 아바타 확장 + 가구 서버 저장 (2026-09-15)

### 1. 전체 학생 오픈

`App.tsx`의 `canAccessPixelWorld`가 `isAdmin || email이 test로 시작` 조건으로 admin/test 계정만
들여보내던 것을 제거하고 `true`로 열었다. 로그인 여부 자체는 이 플래그와 별개로 호출부
(BottomNavigation의 `currentUserId`, Screen의 `session?.user?.id`)가 계속 각자 확인한다.
DB 쪽에는 애초에 admin/test 전용 제한이 없었다(RLS는 전부 `auth.uid() = user_id`) — 클라이언트
게이트 하나만 막고 있었다.

### 2. 아바타 아이템 15개 추가 (12개 → 39개)

기존 감사(위 "실제 에셋 감사" 절)에서 이미 찾아 둔, 아직 안 판 행만 새로 썼다 — 새 PNG 없음.

| 상품 | slot / assetKey | 원본 행 | 가격 | 비고 |
|---|---|---:|---:|---|
| 레드/블루/블랙 리본 블라우스 | top / ribbon_red,blue,black | 14,15,16 | 90P | 기존에 전혀 안 팔던 새 실루엣(위 감사의 "리본") |
| 블랙 니트 조끼 | top / vest_black | 19 | 120P | 기존 브라운 조끼(17)와 다른 색상 |
| 블루/블랙 반바지 | bottom / shorts_blue,black | 2,4 | 45P | 기존엔 긴바지형(데님) 하나뿐 — 반바지 실루엣 신규(0행은 미장착 기본값이라 제외) |
| 블랙 슬랙스 | bottom / pants_black | 10 | 80P | 기존 데님과 같은 실루엣, 대비 색상 1개 |
| 블론드/블랙 양갈래 번 | hair / buns_blonde,black | 7,8 | 150P | |
| 블론드/블랙 단발 | hair / bob_blonde,black | 12,13 | 120P | |
| 블론드/블랙 긴 머리 | hair / long_blonde,black | 17,18 | 180P | |
| 블론드/블랙 옆머리 | hair / swept_blonde,black | 22,23 | 120P | |

헤어 4스타일(번/단발/긴머리/옆머리)이 전부 같은 갈색 한 색으로만 팔리고 있었다 — 스타일을
구매해도 색은 다 똑같아 보이는 게 "서로 구분이 잘 안 됨"의 큰 원인이라 형태별로 대비가 큰
블론드/블랙 두 색만 추가했다(5색 전부는 카탈로그를 과하게 불릴 수 있어 넣지 않음). 신발(10행,
5색×2실루엣, 차이가 작음)과 눈동자(4행)는 이전 감사에서와 같은 이유로 — 실루엣 차이가 거의
없는 단순 색상 증식이라 — 이번에도 판매 목록에 넣지 않았다. 모자·안경은 여전히 저장된 캐릭터
에셋에 없다.

서버: `20260915010000_pixel_world_avatar_variants` — 15개 upsert, client `catalog.ts`와
item_id/slot/asset_key 완전히 일치(usePixelShop.ts가 이 3개로 서버 카탈로그를 필터링).

### 3. 가구 배치 서버 저장

기존엔 가구 구매(`pixel_item_ownership`)만 서버에 있고 방 안 x/y 배치는 계정별 localStorage뿐이라
다른 기기에서 접속하면 사라졌다. 새 테이블/RPC로 옮겼다:

- `pixel_furniture_placement(user_id, item_id, x, y, updated_at)` — PK `(user_id, item_id)`,
  `item_id`는 `pixel_item_catalog(item_id)` FK. SELECT RLS는 본인 또는 관리자만(다른 학생 방을
  구경하는 기능이 없어 공개하지 않음). 기존 `pixel_avatar_equipment`/`pixel_item_ownership`와
  동일하게 `private.guard_pixel_direct_write()` 트리거로 RPC를 거치지 않은 직접 쓰기를 막는다.
- `save_pixel_room_layout(p_placements jsonb)` — 방 전체 배치를 한 번에 교체하는 단일 RPC.
  클라이언트의 `RoomState.furniture` 배열과 1:1로 대응해서 배치/이동/제거 모두 이 RPC 하나로
  처리한다(제거 = 그 아이템을 배열에서 뺀 뒤 다시 호출). 소유하지 않은 가구, `category='furniture'`가
  아닌 item_id, 방 범위(10×8, model.ts ROOM_WIDTH/HEIGHT와 동기화) 밖 좌표, payload 안 중복
  item_id는 전부 거부하고 기존 서버 배치를 그대로 둔다(all-or-nothing).
- 클라이언트(`PixelRoom.tsx`)는 마운트 시 `shop.ready`가 된 뒤 서버 배치를 조회한다. 서버에 행이
  있으면 그걸로 렌더링. 없으면(신규 유저 또는 이 기능 출시 전 로컬에만 저장해 둔 유저) 레거시
  localStorage를 한 번만 읽어 **그중 실제로 소유한 가구만** 서버로 이전하고, 시도 여부를
  `pixelRoom:<userId>:v1:migrated` 마커로 남겨 이후엔 다시 읽지 않는다(비운 방을 매번 되살리는
  것 방지). 이후 배치/이동/제거는 전부 `save_pixel_room_layout`로 저장하고, 실패하면 화면을
  이전 상태로 되돌린다(낙관적 갱신 롤백) — 서버와 화면이 갈라진 채로 남지 않는다.
- 보유하지 않은 가구는 기존과 동일하게(`ownedFurnitureTypes` 필터) 렌더/이동 충돌/재배치 권한을
  절대 얻지 못한다 — 이번에는 서버 RPC도 별도로 소유를 재검증한다(클라이언트 우회 방어).

서버: `20260915010500_pixel_furniture_placement` — 테이블/RLS/트리거/RPC.
`tests/pixelShop/server-roundtrip.sql`에 place/move/remove/미소유 거부/범위 밖 거부/중복 거부/
직접쓰기 거부를 추가해 실제 DB에서 검증(전부 ROLLBACK).

## 후속 작업 — 출입구 카펫 + 아바타 외형 구조 정리 (2026-09-16)

### 1. 출입구 카펫

방 출구(model.ts의 RESERVED_ROOM_CELLS = 문 칸 + 그 앞 칸)에 항상 고정된 바닥 장식을 추가했다.
가구(model.ts/ownership)와 완전히 분리된 개념이라 구매·소유·배치 대상이 아니고, 상점/가구
탭 어디에도 나타나지 않는다.

- 에셋: 같은 interior atlas(`assets/interior/source-17655392.png`)의 미사용 러그 타일
  (x:48, y:144, w:48, h:32) — 새 PNG 없음, 기존 가구와 같은 화풍.
- 렌더링: `sprites.tsx`의 `FurnitureSprite`를 `ArtSprite`로 일반화해서 `DoormatSprite`가 같은
  방식(뷰박스 크롭 + `bottom:0` 앵커)을 재사용한다. `.pr-doormat`은 `.pr-furniture`와 동일하게
  `pointer-events:none` — 눌러도 그대로 아래 바닥 칸 버튼이 반응해서 문 쪽으로 자연스럽게
  걸어간다(새 로직 없음, 기존 walkTo 그대로).
  z-index는 항상 0(가구/캐릭터보다 아래)로 고정해서 옆 칸에 가구가 놓여도 절대 시각적으로
  충돌하지 않는다. 문 칸을 중심으로 좌우 반 칸씩 걸쳐 놓아(x:3.5~5.5, y:7행) 세로형 1칸
  폭보다 실제 러그 비율(48×32)에 맞게 크게 보이도록 했다.
- 기존 "문 앞 가구 배치 금지" 규칙(`RESERVED_ROOM_CELLS`/`coversReservedCell`)은 손대지 않았다.
- 검증: `tests/pixel-room/doormat.browser.mjs`(신규, 실제 브라우저) — 구매/소유 없이도 항상
  보임, 문 칸에 카펫이 있어도 가구는 여전히 배치 불가, 카펫을 밟고 지나가도(클릭) 정상적으로
  걸어서 문에 도달함을 확인.

### 2. 아바타 외형 구조 정리 (Astra 제안 검토)

Astra 제안(장착 아이템: 상의/하의/신발/헤어스타일, 기본 appearance: 피부색/머리색/눈동자색)을
그대로 기계적으로 따르지 않고 기존 코드/DB/구매 이력을 먼저 확인해서 조정했다.

**실제로 채택한 구조**:
- 장착 아이템(기존 그대로, 변경 없음): 상의/하의/신발/**헤어스타일+색 묶음**. 헤어는 이미
  `hair_bob_black`처럼 형태+색이 한 item_id로 팔리고 있었다 — "구매 이력을 깨뜨리지 않는다"는
  요구를 가장 안전하게 지키는 방법은 이 묶음 구조를 그대로 두는 것이라 판단해서 스키마/RPC를
  건드리지 않았다(직전 라운드에서 이미 스타일별 색상 2종을 추가해 구분 문제는 상당 부분
  해결됨).
- 무료 기본 appearance(신규): **피부색**, **눈동자색**. 둘 다 지금까지 한 번도 판매·소유된 적
  없는 슬롯이라(문서 상단 "실제 에셋 감사" 참고 — 피부색 5행/눈동자색 4행은 "상품 수를 늘리기
  위해 판매하지 않았다"고 명시돼 있었음) 자유롭게 새 free 슬롯으로 만들 수 있었다. 가격/희귀도
  없음(요구사항).
- "머리색"은 Astra 제안처럼 완전히 분리하지 않았다 — 이미 판매된 상품의 경제적 가치(예:
  "블론드 양갈래 번"을 150P 주고 산 학생이 있다면, 그 색을 다른 모든 buns 소유자에게 무료로
  풀어버리는 건 그 구매의 가치를 사후적으로 깎는 셈)를 지키는 쪽이 더 안전하다고 판단했다.

**렌더링/DB 구조**: `PublicAvatarAppearance`에 `skin` 필드를 추가하고, 기존 미사용 `eyes`
필드의 의미를 "장착 아이템"에서 "무료 색상 키"로 재사용했다(그 슬롯으로 판 상품이 실제로
하나도 없어 안전한 재해석). `sprites.tsx`의 렌더 레이어 매커니즘(assetKey 문자열 → atlas 행)을
그대로 재사용해서 skin/eyes 두 슬롯을 다른 슬롯과 완전히 동일하게 다룬다 — 별도 렌더링 경로를
새로 만들지 않았다.

- DB: `pixel_avatar_equipment`에 `skin_tone`/`eye_color` text 컬럼 추가(CHECK 제약으로 허용값만
  받음, 카탈로그 FK 없음 — 무료라 소유권 조회 자체가 필요 없음). 기존 `eyes`(FK, 미사용) 컬럼은
  전혀 건드리지 않았다. 새 RPC `set_pixel_base_appearance` — 기존 pixel_* 패턴(SECURITY DEFINER
  + guard 트리거 우회) 그대로.
- 기존 사용자 기본값: 새 컬럼은 NULL 기본(백필 없음) → `row 0` → **지금 전체 사용자가 이미
  보고 있는 모습과 정확히 같다.** 마이그레이션 직후에도 외형이 한 픽셀도 안 바뀐다.
- CSS tint 대신 기존 캐릭터 atlas의 진짜 대체 행(피부 5색/눈동자 4색, 전부 원작 그림)을 그대로
  쓴다 — 새 그림 없음.
- UI: `Wardrobe`에 "기본 외형" 탭 추가 — 피부색/눈동자색 스와치(원형 색상 견본) + 확대 얼굴
  미리보기(`.pr-face-zoom`, 캐릭터를 크게 렌더링). 눈동자색은 실제 캐릭터 크기에서는 잘 안
  보이므로 이 확대 미리보기로 확인 가능하게 했다(요구사항: "확대 preview에서 확인 가능하면
  충분").
- 광장 반영: Plaza는 이미 PixelRoom과 같은 `PublicAvatarAppearance`/`fetchEquippedAppearance`/
  `AvatarSprite`를 쓰고 있었다(둘 다 같은 계약을 이미 공유 중이었음, 이번에 새로 만들 필요
  없었음). 다만 `presenceStore.ts`의 화이트리스트 재구성 로직(다른 필드가 실수로 섞이는 걸
  막는 방어 코드)이 `skin` 필드를 몰라서 빠뜨리고 있던 걸 타입 체크가 잡아냈다 — 그대로
  뒀다면 광장에서 다른 사용자에게 피부색 변경이 전혀 안 보였을 것이다.

서버: `20260916010000_pixel_base_appearance` — 컬럼/CHECK/RPC. `tests/pixelShop/server-roundtrip.sql`에
set/reset/잘못된 값 거부/직접쓰기 차단을 추가해 실제 DB에서 검증(전부 ROLLBACK).
클라이언트: `tests/pixel-room/base-appearance.browser.mjs`(신규, 실제 브라우저) — 스와치 선택 시
즉시 반영, 새로고침/완전히 새 세션(로컬 상태 전혀 없음)에서도 서버 기준으로 복원, 장착
아이템은 전혀 영향받지 않음, 지워진/알 수 없는 저장값은 안전하게 기본값으로 표시됨을 확인.
