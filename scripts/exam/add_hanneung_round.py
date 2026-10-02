"""Add an unpublished advanced Hanneung round without OCR or AI services.

Requires PyMuPDF, numpy and Pillow. --out-dir is a repository-shaped sandbox.
"""
import argparse
from datetime import date, datetime, timedelta, timezone
import hashlib
import html
import json
import tempfile
from pathlib import Path
import re

import fitz
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from crop_hanneung_questions import ROOT, INK, canonical_marker_template, render, split_page


def parse_answers_text(text):
    rows = re.findall(r'(?<!\S)(\d+)\s+([①②③④⑤⑥⑦⑧⑨⑩])\s+(\d+)(?!\S)', text)
    values = {}
    for number, answer, points in rows:
        number, points = int(number), int(points)
        answer = ord(answer) - ord('①') + 1
        if number in values:
            raise ValueError(f'duplicate answer number: {number}')
        if answer not in range(1, 6) or points not in (1, 2, 3):
            raise ValueError(f'invalid answer/points for question {number}')
        values[number] = (str(answer), points)
    if sorted(values) != list(range(1, 51)):
        raise ValueError(f'answer PDF must contain exactly questions 1..50; found {len(values)}')
    if sum(points for _, points in values.values()) != 100:
        raise ValueError('answer PDF points must total 100')
    return values


def read_answers(path):
    with fitz.open(path) as doc:
        return parse_answers_text('\n'.join(page.get_text() for page in doc))


def crop_questions(path):
    pieces, ends, pages = [], [], []
    with fitz.open(path) as doc:
        if not doc.page_count:
            raise ValueError('empty question PDF')
        tpl = canonical_marker_template()
        for index, page in enumerate(doc):
            cropped, scores = split_page(render(page), index == 0, None, tpl, detailed=True)
            pieces.extend(cropped)
            ends.append(len(pieces))
            pages.append({'page': index + 1, 'count': len(cropped), 'scores': scores})
            print(f'page {index + 1}: {len(cropped)} questions; matches ' + ', '.join(f'{score:.4f}' for score in scores), flush=True)
    if len(pieces) != 50:
        raise ValueError(f'question PDF must contain 50 markers in page/left/right order; found {len(pieces)}')
    return pieces, ends, pages


def crop_warnings(pieces):
    warnings = []
    median = float(np.median([piece.shape[0] for piece in pieces]))
    for number, piece in enumerate(pieces, 1):
        ink = piece.mean(axis=2) < INK
        for edge, band in [('top', ink[:3]), ('bottom', ink[-3:])]:
            if band.sum() > 2:
                warnings.append(f'q-{number:02d}: ink in {edge} 3px; possible clipping')
        height = piece.shape[0]
        if height < median * 0.45 or height > median * 2:
            warnings.append(f'q-{number:02d}: unusual height {height}px (median {median:.0f}px)')
    return warnings


def quote(value):
    return "'" + str(value).replace("'", "''") + "'"


def seed_sql(paper):
    pid = quote(paper['id'])
    sql = f"""begin;
insert into public.exam_papers (id, title, exam_date, source, subject, school_grade,
  time_limit_minutes, electives, grade_cuts, published, kind, year, question_count, max_score, hanneung_level)
values ({pid}, {quote(paper['title'])}, {quote(paper['examDate'])}, '국사편찬위원회', '한국사', '전 학년',
  80, '{{}}'::text[], null, false, 'hanneung', {paper['year']}, 50, 100, 'advanced')
on conflict do nothing;
"""
    for q in paper['questions']:
        sql += f"""insert into public.exam_questions (paper_id, number, section, image_url, is_choice, points, answer_type)
values ({pid}, {q['number']}, 'common', {quote(q['imageUrl'])}, true, {q['points']}, 'choice5') on conflict do nothing;
insert into public.exam_answer_keys (question_id, answer)
select id, {quote(q['answer'])} from public.exam_questions where paper_id = {pid} and number = {q['number']} and section = 'common'
on conflict do nothing;
"""
    return sql + '\ncommit;\n'


