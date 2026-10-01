import argparse
import hashlib
import json
import re
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[2]
CONFIG = {
    'advanced': {
        'label': '심화', 'minutes': 80,
        'answers': '2421213253' '5513334554' '2443131512' '2142213554' '1434512523',
        'pageEnds': [4, 9, 13, 17, 21, 25, 29, 34, 38, 42, 46, 50],
        'frequencies': [10, 11, 10, 9, 10],
    },
    'basic': {
        'label': '기본', 'minutes': 70,
        'answers': '4324213221' '4312441213' '4411343112' '2123111333' '4134434442',
        'pageEnds': [4, 8, 13, 17, 22, 26, 30, 34, 38, 42, 46, 50],
        'frequencies': [14, 10, 12, 14],
    },
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('reference', type=Path)
    args = parser.parse_args()
    for level, config in CONFIG.items():
        paper_id = f'2026-hanneung-79-{level}'
        source = args.reference / f'79-{level}-questions.pdf'
        answers_source = args.reference / f'79-{level}-answers.pdf'
        with fitz.open(answers_source) as answer_pdf:
            pairs = re.findall(r'(?m)^(\d+)\n[^\n\d]+\n([123])\n', answer_pdf[0].get_text())[:50]
        points = {int(number): int(score) for number, score in pairs}
        assert sorted(points) == list(range(1, 51))
        assert sum(points.values()) == 100
        answers = config['answers']
        assert len(answers) == 50
        assert [answers.count(str(number)) for number in range(1, len(config['frequencies']) + 1)] == config['frequencies']
        output = ROOT / 'public' / 'exams' / paper_id
        output.mkdir(parents=True, exist_ok=True)
        with fitz.open(source) as document:
            assert len(document) == len(config['pageEnds']) == 12
            for page in document:
                page.get_pixmap(matrix=fitz.Matrix(3, 3), alpha=False).save(output / f'page-{page.number + 1:02}.png')
        questions = []
        for number in range(1, 51):
            page_number = next(index + 1 for index, end in enumerate(config['pageEnds']) if number <= end)
            questions.append({
                'number': number, 'section': 'common', 'pageNumber': page_number,
                'imageUrl': f'/exams/{paper_id}/page-{page_number:02}.png',
                'answerType': 'choice4' if level == 'basic' else 'choice5',
                'answer': answers[number - 1], 'points': points[number],
            })
        data = {
            'id': paper_id, 'title': f'2026 제79회 한국사능력검정시험 {config["label"]}',
            'kind': 'hanneung', 'hanneungLevel': level, 'year': 2026, 'examDate': '2026-08-09',
            'source': '국사편찬위원회', 'timeLimitMinutes': config['minutes'],
            'questionCount': 50, 'maxScore': 100, 'published': True, 'electives': [],
            'sourceUrl': 'https://www.historyexam.go.kr/pst/list.do?bbs=dat',
            'timingSourceUrl': 'https://www.historyexam.go.kr/pageLink.do?link=apyexmInfo',
            'gradeSourceUrl': 'https://www.historyexam.go.kr/pageLink.do?link=examGuideline',
            'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'answersSha256': hashlib.sha256(answers_source.read_bytes()).hexdigest(),
            'pageEnds': config['pageEnds'], 'questions': questions,
        }
        (ROOT / 'src/features/exam/data' / f'{paper_id}.json').write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print(paper_id, '50 questions, 100 points, 12 full pages')


if __name__ == '__main__':
    main()
