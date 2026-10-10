"""Draw native-resolution, opaque-color bug art. Run: python -I scripts/pixel-world/draw-bugs.py."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'src/features/pixel-world-phaser/assets/bugs'
OUTLINE = '#31221a'
WING = '#dcecf0'
VEIN = '#779faa'
WHITE = '#fff1d2'


def dragonfly(species, phase):
    image = Image.new('RGBA', (16, 16))
    d = ImageDraw.Draw(image)
    # Four different poses: spread, lifted, folded, and downstroke.
    poses = [((1, 4), (1, 10)), ((2, 2), (2, 8)),
             ((4, 1), (4, 7)), ((2, 6), (2, 12))]
    front, back = poses[phase]
    if species == 2:
        front = (front[0] + 2, front[1])
        back = (back[0] + 2, back[1] - 1)
    for side in (-1, 1):
        for tip, root_y in ((front, 5), (back, 7)):
            tx = tip[0] if side == -1 else 15 - tip[0]
            rx = 7 if side == -1 else 8
            ty = tip[1]
            points = [(rx, root_y), (tx, ty - 1), (tx, ty + 1),
                      (tx - side, ty + 2), (rx, root_y + 3)]
            d.polygon(points, fill=WING, outline=OUTLINE)
            d.line([(rx, root_y + 1), (tx - side, ty)], fill=VEIN)
    colors = [('#d36e5d', '#a7443d', '#f0a080'),
              ('#779faa', '#527c89', '#bddbe0'),
              ('#61c5bb', '#347f85', '#a4e4da'),
              ('#305569', '#243d4c', '#558c98'),
              ('#edcd75', '#a47451', '#fff1d2')]
    body, shade, light = colors[species]
    if species == 2:
        d.line([(7, 5), (7, 13)], fill=OUTLINE, width=3)
        d.line([(7, 5), (7, 12)], fill=body)
        d.point((7, 9), fill=light)
    else:
        d.rectangle((6, 5, 9, 8), fill=OUTLINE)
        d.rectangle((7, 5, 8, 8), fill=body)
        d.rectangle((7, 9, 9, 13 if species == 3 else 12), fill=OUTLINE)
        d.line([(8, 9), (8, 12 if species == 3 else 11)], fill=body)
        d.point((8, 10), fill=shade)
        d.point((7, 6), fill=light)
    # Large paired eyes give an above-view silhouette readable at 16 px.
    head = '#81ac66' if species == 3 else body
    d.rectangle((5 if species == 3 else 6, 2, 10 if species == 3 else 9, 4), fill=OUTLINE)
    d.point((6, 3), fill=head)
    d.point((9, 3), fill=head)
    d.point((7, 3), fill=WHITE)
    d.point((8, 3), fill=OUTLINE)
    if species == 3:
        d.line([(6, 2), (9, 2)], fill=head)
        d.point((6, 3), fill='#bddb8d')
        d.point((9, 3), fill='#bddb8d')
    if species == 4:
        for pixel in (((2, 2), (12, 11)), ((3, 5),), ((11, 2), (3, 11)), ((12, 4),))[phase]:
            d.point(pixel, fill=WHITE)
    return image


def net(base, center, radius, size, streak=None):
    image = Image.new('RGBA', size)
    d = ImageDraw.Draw(image)
    bx, by = base
    cx, cy = center
    rx, ry = radius
    if streak:
        for points in streak:
            d.line(points, fill=VEIN)
    # White mesh bag trails behind the rim, with a stepped dark perimeter.
    bag = [(cx - rx + 1, cy + 1), (cx + rx - 1, cy + 1),
           (cx + rx - 1, cy + ry + 3), (cx + 2, cy + ry + 5),
           (cx - 2, cy + ry + 5), (cx - rx + 1, cy + ry + 3)]
    d.polygon(bag, fill=WING, outline=OUTLINE)
    for y in range(cy + 2, cy + ry + 5):
        for x in range(cx - rx + 2, cx + rx - 1):
            if (x + y) % 3 == 0 and image.getpixel((x, y))[:3] == (220, 236, 240):
                d.point((x, y), fill=VEIN)
    d.line([base, (cx - rx + 1, cy + ry)], fill=OUTLINE, width=3)
    d.line([base, (cx - rx + 1, cy + ry)], fill='#d3a46b', width=1)
    d.point(base, fill='#a47451')
    d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=OUTLINE)
    d.ellipse((cx - rx + 1, cy - ry + 1, cx + rx - 1, cy + ry - 1), fill=WHITE)
    d.ellipse((cx - rx + 2, cy - ry + 2, cx + rx - 2, cy + ry - 2), fill=WING)
    if rx >= 4:
        d.line([(cx - rx + 2, cy), (cx + rx - 2, cy)], fill=VEIN)
        d.line([(cx, cy - ry + 2), (cx, cy + ry - 2)], fill=VEIN)
    return image


def preview(sheets):
    board = Image.new('RGB', (140, 173), '#f3ead9')
    d = ImageDraw.Draw(board)
    y = 3
    for title, sheet in sheets:
        d.text((4, y), title, fill=OUTLINE)
        y += 11
        for py in range(sheet.height):
            for px in range(sheet.width):
                board.putpixel((4 + px, y + py), (222, 216, 201) if (px // 4 + py // 4) % 2 else (239, 233, 218))
        board.paste(sheet, (4, y), sheet)
        y += sheet.height + 3
    target = ROOT / '.pixel-world-test.local/bugs-preview.png'
    target.parent.mkdir(parents=True, exist_ok=True)
    board.resize((board.width * 6, board.height * 6), Image.Resampling.NEAREST).save(target)


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    flies = Image.new('RGBA', (64, 80))
    for row in range(5):
        for frame in range(4):
            flies.paste(dragonfly(row, frame), (frame * 16, row * 16))
    swing = Image.new('RGBA', (128, 32))
    poses = [((12, 5), (5, 3), None),
             ((22, 8), (6, 4), [[(14, 1), (20, 2), (25, 4)], [(16, 3), (21, 4)]]),
             ((24, 16), (6, 4), [[(21, 2), (27, 6), (30, 12)], [(24, 5), (28, 9)]]),
             ((22, 23), (6, 2), None)]
    for frame, (center, radius, streak) in enumerate(poses):
        swing.paste(net((7, 17), center, radius, (32, 32), streak), (frame * 32, 0))
    icon = net((3, 13), (10, 4), (4, 3), (16, 16))
    sheets = [('DRAGONFLIES 64x80', flies), ('NET SWING 128x32', swing), ('NET ICON 16x16', icon)]
    for filename, (_, sheet) in zip(('dragonflies.png', 'net-swing.png', 'net-icon.png'), sheets):
        sheet.save(ASSETS / filename)
    preview(sheets)


if __name__ == '__main__':
    main()
