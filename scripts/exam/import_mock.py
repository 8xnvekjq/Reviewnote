"""전국연합학력평가 PDF를 재현 가능하게 가져온다. 네트워크/DB 접근 없음."""
import json
import re
import hashlib
from pathlib import Path

import fitz
from import_school import crop_questions, find_starts, PUA_NUMBERS

ROOT = Path(__file__).resolve().parents[2]
INPUT = ROOT / '.import/mock2025-10'


def main():
    cuts = json.loads((INPUT / 'cuts.json').read_text(encoding='utf8'))
    for grade in (1, 2):
        paper_id = f'2025-10-g{grade}-math'
        doc = fitz.open(INPUT / f'g{grade}_q.pdf')
        answers_doc = fitz.open(INPUT / f'g{grade}_a.pdf')
        table = answers_doc[0].get_text().split('1. [출제의도]')[0]
        pairs = re.findall(r'(?<!\d)(\d{1,2})\s+([①②③④⑤]|\d+)(?!\d)', table)
        answers = {int(n): str('①②③④⑤'.index(a) + 1) if a in '①②③④⑤' else a for n, a in pairs if 1 <= int(n) <= 30}
        assert sorted(answers) == list(range(1, 31)), answers
        layout = dict(questionPages=list(range(1, 13)), columns=[[80, 418], [425, 763]], columnDivider=420,
                      bodyTop=164, bodyBottom=1060, pageBodyTop={'1': 215}, pageBodyBottom={'12': 965}, blankRunPx=18)
        starts = find_starts(doc, layout)
        assert sorted(starts) == list(range(1, 31))
        explanations = '\n'.join(p.get_text() for p in answers_doc)
        intents = {int(n): t.strip() for n, t in re.findall(r'(\d+)\. \[출제의도\]([^\n]+)', explanations)}
        assert len(intents) == 30
        questions = []
        for n, (pn, col, y) in sorted(starts.items()):
            end = min([sy for p, c, sy in starts.values() if p == pn and c == col and sy > y] or [1060])
            left, right = layout['columns'][col]
            text = doc[pn - 1].get_text(clip=fitz.Rect(left, y - 10, right, end)).translate(PUA_NUMBERS)
            marks = re.findall(r'\[([234])점\]', text)
            assert len(marks) == 1, (grade, n, marks)
            assert ('①' in text and '⑤' in text) == (n <= 21), (grade, n)
            subject, chapter = curriculum(grade, intents[n])
            if grade == 1 and n == 27:
                chapter = '이차방정식'
            if grade == 2 and n == 29:
                chapter = '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)'
            questions.append(dict(number=n, original=n, section='common', answer=answers[n], points=int(marks[0]),
                                  isChoice=n <= 21, answerType='choice5' if n <= 21 else 'digits',
                                  imageUrl=f'/exams/{paper_id}/c-{n:02d}.png', curriculumGrade=subject,
                                  curriculumChapter=chapter, sourceIntent=intents[n]))
        assert sum(q['points'] for q in questions) == 100
        images, warnings = crop_questions(doc, dict(layout=layout, questions=questions), starts)
        out = ROOT / 'public/exams' / paper_id
        out.mkdir(parents=True, exist_ok=True)
        for n, image in images.items():
            image.save(out / f'c-{n:02d}.png')
        cut = cuts[f'g{grade}']
        grade_cuts = dict(source=cuts['source'] + ' ' + cut['url'], raw=[c['raw'] for c in cut['cuts']],
                          standard=[c['standard'] for c in cut['cuts']], percentile=[c['percentile'] for c in cut['cuts']], top=cut['top'])
        data = dict(id=paper_id, kind='mock', grade=grade, title=f'2025년 10월 고{grade} 전국연합학력평가 수학',
                    examDate='2025-10-14', source='시·도 교육청(서울특별시교육청 주관) 전국연합학력평가',
                    schoolGrade=f'고{grade}', subject='수학', year=2025, timeLimitMinutes=100, questionCount=30,
                    maxScore=100, electives=[], published=False, gradeCuts=grade_cuts,
                    pdfSource={'questions': f'.import/mock2025-10/g{grade}_q.pdf', 'answers': f'.import/mock2025-10/g{grade}_a.pdf'},
                    sourceSha256={name: hashlib.sha256((INPUT / f'g{grade}_{name}.pdf').read_bytes()).hexdigest() for name in ('q', 'a')},
                    answers={'common': {str(n): a for n, a in answers.items()}},
                    points={f'common:{q["number"]}': q['points'] for q in questions},
                    isChoice={f'common:{q["number"]}': q['isChoice'] for q in questions}, questions=questions)
        (ROOT / f'src/features/exam/data/{paper_id}.json').write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf8')
        print(paper_id, '30 questions, 100 points', warnings)


def curriculum(grade, intent):
    if grade == 1:
        mappings = [('다항식', '공통수학1', '다항식의 연산'), ('곱셈공식', '공통수학1', '다항식의 연산'),
                    ('인수분해', '공통수학1', '나머지정리와 인수분해'), ('항등식', '공통수학1', '나머지정리와 인수분해'), ('나머지', '공통수학1', '나머지정리와 인수분해'),
                    ('행렬', '공통수학1', '행렬과 그 연산'), ('복소수', '공통수학1', '복소수'),
                    ('이차함수', '공통수학1', '이차방정식과 이차함수'), ('부등식', '공통수학1', '여러 가지 부등식'),
                    ('방정식', '공통수학1', '여러 가지 방정식'), ('법칙', '공통수학1', '경우의 수'),
                    ('조합', '공통수학1', '순열과 조합'), ('순열', '공통수학1', '순열과 조합'),
                    ('평행이동', '공통수학2', '도형의 이동'), ('대칭이동', '공통수학2', '도형의 이동'),
                    ('원', '공통수학2', '원의 방정식'), ('직선', '공통수학2', '직선의 방정식'),
                    ('거리', '공통수학2', '평면좌표'), ('내분', '공통수학2', '평면좌표')]
    else:
        mappings = [('거듭제곱근', '대수', '지수와 로그'), ('호도법', '대수', '삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)'), ('지수', '대수', '지수와 로그'), ('로그', '대수', '지수와 로그'),
                    ('삼각함수', '대수', '삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)'),
                    ('사인법칙', '대수', '삼각함수의 활용 (사인법칙, 코사인법칙 등)'),
                    ('코사인법칙', '대수', '삼각함수의 활용 (사인법칙, 코사인법칙 등)'),
                    ('수열의 합', '대수', '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)'),
                    ('수열', '대수', '등차수열과 등비수열'), ('극한', '미적분Ⅰ', '함수의 극한'),
                    ('연속', '미적분Ⅰ', '함수의 연속'), ('접선', '미적분Ⅰ', '접선의 방정식과 평균값 정리'),
                    ('극대', '미적분Ⅰ', '극대·극소와 그래프'), ('극소', '미적분Ⅰ', '극대·극소와 그래프'),
                    ('미분', '미적분Ⅰ', '미분계수와 도함수')]
    for token, subject, chapter in mappings:
        if token in intent:
            return subject, chapter
    raise ValueError(f'단원 검토 필요: {grade} {intent}')


if __name__ == '__main__':
    main()
