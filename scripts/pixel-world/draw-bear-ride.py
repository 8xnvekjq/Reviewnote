from pathlib import Path
from collections import Counter
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / '.test-artifacts/bear-ride'
ART.mkdir(parents=True, exist_ok=True)
source = Image.open(ROOT / 'src/features/pixel-room/pet/assets/bear.png').convert('RGBA')
palette = [c for c, n in Counter(source.get_flattened_data()).most_common() if c[3]]
fur, ink, cream, shade, light = palette[:5]

def frame(direction, step):
    im = Image.new('RGBA', (48, 48))
    d = ImageDraw.Draw(im)
    def box(rect, color=fur):
        d.rectangle(rect, fill=color, outline=ink, width=1)
    def oval(rect, color=fur):
        d.ellipse(rect, fill=color, outline=ink, width=1)
    lift = [0, 2, 0, -2][step]
    if direction == 0:
        # 먼 다리, 평평한 등, 가까운 다리 순서로 그린다.
        box((15+lift, 33, 21+lift, 44), shade)
        box((32-lift, 33, 38-lift, 44), shade)
        oval((10, 23, 43, 40))
        box((17, 23, 35, 33))
        d.rectangle((13, 26, 39, 34), fill=fur)
        d.line((18, 24, 34, 24), fill=light)
        box((12-lift, 34, 19-lift, 45))
        box((34+lift, 34, 41+lift, 45))
        d.line((13-lift,44,18-lift,44), fill=shade)
        d.line((35+lift,44,40+lift,44), fill=shade)
        oval((7, 16, 14, 23)); oval((18, 16, 25, 23))
        oval((5, 20, 26, 35))
        oval((2, 27, 14, 34), cream)
        d.rectangle((3, 28, 6, 30), fill=ink)
        d.rectangle((11, 24, 12, 25), fill=ink)
        d.point((8, 19), fill=cream)
    else:
        box((13, 29+lift, 19, 43+lift), shade)
        box((29, 29-lift, 35, 43-lift), shade)
        oval((10, 20, 37, 40))
        d.line((18, 21, 29, 21), fill=light)
        box((11, 35-lift, 19, 45-lift)); box((28, 35+lift, 36, 45+lift))
        oval((10, 18, 18, 26)); oval((29, 18, 37, 26))
        oval((11, 22, 36, 37))
        if direction == 1:
            oval((18, 29, 29, 36), cream)
            d.rectangle((21, 30, 26, 32), fill=ink)
            d.rectangle((17, 26, 18, 27), fill=ink); d.rectangle((29, 26, 30, 27), fill=ink)
        else:
            oval((21, 35, 27, 40), shade)
    return im

sheet = Image.new('RGBA', (192, 192))
for row in range(3):
    for col in range(4): sheet.paste(frame(row, col), (col*48, row*48))
for col, direction in enumerate([0, 1, 2, 0]): sheet.paste(frame(direction, 0), (col*48, 144))
sheet.save(ROOT / 'src/features/pixel-room/pet/assets/bear_ride.png')
sheet.resize((768, 768), Image.Resampling.NEAREST).save(ART / 'sheet-4x.png')
frames = []
for step in range(4):
    strip = Image.new('RGBA', (144, 48), (246, 214, 163, 255))
    for direction in range(3): strip.alpha_composite(frame(direction, step), (direction*48, 0))
    frames.append(strip.resize((576,192), Image.Resampling.NEAREST))
frames[0].save(ART / 'walk.gif', save_all=True, append_images=frames[1:], duration=150, loop=0)
