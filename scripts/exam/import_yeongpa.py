"""Export reviewed 3x question crops and protected seed JSON from the external PDF."""
import json
import random
import re
from pathlib import Path

import fitz
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path('C:/Users/8xnve/Documents/ReviewNotes/reference/school-exams/2024-영파여고-2학년-2학기-중간-미적분1/영파여자고등학교_2학년_2024_2학기중간_수학2_선택,공통_문제_정답.hwp.pdf')
PAPER_ID = '2024-yeongpa-g2-s2-mid-calc1'
POINTS = [.7, .7, .7, .8, .8, .9, .9, 1, 1, 1.1, 1.1, 1.1, 1.2, 1.2, 1.3, 1.4, 1.5, 1.6, 1.9, 1.1, 3]
ANSWERS = ['1', '5', '3', '2', '4', '3', '2', '5', '2', '4', '1', '1', '3', '4', '5', '3', '2', '5']
CHAPTERS = ['함수의 극한', '미분계수와 도함수', '미분계수와 도함수', '함수의 극한', '함수의 극한', '함수의 극한', '극대·극소와 그래프', '함수의 연속', '함수의 극한', '미분계수와 도함수', '함수의 극한', '접선의 방정식과 평균값 정리', '미분계수와 도함수', '미분계수와 도함수', '함수의 연속', '함수의 연속', '미분계수와 도함수', '함수의 극한', '함수의 극한', '함수의 연속', '미분계수와 도함수']


def cases(rows):
    return r'\begin{cases}' + r'\\'.join(f'{value} & ({condition})' for value, condition in rows) + r'\end{cases}'


G_ROWS = [('2', 't>1'), ('1', 't=1'), ('0', r'-2\le t<1'), ('1', 't<-2')]
G_ANSWER = cases(G_ROWS)
G_OPTIONS = [(G_ANSWER, '정답')]
for index, replacement, reason in [
    (0, ('1', 't>1'), 't>1에서 두 교점 중 하나를 누락'),
    (1, ('2', 't=1'), 't=1의 접점을 중근 두 개로 셈'),
    (1, ('0', 't=1'), '접선과 만나는 점을 교점에서 제외'),
    (3, ('0', 't<-2'), '왼쪽 일차함수의 교점을 누락'),
    (3, ('2', 't<-2'), 'x<-3 제한을 무시해 교점 하나를 추가'),
]:
    rows = G_ROWS.copy()
    rows[index] = replacement
    G_OPTIONS.append((cases(rows), reason))
G_OPTIONS += [
    (cases([('2', 't>1'), ('1', 't=1'), ('0', '-2<t<1'), ('1', r't\le-2')]), 't=-2에서 x=-3을 왼쪽 가지의 교점으로 포함'),
    (cases([('2', r't\ge1'), ('0', r'-2\le t<1'), ('1', 't<-2')]), 't=1을 두 교점 구간에 포함'),
    (cases([('2', 't>1'), ('1', 't=1'), ('0', r'-3\le t<1'), ('1', 't<-3')]), 'x 경계 -3을 매개변수 t 경계로 혼동'),
    (cases([('2', 't>2'), ('1', r'1\le t\le2'), ('0', r'-2\le t<1'), ('1', 't<-2')]), '1<t≤2에서 포물선 교점 두 개를 하나로 셈'),
]
F_ANSWER = '2x+10'
F_OPTIONS = [
    (F_ANSWER, '정답'),
    ('2x', '상수 10을 놓쳐 f(0)=0으로 두고 (나)를 대입'),
    ('2x-10', 'f(0)=-10의 부호를 뒤집어 (나)에 대입'),
    ('2x+12', '극한값 12를 f\'(0)으로 오인'),
    ('2x+14', 'g\'(2)를 f\'(0)-2로 오인: c-2=12'),
    ('2x+8', 'g\'(2)=f\'(2)-2를 f\'(2)로 오인'),
    ('2x+5', 'g(2)=f\'(0)에서 2c-c를 2c로 처리'),
    ('x+10', '2xy를 xy로 오인해 이차항 계수를 절반으로 처리'),
    ('4x+10', '이차항 미분에서 계수 2를 한 번 더 곱함'),
    ('2x+16', 'g(2)=f\'(0)을 g(2)=f\'(2)+2로 오인: 2c-10=c+6'),
]


