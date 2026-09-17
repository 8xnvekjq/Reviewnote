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

## 후속 작업 — 첫 번째 펫: 강아지 (2026-09-16)

집 앞(Front Yard, PR #89)이 먼저 들어온 뒤, 그 위에 이어서 구현했다. 코드/에셋/DB/테스트 대부분은
이미 작성돼 있었고(다른 세션이 작업트리에 미완성 상태로 남긴 것 — `codex/first-dog` 브랜치) 이번
라운드에서는 실제로 끝까지 완결됐는지 처음부터 다시 확인하고, 발견한 문제만 고쳐서 마무리했다.

- 에셋: `dog_medium.png`(rmazanek, CC0, OpenGameArt) — 걷기/달리기/앉기 전환/앉은 대기/서 있는
  대기/짖기 6종 애니메이션. 출처는 `src/features/pixel-room/pet/assets/LICENSE.md`와 이 문서의
  "펫: dog_medium" 절 양쪽에 보존했다(기존 캐릭터/가구 에셋과 같은 문서 관례).
- 행동: `dogModel.ts`의 순수 상태머신(`advanceDog`) — 방(느린 걸음 480ms/틱, 긴 휴식
  2800~4800ms), 집 앞 마당(빠른 달림 260ms/틱, 짧은 휴식 1300~3300ms), 짖기는 12% 확률만.
  `dogWorld.ts`가 기존 `isCellFree`(가구)와 `yardWalkable`(마당)을 그대로 재사용해서 새 충돌
  로직을 만들지 않았고, 문/카펫 앞 칸은 방 쪽에서 별도로 제외한다. 플레이어가 펫의 칸으로 들어오면
  그 프레임에는 렌더를 건너뛰어(절대 안 막음) 다음 tick에 자동으로 다른 자리에 다시 나타난다.
- 서버: 기존 `pixel_item_catalog`/`purchase_pixel_item`을 그대로 재사용(카테고리 `pet` 하나
  추가). 활성 펫은 새 테이블 `pixel_pet_equipment` 1줄 — `(user_id, active_pet)`이
  `pixel_item_ownership(user_id, item_id)`를 참조하는 복합 FK라서 **소유하지 않은 펫을
  활성화하는 요청은 DB 자체가 거부**한다(RPC/트리거 없이 선언적 제약만으로). RLS는 본인 행만
  읽기/쓰기 허용. 위치/타이머는 전부 로컬 상태이고 서버에는 전혀 저장·중계하지 않는다(광장
  realtime과 무관).
- 발견해서 고친 문제: (1) `saveActivePet`이 direct upsert를 쓰는 게 기존 pixel_* 패턴(RPC 경유)과
  달라 보였지만, FK+RLS만으로 이미 안전하게 소유권이 강제되는 걸 실제 DB에서 검증해서 그대로
  뒀다. (2) `tests/pixelShop/content.test.ts`가 새 `pet` 슬롯을 몰라서 깨졌던 걸 스킵 처리로 수정.
  (3) 문서(LICENSE.md의 attribution)가 중앙 자산 문서(`docs/pixel-room-assets.md`)에는 빠져 있어
  추가.
- 검증: `tests/plaza/dog.test.ts`(순수 모델, 180초 시뮬레이션으로 가구/문/플레이어/마당 경계
  이탈 없음 확인) 통과. `tests/pixel-room/dog-server.sql`을 실제 Supabase에서 실행 —
  구매/중복방지/활성화/소유권 FK 거부/타 사용자 RLS 거부/익명 거부까지 전부 확인 후 롤백.
  `tests/pixel-room/dog.browser.mjs`(신규, 실제 브라우저) — 구매 시 자동 입양, 방(차분)/마당
  (활발) 양쪽에서 관찰, 광장에는 완전히 없음, 방↔마당↔광장↔마당↔방을 여러 번 왕복해도 안정적,
  새로 놓은 가구 위에 서지 않음, 새로고침과 완전히 새 세션에서도 활성 펫이 서버 기준으로 복원됨을
  확인. 기존 `tests/pixelShop/browser.mjs`(3개 뷰포트)/`furniture-race.browser.mjs`/
  `doormat.browser.mjs`/`base-appearance.browser.mjs` 전부 재실행해 회귀 없음을 재확인.

## 후속 작업 — 캐릭터/강아지 비주얼 정리 (2026-09-16)

- 신고된 문제: (1) 집 앞에서 기본 캐릭터 목이 꺾여 보임, (2) 기본 캐릭터가 화풍 대비 덜 귀엽고
  어색함, (3) 강아지가 캐릭터/월드와 화풍이 달라 이질적임. "비율/scale/offset 미세조정으로는
  이미 여러 번 시도했지만 효과 없었다"는 전제로, 이번엔 근본 원인을 찾아 구조적으로 고쳤다.
- **(1) 목 꺾임의 실제 원인**: `sprites.tsx`의 `AvatarSprite`가 32×32 프레임을 y=18에서
  head/body 두 개로 잘라 각각 별도의 `<svg>`로 렌더링하고, CSS(`.pr-avatar-head{height:70%}`,
  `.pr-avatar-body{height:30%;width:112%;margin-left:-6%}`)로 서로 다른 비율로 독립
  스케일하던 것이 원인이었다 — 이전 세션이 "귀엽게 보이려고" 시도했던 head:body 재비례 트릭.
  head는 100% 폭, body는 112% 폭 + -6% margin으로 서로 다른 스케일 계수를 쓰다 보니, 목/칼라의
  수직 윤곽선이 이음매에서 정확히 같은 화면 픽셀 열에 맞지 않아 "꺾인 목"으로 보였다. 방
  (`.pr-actor`, 22%/27%)과 집 앞(`.pr-plaza-actor`, 13.75%/18%)은 셀 단위 비율은 동일하지만
  실제 렌더 픽셀 크기가 달라(방 ~129px, 집 앞 ~93px — Playwright로 실측) 작은 쪽에서 어긋남이
  더 크게 보였을 뿐, 버그 자체는 두 화면 모두에 있었다(스크린샷으로 확인). 수정: 두 SVG 분리를
  완전히 제거하고 단일 `<svg viewBox="0 0 32 32">`로 되돌렸다 — 세부 숫자를 조정한 게 아니라
  이음매가 생길 수 있는 구조 자체를 없앴다.
- **(2) 기본 캐릭터**: 위 수정만으로 목 꺾임이 사라졌을 뿐 아니라, 원본 도트(Ordinary Bumblebee
  팩)의 둥근 비율도 왜곡 없이 그대로 살아나 "안 귀엽고 어색함"의 상당 부분이 함께 해결됐다 —
  애초에 그 트릭이 원본을 비틀어서 어색해 보이게 만든 주범이었다. 호환 가능한 대체 캐릭터 pack도
  찾아봤지만(itch.io/OpenGameArt 여러 후보 확인) CC0/상업이용 가능하면서 기존 상의/하의/신발/
  머리 layer 구조와 맞는 건 없어, base sprite 자체는 교체하지 않았다(사용자 확인 후 이 상태로
  마무리).
- **(3) 강아지 화풍 교체**: 기존 `dog.png`(rmazanek, CC0, OpenGameArt)는 정교한 음영/얇은 선의
  사실적 스타일이라 캐릭터·가구의 두꺼운 외곽선-단순 색면 스타일과 실제로 이질적이었다. 대체할
  기성 CC0 강아지 pack을 여러 곳에서 찾아봤으나(smolcofe: 유료+라이선스 불명, DoodleDino: 상업
  이용 불가+bark 미포함, Cat&Dog: 벡터 고해상도+bark/sit 미포함) 필요한 5개 동작(idle/walk/run/
  sit/bark)과 화풍을 동시에 만족하는 게 없어, 사용자 승인을 받아 Python(Pillow)으로 원본
  아트를 새로 그렸다. 타원/폴리곤을 10배 크기로 그린 뒤 축소하는 방식이며, 캐릭터 시트의 따뜻한
  톤에 맞춘 탠/크림 팔레트, 굵은 진갈색 외곽선, 볼터치, 큰 단순 눈으로 화풍을 맞췄다. 동작 세트와
  행 순서는 교체 전과 동일(bark 4/walk 6/run 6/sit-transition 3/sit-idle 4/stand-idle 4)이라
  `dogModel.ts`(FSM)와 `dogWorld.ts`(충돌)는 전혀 건드리지 않았고, `Dog.tsx`는 셀 크기 상수만
  60×38→32×32, 시트 크기 360×228→192×192로 바꿨다(캐릭터 시트와 같은 32×32 프레임 단위로 통일).
- 검증: `tests/pixel-room/dog.browser.mjs` 재실행 — 새 sprite로도 구매/자동입양/방·마당 행동
  차이/광장 부재/가구·문 회피/새로고침·새 세션 지속성 전부 그대로 통과(FSM 무회귀 확인). 전체
  유닛 테스트 79/79 통과(`content.test.ts`/`pixelShop.test.ts`/`model.test.ts`/`dog.test.ts`/
  `presenceStore.test.ts`/`positionSmoothing.test.ts`/`layout.test.ts`/`interactions.test.ts`/
  `yard.test.ts`). 기존 브라우저 회귀 테스트 전부 재실행해 회귀 없음 확인:
  `pixelShop/browser.mjs`(390/800/1440), `pixel-room/base-appearance.browser.mjs`,
  `pixel-room/doormat.browser.mjs`, `pixel-room/furniture-race.browser.mjs`,
  `pixel-room/yard.browser.mjs`(390/1440), `plaza/interactions.browser.mjs`,
  `plaza/landscape.browser.mjs`(390/1440). Playwright 스크린샷으로 방/집 앞 양쪽에서 목 이음매가
  사라졌음과 상점 카드/얼굴 확대(`face-zoom`)에서 피부색·눈동자색 스와치가 정상 반영됨을 육안
  확인. `npm run build`(tsc -b && vite build) clean, `npm run lint`에는 사전 존재하던
  `src/App.tsx`의 react-hooks 오류가 있으나 이번 변경 파일과 무관(수정 파일에 없음, 손대지 않음).

## 후속 작업 — 짧은 헤어 보강 (2026-09-16)

- 신고된 문제: 헤어가 번/단발/긴머리/옆머리(전부 볼륨 있는 긴/여성형 실루엣) 4종뿐이라 짧은
  스타일이 없음. 사용자가 제시한 5개 후보(까까머리/단정한 짧은머리/짧은 앞머리 컷/투블럭 숏컷/
  부스스한 숏컷) 중 atlas 재사용 가능 범위와 새 아트 리스크를 사용자에게 보고하고, "재사용 1개 +
  신규 1개"로 범위를 합의한 뒤 진행했다(8개 hair sheet에 새 row를 일관되게 추가하는 건 강아지
  sprite 교체보다 훨씬 큰 작업이라, 스타일 수를 늘리는 대신 품질에 집중).
