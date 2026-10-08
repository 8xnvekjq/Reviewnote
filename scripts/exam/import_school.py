"""Deterministic, text-PDF school exam importer. Never connects to a database."""
import argparse
import copy
import html
import json
import math
import re
import statistics
from pathlib import Path

import fitz
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
# 번호 앞에 "[서답형1]" 같은 꼬리표 줄이 붙는 학교가 있다(둔촌고).
START = re.compile(r'^(?:\s*\[[^\]\n]{1,12}\]\s*)?(?:(\d+)\s+)?(\d+)\.')
PUA_DIGITS = str.maketrans({chr(0xe034 + i): str(i + 1) for i in range(9)} | {chr(0xe03d): '0'})
PUA_NUMBERS = PUA_DIGITS | {0xe053: '.'}


def normalize(text):
    return re.sub(r'\s|\x01', '', text.translate(PUA_DIGITS))


def parse_cover(text):
    """Read section totals, including tables with labels ahead of value cells."""
    text = text.translate(PUA_DIGITS).replace('\x01', '')
    labels = re.findall(r'선\s*택\s*형|서\s*답\s*형|객\s*관\s*식|주\s*관\s*식|서\s*술\s*형', text)
    counts = re.findall(r'(\d+)\s*문\s*항', text)
    points = re.findall(r'(\d+(?:\.\d+)?)\s*점', text)
    if not labels or len(counts) != len(labels):
        return None
    return dict(questionCount=sum(map(int, counts)),
                points=sum(map(float, points)) if len(points) == len(labels) else None)


def read_cover(doc):
    """Only inspect cover/header text, never question bodies or answer tables."""
    for index, page in enumerate(doc):
        anchors = [b[1] for b in page.get_text('blocks') if START.match(b[4])]
        bottom = min(anchors, default=page.rect.height) if index == 0 else min([page.rect.height * .16] + anchors)
        result = parse_cover(page.get_text(clip=fitz.Rect(0, 0, page.rect.width, bottom)))
        if result is not None:
            return result
    return None


def resolve_pdf(config, config_path):
    path = Path(config['pdf'])
    candidates = [path] if path.is_absolute() else [ROOT / path, config_path.parent / path]
    # Reference PDFs are deliberately outside git; allow a portable reference root.
    if config.get('referenceRoot') and not path.is_absolute() and path.is_relative_to('reference/school-exams'):
        candidates.append(Path(config['referenceRoot']) / path.relative_to('reference/school-exams'))
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    raise ValueError(f'PDF not found: {path}; set referenceRoot or an absolute pdf path')


