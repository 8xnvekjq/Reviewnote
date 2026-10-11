"""수정 서재(지식의 조각 전용 가구) — 16x48 픽셀 그림. 기존 슬림 책장과 같은 크기(1칸)로 놓인다.

보라 나무 책장 3단 + 책들 + 맨 위에 빛나는 지식의 조각(세로로 긴 팔면체).
  python3 scripts/pixel-world/draw-crystal-shelf.py
"""
from pathlib import Path
from PIL import Image

OUT = Path(__file__).resolve().parents[2] / 'src/features/pixel-room/assets/interior/crystal-shelf.png'
W, H = 16, 48
img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
px = img.load()

OUTLINE, FRAME, FRAME_HI, BACK, PLANK = (34, 16, 56, 255), (70, 36, 112, 255), (104, 62, 156, 255), (46, 24, 74, 255), (128, 86, 182, 255)
BOOKS = [(214, 92, 92, 255), (236, 190, 64, 255), (92, 156, 214, 255), (116, 186, 120, 255), (236, 236, 222, 255), (186, 120, 214, 255)]
GLOW, LIGHT, MID, DARK, EDGE = (200, 160, 255, 90), (232, 214, 255, 255), (170, 120, 240, 255), (118, 66, 200, 255), (72, 34, 140, 255)

def rect(x0, y0, x1, y1, color):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            px[x, y] = color

# 책장 몸통(위 14행은 수정 자리).
TOP = 14
rect(0, TOP, W - 1, H - 1, OUTLINE)
rect(1, TOP + 1, W - 2, H - 2, FRAME)
rect(1, TOP + 1, 1, H - 2, FRAME_HI)
rect(3, TOP + 3, W - 4, H - 5, BACK)
for shelf_y in (TOP + 11, TOP + 21, H - 5):
    rect(2, shelf_y, W - 3, shelf_y, PLANK)
# 책: 단마다 높이를 다르게.
for row, base in enumerate((TOP + 10, TOP + 20, H - 6)):
    x = 3
    for i, height in enumerate((7, 5, 6, 7, 4, 6)[row % 2::1][:5]):
        color = BOOKS[(i + row * 2) % len(BOOKS)]
        if x + 1 > W - 4:
            break
        rect(x, base - height + 1, min(x + 1, W - 4), base, color)
        x += 2
# 맨 아래 받침.
rect(2, H - 3, W - 3, H - 2, FRAME_HI)

# 지식의 조각: 세로로 긴 팔면체(가로 7, 세로 13), 왼쪽 면은 밝게·오른쪽 면은 어둡게.
CX, CY, HALF_W, HALF_H = 7, 7, 3, 6
for y in range(H):
    for x in range(W):
        if px[x, y][3] == 0 and abs(x - CX - 0.5) / (HALF_W + 2) + abs(y - CY) / (HALF_H + 2) <= 1:
            px[x, y] = GLOW
for y in range(CY - HALF_H, CY + HALF_H + 1):
    span = round(HALF_W * (1 - abs(y - CY) / HALF_H))
    for x in range(CX - span, CX + span + 2):
        left = x <= CX
        upper = y <= CY
        px[x, y] = LIGHT if left and upper else MID if left or upper else DARK
    px[CX - span, y] = EDGE if span else px[CX - span, y]
    px[CX + span + 1, y] = EDGE
px[CX - 1, CY - 3] = (255, 255, 255, 255)  # 반짝임
img.save(OUT, optimize=True)
print(OUT, img.size)
