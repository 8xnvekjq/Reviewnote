"""Text-PDF worksheet importer; private solutions never go into public assets."""
import argparse
import copy
import html
import json
import re
from pathlib import Path

import fitz
from PIL import Image

from import_school import (ROOT, START, NeedsExceptions, blank_boundary, crop_questions,
                           detect_layout, ink_rows, normalize, quote, trim)

KEY = re.compile(r'^(\d+)\)\s*([^\n]+)')
CIRCLED = str.maketrans('➀➁➂➃➄❶❷❸❹❺', '①②③④⑤①②③④⑤')


def parse_answer(raw):
    value = normalize(raw.translate(CIRCLED))
    if value in '①②③④⑤' and len(value) == 1:
        return 'choice5', str('①②③④⑤'.index(value) + 1)
    if re.fullmatch(r'\d{1,3}', value):
        return 'digits', str(int(value))
    return None


def anchors(doc, layout, pages, pattern):
    found = {}
    for pn in pages:
        for block in doc[pn - 1].get_text('blocks'):
            match = pattern.match(block[4])
            if not match:
                continue
            n = int(match[2] if pattern is START else match[1])
            col = next((i for i, (left, right) in enumerate(layout['columns']) if left <= block[0] < right), None)
            if col is None or n in found:
                raise ValueError(f'Ambiguous/duplicate anchor {n} on page {pn}')
            found[n] = (pn, col, block[1], match)
    return found


def solution_images(doc, layout, starts):
    """Reading order is page, left column, right column; join continuations vertically."""
    regions = [(pn, col) for pn in layout['answerPages'] for col in range(len(layout['columns']))]
    columns, boundaries = {}, {}
    width = round(max(right - left for left, right in layout['columns']) * 3)
    for pn, col in regions:
        left, right = layout['columns'][col]
        bottom = layout['bodyBottom']
        pix = doc[pn - 1].get_pixmap(matrix=fitz.Matrix(3, 3), clip=fitz.Rect(left, 0, right, bottom), alpha=False)
        image = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        columns[pn, col] = image, ink_rows(image)
    for n, (pn, col, y, _) in starts.items():
        image, rows = columns[pn, col]
        # The first solution may follow a ruled key table. Do not include its rule.
        floor = max(round(layout['bodyTop'] * 3), round(y * 3) - 24)
        boundaries[n] = blank_boundary(rows, round(y * 3) + 8, floor, 12)
    images, segments, warnings = {}, {}, []
    for n, (pn, col, _, _) in starts.items():
        first = regions.index((pn, col))
        next_start = starts.get(n + 1)
        last = regions.index(next_start[:2]) if next_start else len(regions) - 1
        pieces, refs = [], []
        for index in range(first, last + 1):
            p, c = regions[index]
            image, rows = columns[p, c]
            top = boundaries[n] if index == first else round(layout['bodyTop'] * 3)
            bottom = boundaries[n + 1] if next_start and index == last else image.height
            if bottom <= top:
                continue
            piece = image.crop((0, top, image.width, bottom))
            if not any(ink_rows(piece)):
                continue
            if any(ink_rows(piece)[:3] + ink_rows(piece)[-3:]):
                warnings.append(f'Solution {n}: source edge has ink within 3px')
            piece = trim(piece)
            padded = Image.new('RGB', (width, piece.height), 'white')
            padded.paste(piece, (0, 0))
            pieces.append(padded)
            refs.append(dict(page=p, column=c, top=top / 3, bottom=bottom / 3))
        if not pieces:
            raise ValueError(f'Empty solution {n}')
        result = Image.new('RGB', (width, sum(p.height for p in pieces)), 'white')
        offset = 0
        for piece in pieces:
            result.paste(piece, (0, offset))
            offset += piece.height
        images[n], segments[n] = result, refs
    return images, segments, warnings


