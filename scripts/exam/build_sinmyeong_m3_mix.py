"""One-off: 신명중 2019 3학년 2학기 중간·기말 족보를 한 장의 시험대비 테스트로 합친다 (삼각비~원주각, 31문항).

Sources are 족보닷컴 text-layer PDFs (two columns, no points labels). A question can continue into the next
column or page (중간 3·9·12번), so each question is cut as reading-order segments and stacked.
Dropped: 중간 5번(6번과 같은 삼각비 표 유형), 기말 10번(반지름이 늘며 접선이 도는 억지 문제).
중간 9~13번 서술형은 choice10(오답 근거가 있는 10지선다)으로 바꾼다. 정답은 직접 다시 풀어 원본 정답표와 대조했다.

Outputs: public question PNGs, answer-free frontend JSON, an unpublished seed migration, a publish SQL,
and (with --pdf) a printable PDF with the answer key on its own last page.
"""
import argparse
import json
import math
from pathlib import Path

import fitz
from PIL import Image, ImageDraw, ImageFont

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_school import ROOT, trim  # noqa: E402

REFERENCE = ROOT / 'reference/school-exams'
PDFS = {'mid': '[2019년 기출] 신명중학교 (서울 강동구) 3-2 중간 수학 족보 [Q].pdf',
        'fin': '[2019년 기출] 신명중학교 (서울 강동구) 3-2 기말 수학 족보 [Q].pdf'}
SECTIONS = {'mid': '2019 3학년 2학기 중간', 'fin': '2019 3학년 2학기 기말'}
QUESTION_PAGES = {'mid': 3, 'fin': 5}
PID = '2026-sinmyeong-m3-s2-midfinal-1'
SLUG = 'sinmyeong_m3_mix'
TIMESTAMP = '20261105100000'
SCHOOL = '신명중'
FONT = Path('C:/Windows/Fonts/malgunbd.ttf')
COLUMNS = [(50, 295), (302, 560)]  # page divider is a vertical rule at x=298
BODY_TOP = {1: 167}  # page 1 has the title/copyright box; other pages start under the rule
DEFAULT_TOP, BODY_BOTTOM = 65, 772
SCALE = 3
CHOICE = '①②③④⑤'