def detect_layout(doc, overrides=None):
    """Infer page roles, columns and furniture from text and vector rules."""
    overrides = overrides or {}
    blocks = {i + 1: p.get_text('blocks') for i, p in enumerate(doc)}
    question_pages, answer_pages = [], []
    anchors = {}
    for pn, page_blocks in blocks.items():
        text = doc[pn - 1].get_text()
        choice_keys = re.findall(r'(?m)^\s*\d+[.)]\s*[①②③④⑤]', text)
        short_keys = re.findall(r'(?m)^\s*\d+[.)]\s*\d+\s*$', text)
        labels = [b for b in page_blocks if START.match(b[4])]
        labelled_keys = re.findall(r'(?m)^\s*\d+[.)]\s*정답\s*[:：]', text)
        is_key = len(labelled_keys) >= 2 or len(choice_keys) >= 2 or re.search(r'(?m)^\s*(정답|문항별\s*배점)\s*$', text) or (len(short_keys) >= 2 and len(short_keys) >= len(labels) * .6)
        if is_key:
            answer_pages.append(pn)
        elif labels:
            question_pages.append(pn)
            anchors[pn] = labels
    detected_question_pages, detected_answer_pages = list(question_pages), list(answer_pages)
    question_pages = overrides.get('questionPages', question_pages)
    anchors = {pn: [b for b in blocks[pn] if START.match(b[4])] for pn in question_pages}
    all_anchors = [b for page in anchors.values() for b in page]
    if not all_anchors:
        raise ValueError('No question text found (scanned PDFs are unsupported)')
    width = min(doc[pn - 1].rect.width for pn in question_pages)
    height = min(doc[pn - 1].rect.height for pn in question_pages)
    drawings = {pn: doc[pn - 1].get_drawings() for pn in question_pages}
    dividers = [d['rect'].x0 for ds in drawings.values() for d in ds if d['rect'].width < 2 and d['rect'].height > height * .4 and width * .35 < d['rect'].x0 < width * .65]
    xs = sorted(b[0] for b in all_anchors)
    gaps = [(b - a, (a + b) / 2) for a, b in zip(xs, xs[1:])]
    gap, split = max(gaps, default=(0, width / 2))
    two_columns = bool(dividers) or gap > width * .25
    divider = statistics.median(dividers) if dividers else split
    # Repeated text at the same y, including changing page counters, is furniture.
    repeated = {}
    for pn, page_blocks in blocks.items():
        for b in page_blocks:
            if START.match(b[4]) or not (b[3] < height * .16 or b[1] > height * .85):
                continue
            text = normalize(b[4])
            if re.fullmatch(r'-?\d+-?|\d+\s*[/중]\s*\d+', b[4].strip()) or re.fullmatch(r'\d+\s+\d+', b[4].strip()):
                text = '<page-counter>'
            key = (text, round(b[1] / 2))
            repeated.setdefault(key, set()).add(pn)
    tops, bottoms = {}, {}
    for pn in question_pages:
        page_anchors = anchors[pn]
        first = min(b[1] for b in page_anchors)
        top, bottom = 0, doc[pn - 1].rect.height
        for b in blocks[pn]:
            if START.match(b[4]):
                continue
            text = normalize(b[4])
            if re.fullmatch(r'-?\d+-?|\d+\s*[/중]\s*\d+', b[4].strip()) or re.fullmatch(r'\d+\s+\d+', b[4].strip()):
                text = '<page-counter>'
            if text == '<page-counter>' or len(repeated.get((text, round(b[1] / 2)), set())) >= 2:
                if b[3] < first:
                    top = max(top, math.ceil(b[3]) + 2)
                elif b[1] > height * .85:
                    bottom = min(bottom, math.floor(b[1]) - 2)
        # Wide rules before the first question also exclude first-page cover tables.
        for d in drawings[pn]:
            r = d['rect']
            if r.width > width * .6:
                if r.y1 < first and r.height < height * .2:
                    top = max(top, math.ceil(r.y1) + 1)
                elif r.y0 > height * .85 and r.height < 2:
                    bottom = min(bottom, math.floor(r.y0) - 2)
        if top > first:
            top = math.floor(first)
        tops[str(pn)], bottoms[str(pn)] = top, bottom
    if two_columns and not dividers:
        left_body = [b for pn in question_pages for b in blocks[pn] if b[0] < split and b[1] >= tops[str(pn)] and b[3] <= bottoms[str(pn)]]
        right_start = min(b[0] for b in all_anchors if b[0] >= split)
        divider = (min(max(b[2] for b in left_body), right_start - 4) + right_start) / 2
    # Text envelopes with a small guard keep a fixed width per column. A ruled
    # gutter needs less extra space than an unruled one. Snap to PDF point grid.
    columns = []
    for col in range(2 if two_columns else 1):
        starts = [b for b in all_anchors if not two_columns or (b[0] < divider) == (col == 0)]
        if not starts:
            raise ValueError('Column detection is ambiguous; set layout.columns explicitly')
        body = [b for pn in question_pages for b in blocks[pn] if b[1] >= tops[str(pn)] and b[3] <= bottoms[str(pn)] and (not two_columns or (b[0] < divider) == (col == 0))]
        left = max(0, math.floor(min(b[0] for b in starts)) - 4)
        right = min(width, round(max(b[2] for b in body)) + (2 if dividers else 4))
        if two_columns:
            right = min(right, math.floor(divider) - 2) if col == 0 else right
        columns.append([left, right])
    auto = dict(questionPages=detected_question_pages, answerPages=detected_answer_pages, columns=columns, columnDivider=divider, bodyTop=min(tops.values()), bodyBottom=min(bottoms.values()), pageBodyTop=tops, pageBodyBottom=bottoms, blankRunPx=18)
    effective = copy.deepcopy(auto)
    effective.update(overrides)
    for field, page_field in [('bodyTop', 'pageBodyTop'), ('bodyBottom', 'pageBodyBottom')]:
        effective[page_field] = dict(auto[page_field])
        if field in overrides:
            effective[page_field] = {str(pn): overrides[field] for pn in question_pages}
        effective[page_field].update(overrides.get(page_field, {}))
    return effective, auto


