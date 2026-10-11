"""지식의 학자 로브(상의 row 29) — 기존 브라운 니트 조끼 행(row 17)을 보라 + 금색 넥타이로 바꿔 덧붙인다.

같은 행에서 색만 바꾸므로 4방향·걷기 프레임의 실루엣과 정렬이 원본과 항상 같다.
여러 번 돌려도 같은 결과(이미 30행이면 row 29를 덮어쓴다).
  python3 scripts/pixel-world/draw-scholar-robe.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2] / 'src/features/pixel-room/assets/character'
SOURCE_ROW, TARGET_ROW, FRAME = 17, 29, 32
PALETTE = {
    (140, 70, 15): (104, 56, 170),   # 조끼 → 보라
    (133, 66, 15): (94, 50, 156),
    (110, 55, 12): (70, 36, 122),
    (184, 21, 18): (236, 190, 64),   # 넥타이 → 금색
    (150, 13, 11): (186, 136, 34),
}

for path in sorted(ROOT.glob('Clothing_Top*_*-Sheet.png')):
    sheet = Image.open(path).convert('RGBA')
    rows = sheet.height // FRAME
    if rows not in (TARGET_ROW, TARGET_ROW + 1):
        raise SystemExit(f'{path.name}: unexpected {rows} rows')
    row = sheet.crop((0, SOURCE_ROW * FRAME, sheet.width, (SOURCE_ROW + 1) * FRAME))
    row.putdata([(*PALETTE.get(p[:3], p[:3]), p[3]) for p in row.getdata()])
    out = Image.new('RGBA', (sheet.width, (TARGET_ROW + 1) * FRAME))
    out.paste(sheet.crop((0, 0, sheet.width, TARGET_ROW * FRAME)), (0, 0))
    out.paste(row, (0, TARGET_ROW * FRAME))
    out.save(path, optimize=True)
    print(path.name, out.size)