def era_sheets(pieces, out):
    try:
        font = ImageFont.truetype('DejaVuSans.ttf', 36)
    except OSError:
        try:
            font = ImageFont.truetype('arial.ttf', 36)
        except OSError:
            font = ImageFont.load_default(size=36)
    for group in range(5):
        thumbnails = []
        for offset, piece in enumerate(pieces[group * 10:(group + 1) * 10]):
            thumb = Image.fromarray(piece)
            thumb.thumbnail((750, 650))
            thumbnails.append((group * 10 + offset + 1, thumb))
        heights = [max(thumbnails[i][1].height, thumbnails[i + 1][1].height) + 70 for i in range(0, 10, 2)]
        sheet = Image.new('RGB', (1600, sum(heights) + 20), 'white')
        draw = ImageDraw.Draw(sheet)
        y = 10
        for row, height in enumerate(heights):
            for column in range(2):
                number, thumb = thumbnails[row * 2 + column]
                x = column * 800 + 20
                draw.text((x, y), f'Q {number:02d}', fill='black', font=font)
                sheet.paste(thumb, (x, y + 50))
            y += height
        sheet.save(out / f'era-sheet-{group + 1}.png')


def write_sheet(out, paper, pages, warnings):
    rows = ''.join(f"<tr><td>{p['page']}</td><td>{p['count']}</td><td>{', '.join(f'{s:.4f}' for s in p['scores'])}</td></tr>" for p in pages)
    cards = ''.join(f"<article><h2>{q['number']}번 · 정답 {q['answer']} · {q['points']}점</h2><img src='public{q['imageUrl']}'></article>" for q in paper['questions'])
    content = f"""<!doctype html><html lang="ko"><meta charset="utf-8"><title>{html.escape(paper['title'])}</title>
<style>body{{font-family:sans-serif;margin:24px}}table{{border-collapse:collapse}}td,th{{border:1px solid #aaa;padding:8px}}main{{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}}img{{width:100%}}@media(max-width:700px){{main{{grid-template-columns:1fr}}}}</style>
<h1>{html.escape(paper['title'])} 검토용 (정답 포함)</h1><table><tr><th>쪽</th><th>문항 수</th><th>매칭 점수</th></tr>{rows}</table>
<h2>경고</h2><ul>{''.join('<li>' + html.escape(w) + '</li>' for w in warnings) or '<li>없음</li>'}</ul><main>{cards}</main></html>"""
    (out / 'review.html').write_text(content, encoding='utf-8')