def question_text(doc, layout, starts, original):
    pn, col, y = starts[original]
    end = min([sy for p, c, sy in starts.values() if p == pn and c == col and sy > y] or [layout.get('pageBodyBottom', {}).get(str(pn), layout['bodyBottom'])])
    left, right = layout['columns'][col]
    return doc[pn - 1].get_text(clip=fitz.Rect(left, y - 10, right, end))


class NeedsExceptions(ValueError):
    def __init__(self, originals, normal_questions):
        self.originals = originals
        self.normal_questions = normal_questions
        super().__init__(f'{", ".join(str(n) + "번" for n in originals)}: 이 문항은 설정에 예외로 적어 주세요 (서답형 분리/수식 정답 등 유형이 애매합니다). 일반 문항 {len(normal_questions)}개 정답·배점 자동 해석 완료; 파일은 쓰지 않았습니다.')


def prepare_config(doc, config):
    """Expand sparse exceptions to a complete validated import plan."""
    resolved = copy.deepcopy(config)
    resolved['layout'], resolved['_autoLayout'] = detect_layout(doc, config.get('layout'))
    starts = find_starts(doc, resolved['layout'])
    cover = resolved['_cover'] = read_cover(doc)
    resolved['_warnings'] = []
    if cover is None:
        resolved['_warnings'].append('표지에서 문항 수를 못 읽어 감지값 사용 — 확인 필요')
    elif cover['questionCount'] != len(starts):
        raise ValueError(f"Cover original question count {cover['questionCount']} disagrees with detected question count {len(starts)}; 사람이 확인해 주세요")
    if cover and cover['points'] is not None and abs(cover['points'] * config.get('pointScale', 1) - config['paper']['maxScore']) > 1e-6:
        raise ValueError(f"Points total: cover original points {cover['points']:g} × pointScale {config.get('pointScale', 1):g} disagrees with maxScore {config['paper']['maxScore']}; 사람이 확인해 주세요")
    if sorted(starts) != list(range(1, max(starts) + 1)):
        raise ValueError('Found original question count/numbers are not contiguous')
    answers, points = read_keys(doc, resolved, starts)
    exceptions = {}
    for entry in config.get('questions', []):
        spec = copy.deepcopy(entry)
        original = spec.get('original', spec.get('number'))
        if original not in starts:
            raise ValueError(f'Found original question count/numbers disagree: exception {original} not found')
        spec['original'] = original
        exceptions.setdefault(original, []).append(spec)
    questions, ambiguous, normal = [], [], []
    next_number = 1
    for original in sorted(starts):
        specs = exceptions.get(original, [dict(original=original)])
        for spec in specs:
            spec.setdefault('number', next_number)
            next_number = spec['number'] + 1
            source = answers.get(original, '')
            if spec.get('sourcePart'):
                part = re.search(r'\(' + str(spec['sourcePart']) + r'\)(.*?)(?=\(\d\)|$)', source, re.S)
                source = part[1] if part else ''
            compact = normalize(source)
            type_answer = compact or normalize(str(spec.get('answer', '')))
            text = question_text(doc, resolved['layout'], starts, original)
            has_choices = '①' in text and '⑤' in text
            if 'answerType' not in spec:
                if re.fullmatch('[①②③④⑤]', type_answer) or has_choices and re.fullmatch('[1-5]', type_answer):
                    spec['answerType'] = 'choice5'
                elif re.fullmatch(r'\d+', type_answer) and not has_choices:
                    spec['answerType'] = 'digits'
                elif has_choices and not compact:
                    spec['answerType'] = 'choice5'
                else:
                    ambiguous.append(original)
                    continue
            if 'answer' not in spec:
                if spec['answerType'] == 'choice5' and re.fullmatch('[①②③④⑤]', compact):
                    spec['answer'] = str('①②③④⑤'.index(compact) + 1)
                elif spec['answerType'] in ('choice5', 'digits') and re.fullmatch(r'\d+', compact):
                    spec['answer'] = compact
            value = points.get((original, spec['sourcePart']) if spec.get('sourcePart') else original)
            if value is not None:
                spec.setdefault('points', value)
            chapter = config.get('chapters', {}).get(str(spec['number']))
            if chapter is not None:
                spec.setdefault('chapter', chapter)
            if 'answer' not in spec or 'points' not in spec:
                ambiguous.append(original)
                continue
            questions.append(spec)
            if original not in exceptions:
                normal.append(spec)
    if ambiguous:
        raise NeedsExceptions(sorted(set(ambiguous)), normal)
    derived = (cover['questionCount'] if cover else len(starts)) + sum(len(specs) - 1 for specs in exceptions.values())
    expected = config['paper'].get('questionCount', derived)
    if cover and expected != derived:
        raise ValueError(f'Configured question count {expected} disagrees with cover-derived final question count {derived} (original {cover["questionCount"]}, exceptions applied); 사람이 확인해 주세요')
    # Keep the established JSON field order even when this setting is omitted.
    paper = {}
    for field, value in resolved['paper'].items():
        if field != 'questionCount':
            paper[field] = value
        if field == 'timeLimitMinutes':
            paper['questionCount'] = expected
    paper.setdefault('questionCount', expected)  # timeLimitMinutes가 없는 설정에서도 빠지지 않게
    resolved['paper'] = paper
    if len(questions) != expected or sorted(q['number'] for q in questions) != list(range(1, expected + 1)):
        raise ValueError('Configured/detected question count/numbers disagree with questionCount')
    resolved['questions'] = questions
    return resolved, starts


