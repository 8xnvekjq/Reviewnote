# Astra brief — Pixel World 큰 곰 펫 에셋

너는 에셋 담당이다. 코드(TS/TSX/CSS/SQL/tests)는 절대 수정하지 마라. 구현/연결은 상위 워크트리
(`pixelworld-plaza-shop`, Claude)가 한다. 이 파일(ASTRA_BEAR_BRIEF.md)은 커밋하지 마라.
push / PR / merge 하지 마라.

## 먼저 읽을 것 (화풍 파악)
- `src/features/pixel-room/assets/character/` — 사람 캐릭터 시트 (32×32 셀)
- `src/features/pixel-room/assets/interior/` — 가구
- `src/features/pixel-room/pet/assets/dog.png` (+ `LICENSE.md`) — 강아지: 192×192, 32×32 셀, 두꺼운 진갈색 외곽선, 단순 색면, 볼터치, 크고 단순한 눈
- `src/features/pixel-room/pet/assets/duck.png` (+ `DUCK.md`) — 오리
- `src/features/pixel-room/pet/Dog.tsx`, `Duck.tsx`, `dogModel.ts`, `duckModel.ts` — 스프라이트 사용 방식/FSM
- `src/features/pixel-room/plaza/ShopStallArt.tsx` — 광장 팔레트 참고

## 크기 기준 (중요)
- 방은 10×8 셀. 사람 아바타 박스 ≈ 2.2×2.16 셀(32px 스프라이트, 실제 인물은 그 안에서 더 작음).
- 강아지/오리는 2×2 셀 박스에 32×32 스프라이트.
- 곰은 **3×3 셀 박스**에 렌더링된다 → 스프라이트 논리 캔버스 **48×48**.
  곰 몸은 48×48 안에서 대략 폭 40 / 높이 36~40 px 정도로, 사람 캐릭터보다 확실히 크게.
  단, 둥글고 낮은 무게중심으로 화면을 과하게 가리지 않게.

## 산출물
1. `src/features/pixel-room/pet/assets/bear.png`
   - **192×192 RGBA 투명 PNG, 4열×4행, 셀 48×48 (네이티브 픽셀, 한 픽셀 = 한 논리 픽셀)**.
     이미지 생성 도구를 쓰더라도 최종본은 반드시 이 네이티브 해상도로 양자화/정리할 것
     (안티에일리어싱·그라디언트·반투명 가장자리 없음, 알파는 0 또는 255).
   - 모든 프레임은 발바닥이 같은 기준선(셀 내 y=46 부근)에 닿게 정렬, 좌우 중심도 일관되게.
     프레임 간 몸통이 흔들리며 튀지 않게(의도된 동작 제외).
   - 시점: 강아지처럼 정면 약간 왼쪽(front-left 3/4). 오른쪽은 코드가 좌우반전한다.
     → 비대칭 소품/글씨 금지.
   - 행 구성 (각 행 4프레임):
     - row 0 **idle**: 숨쉬기 2프레임(살짝 부풀었다 가라앉기) + 눈 깜빡임 + 복귀
     - row 1 **walk**: 뒤뚱뒤뚱 4프레임(좌우 발 교대, 몸 살짝 기울기)
     - row 2 **sit**: 앉는 중 → 앉음 → 앉아서 깜빡임 → 앉음(3·4번은 반복 루프로 씀)
     - row 3 **special**: 기지개/하품 또는 손 흔들기 중 가장 귀여운 것 1개(4프레임, 1회 재생)
   - 그림자는 넣지 말 것(코드가 그린다).
2. `src/features/pixel-room/pet/assets/BEAR.md` — DUCK.md 형식: 출처(직접 생성, 제3자 에셋 아님),
   시트 규격, 행/프레임 정의, 기준선 y, 사용한 생성 프롬프트/도구, 팔레트 hex 목록.
3. 검수용 미리보기(커밋하지 말 것): `scratch/bear-preview.png` — 시트를 8배 nearest 확대한 것과,
   같은 배율로 사람 캐릭터(character 시트 정면 1프레임)·강아지·오리를 곰 옆에 나란히 둔 비교 이미지.

## 스타일
- 기존 세계관과 이질감 없음: 두꺼운 진갈색 외곽선(강아지와 동일 계열), 단순 색면 2~3단 음영 이하.
- 따뜻한 갈색 털 + 크림색 주둥이/배, 작은 둥근 귀, 작고 단순한 눈, 볼터치(강아지와 같은 톤).
- "큰데 위협적이지 않은 둥근 곰": 발톱·이빨·찡그린 눈썹 없음. 통통한 배, 짧은 팔다리.
- 강아지 팔레트와 톤을 맞출 것(채도 과하지 않게).

## 완료 조건
- `bear.png`, `BEAR.md`를 워크트리 브랜치 `8xnvekjq/pixelworld-bear-asset`에 커밋 1개로.
  커밋 메시지: `feat(pixel-room): add big round bear pet sprite sheet`
- 마지막에 짧게 보고: 시트 규격, 행별 프레임 요약, 발 기준선 y, 몸 bbox(셀 기준), 특수모션 종류,
  미리보기 경로, 커밋 해시.
