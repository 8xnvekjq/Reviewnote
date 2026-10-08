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


def page_columns(layout, pn):
    return layout.get('pageColumns', {}).get(str(pn), layout['columns'])


def numbered_anchors(doc, layout, font):
    """Standalone textbook numbers: match the configured number font at the margin.

    Font and position checks prevent formula numerators and figure labels from
    becoming anchors. Column windows separate adjacent exam solution blocks.
    """
    found = {}
    for pn in layout['pages']:
        for block in doc[pn - 1].get_text('dict')['blocks']:
            if not block.get('lines'):
                continue
            for line in block['lines']:
                for span in line['spans']:
                    if span['font'] != font or not re.fullmatch(r'\d+\s*', span['text']):
                        continue
                    n = int(span['text'])
                    x, y = span['bbox'][:2]
                    col = next((c for c, (left, right) in enumerate(page_columns(layout, pn))
                                if left <= x < left + 8), None)
                    if col is None:
                        continue
                    window = layout.get('columnWindows', {}).get(f'{pn}:{col}',
                                [layout['bodyTop'], layout['bodyBottom']])
                    if not window[0] <= y < window[1]:
                        continue
                    if n in found:
                        raise ValueError(f'Duplicate numbered anchor {n} on page {pn}')
                    found[n] = (pn, col, y, None)
    return dict(sorted(found.items()))