def add_round(round_number, year, exam_date, questions, answers, out=ROOT, sheet=False, force=False):
    if round_number <= 0 or not 1900 <= year <= 9999:
        raise ValueError('invalid round/year')
    if date.fromisoformat(exam_date).year != year:
        raise ValueError('exam date year differs from --year')
    out = Path(out).resolve()
    pid = f'{year}-hanneung-{round_number}-advanced'
    data_dir = out / 'src/features/exam/data'
    images = out / 'public/exams' / pid
    migrations = out / 'supabase/migrations'
    existing_seeds = sorted(migrations.glob(f'*_exam_hanneung_{round_number}_advanced_seed.sql'))
    targets = [data_dir / f'{pid}.json', data_dir / f'{pid}.topics.json', images]
    if not force and (any(p.exists() for p in targets) or existing_seeds):
        raise ValueError(f'{pid} already exists; use --force to replace generated files')
    values = read_answers(answers)
    pieces, ends, pages = crop_questions(questions)
    warnings = crop_warnings(pieces)
    # Metadata is the same as the existing paper, except identity, source hashes,
    # publication state and the newly detected page boundaries/questions.
    template = json.loads((ROOT / 'src/features/exam/data/2026-hanneung-79-advanced.json').read_text(encoding='utf-8'))
    paper = {k: v for k, v in template.items() if k != 'questions'}
    paper.update(id=pid, title=f'{year} 제{round_number}회 한국사능력검정시험 심화', year=year,
                 examDate=exam_date, published=False, pageEnds=ends, questionImages='cropped',
                 sourceSha256=hashlib.sha256(Path(questions).read_bytes()).hexdigest(),
                 answersSha256=hashlib.sha256(Path(answers).read_bytes()).hexdigest())
    paper['questions'] = [dict(number=n, section='common', pageNumber=next(i + 1 for i, end in enumerate(ends) if n <= end),
                               imageUrl=f'/exams/{pid}/q-{n:02d}.jpg', answerType='choice5', answer=values[n][0], points=values[n][1]) for n in range(1, 51)]
    prior = json.loads((ROOT / 'src/features/exam/data/2026-hanneung-79-advanced.topics.json').read_text(encoding='utf-8'))
    topics = {'paperId': pid, 'questions': [dict(number=q['number'], era=q['era'], field=q['field'],
              keywords=['시대 검토 필요'], confidence='low', note='번호 구간 추정 — 검토 필요') for q in prior['questions']]}
    for folder in (images, data_dir, migrations, out / 'scripts/exam'):
        folder.mkdir(parents=True, exist_ok=True)
    for n, piece in enumerate(pieces, 1):
        piece = np.ascontiguousarray(piece)
        fitz.Pixmap(fitz.csRGB, piece.shape[1], piece.shape[0], piece.tobytes(), False).save(str(images / f'q-{n:02d}.jpg'), jpg_quality=85)
    for name, value in [(f'{pid}.json', paper), (f'{pid}.topics.json', topics)]:
        (data_dir / name).write_text(json.dumps(value, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    # 시각이 아니라 기존 마이그레이션 다음 번호로 — 한능검 스키마(20261003000000)보다 앞서면 새 DB 재구성 때 실패한다.
    stamps = [datetime.strptime(path.name[:14], '%Y%m%d%H%M%S') for path in migrations.glob('[0-9]' * 14 + '_*.sql')]
    next_stamp = (max(stamps) + timedelta(seconds=1)) if stamps else datetime.now(timezone.utc)
    migration = existing_seeds[0] if existing_seeds else migrations / f'{next_stamp:%Y%m%d%H%M%S}_exam_hanneung_{round_number}_advanced_seed.sql'
    migration.write_text(seed_sql(paper), encoding='utf-8')
    (out / f'scripts/exam/publish_hanneung_{round_number}.sql').write_text(
        f"-- 검토 후에만 실행. 시드 적용은 별도 절차입니다.\nupdate public.exam_papers set published = true where id = {quote(pid)};\n", encoding='utf-8')
    # 검토용 파일(정답 포함)은 저장소에 쓰지 않는다 — 저장소 모드면 임시 폴더로.
    review = out if out.resolve() != ROOT.resolve() else Path(tempfile.gettempdir()) / f'hanneung-{round_number}-review'
    review.mkdir(parents=True, exist_ok=True)
    era_sheets(pieces, review)
    if sheet:
        write_sheet(review, paper, pages, warnings)
    print(f'review files: {review}')
    for warning in warnings:
        print('WARNING:', warning)
    print(f'wrote {pid} to {out}; unpublished; era tags require review')
    return paper, pages, warnings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--round', type=int, required=True, dest='round_number')
    parser.add_argument('--year', type=int, required=True)
    parser.add_argument('--exam-date', required=True)
    parser.add_argument('--questions', type=Path, required=True)
    parser.add_argument('--answers', type=Path, required=True)
    parser.add_argument('--out-dir', type=Path, default=ROOT)
    parser.add_argument('--sheet', action='store_true')
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    try:
        add_round(args.round_number, args.year, args.exam_date, args.questions, args.answers, args.out_dir, args.sheet, args.force)
    except (ValueError, RuntimeError, OSError) as error:
        parser.exit(1, f'ERROR: {error}\n')


if __name__ == '__main__':
    main()