def find_starts(doc, layout):
    found = {}
    pages = layout['questionPages']
    for page_number in pages:
        page = doc[page_number - 1]
        for block in page.get_text('blocks'):
            match = START.match(block[4])
            if not match:
                continue
            if match[1] and match[1] != match[2]:
                raise ValueError(f'Conflicting question labels: {match[0]}')
            number = int(match[2])
            if number in found:
                raise ValueError(f'Duplicate original question {number}')
            column = 0 if len(layout['columns']) == 1 or block[0] < layout.get('columnDivider', page.rect.width / 2) else 1
            found[number] = (page_number, column, block[1])
    if not found:
        raise ValueError('No question text found (scanned PDFs are unsupported)')
    return found


def read_keys(doc, config, starts):
    """Try both answer list styles and the numbered point table/inline points."""
    text = '\n'.join(doc[n - 1].get_text() for n in config['layout']['answerPages'])
    matches = list(re.finditer(r'(?m)^\s*(\d+)[.)]\s*', text))
    answers = {}
    for i, match in enumerate(matches):
        raw = text[match.end():matches[i + 1].start() if i + 1 < len(matches) else len(text)]
        answers[int(match[1])] = raw.strip()
    # Some publishers put a labelled answer in its own block, followed by a
    # worked solution. Keep that header (even if empty) separate from the proof.
    for pn in config['layout']['answerPages']:
        blocks = doc[pn - 1].get_text('blocks')
        for index, block in enumerate(blocks):
            labelled = re.match(r'^\s*(\d+)[.)]\s*정답\s*(.*)$', block[4], re.S)
            if labelled:
                value = re.sub(r'^\s*[:：]\s*', '', labelled[2]).split('[해설]', 1)[0].strip()
                # A raised fraction numerator may occupy the following block.
                for continuation in blocks[index + 1:]:
                    if not value or re.search(r'[가-힣]|^\s*\d+[.)]', continuation[4]):
                        break
                    value += '\n' + continuation[4].strip()
                answers[int(labelled[1])] = value or '정답'
    points = {}
    # Yeongpa: ten number labels followed by ten values, twice.
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    index = 0
    while index < len(lines):
        numbers = []
        while index < len(lines) and re.fullmatch(r'\d+번', lines[index]):
            numbers.append(int(lines[index][:-1]))
            index += 1
        values = lines[index:index + len(numbers)]
        if numbers and len(values) == len(numbers) and all(re.fullmatch(r'\d+(?:\.\d+)?', value) for value in values):
            points.update({n: float(v) for n, v in zip(numbers, values)})
            index += len(values)
        else:
            index += 1
    # Dongbuk: each question carries [N.N점]; only inspect its own column.
    for original, (pn, col, y) in starts.items():
        page = doc[pn - 1]
        end = min([sy for n, (p, c, sy) in starts.items() if p == pn and c == col and sy > y] or [config['layout'].get('pageBodyBottom', {}).get(str(pn), config['layout']['bodyBottom'])])
        left, right = config['layout']['columns'][col]
        region = page.get_text(clip=fitz.Rect(left, y - 10, right, end)).translate(PUA_NUMBERS)
        inline = re.findall(r'[\[(]\s*(\d+(?:\.\d+)?)\s*점\s*[\])]', region)
        if inline:
            total = sum(float(v) for v in inline)
            if original in points and abs(total - points[original]) > 1e-6:
                raise ValueError(f'PDF inline/table points disagree for {original}')
            points[original] = total
            for part in re.finditer(r'\((\d+)\)(?:(?!\(\d+\)).)*?\[\s*(\d+(?:\.\d+)?)\s*점\s*\]', region, re.S):
                points[original, int(part[1])] = float(part[2])
    return answers, points


