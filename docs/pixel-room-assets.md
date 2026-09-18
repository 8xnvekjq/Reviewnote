# Pixel Room 원본 에셋 / 라이선스

확인일: 2026-09-11. 에셋은 원저작자의 공식 itch.io 무료 다운로드 흐름에서 받았다. 원본 PNG를 수정하거나 AI 이미지로 대체하지 않았으며, 앱은 atlas 일부를 CSS로 표시한다. CC0의 [공식 설명](https://creativecommons.org/publicdomain/zero/1.0/)은 상업적 복제·수정·배포를 허용하며 저작권상의 별도 허가를 요구하지 않는다.

## 캐릭터: Ordinary Bumblebee

- 원본: [Customizable Character Pack](https://ordinary-bumblebee.itch.io/customizable-character-pack)
- 다운로드 진입: [무료 다운로드 페이지](https://ordinary-bumblebee.itch.io/customizable-character-pack/purchase), `No thanks, just take me to the downloads` 선택
- 원본 ZIP: `32x32 Customizable Character Pack.zip`, 공식 upload ID `13326904`
- 라이선스: 배포 페이지의 `License CC0` 및 `Creative Commons Zero v1.0 Universal` 표시를 확인했다. 원작자 표기는 필수는 아니지만 이 문서에 보존한다.
- 포함: 32×32 캐릭터, 4방향 Walk/Idle 등 8개 애니메이션과 의상. MVP에 필요한 Walk/Idle만 원본 그대로 `src/features/pixel-room/assets/character/`에 저장했다.
- 저장된 PNG: 46개. 방향은 Front(남), Back(북), Left(서), Right(동)별 별도 atlas다.

### 실제 ZIP에서 확인한 geometry

| 레이어 | Walk/Idle atlas 크기 | 32px 기준 변형 행 |
|---|---|---|
| Character | 128×160 | 피부색 5행 |
| Clothing_Tops | 128×928 | 상의 29행 |
| Clothing_Bottoms | 128×448 | 하의 14행 |
| Clothing_Shoes | 128×320 | 신발 10행 |
| Hair | 128×928 (원본 800 + 자체 추가 128) | 머리 29행(원본 25행 + 자체 추가 4행, 2026-09-16) |
| Eyes | 128×128 | 눈 4행; Back에는 별도 눈 파일이 없음 |

각 프레임은 32×32, 가로 4프레임이다. `x = frameIndex × 32`, `y = variantRow × 32`. Front 상의 atlas를 육안 확인해 0행 빨강, 1행 초록, 2행 파랑 반팔을 MVP 선택지로 권장한다. 피부·머리·눈·하의·신발은 우선 0행을 사용한다. 레이어 순서는 body → eyes → bottoms → shoes → tops → hair를 기본으로 한다.

원본 명명 예외: Idle/Back 상의는 `Clothing_Top_Idle_Back-Sheet.png`로 `Top`이 단수다. `assets.ts`가 이를 정규화한다. Back 눈은 빈 문자열이므로 렌더러에서 생략한다. 모자는 이 팩에 포함되지 않는다. 다른 family 모자를 임의로 겹치지 않으며, MVP 실제 선택지는 상의 3개다.

### 짧은 헤어 보강 (2026-09-16)

헤어가 번/단발/긴머리/옆머리 4종(전부 볼륨이 있는 긴/여성형 실루엣)에 치우쳐 있어 짧은 스타일을
추가했다. 새 PNG를 만들지 않고 두 방식을 함께 썼다.

- **rows 0-4 재사용**: 원본 팩에 이미 있었지만 상점에서 한 번도 판 적 없던 볼륨 없는 단정한
  숏컷. 색상은 기존 5색(다크브라운/레드/블론드/블랙/그레이) 반복 중 블론드(row 2)/블랙(row 3)
  2개만 새로 판다 — row 0(다크브라운)은 다른 모든 슬롯과 같은 이유로 팔지 않는다: `hair:null`일
  때의 렌더 기본값이라 이미 모든 유저가 공짜로 보고 있는 모습이고, 그대로 상품화하면 "소유"가
  무의미해진다.
- **rows 25-28 신규 추가(진짜 버즈컷)**: 8개 Hair 시트(Idle/Walk × Front/Back/Left/Right) 각각에
  Python(Pillow)로 새 행을 추가했다. rows 0-4의 실루엣(이미 4방향 모두 검증된 정렬)의 alpha를
  `ImageFilter.MinFilter`로 2단계 침식(erode)해 바깥 테두리만 남기는 방식이라, 새로 좌표를 그린
  게 아니라 기존에 맞던 헤어라인에서 얇은 링 형태로 파생시켰다 — 그래서 4방향/걷기 모두 처음부터
  정렬이 맞는다. 색상은 다크브라운(row25, 기본)/블론드(row26)/블랙(row27)에 더해 기존 팔레트에
  없던 중간 갈색(row28, `rgb(124,79,45)`)을 새로 추가했다(요청한 4색 black/dark_brown/brown/
  blonde 중 유일하게 없던 색).

## 가구: Syntaxes of Play

- 원본: [Retro Interior Expansion Pack (16×16)](https://synofplay.itch.io/retro-interior-expansion-pack-1616)
- 다운로드 진입: [무료 다운로드 페이지](https://synofplay.itch.io/retro-interior-expansion-pack-1616/purchase)
- 배포자 설명: 16×16 grid, 가구 30개 이상, 장식 20개 이상. Penzilla 작품에 영감을 받았지만 원본 팩의 이미지를 포함하거나 수정하지 않고 새로 제작했다고 명시한다.
- 라이선스: 같은 배포 페이지의 원작자 댓글에서 CC0를 명시하고, 상업 작품 사용도 직접 허용했다. 해당 댓글은 페이지의 `Fledon` 라이선스 질문과 `FIOEP` 상업사용 질문 아래에서 확인할 수 있다.
- **Penzilla의 원본 Top-Down Retro Interior 팩은 사용하지 않았다.** 그 배포자는 상업 작품에 suggested price 납부를 요구하므로, 별도 community expansion의 CC0 조건과 혼동하면 안 된다.

| 저장 파일 | 배포 파일 | 원본 크기 |
|---|---|---|
| `assets/interior/source-17655391.png` | floors-walls02.png | 288×160 |
| `assets/interior/source-17655392.png` | furniture03.png | 256×256 |
| `assets/interior/source-17737185.png` | small-items02.png | 128×128 |

`src/features/pixel-room/assets.ts`에 6개 표시 영역을 정의했다: 침대, 책상, 의자, 수납 선반, 화분, 장식 칠판. `bookshelf` 키는 가느다란 수납 선반 외형을 사용한다. 원본은 가구별 이름 메타데이터를 제공하지 않으므로 기능 이름은 앱에서 부여한 해석이며 저작자가 지정한 이름이 아니다.

| 키 | atlas | x / y | width / height |
|---|---|---|---|
| bed | furniture | 0 / 32 | 32 / 48 |
| desk | furniture | 128 / 128 | 48 / 32 |
| chair | furniture | 128 / 48 | 16 / 32 |
| bookshelf | furniture | 176 / 80 | 16 / 48 |
| plant | small-items | 112 / 48 | 16 / 32 |
| decoration | small-items | 96 / 0 | 32 / 32 |

다운로드 CDN URL은 itch.io가 일시적으로 발급하므로 만료 가능한 URL을 코드에 저장하지 않았다. 위 공식 페이지와 upload ID, 원본 PNG를 출처 기록으로 유지한다. 이번 검증은 공식 라이선스 문구, ZIP 구성, PNG 크기와 atlas 육안 확인까지다. 앱 내 이동/착용/가구 배치와 모든 프레임의 합성 결과는 통합 브라우저 검증에서 확인한다.

## 펫: 강아지 (자체 제작, 2026-09-16 교체)

- 원래는 OpenGameArt의 CC0 `dog_medium.png`(rmazanek)를 그대로 썼으나, 정교한 음영/얇은 선의 사실적 화풍이 이 프로젝트의 캐릭터·가구(굵은 외곽선, 단순 색면, 낮은 디테일 밀도)와 이질적이라는 지적을 받고 교체했다.
- 새 `dog.png`는 제3자 에셋이 아니라 이 프로젝트를 위해 직접 만든 원본 아트다. Python(Pillow)으로 도형(타원/폴리곤)을 10배 크기로 그린 뒤 축소하는 방식으로 그렸고, 별도 라이선스/저작자 표기가 필요 없다.
- 팔레트는 캐릭터 시트의 따뜻한 피부/머리색 계열에 맞춘 탠/크림 톤, 진갈색 굵은 외곽선, 볼터치, 큼직한 단순 눈으로 캐릭터·가구와 화풍을 맞췄다.
- 저장 파일: `src/features/pixel-room/pet/assets/dog.png`, 제작 배경은 `LICENSE.md`에 기록.
- geometry: 192×192 PNG, 32×32 셀 6행 — 아바타 시트와 같은 프레임 크기. 행별 프레임 수는 교체 전과 동일(짖기 4, 걷기 6, 달리기 6, 앉기 전환 3, 앉은 대기 4, 서 있는 대기 4)이라 `Dog.tsx`의 행/프레임 로직은 그대로이고 셀 크기 상수만 60×38→32×32, 360×228→192×192로 바뀌었다. FSM(`dogModel.ts`)과 월드 충돌(`dogWorld.ts`)은 전혀 건드리지 않았다.
- 정면 지향 아트이며, 오른쪽 이동은 이전과 동일하게 `scaleX(-1)`로 좌우 반전해서 표현한다.
- 소리 에셋은 사용하지 않았다.

## 농장 허수아비 가이드 (자체 제작, 2026-09-19)

- `Scarecrow.tsx`의 `ScarecrowSprite`는 제3자 에셋이 아니라 이 프로젝트를 위해 직접 그린 인라인
  SVG 원본이다(강아지와 같은 패턴 — 정적 이미지 파일이 아니라 `<path>` 도형을 직접 구성).
- 32×40 viewBox(캐릭터/토마토의 32×32보다 세로로 조금 더 긴 서 있는 형태). 밀짚모자, 십자
  나무팔, 짚 손끝/발끝, 패치 있는 자루 몸통, 볼터치+웃는 얼굴로 구성했다.
- 팔레트는 기존 캐릭터/토마토밭 시트의 따뜻한 갈색·황토색 계열(#8a6338, #c9a86b, #e0b563 등)에
  맞췄고, 볼터치(#e8a9a0)로 귀여움을 더했다 — 무섭거나 사실적이지 않게, 사람이 아닌 명확히
  "허수아비" 실루엣으로 읽히도록 했다.
- 소리 에셋은 사용하지 않았다.