- **재사용**: hair atlas 25행을 전부 확인해 rows 0-4가 상점에서 한 번도 판 적 없던 미사용
  스타일임을 발견 — 볼륨/뎁 없는 단정한 숏컷, 4방향 모두 정렬 정상. 요청한 4색 중 black/
  dark_brown/blonde 3개가 기존 5색 반복(다크브라운/레드/블론드/블랙/그레이) 안에 이미 있었다.
  다만 dark_brown(row 0)은 다른 모든 슬롯과 마찬가지로 `hair:null`(미장착) 렌더 기본값이라
  이미 모든 유저가 공짜로 보고 있는 모습 — 그대로 팔면 "소유"의 의미가 없어져서 상품화하지 않고
  블론드(`hair_crop_blonde`)/블랙(`hair_crop_black`) 2개만 새로 팔았다.
- **신규 추가(진짜 버즈컷)**: 위 3색으로는 "brown"(다크브라운과 구별되는 중간 갈색)과 buzzcut
  실루엣 자체가 atlas에 없어, Python(Pillow)으로 8개 Hair 시트(Idle/Walk × Front/Back/Left/
  Right) 전부에 새 row 25-28을 추가했다. 손으로 새 좌표를 그리지 않고, 이미 검증된 rows 0-4
  실루엣의 alpha를 `ImageFilter.MinFilter`로 2단계 침식(erode)해 바깥 테두리만 남기는 방식을
  썼다 — 그래서 4방향/걷기 전부 처음부터 원본과 같은 자리에 맞는다(정렬 버그가 생길 수 없는
  구조). 색상은 다크브라운(기본)/블론드/블랙(기존 팔레트 재사용) + 새로 만든 중간 갈색
  `rgb(124,79,45)`(요청한 4색 중 atlas에 없던 유일한 색) 총 4개(`hair_buzz`/`hair_buzz_blonde`/
  `hair_buzz_black`/`hair_buzz_brown`). 결과: 새 상품 6개(재사용 2 + 신규 4), 카탈로그 총
  40→46개, 헤어 슬롯 12→18개.
