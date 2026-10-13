"""천광명월 카드 가위바위보 손 카드(cards.png)와 대결 말풍선(duel-bubble.png)을 다시 그린다.

실행: python scripts/art/card_rps_cards.py
- cards.png: 32x44 프레임, 4열(바위·가위·보·뒷면) x 2행(0=내 카드 파랑, 1=상대 카드 빨강) → 128x88
- duel-bubble.png: 16x16 프레임 3개(바위·가위·보) → 48x16
- 미리보기: .test-artifacts/cards-preview.png (8배 확대, 커밋하지 않음)
손 그림은 아래 문자 격자를 손으로 찍은 것이다. 같은 입력이면 항상 같은 그림이 나온다.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'src/features/pixel-world-phaser/assets/cardRps'
PREVIEW = ROOT / '.test-artifacts/cards-preview.png'

CARD_W, CARD_H = 32, 44

INK = (43, 26, 20)
CREAM = (255, 247, 220)
CREAM_SHADE = (240, 222, 184)
SKIN_L = (250, 214, 172)
SKIN = (226, 168, 124)
SKIN_D = (181, 113, 78)
GOLD = (232, 188, 80)
GOLD_D = (168, 112, 48)
NAVY = (30, 32, 70)
INDIGO = (50, 50, 108)
STAR = (255, 240, 190)

FRAMES = {
    'player': {'C': (57, 127, 175), 'c': (32, 78, 122), 'h': (120, 178, 214)},
    'opponent': {'C': (184, 74, 80), 'c': (118, 40, 50), 'h': (226, 128, 124)},
}

# 문자 격자 범례: . 투명(카드 바탕) o 외곽선 L/S/D 피부 밝음·기본·그늘
# C/c 소매(행 색/어두운 행 색) n 손톱
BASE = {'o': INK, 'L': SKIN_L, 'S': SKIN, 'D': SKIN_D, 'n': (252, 228, 206)}

# 바위: 꽉 쥔 주먹. 위쪽 손가락 마디 4개, 가운데 접힌 마디, 엄지가 가로로 감싼다.
ROCK = [
    "",
    "",
    "",
    "",
    "",
    "",
    "......ooo.ooo.ooo.......",
    ".....oLLSoLLSoLLSoooo...",
    ".....oLSSoLSSoLSSoLSSo..",
    ".....oSSSoSSSoSSSoSSSo..",
    "....ooDSDoDSDoDSDoSSDo..",
    "...oLLoooooooooooDoDDo..",
    "..oLLSSSSoSSSoSSSoSSDo..",
    ".oLLSSSSSoSSSoSSSoSSDo..",
    ".oLSSoooooooooooooDSDo..",
    ".oLSoLLLLLLLLLLLLoDSDo..",
    ".oSSoSSSSSSSSSSSSSoDDo..",
    ".oSSSoDDDDDDDDDDDDoDDo..",
    ".oDSSSoooooooooooooDo...",
    "..oDSSSSSSSSSSSSSSDDo...",
    "...oDDSSSSSSSSSSSDDo....",
    "....ooDDDDDDDDDDDDoo....",
    "......oSSSSSSSSSDo......",
    ".....occCCCCCCCCcco.....",
    ".....oCCCCCCCCCCCco.....",
    ".....occccccccccco......",
]

# 가위: 브이. 검지·중지는 V자로 벌어져 사이가 뚫려 있고, 약지·소지는 접혀 엄지가 덮는다.
SCISSORS = [
    "....oo...........oo.....",
    "...oLSo.........oLSo....",
    "...oLSo.........oLSo....",
    "...oLSo........oLSo.....",
    "....oLSo.......oLSo.....",
    "....oLSo.......oLSo.....",
    "....oLSo......oLSo......",
    ".....oLSo.....oLSo......",
    ".....oLSo....oLSo.......",
    ".....oLSo....oLSo.......",
    "......oLSo..oLSo........",
    "......oLSo..oLSo........",
    "......oLSSooLSSo........",
    "......oLSSSSSSSoooo.....",
    ".....oLLSSSSSSSoLSSoo...",
    "....oLLSSSSSSSSoSSoLSo..",
    "....oLSSoooooooooSoSSo..",
    "....oLSoLLLLLLLLLLoSDo..",
    "....oSSoSSSSSSSSSSSoDo..",
    "....oSSSoDDDDDDDDDDoDo..",
    "....oDSSSoooooooooooDo..",
    ".....oDSSSSSSSSSSSSDo...",
    "......oDDSSSSSSSSSDo....",
    ".......ooDDDDDDDDoo.....",
    "........oSSSSSSSDo......",
    ".......occCCCCCCcco.....",
    ".......oCCCCCCCCCco.....",
    ".......occccccccco......",
]

# 보: 활짝 편 손바닥. 다섯 손가락이 모두 떨어져 있다.
PAPER = [
    "...........oo...........",
    "..........oLSo..oo......",
    "......oo..oLSo.oLSo.....",
    ".....oLSo.oLSo.oLSo.....",
    ".....oLSo.oLSo.oLSo..oo.",
    ".....oLSo.oLSo.oLSo.oLSo",
    ".....oLSo.oLSo.oLSo.oLSo",
    ".....oLSo.oLSo.oLSo.oLSo",
    ".....oLSo.oLSo.oLSo.oLSo",
    ".oo..oLSo.oLSo.oLSo.oLSo",
    "oLSo.oLSo.oLSo.oLSo.oLSo",
    "oLSo.oLSSDSLSSDSLSSDSLDo",
    ".oLSSoLSSSSSSSSSSSSSSSDo",
    "..oLSSDSSSSSSSSSSSSSSSDo",
    "...oLSSDSSSSSSSSSSSSSSDo",
    "....oLSSSSSSSSSSSSSSSSDo",
    ".....oSSSSSSSSSSSSSSSSDo",
    ".....oSSSSSSSSSSSSSSSSDo",
    "......oDSSSSSSSSSSSSSDo.",
    ".......oDDSSSSSSSSSDDo..",
    "........ooDDDDDDDDDoo...",
    ".........oSSSSSSSSDo....",
    "........occCCCCCCcco....",
    "........oCCCCCCCCCCo....",
    "........occccccccccco...",
]

# 말풍선용 작은 손(최대 12x11)
MINI_ROCK = [
    "",
    "..oo.oo.oo..",
    ".oLSoLSoLSo.",
    ".oSSoSSoSSDo",
    "oLooooooooDo",
    "oLLLLLLLLoDo",
    "oSSDDDDDDoDo",
    "oDSoooooooDo",
    ".oDSSSSSSDo.",
    "..oDDDDDDo..",
    "...oooooo...",
]
MINI_SCISSORS = [
    ".oo.....oo..",
    ".oLo...oLo..",
    ".oLSo.oLSo..",
    "..oLSoLSo...",
    "..oLSSSSoo..",
    ".oLSSSSoLSo.",
    ".oSooooooDo.",
    ".oSoLLLLoDo.",
    ".oDSoooooDo.",
    "..oDSSSSDo..",
    "...oooooo...",
]
MINI_PAPER = [
    ".....ooo.....",
    ".....oLooo...",
    "...oooLoLo...",
    "...oLoLoLooo.",
    "...oLoLoLoLo.",
    "...oLoLoLoLo.",
    "oo.oSoSoSoSo.",
    "oLLoSSSSSSDo.",
    ".oLLSSSSSSDo.",
    "..oLSSSSSSDo.",
    "...oDSSSSDo..",
    "....oooooo...",
]


def put(img, x, y, color):
    if 0 <= x < img.width and 0 <= y < img.height:
        img.putpixel((x, y), color + (255,))


def stamp(img, grid, ox, oy, palette):
    for y, row in enumerate(grid):
        for x, ch in enumerate(row):
            if ch != '.':
                put(img, ox + x, oy + y, palette[ch])


def corner_cut(x, y, w, h):
    """둥근 모서리 바깥(투명) 픽셀인지."""
    dx = min(x, w - 1 - x)
    dy = min(y, h - 1 - y)
    return dx + dy < 2


def card_frame(img, ox, oy, frame, face):
    """카드 바깥 테두리, 색 프레임, 안쪽 선, 바탕을 그린다."""
    for y in range(CARD_H):
        for x in range(CARD_W):
            if corner_cut(x, y, CARD_W, CARD_H):
                continue
            d = min(x, y, CARD_W - 1 - x, CARD_H - 1 - y)
            edge = d == 0 or (min(x, CARD_W - 1 - x) + min(y, CARD_H - 1 - y) == 2)
            if edge:
                color = INK
            elif d == 1:
                # 위·왼쪽은 밝게, 아래·오른쪽은 어둡게 해서 두께감을 준다.
                color = frame['h'] if (y == 1 or x == 1) and not (x == CARD_W - 2 or y == CARD_H - 2) else frame['C']
            elif d == 2:
                color = frame['C']
            elif d == 3:
                color = frame['c']
            else:
                color = face
            put(img, ox + x, oy + y, color)


def pip(img, ox, oy, frame):
    """작은 마름모 모서리 표시."""
    for dx, dy in [(1, 0), (0, 1), (1, 1), (2, 1), (1, 2)]:
        put(img, ox + dx, oy + dy, frame['C'])
    put(img, ox + 1, oy + 1, frame['h'])


def hand_card(img, ox, oy, frame, grid):
    card_frame(img, ox, oy, frame, CREAM)
    # 바탕 아래쪽에 살짝 그림자 띠를 깔아 종이 느낌을 낸다.
    for x in range(4, CARD_W - 4):
        put(img, ox + x, oy + CARD_H - 5, CREAM_SHADE)
    pip(img, ox + 5, oy + 5, frame)
    pip(img, ox + CARD_W - 8, oy + CARD_H - 8, frame)
    palette = dict(BASE, C=frame['C'], c=frame['c'])
    h = len(grid)
    top = 4 + (36 - h) // 2 if h else 4
    stamp(img, grid, ox + 4, oy + top, palette)


# 뒷면 초승달(11x11): G 금, g 금 그늘
MOON = [
    "...ooooo...",
    "..oGGGGo...",
    ".oGGGgo....",
    "oGGGgo.....",
    "oGGGgo.....",
    "oGGGgo.....",
    "oGGGgo.....",
    "oGGGgo.....",
    ".oGGGgo....",
    "..oGGGGo...",
    "...ooooo...",
]


def card_back(img, ox, oy, frame):
    card_frame(img, ox, oy, frame, NAVY)
    # 금색 안쪽 테 + 모서리 마름모
    x0, y0, x1, y1 = 6, 6, CARD_W - 7, CARD_H - 7
    for x in range(x0, x1 + 1):
        put(img, ox + x, oy + y0, GOLD_D)
        put(img, ox + x, oy + y1, GOLD_D)
    for y in range(y0, y1 + 1):
        put(img, ox + x0, oy + y, GOLD_D)
        put(img, ox + x1, oy + y, GOLD_D)
    for cx, cy in [(x0, y0), (x1, y0), (x0, y1), (x1, y1)]:
        for dx, dy in [(0, -1), (-1, 0), (1, 0), (0, 1), (0, 0)]:
            put(img, ox + cx + dx, oy + cy + dy, GOLD)
    # 안쪽 바둑판 점무늬(남색/쪽빛)
    for y in range(y0 + 1, y1):
        for x in range(x0 + 1, x1):
            if (x + y) % 4 == 0 and (x // 2 + y // 2) % 2 == 0:
                put(img, ox + x, oy + y, INDIGO)
    # 가운데 둥근 판 위에 초승달
    cx, cy = CARD_W // 2, CARD_H // 2
    for y in range(-9, 10):
        for x in range(-9, 10):
            r2 = x * x + y * y
            if r2 <= 64:
                put(img, ox + cx + x - 1, oy + cy + y - 1, INDIGO)
            elif r2 <= 81:
                put(img, ox + cx + x - 1, oy + cy + y - 1, GOLD_D)
    stamp(img, MOON, ox + cx - 6, oy + cy - 6, {'o': INK, 'G': GOLD, 'g': GOLD_D})
    # 별 (십자 + 가운데 밝게)
    for sx, sy in [(cx + 2, cy - 4), (cx + 4, cy + 2), (9, 10), (CARD_W - 10, CARD_H - 11)]:
        for dx, dy in [(0, -1), (-1, 0), (1, 0), (0, 1)]:
            put(img, ox + sx + dx, oy + sy + dy, GOLD)
        put(img, ox + sx, oy + sy, STAR)
    for sx, sy in [(CARD_W - 10, 10), (9, CARD_H - 11), (cx, 9), (cx, CARD_H - 10)]:
        put(img, ox + sx, oy + sy, STAR)


def build_cards():
    img = Image.new('RGBA', (CARD_W * 4, CARD_H * 2), (0, 0, 0, 0))
    for row, key in enumerate(['player', 'opponent']):
        frame = FRAMES[key]
        for col, grid in enumerate([ROCK, SCISSORS, PAPER]):
            hand_card(img, col * CARD_W, row * CARD_H, frame, grid)
        card_back(img, 3 * CARD_W, row * CARD_H, frame)
    return img


def build_bubble():
    img = Image.new('RGBA', (48, 16), (0, 0, 0, 0))
    for f, grid in enumerate([MINI_ROCK, MINI_SCISSORS, MINI_PAPER]):
        ox = f * 16
        # 둥근 상자(0..15 x 0..13) + 아래 꼬리
        for y in range(14):
            for x in range(16):
                if min(x, 15 - x) + min(y, 13 - y) < 1:
                    continue
                edge = x in (0, 15) or y in (0, 13) or (min(x, 15 - x) + min(y, 13 - y) == 1)
                put(img, ox + x, y, INK if edge else CREAM)
        for x, y, c in [(6, 13, CREAM), (7, 13, CREAM), (8, 13, CREAM), (6, 14, INK), (7, 14, CREAM), (8, 14, INK), (7, 15, INK)]:
            put(img, ox + x, y, c)
        h = len(grid)
        stamp(img, grid, ox + 2, 1 + (12 - h) // 2, BASE)
    return img


def check(img):
    assert set(img.getchannel('A').tobytes()) <= {0, 255}


def main():
    cards = build_cards()
    bubble = build_bubble()
    check(cards)
    check(bubble)
    cards.save(OUT / 'cards.png')
    bubble.save(OUT / 'duel-bubble.png')
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    scale = 8
    sheet = Image.new('RGBA', (cards.width * scale, cards.height * scale + bubble.height * scale + 16 + 48 * 3),
                      (120, 84, 60, 255))
    sheet.alpha_composite(cards.resize((cards.width * scale, cards.height * scale), Image.NEAREST), (0, 0))
    sheet.alpha_composite(bubble.resize((bubble.width * scale, bubble.height * scale), Image.NEAREST),
                          (0, cards.height * scale + 16))
    # 실제 크기(1배)와 2배도 함께 보여 준다.
    y = cards.height * scale + 16 + bubble.height * scale + 8
    sheet.alpha_composite(cards, (bubble.width * scale + 16, cards.height * scale + 16))
    sheet.alpha_composite(cards.resize((cards.width * 2, cards.height * 2), Image.NEAREST),
                          (bubble.width * scale + 160, cards.height * scale + 16))
    del y
    sheet.save(PREVIEW)
    print('wrote', OUT / 'cards.png', OUT / 'duel-bubble.png', PREVIEW)


if __name__ == '__main__':
    main()