# 중간 서술형 → choice10 (정답 위치는 고르게 흩어 둔다)
TEN = {
    9: dict(answer=6, original='4\\sqrt{3}+4', choices=[
        ('4\\sqrt{3}-4', 'DC=x로 두고 BC=x+8을 DC−8로 잘못 세움'),
        ('8\\sqrt{3}+8', '분모 유리화 뒤 2를 약분하지 않음'),
        ('4\\sqrt{3}', 'AC=√3·DC에서 DC 대신 AC를 구함'),
        ('8\\sqrt{3}-8', '유리화할 때 (√3+1) 대신 (√3−1)을 곱함'),
        ('4+4\\sqrt{2}', '∠ADC를 45°로 보고 tan 대신 √2를 씀'),
        ('4\\sqrt{3}+4', '정답: ∠ADC=60°, BC=AC에서 8+x=√3x, x=4(√3+1)'),
        ('2\\sqrt{3}+2', '8 대신 4로 계산'),
        ('8\\sqrt{3}', 'BD를 DC와 같다고 봄'),
        ('4\\sqrt{3}+8', 'BC 전체를 DC로 답함'),
        ('8\\sqrt{3}+4', 'BC=x+8에서 x 자리에 8을 넣어 계산'),
    ]),
    10: dict(answer=3, original='(x,\\ y,\\ \\cos A,\\ \\tan A)=\\left(4\\sqrt{5},\\ 8,\\ \\frac{2}{3},\\ \\frac{\\sqrt{5}}{2}\\right)', choices=[
        ('\\left(8,\\ 4\\sqrt{5},\\ \\frac{2}{3},\\ \\frac{\\sqrt{5}}{2}\\right)', 'x와 y를 바꿈'),
        ('\\left(4\\sqrt{5},\\ 8,\\ \\frac{\\sqrt{5}}{3},\\ \\frac{\\sqrt{5}}{2}\\right)', 'cos A를 BC/AC로 계산'),
        ('\\left(4\\sqrt{5},\\ 8,\\ \\frac{2}{3},\\ \\frac{\\sqrt{5}}{2}\\right)', '정답: y=12·sinC=8, x=√(144−64)=4√5'),
        ('\\left(4\\sqrt{5},\\ 8,\\ \\frac{2}{3},\\ \\frac{2\\sqrt{5}}{5}\\right)', 'tan A의 분자·분모를 바꿈'),
        ('\\left(4\\sqrt{13},\\ 8,\\ \\frac{2}{3},\\ \\frac{\\sqrt{13}}{2}\\right)', 'x를 √(12²+8²)로 구함'),
        ('\\left(4\\sqrt{5},\\ 8,\\ \\frac{\\sqrt{5}}{3},\\ \\frac{2\\sqrt{5}}{5}\\right)', '∠A와 ∠C의 삼각비를 바꿈'),
        ('\\left(8,\\ 4\\sqrt{5},\\ \\frac{\\sqrt{5}}{3},\\ \\frac{2\\sqrt{5}}{5}\\right)', 'x·y와 삼각비를 모두 바꿈'),
        ('\\left(4\\sqrt{5},\\ 8,\\ \\frac{2}{3},\\ \\frac{\\sqrt{5}}{3}\\right)', 'tan A를 sin A로 답함'),
        ('\\left(4\\sqrt{5},\\ 8,\\ \\frac{3}{2},\\ \\frac{\\sqrt{5}}{2}\\right)', 'cos A의 분자·분모를 바꿈'),
        ('\\left(2\\sqrt{5},\\ 4,\\ \\frac{2}{3},\\ \\frac{\\sqrt{5}}{2}\\right)', '빗변을 6으로 봄'),
    ]),
    11: dict(answer=8, original='\\frac{\\sqrt{6}}{6}', choices=[
        ('\\frac{\\sqrt{6}}{3}', 'sin x를 FH/BH로 계산'),
        ('\\frac{\\sqrt{2}}{2}', 'tan x만 구하고 곱하지 않음'),
        ('\\frac{\\sqrt{3}}{3}', 'sin x만 구하고 곱하지 않음'),
        ('\\frac{\\sqrt{6}}{2}', 'tan x를 FH/BF로 뒤집음'),
        ('\\frac{1}{3}', 'BH를 3·5로, FH를 5로 봄'),
        ('\\frac{\\sqrt{3}}{6}', 'tan x를 1/2로 계산'),
        ('\\sqrt{6}', 'sin과 tan을 모두 뒤집음'),
        ('\\frac{\\sqrt{6}}{6}', '정답: sin x=1/√3, tan x=1/√2, 곱=1/√6'),
        ('\\frac{\\sqrt{2}}{6}', 'sin x를 1/3로 계산'),
        ('\\frac{2}{3}', 'cos x·tan x로 계산'),
    ]),
    12: dict(answer=2, original='(\\overline{BC},\\ \\overline{AC},\\ \\sin x)=\\left(\\sqrt{5},\\ 5,\\ \\frac{\\sqrt{10}}{10}\\right)', choices=[
        ('\\left(\\sqrt{5},\\ 5,\\ \\frac{\\sqrt{10}}{5}\\right)', '넓이를 ½·AD·BC가 아닌 AD·BC로 둠'),
        ('\\left(\\sqrt{5},\\ 5,\\ \\frac{\\sqrt{10}}{10}\\right)', '정답: 2a²=10→a=√5, AC=5, 넓이 5/2=½·5·√10·sin x'),
        ('\\left(\\sqrt{10},\\ 5\\sqrt{2},\\ \\frac{\\sqrt{10}}{10}\\right)', 'BC를 CD와 같다고 봄'),
        ('\\left(\\sqrt{5},\\ 5,\\ \\frac{3\\sqrt{10}}{10}\\right)', 'sin x 대신 cos x를 구함'),
        ('\\left(\\sqrt{5},\\ \\sqrt{15},\\ \\frac{\\sqrt{10}}{10}\\right)', 'AC를 √(AB²−BC²)로 계산'),
        ('\\left(\\sqrt{5},\\ 5,\\ \\frac{1}{5}\\right)', '넓이 식에서 CD를 빠뜨림'),
        ('\\left(5,\\ \\sqrt{5},\\ \\frac{\\sqrt{10}}{10}\\right)', 'BC와 AC를 바꿈'),
        ('\\left(\\sqrt{5},\\ 5,\\ \\frac{\\sqrt{5}}{5}\\right)', 'sin x를 BC/AC로 봄'),
        ('\\left(\\frac{\\sqrt{10}}{2},\\ \\frac{5}{2},\\ \\frac{\\sqrt{10}}{10}\\right)', 'CD²=a²으로 둠'),
        ('\\left(\\sqrt{5},\\ 5,\\ \\frac{1}{3}\\right)', 'tan x를 구함'),
    ]),
    13: dict(answer=9, original='25(3-\\sqrt{3})\\ \\mathrm{m}', choices=[
        ('25(3+\\sqrt{3})', '유리화할 때 부호를 틀림'),
        ('25(\\sqrt{3}-1)', 'BH=h, CH=√3h로 잘못 둠'),
        ('50(3-\\sqrt{3})', '마지막에 2로 나누지 않음'),
        ('25(\\sqrt{3}+1)', 'CH=√3h로 두고 부호도 틀림'),
        ('25\\sqrt{3}', '두 각을 모두 60°로 봄'),
        ('25', '두 각을 모두 45°로 봄'),
        ('50(\\sqrt{3}-1)', 'CH=√3h로 두고 2로 나누지 않음'),
        ('\\frac{50}{3}\\sqrt{3}', 'BH만 h·tan30°로 둠'),
        ('25(3-\\sqrt{3})', '정답: h+h/√3=50, h=50√3/(√3+1)=25(3−√3)'),
        ('75-25\\sqrt{2}', 'tan 60° 대신 √2를 씀'),
    ]),
}
# (source, original number, chapter, verified answer, raw points)
SELECTION = (
    [('mid', n, '삼각비', a, 3) for n, a in [(1, 5), (2, 5), (3, 1), (4, 4), (6, 4), (7, 1), (8, 3)]]
    + [('mid', n, '삼각비', TEN[n]['answer'], 4.4) for n in (9, 10, 11, 12, 13)]
    + [('fin', n, '원과 직선', a, 3) for n, a in [(1, 3), (2, 3), (3, 1), (4, 5), (5, 2), (6, 5), (7, 2), (8, 4), (9, 1)]]
    + [('fin', n, '원주각', a, 3) for n, a in [(11, 5), (12, 4), (13, 3), (14, 2), (15, 1), (16, 4), (17, 5), (18, 3), (19, 1), (20, 5)]]
)
# 원본 정답표(대조용)
SOURCE_KEYS = {'mid': {1: 5, 2: 5, 3: 1, 4: 4, 5: 2, 6: 4, 7: 1, 8: 3},
               'fin': {1: 3, 2: 3, 3: 1, 4: 5, 5: 2, 6: 5, 7: 2, 8: 4, 9: 1, 10: 4, 11: 5, 12: 4, 13: 3, 14: 2,
                       15: 1, 16: 4, 17: 5, 18: 3, 19: 1, 20: 5}}