def prepare(doc, config):
    first_key = next((i + 1 for i, p in enumerate(doc) if any(KEY.match(b[4]) for b in p.get_text('blocks'))), None)
    if first_key is None:
        raise ValueError('No solution anchors found')
    overrides = dict(config.get('layout', {}))
    overrides.setdefault('questionPages', list(range(1, first_key)))
    overrides.setdefault('answerPages', list(range(first_key, len(doc) + 1)))
    layout, auto = detect_layout(doc, overrides)
    # Explanation pages have no N. anchors; outer rules delimit their body.
    layout['bodyTop'] = 0
    # Answer pages have no N. anchors: their outer rule gives the content limits.
    for pn, page in enumerate(doc, 1):
        rules = [d['rect'] for d in page.get_drawings() if d['rect'].width > page.rect.width * .6 and d['rect'].height < 4]
        if rules:
            layout['bodyTop'] = max(layout['bodyTop'], min(r.y1 for r in rules) + 2)
            layout['bodyBottom'] = min(layout['bodyBottom'], max(r.y0 for r in rules) - 2)
            if pn in layout['questionPages']:
                layout['pageBodyBottom'][str(pn)] = max(r.y0 for r in rules) - 2
                top_rules = [r for r in rules if r.y1 < page.rect.height * .2]
                if top_rules:
                    layout['pageBodyTop'][str(pn)] = max(r.y1 for r in top_rules) + 2
    qs = anchors(doc, layout, layout['questionPages'], START)
    ks = anchors(doc, layout, layout['answerPages'], KEY)
    if not qs or sorted(qs) != list(range(1, len(qs) + 1)) or set(qs) != set(ks):
        raise ValueError(f'Question/key/solution counts disagree: {len(qs)}/{len(ks)}')
    for found in (qs, ks):
        ordered = [found[n][:3] for n in sorted(found)]
        if ordered != sorted(ordered):
            raise ValueError('Anchors do not follow page/column reading order')
    if config['paper'].get('questionCount', len(qs)) != len(qs):
        raise ValueError('Configured question count disagrees with PDF')
    exceptions = {q['number']: q for q in config.get('questions', [])}
    questions, ambiguous = [], []
    for n, (pn, col, y, _) in qs.items():
        left, right = layout['columns'][col]
        end = min([a[2] for a in qs.values() if a[:2] == (pn, col) and a[2] > y] or [layout['bodyBottom']])
        text = doc[pn - 1].get_text(clip=fitz.Rect(left, y - 10, right, end))
        points = re.findall(r'\[\s*(\d+(?:\.\d+)?)\s*점\s*\]', text)
        labels = re.findall(r'\[([^\]]*년[^\]]+)\]', text)
        spec = exceptions.get(n, {})
        answer = parse_answer(ks[n][3][2])
        if answer and spec.get('answer') is not None and str(spec['answer']) != answer[1]:
            raise ValueError(f'Question {n}: configured answer disagrees with PDF')
        if not answer:
            if not spec.get('answerType') or not spec.get('answer') or spec.get('sourceAnswerText') != ks[n][3][2]:
                ambiguous.append(n)
                continue
            answer = (spec['answerType'], str(spec['answer']))
            if answer[0] not in ('choice5', 'digits') or not re.fullmatch(r'\d{1,3}', answer[1]) or (answer[0] == 'choice5' and not 1 <= int(answer[1]) <= 5):
                raise ValueError(f'Question {n}: invalid configured typed answer')
        if len(points) != 1 or len(labels) != 1:
            raise ValueError(f'Question {n}: expected one points/source label')
        questions.append(dict(number=n, original=n, answerType=answer[0], answer=answer[1],
                              points=float(points[0]), sourceLabel=labels[0], sourcePage=pn))
    if ambiguous:
        raise NeedsExceptions(ambiguous, questions)
    resolved = copy.deepcopy(config)
    # Restore question-page tops for crop_questions, with raised glyph blank detection.
    resolved.update(layout=layout, questions=sorted(questions, key=lambda q: q['number']))
    return resolved, {n: a[:3] for n, a in qs.items()}, ks, auto


def seed_sql(data):
    p = data
    columns = 'id,title,exam_date,source,subject,school_grade,time_limit_minutes,electives,grade_cuts,published,kind,school_name,grade,question_count,max_score,unit_name'
    values = [quote(p['id']), quote(p['title']), 'null', quote(p['source']), quote(p['subject']), quote(p['schoolGrade']),
              'null', "'{}'::text[]", 'null', 'false', "'worksheet'", quote(p['schoolName']), str(p['grade']),
              str(p['questionCount']), str(p['maxScore']), quote(p['unitName'])]
    sql = '-- Worksheet reviewed separately; remains unpublished. Review images remain local only.\nbegin;\n'
    sql += f'insert into public.exam_papers ({columns}) values ({",".join(values)}) on conflict do nothing;\n'
    for q in p['questions']:
        sql += 'insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,curriculum_grade,curriculum_chapter,answer_type,source_label) values ('
        sql += ','.join([quote(p['id']), str(q['number']), "'common'", quote(q['imageUrl']), str(q['answerType'] != 'digits').lower(), str(q['points']), quote(q['curriculumGrade']), quote(q['curriculumChapter']), quote(q['answerType']), quote(q['sourceLabel'])]) + ') on conflict do nothing;\n'
        sql += f"insert into public.exam_answer_keys select id,{quote(q['answer'])} from public.exam_questions where paper_id={quote(p['id'])} and number={q['number']} on conflict do nothing;\n"
    return sql + 'commit;\n'


