"""One-off: combine 해성국제컨벤션고 past papers into one 고1 practice paper (평면좌표~집합).

Sources are several retyped text-layer PDFs (different layouts, no shared section
format), so import_worksheet.py cannot take them directly. Output shape matches the
`2026-gaeplus-m3-s2-midfinal-1` import: public question PNGs, answer-free frontend
JSON, an unpublished seed migration and a separate publish SQL. Answers are
hand-verified and cross-checked against each source answer table; review assets
go only to the local --review-dir.

Crops: the original question number is whited out and the new number drawn in its
place (right-aligned to the old number); the original points label is whited out
because points are rescaled to a total of 100.
"""
import argparse
import json
import math
import re
import sys
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_school import ROOT, ink_rows, trim  # noqa: E402
from import_worksheet import seed_sql  # noqa: E402

REFERENCE = Path('C:/Users/8xnve/Documents/ReviewNotes/reference/school-exams/해성국제컨벤션-공통수학2-모음')
PID = '2026-haecon-g1-s2-mid-prep-1'
SLUG = 'haecon_g1_mix'
TIMESTAMP = '20261019120000'
SCHOOL = '해성국제컨벤션고'
FONTS = Path('C:/Windows/Fonts')
CHOICE = '①②③④⑤'

# columns/bodyBottom in PDF points; scale keeps rendered text size equal across page sizes.
SOURCES = {
    '2020F': dict(pdf='2020-1-1-final-retyped.pdf', section='2020학년도 1학년 1학기 기말', columns=[(58, 294), (300, 538)],
                  bodyBottom=755, scale=3, keyPage=5, font='malgun.ttf'),
    '2021F': dict(pdf='2021-1-1-final-retyped.pdf', section='2021학년도 1학년 1학기 기말', columns=[(58, 294), (300, 538)],
                  bodyBottom=755, scale=3, keyPage=5, font='malgun.ttf'),
    '2022F': dict(pdf='2022-1-1-final-retyped.pdf', section='2022학년도 1학년 1학기 기말', columns=[(80, 416), (424, 762)],
                  bodyBottom=1075, scale=3 * 595 / 841, keyPage=5, font='malgun.ttf'),
    # Retyped 2학기 중간 has no points labels; points come from the original scan (2020-1-2-mid.pdf).
    '2020M': dict(pdf='2020-1-2-mid-retyped.pdf', section='2020학년도 1학년 2학기 중간', columns=[(58, 294), (300, 538)],
                  bodyBottom=757, scale=2.6, keyPage=4, font='malgunbd.ttf', numberSize=9.2,
                  scanPoints={1: 3.1, 2: 3.4, 5: 3.6, 6: 3.2, 7: 3.2, 8: 2.8, 10: 3.0, 12: 3.3, 13: 2.5, 14: 3.5, 15: 3.2, 16: 3.4}),
}

# Final order: (source, original number, chapter, verified answer)
SELECTION = [
    ('2021F', 6, '평면좌표', 3), ('2021F', 7, '평면좌표', 5), ('2022F', 4, '평면좌표', 4), ('2020F', 9, '평면좌표', 5),
    ('2021F', 13, '직선의 방정식', 4), ('2022F', 5, '직선의 방정식', 1), ('2022F', 6, '직선의 방정식', 5),
    ('2022F', 12, '직선의 방정식', 1), ('2020F', 16, '직선의 방정식', 3),
    ('2020M', 1, '원의 방정식', 1), ('2021F', 17, '원의 방정식', 2), ('2020M', 2, '원의 방정식', 4),
    ('2020M', 5, '원의 방정식', 2), ('2021F', 22, '원의 방정식', 3),
    ('2020M', 6, '도형의 이동', 4), ('2020M', 8, '도형의 이동', 1), ('2020M', 7, '도형의 이동', 3),
    ('2020M', 10, '집합', 5), ('2020M', 13, '집합', 3), ('2020M', 12, '집합', 4),
    ('2020M', 15, '집합', 5), ('2020M', 16, '집합', 2), ('2020M', 14, '집합', 4),
]

