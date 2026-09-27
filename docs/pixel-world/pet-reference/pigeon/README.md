# 비둘기 (pet_pigeon) 제작 참고자료

- 최종본(런타임): `src/features/pixel-room/pet/assets/pigeon.png` (128×192, 4×6, 32px 셀), 스펙 `PIGEON.md`
- 머지된 PR: #110

| 파일 | 종류 | 설명 |
| --- | --- | --- |
| `brief.md` | 참고본 | 에셋 제작 브리프(원래 `ASTRA_PIGEON_BRIEF.md`). 2×2 셀 박스·32px 캔버스, 6행 구성(idle/walk/peck/rest/takeoff·land/fly), 비행 프레임 규칙 |
| `generated-raw.png` | 참고본 | 이미지 생성 도구 원본 출력(1024×1536). 안티에일리어싱·배경이 남아 있어 그대로 쓸 수 없고, 네이티브 32px 그리드로 양자화·정리한 결과가 최종본 |
| `preview-8x.png` | 참고본 | 최종 시트 8배 확대(행·열 라벨) + 사람·오리·강아지·곰과 같은 배율, 접지 기준선을 맞춘 비교 |