- `sprites.tsx`의 hair 레이어 렌더 height 상수(800→928)를 실제 시트 높이에 맞춰 갱신했다 —
  누락했다면 새로 추가한 4행이 잘못된 y좌표로 잘려 보였을 것.
- 검증: `tests/pixelShop/content.test.ts`(atlas row 경계/카탈로그 개수 전수 검사, hair row 개수
  25→29 갱신) 등 전체 유닛 테스트 79/79 통과. Playwright로 새 상품 6개 전부 구매→자동 장착 후
  방에서 정면/후면/측면 스크린샷 확인 — 4방향 모두 헤어라인 정렬 정상, 버즈컷은 두피 색이 비쳐
  보이는 얇은 테두리로 기존 굵은 스타일들과 실루엣이 뚜렷이 구분됨. 기존 브라우저 회귀 테스트
  전부 재실행해 회귀 없음 재확인: `pixelShop/browser.mjs`(390/800/1440, 기존 4슬롯 구매/장착/
  새로고침 포함), `base-appearance.browser.mjs`(피부색/눈동자색 무회귀), `doormat.browser.mjs`,
  `furniture-race.browser.mjs`, `yard.browser.mjs`(390/1440), `dog.browser.mjs`,
  `plaza/interactions.browser.mjs`, `plaza/landscape.browser.mjs`(390/1440). `npm run build`
  clean, `npm run lint`에는 무관한 기존 `src/App.tsx` 오류만 있음(미수정 파일).

