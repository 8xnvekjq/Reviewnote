# Astra brief — Pixel World 비둘기 펫 에셋

너는 에셋 담당이다. 코드(TS/TSX/CSS/SQL/tests)는 수정하지 마라. 런타임 연결은 상위 워크트리
(`pixelworld-plaza-shop`, 브랜치 `8xnvekjq/pixelworld-pigeon`, Claude)가 한다.
이 파일(ASTRA_PIGEON_BRIEF.md)은 커밋하지 마라. push / PR / merge 하지 마라.

## 먼저 읽을 것 (화풍/규격 기준)
- `src/features/pixel-room/pet/assets/BEAR.md` + `bear.png` — 직전에 네가 만든 곰. 제작/정리 파이프라인
  (image_gen → 네이티브 그리드 정리, 이진 알파, 평면 팔레트, 기준선 정렬)을 그대로 따를 것.
- `pet/assets/duck.png` + `DUCK.md`, `pet/assets/dog.png` + `LICENSE.md` — 같은 크기대(32px) 펫
- `src/features/pixel-room/assets/character/` — 사람 캐릭터(32×32)
- `pet/Duck.tsx`, `pet/Bear.tsx`, `pet/duckModel.ts`, `pet/bearModel.ts` — 스프라이트 사용 방식

## 크기
- 비둘기는 오리와 같은 **2×2 셀 박스, 논리 캔버스 32×32**. 몸은 대략 폭 20~24 / 높이 18~22 px.
  오리보다 살짝 날렵하고 사람보다 확실히 작게.

## 산출물
1. `src/features/pixel-room/pet/assets/pigeon.png`
   - **128×192 RGBA 투명 PNG, 4열×6행, 셀 32×32, 네이티브 픽셀**(1px = 1논리px).
     안티에일리어싱/그라디언트/반투명 없음, 알파 0 또는 255. 그림자 없음(코드가 그림).
   - 시점: 오리/곰처럼 정면 약간 왼쪽(front-left 3/4), 코드가 좌우반전해 오른쪽을 만든다 → 비대칭 소품 금지.
   - 지상 프레임은 모두 발끝이 셀 내 **y=30** 기준선에 닿게. 가로 중심 일관.
   - 비행 프레임(row 4 c1~c2, row 5)은 **몸통 위치를 지상 서있기와 같은 높이로 그리고 발은 접을 것**.
     공중 높이는 코드가 위로 띄워서 표현한다(스프라이트 안에서 몸을 올리지 말 것).
     날개가 위로 펼쳐질 때도 셀 밖으로 나가지 않게.
   - 행 구성 (0-based):
     - row 0 **idle**: 서있기 / 고개 까딱(갸웃) / 서있기 / 눈 깜빡임
     - row 1 **walk**: 종종걸음 4프레임(발 교대 + 비둘기 특유의 머리 앞뒤 까딱)
     - row 2 **peck**: 똑바로 / 숙이기 / 바닥 쪼기 / 복귀
     - row 3 **rest**: 몸 부풀리며 웅크리기 / 웅크려 쉼 / 쉼+눈감음 / 쉼
     - row 4 **takeoff & land**: c0 도약 전 웅크림, c1 날개 번쩍 들고 뛰어오름, c2 착지 직전 날개 펴고 발 내림, c3 착지(날개 접는 중)
     - row 5 **fly**: 날갯짓 루프 4프레임(위 / 중간 / 아래 / 중간), 발 접음
2. `src/features/pixel-room/pet/assets/PIGEON.md` — BEAR.md 형식: 출처(직접 생성, 제3자 에셋 아님),
   규격, 행/프레임 표, 기준선 y, 프레임별 bbox, 생성 프롬프트/도구, 팔레트 hex.
3. 검수용 미리보기(커밋하지 말 것): `scratch/pigeon-preview.png` — 시트 8배 nearest 확대 +
   같은 배율로 사람·오리·강아지·곰과 기준선 맞춘 비교.

## 스타일
- 기존 세계관: 두꺼운 진한 외곽선(따뜻한 진회갈색 계열, 오리/곰과 톤 맞춤), 단순 색면, 2~3단 음영 이하.
- 귀엽고 친근한 비둘기: 부드러운 청회색 몸, 목에 작은 초록/보라 무지개빛 패치(단순 색면 2개 정도),
  날개에 짙은 줄무늬 2개, 작은 분홍/산호색 발, 작고 단순한 검은 눈, 작은 부리. 통통하고 둥근 실루엣.
- 채도 과하지 않게, 오리의 노랑·곰의 갈색 옆에 있어도 튀지 않게.

## 완료 조건
- `pigeon.png`, `PIGEON.md`를 브랜치 `8xnvekjq/pixelworld-pigeon-asset`에 커밋 1개로.
  커밋 메시지: `feat(pixel-room): add pigeon pet sprite sheet`
- 마지막에 짧게 보고: 규격, 행별 요약, 기준선, 비행 프레임 몸통 높이, 미리보기 경로, 커밋 해시.
