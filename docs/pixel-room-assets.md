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
| Hair | 128×800 | 머리 25행 |
| Eyes | 128×128 | 눈 4행; Back에는 별도 눈 파일이 없음 |

각 프레임은 32×32, 가로 4프레임이다. `x = frameIndex × 32`, `y = variantRow × 32`. Front 상의 atlas를 육안 확인해 0행 빨강, 1행 초록, 2행 파랑 반팔을 MVP 선택지로 권장한다. 피부·머리·눈·하의·신발은 우선 0행을 사용한다. 레이어 순서는 body → eyes → bottoms → shoes → tops → hair를 기본으로 한다.

원본 명명 예외: Idle/Back 상의는 `Clothing_Top_Idle_Back-Sheet.png`로 `Top`이 단수다. `assets.ts`가 이를 정규화한다. Back 눈은 빈 문자열이므로 렌더러에서 생략한다. 모자는 이 팩에 포함되지 않는다. 다른 family 모자를 임의로 겹치지 않으며, MVP 실제 선택지는 상의 3개다.

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