### 후속 수정 — 운영 DB catalog 누락 (2026-09-16)

PR #92 병합 직후 사용자가 "새 헤어가 실제 상점에 안 보인다"고 보고. 원인은 이 PR이 client-side
`catalog.ts`만 바꾸고 **운영 Supabase `pixel_item_catalog`에 INSERT 마이그레이션을 빠뜨린 것** —
`usePixelShop.ts`가 처음엔 `PIXEL_CATALOG`(정적)로 즉시 렌더링하지만, 서버 fetch가 끝나면
`rows.filter(row => PIXEL_CATALOG.some(known => ...))`로 카탈로그 state를 **서버 응답으로 완전히
교체**한다 — 서버에 없는 6개는 그 순간 사라진다. 코드/테스트(`content.test.ts`)는 전부 정적
카탈로그만 검증했기 때문에 이 누락을 잡지 못했다. 기존 avatar variant 추가(PR #88 계열,
`20260915010000_pixel_world_avatar_variants.sql`)에서 쓰던 것과 같은 패턴으로
`supabase/migrations/20260916020000_pixel_world_short_hair.sql`을 추가해 실제 DB에 6개 행을
넣었고, REST(anon key)로 직접 조회해 6개 전부가 반환되는 것까지 확인했다(SQL SELECT만이 아니라
앱이 실제로 호출하는 것과 동일한 HTTP 경로). 이미지/atlas는 이미 정상이라 다시 건드리지 않았다.

