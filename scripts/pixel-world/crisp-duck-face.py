"""병아리(duck.png) 칸마다 눈·부리만 또렷한 도트로 다시 찍는다(축소하며 생긴 번짐 제거).
실행: python -I scripts/pixel-world/crisp-duck-face.py [--preview 경로]
몸통·윤곽선·볏은 그대로 두고, 얼굴 영역 안의 어두운 점(눈)과 주황 점(부리)만 정리한다.
뒷모습처럼 눈이 둘 보이지 않는 칸은 건드리지 않는다."""
from pathlib import Path
import sys
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SHEET = ROOT / 'src/features/pixel-room/pet/assets/duck.png'
OUTLINE = (49, 34, 25)
BEAK = (217, 127, 30)
BEAK_DARK = (153, 83, 25)
SHINE = (255, 248, 193)
CELL = 32


def is_dark(c):
    return c[3] > 0 and sum(c[:3]) < 200


def is_orange(c):
    r, g, b, a = c
    return a > 0 and r > 140 and g < 175 and b < 60 and r - g > 55


def body_color(img, box):
    counts = {}
    for y in range(box[1], box[3]):
        for x in range(box[0], box[2]):
            c = img.getpixel((x, y))
            if c[3] and c[0] > 240 and c[1] > 190 and c[2] < 100:
                counts[c] = counts.get(c, 0) + 1
    return max(counts, key=counts.get) if counts else (255, 211, 58, 255)


def clusters(points):
    left, groups = set(points), []
    while left:
        stack, group = [left.pop()], []
        while stack:
            p = stack.pop(); group.append(p)
            for q in [(p[0] + dx, p[1] + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)]:
                if q in left: left.remove(q); stack.append(q)
        groups.append(group)
    return groups


def fix_cell(img, ox, oy):
    alpha = [[img.getpixel((ox + x, oy + y))[3] > 0 for x in range(CELL)] for y in range(CELL)]
    inside = lambda x, y: 0 < x < CELL - 1 and 0 < y < CELL - 1 and all(alpha[y + dy][x + dx] for dx in (-1, 0, 1) for dy in (-1, 0, 1))
    # 얼굴 안쪽(윤곽선에서 한 칸 이상 떨어진 곳)의 어두운 점 = 눈 후보.
    dark = [(x, y) for y in range(CELL) for x in range(CELL) if inside(x, y) and is_dark(img.getpixel((ox + x, oy + y)))]
    # 볏 밑·발의 어두운 점도 섞여 있으므로, 같은 높이에 나란히 있는 두 덩어리(5~12칸 간격)를 눈으로 고른다.
    ys_all = [y for y in range(CELL) for x in range(CELL) if alpha[y][x]]
    top, bottom = min(ys_all), max(ys_all)
    center = lambda g: (sum(p[0] for p in g) / len(g), sum(p[1] for p in g) / len(g))
    cands = [g for g in clusters(dark) if 2 <= len(g) <= 6 and top + (bottom - top) * .3 <= center(g)[1] <= top + (bottom - top) * .8]
    pairs = [(a, b) for i, a in enumerate(cands) for b in cands[i + 1:]
             if abs(center(a)[1] - center(b)[1]) <= 3.5 and 5 <= abs(center(a)[0] - center(b)[0]) <= 12]  # 고개를 기울인 칸은 높이가 조금 다르다
    if not pairs:
        return False
    eyes = sorted(max(pairs, key=lambda pr: len(pr[0]) + len(pr[1])), key=lambda g: center(g)[0])
    fill = body_color(img, (ox, oy, ox + CELL, oy + CELL))
    centers = []
    for g in eyes:
        xs, ys = [p[0] for p in g], [p[1] for p in g]
        closed = max(ys) == min(ys) and max(xs) - min(xs) >= 1  # 감은 눈(가로 한 줄)
        # 번진 테두리까지 몸 색으로 덮는다.
        for y in range(min(ys) - 1, max(ys) + 2):
            for x in range(min(xs) - 1, max(xs) + 2):
                c = img.getpixel((ox + x, oy + y))
                # 눈 둘레의 갈색·주황 번짐까지 몸 색으로 덮는다.
                if inside(x, y) and (is_dark(c) or is_orange(c) or (c[3] and c[1] < 190)):
                    img.putpixel((ox + x, oy + y), fill)
        cx, cy = round(sum(xs) / len(xs)), round(sum(ys) / len(ys))
        centers.append((cx, cy, closed))
    y_eye = round(sum(c[1] for c in centers) / 2)
    tilted = abs(centers[0][1] - centers[1][1]) > 1
    for cx, cy, closed in centers:
        ey = cy if tilted else y_eye
        if closed:
            for x in (cx - 1, cx, cx + 1): img.putpixel((ox + x, oy + ey), (*OUTLINE, 255))
        else:
            # 2×2 눈 + 왼쪽 위 반짝임 한 점.
            for dx in (0, 1):
                for dy in (0, 1): img.putpixel((ox + cx - 1 + dx, oy + ey - 1 + dy), (*OUTLINE, 255))
            img.putpixel((ox + cx - 1, oy + ey - 1), (*SHINE, 255))
    # 부리: 두 눈 사이 아래쪽의 주황 점들을 지우고 깔끔한 모양으로.
    mid = round((centers[0][0] + centers[1][0]) / 2)
    orange = [(x, y) for y in range(y_eye, min(CELL - 1, y_eye + 7)) for x in range(mid - 5, mid + 6)
              if inside(x, y) and (is_orange(img.getpixel((ox + x, oy + y))) or img.getpixel((ox + x, oy + y))[1] < 190)
              and not is_dark(img.getpixel((ox + x, oy + y)))]
    for x, y in orange:
        img.putpixel((ox + x, oy + y), fill)
    top = y_eye + 1
    for x in range(mid - 2, mid + 2): img.putpixel((ox + x, oy + top), (*BEAK, 255))
    for x in range(mid - 1, mid + 1): img.putpixel((ox + x, oy + top + 1), (*BEAK_DARK, 255))
    return True


def main():
    img = Image.open(SHEET).convert('RGBA')
    fixed = [fix_cell(img, (i % 4) * CELL, (i // 4) * CELL) for i in range(16)]
    img.save(SHEET)
    print('fixed cells:', [i for i, ok in enumerate(fixed) if ok])
    if '--preview' in sys.argv:
        out = Path(sys.argv[sys.argv.index('--preview') + 1])
        big = img.resize((1024, 1024), Image.Resampling.NEAREST)
        bg = Image.new('RGBA', big.size, '#9fbf9a'); bg.alpha_composite(big); bg.save(out)


if __name__ == '__main__':
    main()
