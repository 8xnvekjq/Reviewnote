"""병아리 원본을 32px 칸과 고정 팔레트로 정리한다. 실행: python scripts/pixel-world/pixelate-duck.py"""
from pathlib import Path
import re
from PIL import Image, ImageFilter, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'src/features/pixel-room/pet/assets'
OUT = ROOT / '.test-artifacts/pw-bugs-a'
OUT.mkdir(parents=True, exist_ok=True)
source_path = ASSETS / 'duck-source.png'
if not source_path.exists():
    source_path.write_bytes((ASSETS / 'duck.png').read_bytes())
source = Image.open(source_path).convert('RGBA')
text = (ROOT / 'src/features/pixel-world-phaser/logic/petSheets.ts').read_text(encoding='utf8')
bounds = [tuple(map(int, group)) for group in re.findall(r'\[(\d+), (\d+), (\d+), (\d+)\]', text.split('export const DUCK_BOUNDS', 1)[1])]
assert len(bounds) == 16
colors = [(49, 34, 25), (89, 53, 27), (153, 83, 25), (217, 127, 30),
          (246, 170, 38), (232, 184, 46), (255, 211, 58), (255, 228, 94),
          (255, 241, 143), (255, 248, 193)]
palette = Image.new('P', (1, 1))
palette.putpalette([v for color in colors for v in color] + list(colors[0]) * (256 - len(colors)))
sheet = Image.new('RGBA', (128, 128))
before = Image.new('RGBA', (128, 128))
for i, (left, top, right, bottom) in enumerate(bounds):
    crop = source.crop((left - 2, top - 2, right + 2, bottom + 2))
    size = (round(crop.width / 10), round(crop.height / 10))
    small = crop.resize(size, Image.Resampling.LANCZOS)
    position = (i % 4 * 32 + (32 - size[0]) // 2, i // 4 * 32 + 30 - size[1])
    before.paste(small, position)
    mask = small.getchannel('A').point(lambda a: 255 if a >= 128 else 0)
    pixels = small.convert('RGB').quantize(palette=palette, dither=Image.Dither.NONE).convert('RGBA')
    pixels.putalpha(mask)
    # 알파 가장자리 안쪽 한 칸을 진한 갈색 윤곽선으로 만든다.
    padded = Image.new('L', (size[0] + 2, size[1] + 2))
    padded.paste(mask, (1, 1))
    inner = padded.filter(ImageFilter.MinFilter(3)).crop((1, 1, size[0] + 1, size[1] + 1))
    for y in range(size[1]):
        for x in range(size[0]):
            if mask.getpixel((x, y)) and not inner.getpixel((x, y)):
                pixels.putpixel((x, y), (*colors[0], 255))
    sheet.paste(pixels, position)
sheet.save(ASSETS / 'duck.png')
before.resize((512, 512), Image.Resampling.NEAREST).save(OUT / 'duck-before-4x.png')
sheet.resize((512, 512), Image.Resampling.NEAREST).save(OUT / 'duck-after-4x.png')
dog = Image.open(ASSETS / 'dog.png').convert('RGBA').resize((768, 768), Image.Resampling.NEAREST)
comparison = Image.new('RGB', (1808, 800), '#b5c8b0')
draw = ImageDraw.Draw(comparison)
for label, picture, x in [('Before', before.resize((512,512), Image.Resampling.NEAREST), 0),
                          ('After', sheet.resize((512,512), Image.Resampling.NEAREST), 520), ('Dog', dog, 1040)]:
    draw.text((x + 8, 8), label, fill='black')
    comparison.paste(picture, (x, 32), picture)
comparison.save(OUT / 'duck-comparison-4x.png')