def anchors(doc, pages):
    found = {}
    for pn in range(1, pages + 1):
        for block in doc[pn - 1].get_text('rawdict')['blocks']:
            for line in block.get('lines', []):
                chars = [dict(c, size=s['size']) for s in line['spans'] for c in s['chars']]
                text = ''.join(c['c'] for c in chars)
                head = text.split('.')[0]
                if not head.isdigit() or not text.startswith(head + '.') or line['spans'][0]['size'] < 13:
                    continue
                x, y = line['bbox'][:2]
                col = next((i for i, (l, _) in enumerate(COLUMNS) if l <= x < l + 12), None)
                if col is not None:
                    found[int(head)] = dict(page=pn, col=col, y=y, chars=chars[:len(head) + 1])
    return found


def segments(starts, n, pages):
    """Reading-order regions from question n's anchor to the next anchor (may span columns/pages)."""
    a = starts[n]
    order = sorted(starts.values(), key=lambda s: (s['page'], s['col'], s['y']))
    nxt = next((s for s in order if (s['page'], s['col'], s['y']) > (a['page'], a['col'], a['y'])), None)
    out, page, col, top = [], a['page'], a['col'], max(a['y'] - 6, BODY_TOP.get(a['page'], DEFAULT_TOP))
    while True:
        if nxt and (nxt['page'], nxt['col']) == (page, col):
            out.append((page, col, top, nxt['y'] - 8))
            return out
        out.append((page, col, top, BODY_BOTTOM))
        page, col = (page, 1) if col == 0 else (page + 1, 0)
        if page > pages:
            return out
        top = BODY_TOP.get(page, DEFAULT_TOP)