## 후속 작업 — 농장 작물 크기 시스템 (2026-09-18)

Astra가 구현한 토마토 농장 MVP(PR #94, `20260917155631_pixel_tomato_farm.sql` — 밭 2칸, 24시간
성장, 무료 물주기, 물주기를 놓쳐도 안 죽음, `pixel_farm_crops`/`pixel_farm_plots`/
`pixel_farm_care` 3테이블 + revision CAS 기반 `act_pixel_farm` RPC) 위에, 기존 구조를 다시 설계
하지 않고 그대로 확장해 "작물 크기" 시스템을 추가했다.

- **계산**: `size = clamp(40 + careRatio*30 + (luckRoll-0.5)*40, 10, 100)`. `careRatio =
  min(1, care_count / maxCareDays)`이고 `maxCareDays`는 그 작물의 planted~ready 구간이 걸치는
  한국시간 캘린더 날짜 수(고정 24시간 성장에서는 항상 2 — 하루 최대 1회 물주기 제한과 결합해
  care_count의 자연스러운 상한이 된다). `luckRoll = (random()+random()+random())/3`으로 0..1
  사이에서 평평하지 않고 0.5 근처에 몰리는 종형 분포를 만들어, 결과가 "완전 랜덤" 느낌이 아니라
  "대체로 무난하고 가끔 크게 엇나가는" 행운으로 읽히게 했다.
- **물주기 반영**: care_count가 늘수록(=maxCareDays에 가까워질수록) careRatio가 올라가고 크기
  기대값이 오른다. 실제 SQL로 300회씩 시뮬레이션한 결과 완전물주기 평균 69.7(범위 54–86) vs
  무물주기 평균 39.6(범위 23–57) — 약 30점 차(10~100 척도에서 큰 차이)로 "성실하면 평균적으로
  유리"가 뚜렷하지만, 각 그룹 내부 편차가 30점 이상이라 매번 결과가 달라지고 두 그룹 범위가
  살짝 겹친다(운 좋은 무물주기가 운 나쁜 완전물주기를 이길 수 있음) — "항상 가장 크지도, 못 줬다고
  실패하지도 않음"을 만족한다.
- **서버 확정/재추첨·중복 방지**: 크기는 기존 harvest 분기(`pixel_private.farm_action`의 마지막
  `else`) 안에서, 기존 revision CAS(`p.revision <> p_revision`이면 즉시 `changed` 반환) +
  `for update` 행 잠금과 **같은** 원자적 경로 안에 계산을 끼워 넣었다 — 새 잠금/새 플로우를 만들지
  않았다. 새로고침/재시도는 이미 소모된 revision으로 들어와 `changed`만 받고 harvest 분기 자체가
  실행되지 않으므로 크기가 다시 뽑히지 않는다. 수확 완료 후 `plot.crop_id`가 비므로 같은 크롭을
  다시 harvest할 방법이 구조적으로 없다(중복 수확 불가). 클라이언트가 보내는 어떤 시간값도 쓰지
  않고 전부 `clock_timestamp()`(서버 시각)만 사용한다.
