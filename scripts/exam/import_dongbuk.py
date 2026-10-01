"""Read the external PDF; export only individual 3x question PNGs and source data."""
import json
import re
from pathlib import Path

import fitz
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path('C:/Users/8xnve/Documents/ReviewNotes/reference/school-exams/2026-동북고-1학년-2학기-중간-공통수학2/동북고등학교_1학년_2026_2학기중간_공통수학2_선택,공통_문제_정답.pdf')
PAPER_ID = '2026-dongbuk-g1-s2-mid-common2'
output = ROOT / 'public/exams' / PAPER_ID
output.mkdir(parents=True, exist_ok=True)
doc = fitz.open(SOURCE)
points = [4.4, 4.4, 4.6, 4.5, 4.9, 4.6, 4.6, 4.5, 4.5, 4.6, 4.6, 4.6, 4.8, 4.6, 4.6, 4.4, 4.8, 5, 5, 6, 6]
answers = ['5', '3', '5', '1', '5', '2', '5', '4', '1', '3', '3', '1', '4', '4', '4', '2', '2', '7', '10', '7', '15']
chapters = ['평면좌표', '평면좌표', '직선의 방정식', '직선의 방정식', '평면좌표', '원의 방정식', '원의 방정식', '원의 방정식', '도형의 이동', '도형의 이동', '원의 방정식', '원의 방정식', '원의 방정식', '집합', '집합', '집합', '집합', '원의 방정식', '평면좌표', '원의 방정식', '집합']
choices = [r'\frac{\sqrt{23}}{2}', r'\sqrt{41}', r'\sqrt{105}', '23', r'\sqrt{39}', r'4\sqrt{3}', r'\sqrt{23}', r'2\sqrt{23}', r'\frac{\sqrt{23}}{4}', '8']
reasons = ['현의 반길이를 답함', '두 중심 사이 거리를 답함', '피타고라스에서 빼기 대신 더하기', '제곱근 누락', '중심 거리의 y성분 누락', '중심 거리의 x성분 누락', '정답', '현 길이에 2를 다시 곱함', '중심 거리와 현 길이를 각각 추가로 반으로 줄임', '두 원의 교점을 지름 양 끝점으로 생각함']
questions = []
for page_index, page in enumerate(doc):
    starts = [(int(re.match(r'(\d+)\.', b[4])[1]), b[0], b[1]) for b in page.get_text('blocks') if re.match(r'\d+\.', b[4])]
    for number, x, y in starts:
        left, right = (42, 291) if x < 297 else (302, 550)
        next_y = min([sy - 8 for _, sx, sy in starts if (sx < 297) == (x < 297) and sy > y] or [785])
        clip = fitz.Rect(left, y - 5, right, next_y)
        pix = page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=clip, alpha=False)
        image = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
        bbox = ImageChops.difference(image, Image.new('RGB', image.size, 'white')).getbbox()
        # Preserve a consistent column width for consistent text scale; trim vertical whitespace.
        image = image.crop((0, max(0, bbox[1] - 12), image.width, min(image.height, bbox[3] + 12)))
        image.save(output / f'q-{number:02}.png')
        q = dict(number=number, section='common', imageUrl=f'/exams/{PAPER_ID}/q-{number:02}.png', points=points[number-1], answer=answers[number-1], answerType='choice5' if number <= 17 else 'choice10' if number == 18 else 'digits', curriculumGrade='공통수학2', curriculumChapter=chapters[number-1], sourcePage=page_index+1)
        if number == 18:
            q.update(choices=choices, originalAnswer=r'\sqrt{23}', distractorReasons=reasons)
        questions.append(q)
questions.sort(key=lambda q: q['number'])
assert len(questions) == 21 and round(sum(points), 6) == 100
data = dict(id=PAPER_ID, title='2026 동북고 1학년 2학기 중간 공통수학2', kind='school', schoolName='동북고', year=2026, grade=1, semester=2, examTerm='mid', subject='공통수학2', source='동북고', schoolGrade='고1', examDate=None, examDateNote='원본에는 연도·학기·중간고사만 있고 정확한 시행일은 없음', timeLimitMinutes=50, questionCount=21, maxScore=100, electives=[], published=False, questions=questions)
(ROOT / 'src/features/exam/data' / f'{PAPER_ID}.json').write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
print(f'Exported {len(questions)} questions, {sum(points):g} points')