def shuffled(options, seed):
    values = options.copy()
    random.Random(seed).shuffle(values)
    answer = next(str(i+1) for i, (_, reason) in enumerate(values) if reason == '정답')
    return dict(choices=[v for v, _ in values], distractorReasons=[r for _, r in values], answer=answer, originalAnswer=options[0][0])


def render(page, rect):
    pix = page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=fitz.Rect(rect), alpha=False)
    return Image.frombytes('RGB', (pix.width, pix.height), pix.samples)


def trim(image):
    bbox = ImageChops.difference(image, Image.new('RGB', image.size, 'white')).getbbox()
    assert bbox
    return image.crop((0, max(0, bbox[1]-12), image.width, min(image.height, bbox[3]+12)))


def main():
    output = ROOT / 'public/exams' / PAPER_ID
    output.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(SOURCE)
    questions = []
    for page_index, page in enumerate(doc[:6]):
        starts = []
        for block in page.get_text('blocks'):
            match = re.match(r'(\d+)\s+(\d+)\.', block[4])
            if match:
                assert match[1] == match[2]
                starts.append((int(match[1]), block[0], block[1]))
        for original, x, y in starts:
            left, right = (42, 294) if x < 297 else (302, 554)
            end = min([sy-8 for _, sx, sy in starts if (sx<297)==(x<297) and sy>y] or [760])
            if original == 19:
                crops = [(19, trim(render(page, (left, y-6, right, 191)))),
                         (20, None)]
                body = render(page, (left, y-6, right, 159))
                part2 = render(page, (left, 211, right, 238))
                combined = Image.new('RGB', (body.width, body.height+24+part2.height), 'white')
                combined.paste(body, (0, 0))
                combined.paste(part2, (0, body.height+24))
                crops[1] = (20, trim(combined))
            else:
                # Page 1's metadata table ends immediately above q1.
                top = y if original == 1 else y-6
                crops = [(21 if original == 20 else original, trim(render(page, (left, top, right, end))))]
            for number, image in crops:
                image.save(output / f'q-{number:02}.png')
                q = dict(number=number, originalNumber='19(1)' if number==19 else '19(2)' if number==20 else str(original), section='common', imageUrl=f'/exams/{PAPER_ID}/q-{number:02}.png', originalPoints=POINTS[number-1], points=round(POINTS[number-1]*4, 1), answer=ANSWERS[number-1] if number<=18 else '8', answerType='choice5' if number<=18 else 'digits' if number==20 else 'choice10', curriculumGrade='미적분Ⅰ', curriculumChapter=CHAPTERS[number-1], sourcePage=page_index+1)
                if number == 19:
                    q.update(shuffled(G_OPTIONS, 202419))
                if number == 21:
                    q.update(shuffled(F_OPTIONS, 202421))
                questions.append(q)
    questions.sort(key=lambda q: q['number'])
    assert len(questions)==21 and round(sum(q['points'] for q in questions), 6)==100
    assert questions[18]['answer'] != questions[20]['answer']
    data = dict(id=PAPER_ID, title='2024 영파여고 2학년 2학기 중간 미적분1', kind='school', schoolName='영파여고', year=2024, grade=2, semester=2, examTerm='mid', subject='미적분1', subjectNote='선생님 폴더 이름 기준 미적분1; 원본 시험지 표기는 수학2', source='영파여고', schoolGrade='고2', examDate=None, examDateNote='원본에는 연도·학기·중간고사만 있고 정확한 시행일은 없음', timeLimitMinutes=50, questionCount=21, originalMaxScore=25, pointScale=4, maxScore=100, electives=[], published=False, questions=questions)
    (ROOT / 'src/features/exam/data' / f'{PAPER_ID}.json').write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'Exported {len(questions)} questions; choice10 answers {questions[18]["answer"]}, {questions[20]["answer"]}')


if __name__ == '__main__':
    main()