def ink_rows(image):
    gray = image.convert('L')
    pixels = gray.tobytes()
    return [min(pixels[y * gray.width:(y + 1) * gray.width]) < 245 for y in range(gray.height)]


def blank_boundary(rows, anchor, floor, run):
    """Walk upwards through raised fractions/exponents to a full blank band."""
    count = 0
    for y in range(min(anchor, len(rows) - 1), floor - 1, -1):
        count = 0 if rows[y] else count + 1
        if count >= run:
            return y + run // 2
    return floor


def trim(image, margin=18):
    bbox = ImageChops.difference(image, Image.new('RGB', image.size, 'white')).getbbox()
    if not bbox:
        raise ValueError('Empty question image')
    # Add real white padding even when the source region has no spare space.
    content = image.crop((0, bbox[1], image.width, bbox[3]))
    result = Image.new('RGB', (image.width, content.height + margin * 2), 'white')
    result.paste(content, (0, margin))
    return result


def crop_questions(doc, config, starts):
    layout = config['layout']
    columns = {}
    boundaries = {}
    warnings = []
    for original, (pn, col, y) in starts.items():
        key = (pn, col)
        if key not in columns:
            left, right = layout.get('pageColumns', {}).get(str(pn), layout['columns'])[col]
            bottom = layout.get('pageBodyBottom', {}).get(str(pn), layout['bodyBottom'])
            pix = doc[pn - 1].get_pixmap(matrix=fitz.Matrix(3, 3), clip=fitz.Rect(left, 0, right, bottom), alpha=False)
            image = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
            columns[key] = image, ink_rows(image)
        image, rows = columns[key]
        top = layout.get('pageBodyTop', {}).get(str(pn), layout['bodyTop'])
        boundaries[original] = blank_boundary(rows, round(y * 3) + 12, round(top * 3), layout.get('blankRunPx', 18))
    images = {}
    for q in config['questions']:
        original = q['original']
        pn, col, y = starts[original]
        image, rows = columns[pn, col]
        top = boundaries[original]
        end = min([boundaries[n] for n, (p, c, sy) in starts.items() if p == pn and c == col and sy > y] or [image.height])
        # Optional composition is expressed in PDF coordinates, independent of school.
        segments = q.get('imageSegments', [[None, None]])
        pieces = []
        for lo, hi in segments:
            a = top if lo is None else round(lo * 3)
            b = end if hi is None else round(hi * 3)
            if not top <= a < b <= end:
                raise ValueError(f'Invalid image segment for question {q["number"]}: {a}:{b}')
            if (a > top and any(rows[max(top, a - 3):a + 3])) or (b < end and any(rows[b - 3:min(end, b + 3)])):
                warnings.append(f'Question {q["number"]}: segment boundary has ink within 3px; inspect for clipping')
            pieces.append(image.crop((0, a, image.width, b)))
        height = sum(p.height for p in pieces) + 24 * (len(pieces) - 1)
        combined = Image.new('RGB', (image.width, height), 'white')
        offset = 0
        for piece in pieces:
            combined.paste(piece, (0, offset))
            offset += piece.height + 24
        # Inspect before padding: adding a border must not conceal a cut glyph.
        combined_rows = ink_rows(combined)
        if any(combined_rows[:3] + combined_rows[-3:]):
            warnings.append(f'Question {q["number"]}: source edge has ink within 3px; inspect for clipping')
        result = trim(combined)
        images[q['number']] = result
    median = statistics.median(im.height for im in images.values())
    for number, image in images.items():
        if image.height < 60 or image.height > median * 3:
            warnings.append(f'Question {number}: unusual image height {image.height}px (median {median:g})')
    return images, warnings