POINTS = re.compile(r'[\[(]\s*(\d+(?:\.\d+)?)\s*점\s*[\])]')


def lines(page):
    """Text lines as (text, chars) from rawdict, chars carrying bbox/origin/size."""
    out = []
    for block in page.get_text('rawdict')['blocks']:
        for line in block.get('lines', []):
            chars = [dict(c, size=s['size']) for s in line['spans'] for c in s['chars']]
            out.append((''.join(c['c'] for c in chars), chars))
    return out


def anchors(doc, src):
    """Question anchors: a line starting with 'N.' at a column's left edge (question pages only)."""
    found = {}
    for pn, page in enumerate(doc, 1):
        if pn >= src['keyPage']:
            break
        for text, chars in lines(page):
            m = re.match(r'(\d{1,2})\.', text)
            if not m:
                continue
            x, y = chars[0]['bbox'][:2]
            col = next((i for i, (l, _) in enumerate(src['columns']) if l <= x < l + 8), None)
            if col is None or y > src['bodyBottom']:
                continue
            n = int(m[1])
            # Written-answer pages restart at 1; keep only the first (multiple-choice) run.
            if n in found:
                continue
            found[n] = dict(page=pn, col=col, y=y, chars=chars[:len(m[0])])
    return found


def answer_key(doc, src):
    page = doc[src['keyPage'] - 1]
    if 'scanPoints' in src:
        return {int(m[1]): int(m[2]) for m in re.finditer(r'(\d+)\. \[정답\] ([1-5])\n', page.get_text())}
    words = [w for w in page.get_text('words') if w[1] < page.rect.height * .55 and re.fullmatch(r'\d+', w[4])]
    rows = []
    for w in sorted(words, key=lambda w: (w[1] + w[3]) / 2):
        mid = (w[1] + w[3]) / 2
        if rows and abs(rows[-1][0] - mid) < 4:
            rows[-1][1].append(w)
        else:
            rows.append([mid, [w]])
    key = {}
    for _, row in rows:
        row.sort(key=lambda w: w[0])
        if len(row) % 2:
            continue
        for label, value in zip(row[::2], row[1::2]):
            key[int(label[4])] = int(value[4])
    return key


