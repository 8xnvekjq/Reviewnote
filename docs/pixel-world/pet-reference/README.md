# Pixel World 펫 제작 참고자료

펫 스프라이트를 만들 때 나온 브리프·원본 생성 이미지·검수 미리보기를 모아둔 곳입니다.
**앱이 import하는 런타임 에셋이 아닙니다.** 비슷한 펫을 새로 만들 때 규격·프롬프트·검수 방식을 참고하는 용도입니다.

| 구분 | 위치 |
| --- | --- |
| 런타임 에셋(최종본, 스프라이트 시트 + 스펙) | `src/features/pixel-room/pet/assets/` (`bear.png`/`BEAR.md`, `pigeon.png`/`PIGEON.md` 등) |
| 제작 참고자료(이 폴더) | `docs/pixel-world/pet-reference/<pet>/` |

폴더별 파일 규칙:

- `brief.md` — 에셋 담당 에이전트에게 준 제작 브리프(원래 파일명 `ASTRA_<PET>_BRIEF.md`). 본문의 "커밋하지 마라"·"push/PR 하지 마라"는 제작 당시 에셋 워크트리에 대한 지시이고, 브리프는 작업이 끝난 뒤 여기에 보관했습니다.
- `generated-raw.png` — 이미지 생성 도구 원본 출력(네이티브 그리드로 정리하기 전). 남아 있는 펫만 있습니다.
- `preview-8x.png` — 최종 시트를 8배 nearest로 확대하고, 같은 배율로 다른 캐릭터와 기준선을 맞춰 비교한 검수용 이미지.

최종 스프라이트 시트는 여기에 복사하지 않습니다. 항상 `src/features/pixel-room/pet/assets/`의 파일이 기준입니다.