def render(doc, seg):
    page, col, top, bottom = seg
    left, right = COLUMNS[col]
    pix = doc[page - 1].get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), clip=fitz.Rect(left, top, right, bottom), alpha=False)
    image = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
    gray = image.convert('L')  # long dark rows are page rules, not content
    for y in range(gray.height):
        row = gray.crop((0, y, gray.width, y + 1)).getdata()
        if sum(v < 200 for v in row) > gray.width * .6:
            image.paste('white', (0, y, image.width, y + 1))
    bbox = Image.eval(image.convert('L'), lambda v: 255 if v < 245 else 0).getbbox()
    return image.crop((0, bbox[1], image.width, bbox[3])) if bbox else None


def crop(doc, starts, original, number, pages, before=None):
    a = starts[original]
    parts = [render(doc, s) for s in segments(starts, original, pages)]
    parts = [p for p in parts if p is not None]
    lead = render(doc, before) if before else None
    # 첫 조각 위에서 원래 번호를 지우고 새 번호를 쓴다.
    first = parts[0]
    left = COLUMNS[a['col']][0]
    old = a['chars']
    box = [min(c['bbox'][0] for c in old), min(c['bbox'][1] for c in old), max(c['bbox'][2] for c in old), max(c['bbox'][3] for c in old)]
    top = max(a['y'] - 6, BODY_TOP.get(a['page'], DEFAULT_TOP))
    raw = doc[a['page'] - 1].get_pixmap(matrix=fitz.Matrix(SCALE, SCALE), clip=fitz.Rect(left, top, COLUMNS[a['col']][1], top + 40), alpha=False)
    head = Image.frombytes('RGB', (raw.width, raw.height), raw.samples)
    head_bbox = Image.eval(head.convert('L'), lambda v: 255 if v < 245 else 0).getbbox()
    offset = head_bbox[1] / SCALE if head_bbox else 0  # crop trimmed blank rows above the number
    gap = 24
    pad = 30
    width = max(p.width for p in parts) + pad
    canvas = Image.new('RGB', (width, sum(p.height for p in parts) + gap * (len(parts) - 1)), 'white')
    y = 0
    for p in parts:
        canvas.paste(p, (pad, y))
        y += p.height + gap
    draw = ImageDraw.Draw(canvas)
    px = lambda x, yy: (pad + (x - left) * SCALE, (yy - top - offset) * SCALE)
    x0, y0 = px(box[0] - .8, box[1] - .8)
    x1, y1 = px(box[2] + .8, box[3] + .8)
    draw.rectangle([x0, y0, x1, y1], fill='white')
    font = ImageFont.truetype(str(FONT), round(old[0]['size'] * SCALE))
    draw.text(px(box[2], old[0]['origin'][1]), f'{number}.', font=font, fill='black', anchor='rs')
    if lead is not None:
        stacked = Image.new('RGB', (max(lead.width + pad, canvas.width), lead.height + 40 + canvas.height), 'white')
        stacked.paste(lead, (pad, 0))
        stacked.paste(canvas, (0, lead.height + 40))
        canvas = stacked
    return trim(canvas)


def scaled_points(raw, total=100):
    tenths = [p * total * 10 / sum(raw) for p in raw]
    base = [math.floor(t) for t in tenths]
    for i in sorted(range(len(raw)), key=lambda i: tenths[i] - base[i], reverse=True)[:total * 10 - sum(base)]:
        base[i] += 1
    return [b / 10 for b in base]


def q_sql(v):
    return 'null' if v is None else "'" + str(v).replace("'", "''") + "'"