def make_data(doc, config, starts):
    metadata = dict(config['paper'])
    answers, points = read_keys(doc, config, starts)
    questions = []
    warnings = list(config.get('_warnings', []))
    original_totals = {}
    for spec in config['questions']:
        number, original = spec['number'], spec['original']
        answer_type = spec.get('answerType', 'choice5')
        source = answers.get(original)
        if spec.get('sourcePart') and source:
            part = re.search(r'\(' + str(spec['sourcePart']) + r'\)(.*?)(?=\(\d\)|$)', source, re.S)
            source = part[1].strip() if part else None
        parsed = None
        if source:
            compact = normalize(source)
            if answer_type == 'choice5' and re.fullmatch('[①②③④⑤]', compact):
                parsed = str('①②③④⑤'.index(compact) + 1)
            elif answer_type == 'choice5' and re.fullmatch('[1-5]', compact):
                parsed = compact
            elif answer_type == 'digits' and re.fullmatch(r'\d+', compact):
                parsed = compact
            if spec.get('sourceAnswerText') and compact != normalize(spec['sourceAnswerText']):
                raise ValueError(f'Question {number}: PDF/config source answer mismatch')
        manual = spec.get('answer')
        if parsed is not None and manual is not None and parsed != str(manual):
            raise ValueError(f'Question {number}: PDF/config answer mismatch ({parsed} != {manual})')
        answer = parsed if parsed is not None else str(manual) if manual is not None else None
        if answer is None:
            raise ValueError(f'Question {number}: no parsed or manual answer')
        if parsed is None:
            warnings.append(f'Question {number}: using configured answer; ' + ('PDF source text verified' if source and spec.get('sourceAnswerText') else 'source answer requires manual review'))
        maximum = {'choice5': 5, 'choice10': 10, 'digits': 999}.get(answer_type)
        if maximum is None or not re.fullmatch(r'\d+', answer) or not (0 if answer_type == 'digits' else 1) <= int(answer) <= maximum:
            raise ValueError(f'Question {number}: invalid {answer_type} answer {answer}')
        if answer_type == 'choice10':
            if len(spec.get('choices', [])) != 10 or len(spec.get('distractorReasons', [])) != 10:
                raise ValueError(f'Question {number}: choice10 needs ten choices and reasons')
            if spec['choices'][int(answer) - 1] != spec.get('originalAnswer'):
                raise ValueError(f'Question {number}: selected choice disagrees with originalAnswer')
            # KaTeX는 쉼표에서 줄을 바꾸지 않는다 — 좌표 여러 개짜리 선지는 칸 밖으로 잘린다(둔촌고 22번).
            long = [i + 1 for i, choice in enumerate(spec['choices']) if choice.count('),') >= 2 and r'\allowbreak' not in choice]
            if long:
                warnings.append(f'Question {number}: choices {long} list several points without \\allowbreak after "),"; they may be clipped')
        auto_points = points.get((original, spec['sourcePart']) if spec.get('sourcePart') else original)
        # 사용자 결정: 원본 합계 99.8 → 선택형 마지막 19번 +0.2. 이 시험지/문항만 허용.
        corrected = (
            metadata['id'] == '2025-daedong-g1-s2-mid-common2'
            and number == original == 19
            and not spec.get('sourcePart')
            and auto_points == spec.get('originalPoints') == 4.7
            and spec.get('points') == 4.9
            and spec.get('pointsCorrectionNote') == '사용자 결정: 원본 합계 99.8 → 선택형 마지막 19번 +0.2'
        )
        if 'originalPoints' in spec and auto_points != spec['originalPoints']:
            raise ValueError(f'Question {number}: PDF/config original points mismatch')
        if auto_points is not None and spec.get('points') is not None and abs(auto_points - spec['points']) > 1e-6 and not corrected:
            raise ValueError(f'Question {number}: PDF/config points mismatch')
        value = spec['points'] if corrected else auto_points if auto_points is not None else spec.get('points')
        if corrected:
            warnings.append(f"Question {number}: {spec['pointsCorrectionNote']} ({auto_points} → {value}점)")
        if value is None or value <= 0:
            raise ValueError(f'Question {number}: no positive parsed/manual points')
        if auto_points is None:
            warnings.append(f'Question {number}: using configured points; PDF points require manual review')
        original_totals[original] = original_totals.get(original, 0) + (auto_points if corrected else value)
        q = dict(number=number, section='common', imageUrl=f'/exams/{metadata["id"]}/q-{number:02}.png', points=round(value * config.get('pointScale', 1), 1), answer=answer, answerType=answer_type, curriculumGrade=config['curriculumGrade'], sourcePage=starts[original][0])
        if config.get('includeOriginalNumber'):
            q['originalNumber'] = spec.get('originalNumber', str(original))
        if config.get('includeOriginalPoints'):
            q['originalPoints'] = value
        if corrected:
            q['originalPoints'] = spec['originalPoints']
        if spec.get('chapter'):
            q['curriculumChapter'] = spec['chapter']
        for field in ('choices', 'originalAnswer', 'distractorReasons'):
            if field in spec:
                q[field] = spec[field]
        questions.append(q)
    for original, total in original_totals.items():
        if original in points and abs(points[original] - total) > 1e-6:
            raise ValueError(f'Original question {original}: split points disagree with PDF')
    if abs(sum(q['points'] for q in questions) - metadata['maxScore']) > 1e-6:
        raise ValueError('Points total disagrees with maxScore')
    metadata['published'] = False
    metadata['questions'] = sorted(questions, key=lambda q: q['number'])
    return metadata, warnings