def collection_images(doc, config):
    """Import independent numbered exams, filter explicitly, then renumber.

    All source anchors remain crop boundaries even when a question is excluded.
    The answer table is read from its configured region, never a supplied key.
    """
    resolved = copy.deepcopy(config)
    questions, images, solutions, segments, warnings, layouts = [], {}, {}, {}, [], []
    for section in config['sections']:
        layout = copy.deepcopy(section['layout'])
        layout['pages'] = layout['questionPages']
        qs = numbered_anchors(doc, layout, section['numberFont'])
        sl = copy.deepcopy(section['solutionLayout'])
        sl['pages'] = sl['answerPages']
        ks = numbered_anchors(doc, sl, section['numberFont'])
        expected = list(range(1, section['questionCount'] + 1))
        if list(qs) != expected or list(ks) != expected:
            raise ValueError(f'{section["name"]}: question/solution anchors disagree')
        for found in (qs, ks):
            order = [a[:3] for a in found.values()]
            if order != sorted(order):
                raise ValueError('Anchors do not follow page/column reading order')
        table = section['answerTable']
        text = doc[table['page'] - 1].get_text(clip=fitz.Rect(table['rect']))
        raw_keys = {}
        entries = list(re.finditer(r'(?m)^(\d+)[ \u2004]+(\S[^\n]*)', text))
        for i, match in enumerate(entries):
            end = entries[i + 1].start() if i + 1 < len(entries) else len(text)
            n, raw = int(match[1]), text[match.start(2):end].strip()
            if n in raw_keys:
                raise ValueError(f'Duplicate answer-table key {n}')
            raw_keys[n] = raw
        if sorted(raw_keys) != expected:
            raise ValueError(f'{section["name"]}: incomplete answer table')
        include = section.get('include', expected)
        if include != sorted(set(include)) or not set(include) <= set(qs) or not include:
            raise ValueError('Invalid included question list')
        exceptions = {q['number']: q for q in section.get('questions', [])}
        selected = []
        for original in include:
            pn, col, y, _ = qs[original]
            left, right = page_columns(layout, pn)[col]
            end = min([a[2] - 8 for a in qs.values() if a[:2] == (pn, col) and a[2] > y]
                      or [layout['bodyBottom']])
            body = doc[pn - 1].get_text(clip=fitz.Rect(left, y - 5, right, end))
            points = re.findall(r'\[\s*(\d+(?:\.\d+)?)\s*점\s*\]', body)
            if len(points) != 1:
                raise ValueError(f'{section["name"]} {original}: expected one points label')
            raw = raw_keys[original]
            # A wrapped fraction must never turn into concatenated integer digits.
            answer = parse_answer(raw) if '\n' not in raw else None
            spec = exceptions.get(original, {})
            if 'sourceAnswerText' in spec and spec['sourceAnswerText'] != raw:
                raise ValueError(f'Question {original}: source answer text changed')
            if answer and ('answer' in spec and str(spec['answer']) != answer[1]
                           or 'answerType' in spec and spec['answerType'] != answer[0]):
                raise ValueError(f'Question {original}: configured answer disagrees with PDF')
            if not answer:
                if spec.get('sourceAnswerText') != raw or not spec.get('answerType') or 'answer' not in spec:
                    raise NeedsExceptions([original], questions)
                answer = spec['answerType'], str(spec['answer'])
                if answer[0] not in ('choice5', 'digits') or not re.fullmatch(r'\d{1,3}', answer[1]) or (answer[0] == 'choice5' and not 1 <= int(answer[1]) <= 5):
                    raise ValueError('Invalid configured typed answer')
            number = len(questions) + len(selected) + 1
            selected.append(dict(number=number, original=original, originalNumber=original,
                sourceSection=section['name'], sourcePage=pn, sourceAnswerText=raw,
                answerPage=table['page'], answerType=answer[0], answer=answer[1],
                points=float(points[0]), curriculumChapter=section['chapters'][str(original)],
                sourceLabel=f'{config["paper"]["schoolName"]} · {section["name"]} · PDF {pn}쪽 · {original}번',
                **({'imageSegments': spec['imageSegments']} if 'imageSegments' in spec else {})))
        cropped, cw = crop_questions(doc, dict(layout=layout, questions=selected),
                                     {n: a[:3] for n, a in qs.items()})
        explained, refs, sw = solution_images(doc, sl, ks)
        for q in selected:
            n, original = q['number'], q['original']
            images[n], solutions[n], segments[n] = cropped[n], explained[original], refs[original]
        questions.extend(selected)
        warnings.extend(cw + [f'{section["name"]}: {w}' for w in sw if any(f'Solution {n}:' in w for n in include)])
        layouts.append(dict(name=section['name'], questions=layout, solutions=sl))
    if config['paper'].get('questionCount', len(questions)) != len(questions):
        raise ValueError('Configured question count disagrees with selection')
    resolved.update(questions=questions, layout=layouts)
    return resolved, images, solutions, segments, warnings


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
    all_columns = layout['columns'] + [column for columns in layout.get('pageColumns', {}).values() for column in columns]
    width = round(max(right - left for left, right in all_columns) * 3)
    for pn, col in regions:
        left, right = page_columns(layout, pn)[col]
        bottom = layout['bodyBottom']
        pix = doc[pn - 1].get_pixmap(matrix=fitz.Matrix(3, 3), clip=fitz.Rect(left, 0, right, bottom), alpha=False)
        image = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        columns[pn, col] = image, ink_rows(image)
    for n, (pn, col, y, _) in starts.items():
        image, rows = columns[pn, col]
        # The first solution may follow a ruled key table. Do not include its rule.
        floor = max(round(layout['bodyTop'] * 3), round((y - layout.get('anchorSearchUpPt', 8)) * 3))
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
            window = layout.get('columnWindows', {}).get(f'{p}:{c}')
            top = boundaries[n] if index == first else round((window[0] if window else layout['bodyTop']) * 3)
            bottom = boundaries[n + 1] if next_start and index == last else (min(image.height, round(window[1] * 3)) if window else image.height)
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
              str(p['timeLimitMinutes']) if p['timeLimitMinutes'] is not None else 'null', "'{}'::text[]", 'null', 'false', quote(p['kind']), quote(p['schoolName']), str(p['grade']),
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
    kind = config['paper'].get('kind')
    if config.get('schemaVersion') != 1 or kind not in ('worksheet', 'school'):
        raise ValueError('Requires schemaVersion=1 and kind=worksheet or school')
    if kind == 'school' and (not isinstance(config['paper'].get('timeLimitMinutes'), int)
                            or config['paper']['timeLimitMinutes'] <= 0
                            or config['paper'].get('questionCount', 0) > 50):
        raise ValueError('School papers require a positive time limit and at most 50 questions')
    pid = config['paper']['id']
    if not re.fullmatch('[a-z0-9-]+', pid) or not re.fullmatch(r'\d{14}', config['migrationTimestamp']):
        raise ValueError('Unsafe id or migration timestamp')
    slug = config.get('slug', pid.replace('-', '_'))
    if not re.fullmatch('[a-z0-9_]+', slug):
        raise ValueError('Unsafe slug')
    out = Path(out_dir).resolve() if out_dir else ROOT
    target = out / 'scripts/exam/worksheet-generated' / pid
    frontend_path = out / 'src/features/exam/data' / f'{pid}.json'
    if target.exists() and not force:
        raise ValueError('Existing worksheet; use --force to overwrite')
    if frontend_path.exists() and not force:
        raise ValueError('Existing frontend paper; use --force to overwrite')
    pdf = Path(config['pdf'])
    if not pdf.is_absolute():
        reference = Path(config.get('referenceRoot', config_path.parent))
        if not reference.is_absolute():
            reference = config_path.parent / reference
        pdf = reference / pdf
    with fitz.open(pdf) as doc:
        if config.get('sections'):
            resolved, images, solutions, segments, warnings = collection_images(doc, config)
            auto, keys = None, solutions
        else:
            resolved, starts, keys, auto = prepare(doc, config)
            images, warnings = crop_questions(doc, resolved, starts)
            solutions, segments, sw = solution_images(doc, resolved['layout'], keys)
            warnings += sw
    data = dict(config['paper'], published=False,
                timeLimitMinutes=config['paper']['timeLimitMinutes'] if kind == 'school' else None,
                electives=[], gradeCuts=None)
    data['questionCount'] = len(images)
    data['maxScore'] = sum(q['points'] for q in resolved['questions'])
    if config['paper'].get('maxScore', data['maxScore']) != data['maxScore']:
        raise ValueError('Configured maxScore disagrees with parsed points')
    data['questions'] = [dict(q, section='common', curriculumGrade=data['subject'], curriculumChapter=q.get('curriculumChapter', config.get('chapters', {}).get(str(q['number']), data['unitName'])),
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
    # Only metadata and question images enter the frontend; keys and solutions stay local.
    frontend = dict(data, questions=[{k: v for k, v in q.items() if k not in
        ('answer', 'sourceAnswerText', 'answerPage', 'solutionKey', 'solutionSegments', 'imageSegments')}
        for q in data['questions']])
    frontend_path.parent.mkdir(parents=True, exist_ok=True)
    frontend_path.write_text(json.dumps(frontend, ensure_ascii=False, indent=2), encoding='utf-8')
    migration = out / 'supabase/migrations' / f'{config["migrationTimestamp"]}_exam_{slug}_seed.sql'
    migration.parent.mkdir(parents=True, exist_ok=True)
    migration.write_text(seed_sql(data), encoding='utf-8')
    publish = out / 'scripts/exam' / f'publish_{slug}.sql'
    publish.parent.mkdir(parents=True, exist_ok=True)
    publish.write_text(f"-- Only after question/answer review.\nupdate public.exam_papers set published=true where id={quote(pid)} and kind={quote(kind)};\n", encoding='utf-8')
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