def seed_sql(paper, questions):
    cols = 'id,title,exam_date,source,subject,school_grade,time_limit_minutes,electives,grade_cuts,published,kind,school_name,grade,question_count,max_score,unit_name'
    vals = [q_sql(paper['id']), q_sql(paper['title']), 'null', q_sql(paper['source']), q_sql(paper['subject']), q_sql(paper['schoolGrade']),
            str(paper['timeLimitMinutes']), "'{}'::text[]", 'null', 'false', q_sql(paper['kind']), q_sql(paper['schoolName']),
            str(paper['grade']), str(paper['questionCount']), str(paper['maxScore']), q_sql(paper['unitName'])]
    sql = '-- 신명중 2019 중간·기말 합본(삼각비~원주각). Unpublished until reviewed; publish with scripts/exam/publish_sinmyeong_m3_mix.sql\nbegin;\n'
    sql += f'insert into public.exam_papers ({cols}) values ({",".join(vals)}) on conflict do nothing;\n'
    for q in questions:
        choices = q_sql(json.dumps(q['choices'], ensure_ascii=False)) + '::jsonb' if q.get('choices') else 'null'
        sql += ('insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,curriculum_grade,curriculum_chapter,answer_type,source_label,choices) values ('
                + ','.join([q_sql(paper['id']), str(q['number']), "'common'", q_sql(q['imageUrl']), 'true', str(q['points']), q_sql(q['curriculumGrade']),
                            q_sql(q['curriculumChapter']), q_sql(q['answerType']), q_sql(q['sourceLabel']), choices]) + ') on conflict do nothing;\n')
        sql += f"insert into public.exam_answer_keys select id,{q_sql(q['answer'])} from public.exam_questions where paper_id={q_sql(paper['id'])} and number={q['number']} on conflict do nothing;\n"
    return sql + 'commit;\n'