- **저장**: `pixel_farm_crops`에 `size_score`(1~100) · `size_calc_version`(현재 1) ·
  `size_inputs`(jsonb: careCount/maxCareDays/careRatio/luckRoll/base/careBonusMax/luckSpread)를
  추가(`20260918090000_pixel_farm_crop_size.sql`) — 나중에 같은 버전 번호로 재계산해 결과를
  검증할 수 있다. `size_score`는 수확 전엔 절대 채워지지 않는다는 CHECK 제약이 있고(harvest 전
  강제로 넣으려 하면 제약 위반), 이 새 컬럼도 다른 모든 pixel_farm_* 컬럼과 마찬가지로
  `authenticated`에 UPDATE 권한이 없어 클라이언트의 직접 위조가 원천 차단된다(SQL로 직접
  `update ... set size_score=100` 시도 → `insufficient_privilege` 확인). `get_pixel_farm()`은
  `bestSize`/`lastHarvestSize`(개인 최고·최근 기록)도 함께 내려준다.
- **UX**: 새 모달 없이 기존 `.pr-farm-feedback`(수확/물주기 때마다 쓰던 가벼운 인월드 문구
  버블)에 "이번 토마토는 큰 토마토예요 (78/100)" 식으로 바로 보여준다. 밭 팝업의 기존
  "지금까지 수확 N개" 줄에 `· 최고 기록 N · 최근 N`을 추가해 개인 기록도 가볍게 확인 가능
  (전시대·타 학생 비교는 이번에 만들지 않음).
- **확장 여지**: `size_calc_version`이 있어 나중에 실제 복습 성실도를 반영하는 v2 공식을 추가해도
  기존에 수확된 작물의 기록은 그대로 v1로 남는다(재해석되지 않음). 포인트 경제·상점·비료·작물
  추가는 이번에 전혀 건드리지 않았다.
- 검증: `tests/plaza/farm.test.ts`에 `computeCropSize`/`cropCareRatio`/`maxCareDaysFor`/
  `sizeLabel` 단위 테스트 + 5,000회 시뮬레이션 분포 테스트(완전/절반/무물주기 평균이 단조증가,
  각 그룹 항상 [10,100] 안, 완전물주기가 항상 최상위 등급은 아님, 무물주기도 항상 하위 등급은
  아님, 그룹 간 범위 겹침 존재) 추가 — 전체 유닛 테스트 88/88 통과. `tests/pixel-room/farm-server.sql`
  에 크기 1회 확정/저장값 일치/재시도 안전/직접 위조 거부/bestSize·lastHarvestSize 정확성/
  무물주기도 정상 수확을 실제 Supabase에서 검증(전부 롤백). `tests/pixel-room/farm.browser.mjs`에
  수확 시 크기 노출 문구 + 최고·최근 기록 표시 + 새로고침/새 세션 지속성 검증 추가, 3개 뷰포트
  전부 통과. 기존 회귀 테스트(`base-appearance`/`doormat`/`furniture-race`/`yard`(2뷰포트)/`dog`/
  `pixelShop/browser`(3뷰포트)/`plaza/interactions`/`plaza/landscape`(2뷰포트)) 전부 재실행해
  회귀 없음 확인. `npm run build` clean, `npm run lint`에는 무관한 기존 `src/App.tsx` 오류만
  있음(미수정 파일).

## 후속 작업 — 4일 성장 + 복습 확률 연계 (2026-09-18)

토마토 성장 기간을 24시간→4일로 바꾸고, 실제 복습 활동이 작물 크기에 "확률적으로 간접" 연계되도록
확장했다. 기존 harvest 분기(revision CAS + 행 잠금)를 그대로 재사용했고 물주기 기반 기본 크기
공식(`computeCropSize`)은 전혀 바꾸지 않았다 — 복습은 그 위에 얹는 별도의 확률 레이어로만
추가했다.