def crop(doc, src, starts, original, number):
    a = starts[original]
    page = doc[a['page'] - 1]
    left, right = src['columns'][a['col']]
    following = [s['y'] for s in starts.values() if (s['page'], s['col']) == (a['page'], a['col']) and s['y'] > a['y']]
    bottom = min(following) - 8 if following else src['bodyBottom']
    top = a['y'] - 14  # room for a raised brace/fraction; trimmed below if blank
    clip = fitz.Rect(left, top, right, bottom)
    sc = src['scale']
    pix = page.get_pixmap(matrix=fitz.Matrix(sc, sc), clip=clip, alpha=False)
    image = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    # Page/column border rules (long dark rows) are layout, not question content.
    gray = image.convert('L')
    for y in range(gray.height):
        row = gray.crop((0, y, gray.width, y + 1)).getdata()
        if sum(v < 160 for v in row) > gray.width * .5:
            image.paste('white', (0, y, image.width, y + 1))
    # A neighbour's raised brace/fraction can enter the window: cut at the nearest blank run.
    rows, run = ink_rows(image), 15
    if any(rows[-3:]):
        cut = next(i for i in range(len(rows) - 3, run, -1) if not any(rows[i - run:i]))
        image = image.crop((0, 0, image.width, cut - run // 2))
    if any(rows[:3]):
        start = next(i for i in range(3, len(rows) - run) if not any(rows[i:i + run]))
        image = image.crop((0, start, image.width, image.height))
        top += start / sc
    pad = 60  # left gutter for a wider replacement number
    canvas = Image.new('RGB', (image.width + pad, image.height), 'white')
    canvas.paste(image, (pad, 0))
    draw = ImageDraw.Draw(canvas)
    px = lambda x, y: (pad + (x - left) * sc, (y - top) * sc)

    def white(bbox):
        x0, y0 = px(bbox[0] - .6, bbox[1] - .6)
        x1, y1 = px(bbox[2] + .6, bbox[3] + .6)
        draw.rectangle([x0, y0, x1, y1], fill='white')

    region = [(t, c) for t, c in lines(page) if c and clip.contains(fitz.Rect(c[0]['bbox']).tl)
              and left <= c[0]['bbox'][0] < right]
    removed = 0
    for text, chars in region:
        for m in POINTS.finditer(text):
            span = chars[m.start():m.end()]
            white((min(c['bbox'][0] for c in span), min(c['bbox'][1] for c in span),
                   max(c['bbox'][2] for c in span), max(c['bbox'][3] for c in span)))
            removed += 1
    if removed != (0 if 'scanPoints' in src else 1):
        raise ValueError(f'{original}: expected one points label in crop, found {removed}')
    old = a['chars']
    box = (min(c['bbox'][0] for c in old), min(c['bbox'][1] for c in old),
           max(c['bbox'][2] for c in old), max(c['bbox'][3] for c in old))
    white(box)
    size = src.get('numberSize', old[0]['size']) * sc
    font = ImageFont.truetype(str(FONTS / src['font']), round(size))
    x, baseline = px(box[2], old[0]['origin'][1])
    draw.text((x, baseline), f'{number}.', font=font, fill='black', anchor='rs')
    rows = ink_rows(canvas)
    if any(rows[-3:]):
        raise ValueError(f'{original}: ink at crop bottom; inspect')
    return trim(canvas)


def scaled_points(raw, total=100):
    """Keep relative weights; round to 0.1 by largest remainder so the sum is exact."""
    tenths = [p * total * 10 / sum(raw) for p in raw]
    base = [math.floor(t) for t in tenths]
    for i in sorted(range(len(raw)), key=lambda i: tenths[i] - base[i], reverse=True)[:total * 10 - sum(base)]:
        base[i] += 1
    return [b / 10 for b in base]


def build(review_dir=None, force=False):
    frontend_path = ROOT / 'src/features/exam/data' / f'{PID}.json'
    if frontend_path.exists() and not force:
        raise ValueError('Existing frontend paper; use --force to overwrite')
    docs, starts, keys = {}, {}, {}
    for name, src in SOURCES.items():
        docs[name] = fitz.open(REFERENCE / src['pdf'])
        starts[name] = anchors(docs[name], src)
        keys[name] = answer_key(docs[name], src)
    questions, images, raw = [], {}, []
    for number, (name, original, chapter, answer) in enumerate(SELECTION, 1):
        src, doc = SOURCES[name], docs[name]
        if keys[name].get(original) != answer:
            raise ValueError(f'{name} {original}: verified answer {answer} != source key {keys[name].get(original)}')
        a = starts[name][original]
        if 'scanPoints' in src:
            points = src['scanPoints'][original]
        else:
            following = [s['y'] for s in starts[name].values() if (s['page'], s['col']) == (a['page'], a['col']) and s['y'] > a['y']]
            left, right = src['columns'][a['col']]
            text = doc[a['page'] - 1].get_text(clip=fitz.Rect(left, a['y'] - 2, right, min(following or [src['bodyBottom']])))
            found = POINTS.findall(text)
            if len(found) != 1:
                raise ValueError(f'{name} {original}: expected one points label')
            points = float(found[0])
        raw.append(points)
        images[number] = crop(doc, src, starts[name], original, number)
        questions.append(dict(number=number, original=original, originalNumber=original, sourceSection=src['section'],
                              sourcePage=a['page'], answerType='choice5', originalPoints=points, curriculumChapter=chapter,
                              sourceLabel=f'{SCHOOL} · {src["section"]} · PDF {a["page"]}쪽 · {original}번',
                              answer=str(answer), sourcePdf=src['pdf']))
    for q, p in zip(questions, scaled_points(raw)):
        q['points'] = p
    paper = dict(id=PID, title=f'{SCHOOL} 1학년 2학기 중간 대비 1회 (평면좌표~집합)', kind='school', schoolName=SCHOOL,
                 year=None, grade=1, semester=None, examTerm=None, schoolGrade='고1', subject='공통수학2',
                 source=SCHOOL, unitName='평면좌표~집합', questionCount=len(questions), timeLimitMinutes=50,
                 maxScore=100.0, electives=[], published=False, gradeCuts=None)
    assert round(sum(q['points'] for q in questions), 6) == paper['maxScore']
    data = dict(paper, questions=[dict(q, section='common', curriculumGrade=paper['subject'],
                                       imageUrl=f'/exams/{PID}/q-{q["number"]:02}.png') for q in questions])
    public = ROOT / 'public/exams' / PID
    public.mkdir(parents=True, exist_ok=True)
    for n, image in images.items():
        image.save(public / f'q-{n:02}.png')
    private = ('answer', 'originalPoints', 'sourcePdf')
    frontend = dict(data, questions=[{k: v for k, v in q.items() if k not in private} for q in data['questions']])
    frontend_path.write_text(json.dumps(frontend, ensure_ascii=False, indent=2), encoding='utf-8')
    (ROOT / 'supabase/migrations' / f'{TIMESTAMP}_exam_{SLUG}_seed.sql').write_text(seed_sql(data), encoding='utf-8')
    (ROOT / 'scripts/exam' / f'publish_{SLUG}.sql').write_text(
        f"-- Only after question/answer review.\nupdate public.exam_papers set published=true where id='{PID}' and kind='school';\n",
        encoding='utf-8')
    if review_dir:
        write_review(Path(review_dir), data, images)
    print(f'{PID}: {len(questions)} questions, total {sum(q["points"] for q in questions):g}')
    return data


def write_review(out, data, images):
    out.mkdir(parents=True, exist_ok=True)
    (out / 'data.json').write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    cards = ''.join(
        f'<article><h2>{q["number"]}번 · 정답 {CHOICE[int(q["answer"]) - 1]} · {q["originalPoints"]:g}→{q["points"]:g}점 · '
        f'{q["curriculumChapter"]} · {q["sourceLabel"]}</h2><img src="../../public{q["imageUrl"]}"></article>'
        for q in data['questions'])
    (out / 'review.html').write_text(
        '<!doctype html><html lang="ko"><meta charset="utf-8"><title>검토</title><style>body{font-family:system-ui;'
        'background:#eee;margin:24px}article{background:#fff;padding:16px;margin:16px 0}img{max-width:100%}</style>'
        f'<h1>{data["title"]}</h1>' + cards + '</html>', encoding='utf-8')
    font = ImageFont.truetype(str(FONTS / 'malgunbd.ttf'), 22)
    tiles = []
    for q in data['questions']:
        im = images[q['number']]
        tile = Image.new('RGB', (780, im.height + 44), 'white')
        ImageDraw.Draw(tile).text((8, 8), f'{q["number"]}번  정답 {CHOICE[int(q["answer"]) - 1]}  {q["points"]:g}점  '
                                  f'{q["curriculumChapter"]}  ({q["sourceSection"]} {q["original"]}번)', font=font, fill='#b00020')
        tile.paste(im, (0, 40))
        tiles.append(tile)
    half = (len(tiles) + 1) // 2
    cols = [tiles[:half], tiles[half:]]
    height = max(sum(t.height for t in c) for c in cols)
    sheet = Image.new('RGB', (1580, height), '#ddd')
    for i, col in enumerate(cols):
        y = 0
        for t in col:
            sheet.paste(t, (i * 800, y))
            y += t.height + 2
    sheet.save(out / 'sheet.png')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--review-dir')
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    build(args.review_dir, args.force)