def build_pdf(path, title, questions, images):
    """A4 2단 시험지 + 마지막 쪽 정답표."""
    dpi = 200
    W, H = int(8.27 * dpi), int(11.69 * dpi)
    margin, gutter, colw = 110, 70, None
    colw = (W - margin * 2 - gutter) // 2
    font_t = ImageFont.truetype(str(FONT), 46)
    font_s = ImageFont.truetype('C:/Windows/Fonts/malgun.ttf', 28)
    pages, page, y, col = [], None, 0, 0

    def new_page(first=False):
        nonlocal page, y, col
        page = Image.new('RGB', (W, H), 'white')
        d = ImageDraw.Draw(page)
        top = margin
        if first:
            d.text((W // 2, margin), title, font=font_t, fill='black', anchor='mt')
            d.text((W - margin, margin + 80), '이름 ____________   점수 ______ / 100', font=font_s, fill='black', anchor='rt')
            top = margin + 140
            d.line([(margin, top - 20), (W - margin, top - 20)], fill='black', width=3)
        d.line([(W // 2, top), (W // 2, H - margin)], fill='#999', width=2)
        d.text((W // 2, H - margin + 40), f'- {len(pages) + 1} -', font=font_s, fill='#555', anchor='mt')
        pages.append(page)
        y, col = top, 0
        return top

    top = new_page(first=True)
    for q in questions:
        im = images[q['number']]
        scale = colw / im.width
        im = im.resize((colw, round(im.height * scale)), Image.LANCZOS)
        if y + im.height > H - margin:
            if col == 0:
                col, y = 1, top
            else:
                top = new_page()
        x = margin + col * (colw + gutter)
        pages[-1].paste(im, (x, y))
        y += im.height + 70
    # 정답표
    key = Image.new('RGB', (W, H), 'white')
    d = ImageDraw.Draw(key)
    d.text((W // 2, margin), '정답', font=font_t, fill='black', anchor='mt')
    for i, q in enumerate(questions):
        c, r = divmod(i, 16)
        ans = CHOICE[int(q['answer']) - 1] if q['answerType'] == 'choice5' else TEN[q['original']]['original']
        if q['answerType'] != 'choice5':
            ans = {9: '4√3+4', 10: 'x=4√5, y=8, cosA=2/3, tanA=√5/2', 11: '√6/6', 12: 'BC=√5, AC=5, sin x=√10/10', 13: '25(3-√3) m'}[q['original']]
        d.text((margin + c * (W - margin * 2) // 2, margin + 120 + r * 70), f'{q["number"]}.  {ans}   ({q["curriculumChapter"]})', font=font_s, fill='black')
    pages.append(key)
    pages[0].save(path, save_all=True, append_images=pages[1:], resolution=dpi)


def build(review_dir=None, pdf=None, force=False):
    frontend_path = ROOT / 'src/features/exam/data' / f'{PID}.json'
    if frontend_path.exists() and not force:
        raise ValueError('Existing frontend paper; use --force to overwrite')
    docs = {k: fitz.open(REFERENCE / v) for k, v in PDFS.items()}
    starts = {k: anchors(docs[k], QUESTION_PAGES[k]) for k in docs}
    for k, n in (('mid', 13), ('fin', 20)):
        assert sorted(starts[k]) == list(range(1, n + 1)), (k, sorted(starts[k]))
    # 중간 1쪽 오른쪽의 삼각비 표(5·6번 공용)는 4번에서 떼어 6번 위에 붙인다.
    table_y = next(l['bbox'][1] for b in docs['mid'][0].get_text('dict')['blocks'] for l in b.get('lines', [])
                   if ''.join(sp['text'] for sp in l['spans']).startswith('※'))
    starts['mid'][0] = dict(page=1, col=1, y=table_y, chars=[])
    prefix = {('mid', 6): (1, 1, table_y - 6, starts['mid'][5]['y'] - 8)}
    questions, images, raw = [], {}, []
    for number, (src, original, chapter, answer, points) in enumerate(SELECTION, 1):
        if original in SOURCE_KEYS[src] and SOURCE_KEYS[src][original] != answer:
            raise ValueError(f'{src} {original}: verified {answer} != source {SOURCE_KEYS[src][original]}')
        a = starts[src][original]
        images[number] = crop(docs[src], starts[src], original, number, QUESTION_PAGES[src], prefix.get((src, original)))
        raw.append(points)
        q = dict(number=number, original=original, originalNumber=original, sourceSection=SECTIONS[src], sourcePage=a['page'],
                 answerType='choice5', curriculumChapter=chapter, answer=str(answer),
                 sourceLabel=f'{SCHOOL} · {SECTIONS[src]} · PDF {a["page"]}쪽 · {original}번', sourcePdf=PDFS[src])
        if src == 'mid' and original in TEN:
            t = TEN[original]
            assert len(t['choices']) == 10 and t['choices'][t['answer'] - 1][1].startswith('정답')
            q.update(answerType='choice10', choices=[c for c, _ in t['choices']], originalAnswer=t['original'],
                     distractorReasons=[r for _, r in t['choices']])
        questions.append(q)
    for q, p in zip(questions, raw):  # 객관식 3점 ×26 + 서술형(10지선다) 4.4점 ×5 = 100
        q['points'] = p
    paper = dict(id=PID, title='신명중 3학년 2학기 시험대비 1회 (삼각비~원주각)', kind='school', schoolName=SCHOOL, year=None,
                 grade=9, semester=None, examTerm=None, schoolGrade='중3', subject='중3-2', source=SCHOOL, unitName='삼각비~원주각',
                 questionCount=len(questions), timeLimitMinutes=90, maxScore=100.0, electives=[], published=False, gradeCuts=None)
    assert round(sum(q['points'] for q in questions), 6) == 100
    data = dict(paper, questions=[dict(q, section='common', curriculumGrade='중3-2', imageUrl=f'/exams/{PID}/q-{q["number"]:02}.png')
                                  for q in questions])
    public = ROOT / 'public/exams' / PID
    public.mkdir(parents=True, exist_ok=True)
    for n, image in images.items():
        image.save(public / f'q-{n:02}.png')
    private = ('answer', 'sourcePdf')
    frontend = dict(data, questions=[{k: v for k, v in q.items() if k not in private} for q in data['questions']])
    frontend_path.write_text(json.dumps(frontend, ensure_ascii=False, indent=2), encoding='utf-8')
    (ROOT / 'supabase/migrations' / f'{TIMESTAMP}_exam_{SLUG}_seed.sql').write_text(seed_sql(paper, data['questions']), encoding='utf-8')
    (ROOT / 'scripts/exam' / f'publish_{SLUG}.sql').write_text(
        f"-- Only after question/answer review.\nupdate public.exam_papers set published=true where id='{PID}' and kind='school';\n", encoding='utf-8')
    if review_dir:
        out = Path(review_dir)
        out.mkdir(parents=True, exist_ok=True)
        (out / 'data.json').write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    if pdf:
        build_pdf(pdf, paper['title'], data['questions'], images)
    print(f'{PID}: {len(questions)} questions, total {sum(q["points"] for q in questions):g}')
    return data


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--review-dir')
    parser.add_argument('--pdf')
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    build(args.review_dir, args.pdf, args.force)