- **4일 성장**: `ready_at = planted_at + interval '4 days'`. care ratio 분모는 "4일 중 며칠 물을
  줬는지"를 그대로 뜻하도록 고정 4로 캡을 씌웠다(실제 96시간 창은 달력 경계상 5개 날짜에 걸칠 수
  있지만 — 심은 날 일부 + 온전한 날 3개 + 준비되는 날 일부 — 그 5번째 날 새벽의 아주 좁은 틈을
  물주기 액션 자체에서 `care_count>=4`로 막아 "4일 중 며칠"이라는 의미를 정확히 지킨다). 이미
  진행 중이던 구 24시간 작물(마이그레이션 당시 실 DB에 2개 있었음)은 자기 실제 planted~ready
  구간으로 계산되는 원래의 더 작은 분모(2)를 그대로 유지해, 한 번도 주어진 적 없는 4일 기준으로
  불리하게 평가되지 않는다. 물주기를 놓쳐도 안 죽고, 수확 가능 상태에 만료 기한이 없는 것도 기존
  그대로다(코드에 별도 만료 로직이 없다는 것을 재확인).
- **실제 사용한 복습 데이터**: 스키마 전체를 확인한 결과, 이 프로젝트에는 "하루 단위로 신뢰
  가능한 복습 이력"을 남기는 append-only 로그가 전혀 없다(`review_check_*`는 교사 채점이라
  가장 신뢰도가 높지만 DB 전체에 세션 3개·문항 10개뿐으로 극히 드묾; `mistakes.analysis`의
  `pointLog`/`reviews`는 학생이 자기 행을 직접 수정할 수 있는 jsonb라 위조·반복 체크에 취약).
  대신 **`profiles.bonus_points`**를 썼다 — 이 컬럼은 `increment_bonus_points()` RPC를 통해서만
  바뀌고, 그 RPC는 오직 복습 콤보 점수/스트릭 마일스톤/일일 복습 퀘스트 코드
  (`src/features/mistakes/useReviewState.ts`)에서만 호출된다. 상점 구매·가챠·관리자 지급은 전부
  별개 컬럼(`point_adjustment`)을 쓰므로 `bonus_points`는 절대 섞이지 않는다. 로그인 횟수나 접속
  시간은 전혀 쓰지 않았다.
- **확률에 반영되는 방식**: 심을 때 `pixel_farm_crops.review_points_at_plant`에 그 순간의
  `bonus_points`를 스냅샷하고, 수확 때 현재값과의 차이(`reviewGained`, 음수면 0)를 그 작물의
  "이번 성장 기간에 딴 복습 콤보 점수"로 쓴다. `reviewRatio = min(1, reviewGained/50)`(4일에 50점
  이상이면 1.0), `bonusChance = 12% + reviewRatio×28%`(12~40%). 독립된 두 번째 주사위
  (`random() < bonusChance`)가 통과해야만 보너스가 발생하고, 발생 시에만 `+6~18`(평균 12)이
  **더해진다** — 복습 점수를 크기에 직접 더하지 않는다는 요구를 그대로 지켰다.
- **최종 공식**: `baseSize = computeCropSize(...)`(기존 물주기+행운 공식, 불변) →
  `finalSize = clamp(baseSize + (보너스 발동 시 6~18, 아니면 0), 10, 100)`. `size_calc_version=2`,
  `size_inputs`에 careCount/maxCareDays/careRatio/luckRoll/baseSize + reviewGained/reviewRatio/
  bonusChance/bonusRoll/bonusAmount를 전부 기록해 나중에 재계산·검증 가능하다. 마이그레이션 이전
  크롭(`review_points_at_plant` null)은 reviewGained=0으로 안전하게 처리된다(에러 없음, 데이터
  없는 척 지어내지 않고 정직하게 0).