def review_html(data, warnings):
    esc = lambda s: html.escape(str(s))
    cards = []
    for q in data['questions']:
        cards.append(f'<article><h2>{q["number"]}번 · 정답 {esc(q["answer"])} · {q["points"]:g}점 · {esc(q["sourceLabel"])}</h2><div><img src="public{esc(q["imageUrl"])}" alt="{q["number"]}번 문제"><img src="private-solutions/{esc(q["solutionKey"])}" alt="{q["number"]}번 해설"></div></article>')
    return '<!doctype html><html lang="ko"><meta charset="utf-8"><title>' + esc(data['title']) + '</title><style>body{font-family:system-ui;background:#eee;margin:24px}article{background:white;padding:18px;margin:20px 0}article>div{display:grid;grid-template-columns:1fr 1fr;gap:24px}img{width:100%;height:auto}aside{color:#b00020}@media(max-width:800px){article>div{grid-template-columns:1fr}}</style><h1>' + esc(data['title']) + f'</h1><aside>경고 {len(warnings)}개' + ''.join('<p>' + esc(w) + '</p>' for w in warnings) + '</aside>' + ''.join(cards) + '</html>'


def run(config_path, out_dir=None, sheet=False, force=False):
    config_path = Path(config_path).resolve()
    config = json.loads(config_path.read_text(encoding='utf-8-sig'))
    if config.get('schemaVersion') != 1 or config['paper'].get('kind') != 'worksheet':
        raise ValueError('Requires schemaVersion=1 and kind=worksheet')
    pid = config['paper']['id']
    if not re.fullmatch('[a-z0-9-]+', pid) or not re.fullmatch(r'\d{14}', config['migrationTimestamp']):
        raise ValueError('Unsafe id or migration timestamp')
    out = Path(out_dir).resolve() if out_dir else ROOT
    target = out / 'scripts/exam/worksheet-generated' / pid
    if target.exists() and not force:
        raise ValueError('Existing worksheet; use --force to overwrite')
    pdf = Path(config['pdf'])
    if not pdf.is_absolute():
        pdf = Path(config.get('referenceRoot', config_path.parent)) / pdf
    with fitz.open(pdf) as doc:
        resolved, starts, keys, auto = prepare(doc, config)
        images, warnings = crop_questions(doc, resolved, starts)
        solutions, segments, sw = solution_images(doc, resolved['layout'], keys)
    warnings += sw
    data = dict(config['paper'], published=False, timeLimitMinutes=None, electives=[], gradeCuts=None)
    data['questionCount'] = len(images)
    data['maxScore'] = sum(q['points'] for q in resolved['questions'])
    if config['paper'].get('maxScore', data['maxScore']) != data['maxScore']:
        raise ValueError('Configured maxScore disagrees with parsed points')
    data['questions'] = [dict(q, section='common', curriculumGrade=data['subject'], curriculumChapter=config.get('chapters', {}).get(str(q['number']), data['unitName']),
                              imageUrl=f'/exams/{pid}/q-{q["number"]:02}.png',
                              solutionKey=f'{pid}/s-{q["number"]:02}.png', solutionSegments=segments[q['number']]) for q in resolved['questions']]
    target.mkdir(parents=True, exist_ok=True)
    for q in data['questions']:
        n = q['number']
        for base, name, image in [(out / 'public/exams' / pid, f'q-{n:02}.png', images[n]),
                                  (target / 'private-solutions' / pid, f's-{n:02}.png', solutions[n])]:
            base.mkdir(parents=True, exist_ok=True)
            image.save(base / name)
    # Answer-bearing JSON stays outside the frontend import tree.
    (target / 'data.json').write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    (target / 'review.html').write_text(review_html(data, warnings).replace('src="public/exams/', 'src="../../../../public/exams/'), encoding='utf-8')
    (target / 'validation.json').write_text(json.dumps(dict(warnings=warnings, layout=resolved['layout'], autoLayout=auto), ensure_ascii=False, indent=2), encoding='utf-8')
    migration = out / 'supabase/migrations' / f'{config["migrationTimestamp"]}_exam_{pid.replace("-", "_")}_seed.sql'
    migration.parent.mkdir(parents=True, exist_ok=True)
    migration.write_text(seed_sql(data), encoding='utf-8')
    publish = out / 'scripts/exam' / f'publish_{pid.replace("-", "_")}.sql'
    publish.parent.mkdir(parents=True, exist_ok=True)
    publish.write_text(f"-- Only after question/answer review.\nupdate public.exam_papers set published=true where id={quote(pid)} and kind='worksheet';\n", encoding='utf-8')
    if sheet:
        thumbs = []
        for n in sorted(images):
            a, b = images[n].copy(), solutions[n].copy()
            a.thumbnail((330, 650)); b.thumbnail((330, 1100))
            tile = Image.new('RGB', (680, max(a.height, b.height) + 30), 'white')
            tile.paste(a, (0, 25)); tile.paste(b, (350, 25)); thumbs.append(tile)
        contact = Image.new('RGB', (680, sum(t.height for t in thumbs)), 'white')
        y = 0
        for tile in thumbs:
            contact.paste(tile, (0, y)); y += tile.height
        contact.save(target / 'sheet.png')
    print(f'{pid}: {len(images)} questions, {len(keys)} keys, {len(solutions)} solutions, {len(warnings)} warnings; {target}')
    return data, warnings


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('config'); parser.add_argument('--out-dir'); parser.add_argument('--sheet', action='store_true'); parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    run(args.config, args.out_dir, args.sheet, args.force)
