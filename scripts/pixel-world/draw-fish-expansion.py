from pathlib import Path
import argparse
import hashlib
import json

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'src/features/pixel-world-phaser/assets/fishing'
ORIGINAL_HASH = '2fde85e7e4b0ad943fd01843a139155993332d5fda27a27cdee89fc654d36134'
PALETTE = {
    'O': '#493c36', 'W': '#fff1d2', 'A': '#bddbe0', 'B': '#779faa',
    'C': '#527c89', 'T': '#305569', 'E': '#406f80', 'F': '#558c98',
    'K': '#d3a46b', 'L': '#a47451', 'N': '#e0c395', 'Y': '#edcd75',
    'R': '#d36e5d',
}

# 기존 물고기처럼 오른쪽을 바라보는 1픽셀 외곽선 도안.
SHARK = [
    '................',
    '.......O........',
    '......OBO.......',
    '.O....OBBO......',
    '.OO..OCBBO......',
    '.OCOOCCBBBOOO...',
    '..OCCCCBBBBAAO..',
    '...OCCCBCBBWOAO.',
    '..OCCCCBCBBBAAO.',
    '.OCOOCCBCWWWOO..',
    '.OO..OWWWOWO....',
    '.O....OOBOO.....',
    '........OO......',
    '................',
    '................',
    '................',
]
WHALE = [
    '................',
    '................',
    '........OOOOO...',
    '.OO...OOTTTTTO..',
    '.OTO.OTTEEETTTO.',
    '..OTOTTEEETTTTO.',
    '...OOTEEETTTTTO.',
    '..OTTTTTTTTOWTO.',
    '.OTOTTTTTTTTTTO.',
    '.OO.OTTTTTTTTTO.',
    '.....OAAACACAO..',
    '......OAACACO...',
    '.......OOTOO....',
    '.........OO.....',
    '................',
    '................',
]
SHOE = [
    '................',
    '................',
    '....OOOOOO......',
    '....OLLLLO......',
    '....OLKKLO......',
    '....OLNWLO......',
    '....OLKLLO......',
    '....OLNWLO......',
    '....OLKLLOOO....',
    '...OOLKKLKKKO...',
    '..OLLLKKKKKKKO..',
    '..OLLLLLLLLLLO..',
    '..OOOOOOOOOOOO..',
    '................',
    '................',
    '................',
]
CAN = [
    '................',
    '................',
    '.....OOOOOO.....',
    '....OABOOAAO....',
    '....OBOOOOBO....',
    '....OABBBBCO....',
    '.....OABBBBO....',
    '....OANNNNCO....',
    '....OANRRNCO....',
    '....OANNNNCO....',
    '....OABBBCO.....',
    '....OABBBBCO....',
    '.....OOOOOO.....',
    '................',
    '................',
    '................',
]
COIN = [
    '................',
    '................',
    '......OOOO......',
    '....OONKKLOO....',
    '...ONWYKKKLLO...',
    '...OWYKKLLLLO...',
    '..ONKKLOOLLLLO..',
    '..OKKLOKKOLLLO..',
    '..OKLLOKLOLLLO..',
    '..OLLLLOOLLLLO..',
    '...OLLLLRLLLO...',
    '...OLLRLLLLLO...',
    '....OOLLLLOO....',
    '......OOOO......',
    '................',
    '................',
]


def sprite(rows):
    assert len(rows) == 16 and all(len(row) == 16 for row in rows)
    image = Image.new('RGBA', (16, 16))
    draw = ImageDraw.Draw(image)
    for y, row in enumerate(rows):
        for x, key in enumerate(row):
            if key != '.':
                draw.point((x, y), fill=PALETTE[key])
    return image


def original_region(image):
    assert image.height == 16 and image.width in (192, 224)
    region = image.crop((0, 0, 192, 16))
    assert hashlib.sha256(region.tobytes()).hexdigest() == ORIGINAL_HASH
    return region


def check_assets():
    fish = Image.open(ASSETS / 'fish-icons.png').convert('RGBA')
    junk = Image.open(ASSETS / 'junk-icons.png').convert('RGBA')
    assert fish.size == (224, 16) and junk.size == (48, 16)
    original_region(fish)
    counts = []
    for sheet, indices in [(fish, (12, 13)), (junk, (0, 1, 2))]:
        for index in indices:
            cell = sheet.crop((index * 16, 0, (index + 1) * 16, 16))
            alpha = cell.getchannel('A')
            count = alpha.tobytes().count(255)
            assert 0 < count < 256
            assert set(alpha.tobytes()) == {0, 255}
            assert any(cell.getpixel((x, y)) == (73, 60, 54, 255) for y in range(16) for x in range(16))
            counts.append(count)
    return {'originalHash': ORIGINAL_HASH, 'fishSize': list(fish.size),
            'junkSize': list(junk.size), 'opaquePixels': counts}


def generate():
    original = original_region(Image.open(ASSETS / 'fish-icons.png').convert('RGBA'))
    fish = Image.new('RGBA', (224, 16))
    fish.paste(original, (0, 0))
    for index, rows in enumerate((SHARK, WHALE), 12):
        fish.paste(sprite(rows), (index * 16, 0))
    junk = Image.new('RGBA', (48, 16))
    for index, rows in enumerate((SHOE, CAN, COIN)):
        junk.paste(sprite(rows), (index * 16, 0))
    assert fish.crop((0, 0, 192, 16)).tobytes() == original.tobytes()
    fish.save(ASSETS / 'fish-icons.png')
    junk.save(ASSETS / 'junk-icons.png')

    # 체크무늬 위에 정수 배율로 표시해 투명 여백과 픽셀을 확인한다.
    preview = Image.new('RGB', (224 * 6, 240), '#f3ebdc')
    draw = ImageDraw.Draw(preview)
    for sheet, top, label in [(fish, 24, 'FISH 1-14 / 6X'), (junk, 144, 'JUNK: SHOE / CAN / COIN / 6X')]:
        draw.text((0, top - 18), label, fill=PALETTE['O'])
        for y in range(0, 96, 12):
            for x in range(0, sheet.width * 6, 12):
                if (x // 12 + y // 12) % 2:
                    draw.rectangle((x, top + y, x + 11, top + y + 11), fill='#ded6c7')
        enlarged = sheet.resize((sheet.width * 6, 96), Image.Resampling.NEAREST)
        preview.paste(enlarged, (0, top), enlarged)
    destination = ROOT / '.pixel-world-test.local/fish-expansion-preview.png'
    destination.parent.mkdir(parents=True, exist_ok=True)
    preview.save(destination)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    if not args.check:
        generate()
    print(json.dumps(check_assets()))