- **재추첨/중복 방지**: 새 동시성 로직을 만들지 않고 기존 harvest 분기(같은 revision CAS +
  `for update` 행 잠금) 안에서 계산한다 — 재시도는 `changed`만 받아 harvest 로직 자체가 실행되지
  않으므로 크기도, 보너스 주사위도 다시 굴러가지 않는다. `review_points_at_plant`도 다른
  `pixel_farm_*` 컬럼과 동일하게 `authenticated`에 UPDATE 권한이 없어 직접 위조가 막힌다.
  **정직하게 밝히는 한계**: `bonus_points`는 리뷰 체크박스를 O→빈칸→O로 반복 토글하면 각 사이클마다
  다시 배점되는 기존 버그(이 라운드 밖의 복습 시스템 자체의 문제)가 있어 완전히 위조 불가능하지는
  않다 — 다만 그 취약점은 이미 실제 사용 가능한 포인트를 직접 불리는 데 쓸 수 있어 더 가치가 크고,
  농장 쪽은 크롭 하나당 한 번만 소비되는 작고 확률적인 보너스라 추가로 노출되는 실익이 낮다.
- 검증: `tests/plaza/farm.test.ts`에 `maxCareDaysFor`(레거시 24h vs 신규 4일 캡)/`growthLabel`
  (일/시간/분 단위 전환)/`reviewRatioFor`/`bonusChanceFor`/`computeBonusAmount`/
  `computeCropSizeV2` 단위 테스트 + 물주기(0/2/4)×복습(낮음/중간/높음) 9-조합 4,000회 시뮬레이션을
  추가 — 전체 유닛 테스트 93/93 통과. `tests/pixel-room/farm-server.sql`에 실제 4일 성장/4일 중
  4일 캡/`increment_bonus_points` 실제 RPC로 복습 점수를 만들어 스냅샷-diff 검증/버전2 확인/감사
  필드 확인/직접 위조 거부/레거시 크롭 호환을 실제 Supabase에서 검증(전부 롤백). 기존 lifecycle
  블록도 4일 기준으로 갱신해 재실행, 통과. `tests/pixel-room/farm.browser.mjs`를 96시간 성장 +
  결정론적 복습 보너스 목(mock)으로 갱신, 3개 뷰포트 전부 통과. 기존 회귀 테스트
  (`base-appearance`/`doormat`/`furniture-race`/`yard`(2뷰포트)/`dog`/`pixelShop/browser`
  (3뷰포트)/`plaza/interactions`/`plaza/landscape`(2뷰포트)) 전부 재실행해 회귀 없음 확인.
  `npm run build` clean, `npm run lint`에는 무관한 기존 `src/App.tsx` 오류만 있음(미수정 파일).
- 시뮬레이션 결과(물주기×복습, N=4000, 크기 10~100):

  | 물주기 | 복습 | 평균 | 최소 | 최대 | 보너스 발동률 |
  |---|---|---|---|---|---|
  | 0/4 | 낮음 | 41.5 | 21 | 71 | 12.7% |
  | 0/4 | 중간 | 43.2 | 22 | 72 | 26.6% |
  | 0/4 | 높음 | 44.6 | 21 | 73 | 39.6% |
  | 2/4 | 낮음 | 56.1 | 37 | 84 | 11.9% |
  | 2/4 | 중간 | 58.4 | 37 | 87 | 26.6% |
  | 2/4 | 높음 | 59.7 | 37 | 89 | 40.2% |
  | 4/4 | 낮음 | 71.7 | 51 | 100 | 11.9% |
  | 4/4 | 중간 | 73.1 | 52 | 100 | 26.4% |
  | 4/4 | 높음 | 74.5 | 51 | 100 | 39.1% |

  물주기 한 단계(0→2→4)마다 평균이 약 15점씩 뚜렷하게 오르는 반면, 같은 물주기에서 복습이
  낮음→높음으로 가도 평균은 약 3점만 오른다(물주기 효과의 1/5 수준) — "물주기가 가장 이해하기
  쉬운 핵심 요소, 복습은 보조적인 확률 편향"이 수치로도 확인된다. 모든 조합에서 최소~최대 범위가
  넓게 겹쳐 있어 복습이 낮아도 운 좋게 큰 작물이, 복습이 높아도 운 나쁘게 작은 작물이 얼마든지
  나올 수 있다.
