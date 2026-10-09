"""전국연합학력평가 PDF를 재현 가능하게 가져온다. 네트워크/DB 접근 없음."""
import json
import re
import hashlib
import argparse
from pathlib import Path

import fitz
from import_school import crop_questions, find_starts, PUA_NUMBERS

ROOT = Path(__file__).resolve().parents[2]
INPUT = ROOT / '.import/mock2025-10'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--grade', type=int, choices=(1, 2, 3))
    args = parser.parse_args()
    if args.grade == 3:
        import_g3()
        return
    cuts = json.loads((INPUT / 'cuts.json').read_text(encoding='utf8'))
    for grade in ((args.grade,) if args.grade else (1, 2)):
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


def import_g3():
    """고3 공통·선택과목을 머리말로 구분하고 기존 자르기 함수를 재사용한다."""
    source_dir = ROOT / '.import/g3'
    paper_id = '2025-10-g3-math'
    doc = fitz.open(source_dir / 'g3_q.pdf')
    answer_doc = fitz.open(source_dir / 'g3_a.pdf')
    electives = ['확률과 통계', '미적분', '기하']
    prefixes = dict(zip(['common'] + electives, ['c', 'prob', 'calc', 'geom']))
    pages = {section: [] for section in prefixes}
    for pn, page in enumerate(doc, 1):
        header = re.sub(r'\s', '', page.get_text(clip=fitz.Rect(0, 0, 841, 160)))
        section = next((e for e in electives if e.replace(' ', '') in header), 'common')
        assert '수학영역' in header, (pn, header)
        pages[section].append(pn)
    text = '\n'.join(p.get_text() for p in answer_doc).translate(PUA_NUMBERS)
    chunks = re.split(r'\[(확률과통계|미적분|기하)\]', text)
    section_texts = {'common': chunks[0]}
    section_texts.update({next(e for e in electives if e.replace(' ', '') == chunks[i]): chunks[i + 1]
                         for i in range(1, len(chunks), 2)})
    answers, questions = {}, []
    out = ROOT / 'public/exams' / paper_id
    out.mkdir(parents=True, exist_ok=True)
    for section, pns in pages.items():
        expected = list(range(1, 23) if section == 'common' else range(23, 31))
        section_text = section_texts[section]
        table = section_text.split('[출제의도]', 1)[0].rsplit('해 설', 1)[0]
        pairs = re.findall(r'(?<!\d)(\d{1,2})\s+([①②③④⑤]|\d+)(?!\d)', table)
        keys = {int(n): str('①②③④⑤'.index(a) + 1) if a in '①②③④⑤' else a
                for n, a in pairs if int(n) in expected}
        assert sorted(keys) == expected, (section, keys)
        answers[section] = {str(n): keys[n] for n in expected}
        intents = {int(n): re.sub(r'\s+', ' ', t).strip() + '다.' for n, t in
                   re.findall(r'(\d+)\. \[출제의도\](.*?)다\.', section_text, re.S)}
        # 단원은 기존 수능 데이터와 동일한 분류명을 사용한다. 해설의 출제의도로 검토했다.
        common_chapters = [
            ('대수', '지수와 로그'), ('미적분Ⅰ', '미분계수와 도함수'), ('대수', '등차수열과 등비수열'),
            ('미적분Ⅰ', '함수의 연속'), ('미적분Ⅰ', '미분계수와 도함수'),
            ('대수', '삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)'),
            ('미적분Ⅰ', '접선의 방정식과 평균값 정리'), ('대수', '지수와 로그'),
            ('미적분Ⅰ', '정적분의 활용'), ('대수', '삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함)'),
            ('미적분Ⅰ', '부정적분과 정적분'), ('대수', '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)'),
            ('미적분Ⅰ', '정적분의 활용'), ('대수', '삼각함수의 활용 (사인법칙, 코사인법칙 등)'),
            ('미적분Ⅰ', '부정적분과 정적분'), ('대수', '지수함수와 로그함수'), ('미적분Ⅰ', '부정적분과 정적분'),
            ('대수', '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)'),
            ('미적분Ⅰ', '극대·극소와 그래프'), ('대수', '지수함수와 로그함수'),
            ('미적분Ⅰ', '미분계수와 도함수'), ('대수', '수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)')]
        elective_chapters = {
            '확률과 통계': ['이항정리', '확률의 뜻과 성질', '확률의 뜻과 성질', '통계적 추정',
                          '여러 가지 순열과 조합', '확률분포', '여러 가지 순열과 조합', '조건부확률'],
            '미적분': ['삼각함수의 미분', '급수', '수열의 극한', '초월함수 정적분의 활용',
                     '여러 가지 미분법', '초월함수 정적분의 활용', '급수', '여러 가지 미분법'],
            '기하': ['평면벡터의 연산과 성분', '이차곡선', '공간도형과 공간좌표', '공간도형과 공간좌표',
                   '이차곡선', '공간도형과 공간좌표', '이차곡선', '평면벡터의 내적']}
        layout = dict(questionPages=pns, columns=[[80, 418], [425, 763]], columnDivider=420,
                      bodyTop=162, bodyBottom=1060, pageBodyTop={str(pns[0]): 213},
                      pageBodyBottom={str(pns[-1]): 960 if section != '기하' else 1000}, blankRunPx=18)
        starts = find_starts(doc, layout)
        assert sorted(starts) == expected, (section, starts)
        specs = []
        for n, (pn, col, y) in sorted(starts.items()):
            bottom = layout['pageBodyBottom'].get(str(pn), layout['bodyBottom'])
            end = min([sy for p, c, sy in starts.values() if p == pn and c == col and sy > y] or [bottom])
            left, right = layout['columns'][col]
            body = doc[pn - 1].get_text(clip=fitz.Rect(left, y - 10, right, end)).translate(PUA_NUMBERS)
            marks = re.findall(r'\[([234])점\]', body)
            assert len(marks) == 1, (section, n, marks)
            choice = n <= 15 if section == 'common' else n <= 28
            assert ('①' in body and '⑤' in body) == choice, (section, n)
            subject, chapter = common_chapters[n - 1] if section == 'common' else (
                '미적분Ⅱ' if section == '미적분' else section, elective_chapters[section][n - 23])
            specs.append(dict(number=n, original=n, section=section, answer=keys[n], points=int(marks[0]),
                              isChoice=choice, answerType='choice5' if choice else 'digits',
                              imageUrl=f'/exams/{paper_id}/{prefixes[section]}-{n:02d}.png',
                              curriculumGrade=subject, curriculumChapter=chapter, sourceIntent=intents[n]))
        assert sum(q['points'] for q in specs) == (74 if section == 'common' else 26)
        images, warnings = crop_questions(doc, dict(layout=layout, questions=specs), starts)
        for n, im in images.items():
            im.save(out / f'{prefixes[section]}-{n:02d}.png')
        print(section, len(specs), warnings)
        questions.extend(specs)
    cuts = json.loads((source_dir / 'cuts.json').read_text(encoding='utf8'))
    grade_cuts = {'source': cuts['source']}
    for field in ('raw', 'standard', 'percentile'):
        grade_cuts[field + 'ByElective'] = {e: [c[field] for c in cuts['byElective'][e]] for e in electives}
    data = dict(id=paper_id, kind='csat', title='2025년 10월 고3 전국연합학력평가 수학', examDate='2025-10-14',
                source='시·도 교육청(서울특별시교육청 주관) 전국연합학력평가', schoolGrade='고3', subject='수학',
                year=2026, grade=3, timeLimitMinutes=100, questionCount=30, maxScore=100, electives=electives,
                published=False, pdfSource={'questions': '.import/g3/g3_q.pdf', 'answers': '.import/g3/g3_a.pdf'},
                sourceSha256={name: hashlib.sha256((source_dir / f'g3_{name}.pdf').read_bytes()).hexdigest() for name in ('q', 'a')},
                pageLayout={s: [min(p), max(p)] for s, p in pages.items()}, answers=answers,
                points={str(q['number']): q['points'] for q in questions},
                isChoice={str(q['number']): q['isChoice'] for q in questions}, gradeCuts=grade_cuts, questions=questions)
    (ROOT / f'src/features/exam/data/{paper_id}.json').write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf8')


if __name__ == '__main__':
    main()