def quote(value):
    return 'null' if value is None else "'" + str(value).replace("'", "''") + "'"


def seed_sql(data):
    columns = ['id', 'title', 'exam_date', 'source', 'subject', 'school_grade', 'time_limit_minutes', 'electives', 'grade_cuts', 'published', 'kind', 'school_name', 'year', 'grade', 'semester', 'exam_term', 'question_count', 'max_score']
    values = [quote(data['id']), quote(data['title']), quote(data['examDate']), quote(data['source']), quote(data['subject']), quote(data['schoolGrade']), str(data['timeLimitMinutes']), "'{}'::text[]", 'null', 'false', quote(data['kind']), quote(data['schoolName']), str(data['year']), str(data['grade']), str(data['semester']), quote(data['examTerm']), str(data['questionCount']), str(data['maxScore'])]
    sql = '-- 생성: python scripts/exam/import_school.py\n-- 기존 내신 스키마·RPC·RLS를 그대로 사용. 검토 전 비공개, 정확한 시행일 없음.\nbegin;\n'
    sql += 'insert into public.exam_papers (' + ', '.join(columns) + ')\nvalues (' + ', '.join(values) + ') on conflict do nothing;\n'
    sql += 'insert into public.exam_questions (paper_id,number,section,image_url,is_choice,points,curriculum_grade,curriculum_chapter,answer_type,choices)\nvalues\n'
    rows = []
    for q in data['questions']:
        rows.append('  (' + ', '.join([quote(data['id']), str(q['number']), quote(q['section']), quote(q['imageUrl']), 'true' if q['answerType'] != 'digits' else 'false', str(q['points']), quote(q['curriculumGrade']), quote(q.get('curriculumChapter')), quote(q['answerType']), quote(json.dumps(q['choices'])) + '::jsonb' if 'choices' in q else 'null']) + ')')
    sql += ',\n'.join(rows) + '\non conflict do nothing;\n'
    sql += 'insert into public.exam_answer_keys (question_id,answer)\nselect q.id, v.answer from (values\n'
    sql += ',\n'.join(f"  ({q['number']}, {quote(q['answer'])})" for q in data['questions'])
    sql += ") v(number,answer) join public.exam_questions q on q.paper_id = " + quote(data['id']) + " and q.section = 'common' and q.number = v.number\non conflict do nothing;\ncommit;\n"
    return sql


def review_html(data, warnings, specs=None, layout=None, auto_layout=None, cover=None):
    escape = lambda value: html.escape(str(value))
    cards = []
    originals = {q['number']: q.get('originalNumber', str(q['original']) + (f'({q["sourcePart"]})' if q.get('sourcePart') else '')) for q in specs or []}
    for q in data['questions']:
        label = f"{q['number']}번 · 원래 {originals.get(q['number'], q.get('originalNumber', q['number']))} · {q['answerType']} · 정답 {q['answer']} · {q['points']}점 · {q.get('curriculumChapter', '')}"
        cards.append(f'<article><h2>{escape(label)}</h2><img loading="lazy" src="public{escape(q["imageUrl"])}" alt="{escape(label)}"></article>')
    rows = ''.join('<tr><th>' + escape(field) + '</th><td>' + escape(json.dumps(value, ensure_ascii=False)) + '</td><td>' + escape(json.dumps((layout or {}).get(field), ensure_ascii=False)) + '</td></tr>' for field, value in (auto_layout or {}).items())
    rows = '<tr><th>표지 문항 수/배점(읽은 값)</th><td>' + escape(json.dumps(cover, ensure_ascii=False) if cover else '표기 없음') + '</td><td>원본 기준</td></tr><tr><th>최종 문항 수</th><td colspan="2">' + escape(data['questionCount']) + '</td></tr>' + rows
    table = '<h2>레이아웃 자동 감지 (PDF 좌표)</h2><table><thead><tr><th>항목</th><th>자동값</th><th>적용값 (설정 우선)</th></tr></thead><tbody>' + rows + '</tbody></table>' if rows else ''
    return '<!doctype html><html lang="ko"><meta charset="utf-8"><title>' + escape(data['title']) + '</title><style>body{font-family:system-ui;margin:24px;background:#eee}aside{color:#b00020}table{border-collapse:collapse;margin-bottom:20px;background:white}th,td{border:1px solid #ccc;padding:6px;text-align:left}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}article{background:white;padding:14px}h2{font-size:14px}img{width:100%;height:auto}@media(max-width:900px){main{grid-template-columns:1fr}}@media print{main{grid-template-columns:repeat(2,1fr)}article{break-inside:avoid}}</style><h1>' + escape(data['title']) + '</h1>' + table + '<aside>' + ''.join('<p>' + escape(w) + '</p>' for w in warnings) + '</aside><main>' + ''.join(cards) + '</main></html>\n'


def run(config_path, out_dir=None, sheet=False, force=False):
    config_path = Path(config_path).resolve()
    config = json.loads(config_path.read_text(encoding='utf-8-sig'))
    if config.get('schemaVersion') != 1:
        raise ValueError('Unsupported schemaVersion (expected 1)')
    if config['paper'].get('kind') != 'school' or config['paper'].get('electives') != []:
        raise ValueError('This importer requires kind=school and common questions (electives=[])')
    if config.get('pointScale', 1) <= 0:
        raise ValueError('pointScale must be positive')
    data_id = config['paper']['id']
    if not re.fullmatch(r'[a-z0-9-]+', data_id) or not re.fullmatch(r'[a-z0-9_]+', config['slug']):
        raise ValueError('Unsafe paper id or slug')
    if not re.fullmatch(r'\d{14}', config['migrationTimestamp']):
        raise ValueError('migrationTimestamp must have 14 digits')
    out = Path(out_dir).resolve() if out_dir else ROOT
    if out == ROOT and (ROOT / 'src/features/exam/data' / f'{data_id}.json').exists() and not force:
        raise ValueError(f'Existing paperId {data_id}: 덮어쓰려면 --force를 지정하세요 (시드 중복 생성 방지)')
    with fitz.open(resolve_pdf(config, config_path)) as doc:
        config, starts = prepare_config(doc, config)
        data, warnings = make_data(doc, config, starts)
        images, image_warnings = crop_questions(doc, config, starts)
    warnings += image_warnings
    # Validation finishes before any output is written.
    files = {
        out / 'src/features/exam/data' / f'{data_id}.json': json.dumps(data, ensure_ascii=False, indent=2) + '\n',
        out / 'supabase/migrations' / f'{config["migrationTimestamp"]}_exam_{config["slug"]}_school_seed.sql': seed_sql(data),
        out / 'scripts/exam' / f'publish_{config["slug"]}.sql': 'update public.exam_papers\nset published = true\nwhere id = ' + quote(data_id) + "\n  and kind = 'school'\n  and published = false\nreturning id, title, grade, published;\n",
    }
    if sheet:
        files[out / f'review-{data_id}.html'] = review_html(data, warnings, config['questions'], config['layout'], config['_autoLayout'], config['_cover'])
    for path, contents in files.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(contents, encoding='utf-8')
    image_dir = out / 'public/exams' / data_id
    image_dir.mkdir(parents=True, exist_ok=True)
    for number, image in images.items():
        image.save(image_dir / f'q-{number:02}.png')
    return data, warnings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('config', type=Path)
    parser.add_argument('--out-dir', type=Path)
    parser.add_argument('--sheet', action='store_true')
    parser.add_argument('--force', action='store_true', help='Allow replacing an existing paper in repository output mode')
    args = parser.parse_args()
    try:
        data, warnings = run(args.config, args.out_dir, args.sheet, args.force)
    except (ValueError, KeyError, OSError, IndexError) as error:
        parser.exit(1, f'ERROR: {error}\n')
    print(f'Exported {len(data["questions"])} questions; {sum(q["points"] for q in data["questions"]):g} points')
    for warning in warnings:
        print('WARNING: ' + warning)


if __name__ == '__main__':
    main()
