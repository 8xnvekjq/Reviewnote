"""Real-PDF regression: python scripts/exam/test_add_hanneung_round.py."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import fitz
import numpy as np
from PIL import Image

import add_hanneung_round as tool
from import_hanneung import CONFIG
from crop_hanneung_questions import canonical_marker_template, find_markers

REFERENCE = Path(os.environ.get('HANNEUNG_REFERENCE', 'C:/Users/8xnve/Documents/ReviewNotes/reference/hanneung/2026-79'))
QUESTIONS = REFERENCE / '79-advanced-questions.pdf'
ANSWERS = REFERENCE / '79-advanced-answers.pdf'
PID = '2026-hanneung-79-advanced'
ROUNDS_REFERENCE = Path(os.environ.get('HANNEUNG_ROUNDS_REFERENCE', str(REFERENCE.parent)))


class AnswerValidation(unittest.TestCase):
    def text(self, answer='①', points=2):
        return '\n'.join(f'{n}\n{answer}\n{points}' for n in range(1, 51))

    def test_fifty_answers(self):
        self.assertEqual(len(tool.parse_answers_text(self.text())), 50)

    def test_missing_duplicate_range_points_and_total(self):
        for text in [self.text().replace('50\n①\n2', ''), self.text() + '\n1\n①\n2',
                     self.text('⑥'), self.text(points=4), self.text(points=1)]:
            with self.subTest(text=text[-30:]), self.assertRaises(ValueError):
                tool.parse_answers_text(text)

    def test_edge_and_height_warnings(self):
        pieces = [np.full((100, 80, 3), 255, dtype=np.uint8) for _ in range(5)]
        pieces[0][:3, :10] = 0
        pieces[-1] = np.full((250, 80, 3), 255, dtype=np.uint8)
        warnings = tool.crop_warnings(pieces)
        self.assertTrue(any('top 3px' in w for w in warnings))
        self.assertTrue(any('unusual height' in w for w in warnings))

    def test_marker_matching_without_opencv(self):
        template = canonical_marker_template()
        column = np.full((230, 300, 3), 255, dtype=np.uint8)
        for y in (20, 140):
            column[y:y + template.shape[0], 260:260 + template.shape[1]] = template[:, :, None]
        normal = find_markers(column, template)
        with patch.dict(sys.modules, {'cv2': None}):
            fallback = find_markers(column, template)
        self.assertEqual([y for y, _ in normal], [20, 140])
        self.assertEqual([y for y, _ in fallback], [20, 140])
        self.assertTrue(all(score > 0.99 for _, score in fallback))



class RealRound(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not QUESTIONS.exists() or not ANSWERS.exists():
            raise RuntimeError(f'real 79th-round PDFs required at {REFERENCE}; set HANNEUNG_REFERENCE')
        cls.temp = tempfile.TemporaryDirectory(prefix='hanneung-round-')
        cls.out = Path(cls.temp.name) / 'output'
        cls.paper, cls.pages, cls.warnings = tool.add_round(79, 2026, '2026-08-09', QUESTIONS, ANSWERS, cls.out, sheet=True)
        cls.old = json.loads((tool.ROOT / f'src/features/exam/data/{PID}.json').read_text(encoding='utf-8'))

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_answers_page_ends_all_json_fields(self):
        self.assertEqual(''.join(q['answer'] for q in self.paper['questions']), CONFIG['advanced']['answers'])
        self.assertEqual(self.paper['pageEnds'], self.old['pageEnds'])
        self.assertEqual(sum(p['count'] for p in self.pages), 50)
        self.assertEqual(sum(len(p['scores']) for p in self.pages), 50)
        expected = dict(self.old, published=False)
        self.assertEqual(self.paper, expected)
        self.assertEqual(sum(q['points'] for q in self.paper['questions']), 100)

    def test_fifty_images_byte_identical(self):
        for n in range(1, 51):
            name = f'public/exams/{PID}/q-{n:02d}.jpg'
            with self.subTest(number=n):
                self.assertEqual((self.out / name).read_bytes(), (tool.ROOT / name).read_bytes())

    def test_seed_matches_existing_question_answer_point_inserts(self):
        original = (tool.ROOT / 'supabase/migrations/20261003000000_exam_hanneung.sql').read_text(encoding='utf-8')
        crop_sql = (tool.ROOT / 'supabase/migrations/20261003040000_exam_hanneung_advanced_cropped.sql').read_text(encoding='utf-8')
        seed = next((self.out / 'supabase/migrations').glob('*_seed.sql')).read_text(encoding='utf-8')
        self.assertEqual(seed.count('insert into public.exam_questions'), 50)
        self.assertEqual(seed.count('insert into public.exam_answer_keys'), 50)
        self.assertEqual(seed.count('on conflict do nothing;'), 101)
        self.assertNotRegex(seed.lower(), r'\b(alter|drop|delete|update|create)\b')
        self.assertIn("null, false, 'hanneung', 2026, 50, 100, 'advanced'", seed)
        self.assertIn("'/exams/" + PID + "/q-' || lpad(q.number::text, 2, '0') || '.jpg'", crop_sql)
        self.assertIn("q.paper_id = '" + PID + "'", crop_sql)
        self.assertIn('q.number between 1 and 50', crop_sql)
        for q in self.paper['questions']:
            n = q['number']
            old_q = re.search(r"values \('" + PID + r"', " + str(n) + r", 'common', '[^']+', true, (\d), 'choice5'\)", original)
            self.assertIsNotNone(old_q)
            self.assertEqual(int(old_q[1]), q['points'])
            answer = f"select id, '{q['answer']}' from public.exam_questions where paper_id = '{PID}' and number = {n} and section = 'common'"
            self.assertIn(answer, original)
            self.assertIn(answer, seed)
            self.assertIn(f"'{q['imageUrl']}'", seed)

    def test_topics_sheets_and_html(self):
        tags = json.loads((self.out / f'src/features/exam/data/{PID}.topics.json').read_text(encoding='utf-8'))
        self.assertEqual([q['number'] for q in tags['questions']], list(range(1, 51)))
        for q in tags['questions']:
            self.assertEqual(q['confidence'], 'low')
            self.assertEqual(q['note'], '번호 구간 추정 — 검토 필요')
            self.assertTrue(1 <= len(q['keywords']) <= 4)
        for n in range(1, 6):
            with Image.open(self.out / f'era-sheet-{n}.png') as img:
                self.assertLessEqual(img.width, 1600)
                self.assertGreater(img.height, 0)
        review = (self.out / 'review.html').read_text(encoding='utf-8')
        self.assertEqual(review.count('<article>'), 50)
        self.assertFalse((self.out / 'src/features/exam/data/hanneungTopics.ts').exists())

    def test_existing_paper_refused_and_force_reuses_seed(self):
        with self.assertRaisesRegex(ValueError, 'already exists'):
            tool.add_round(79, 2026, '2026-08-09', QUESTIONS, ANSWERS, self.out)
        # Reuse already validated crops to check replacement without another expensive render.
        with patch.object(tool, 'crop_questions', return_value=([np.full((80, 80, 3), 255, dtype=np.uint8)] * 50, self.paper['pageEnds'], self.pages)):
            force_out = Path(self.temp.name) / 'force'
            tool.add_round(78, 2026, '2026-05-24', QUESTIONS, ANSWERS, force_out)
            tool.add_round(78, 2026, '2026-05-24', QUESTIONS, ANSWERS, force_out, force=True)
            self.assertEqual(len(list((force_out / 'supabase/migrations').glob('*_seed.sql'))), 1)

    def run_bad_cli(self, questions, answers, out):
        result = subprocess.run([sys.executable, str(tool.ROOT / 'scripts/exam/add_hanneung_round.py'),
            '--round', '79', '--year', '2026', '--exam-date', '2026-08-09', '--questions', str(questions),
            '--answers', str(answers), '--out-dir', str(out)], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn('ERROR:', result.stderr)
        self.assertFalse(out.exists(), 'invalid input must not create output')
        return result

    def test_wrong_answer_pdf_stops(self):
        result = self.run_bad_cli(QUESTIONS, QUESTIONS, Path(self.temp.name) / 'wrong-answer')
        self.assertIn('exactly questions 1..50', result.stderr)

    def test_missing_question_page_stops(self):
        missing = Path(self.temp.name) / 'missing-page.pdf'
        with fitz.open(QUESTIONS) as doc:
            doc.delete_page(5)
            doc.save(missing)
        result = self.run_bad_cli(missing, ANSWERS, Path(self.temp.name) / 'missing-page-output')
        self.assertIn('found 46', result.stderr)


class OtherRealRounds(unittest.TestCase):
    def check_round(self, number, year, exam_date):
        reference = ROUNDS_REFERENCE / f'{year}-{number}'
        questions = reference / f'{number}-advanced-questions.pdf'
        answers = reference / f'{number}-advanced-answers.pdf'
        if not questions.exists() or not answers.exists():
            self.skipTest(f'optional round {number} PDFs missing at {reference}')
        original_crop = tool.crop_questions

        def image_only_crop(path):
            # Never use the question PDF text layer, even when present.
            with patch.object(fitz.Page, 'get_text', side_effect=AssertionError('question text layer used')):
                return original_crop(path)

        with tempfile.TemporaryDirectory(prefix=f'hanneung-{number}-') as folder:
            with patch.object(tool, 'crop_questions', side_effect=image_only_crop):
                paper, pages, warnings = tool.add_round(number, year, exam_date, questions, answers, Path(folder), sheet=True)
            self.assertEqual(len(paper['questions']), 50)
            self.assertEqual(sum(page['count'] for page in pages), 50)
            self.assertEqual(sum(q['points'] for q in paper['questions']), 100)
            self.assertEqual(paper['questions'][-1]['number'], 50)
            self.assertEqual(len(list((Path(folder) / 'public/exams' / paper['id']).glob('q-*.jpg'))), 50)
            if number == 77:
                # The third heading has its points on line two. Previously it
                # became a blank strip and the fourth image contained both.
                for question in (3, 4):
                    with Image.open(Path(folder) / f'public/exams/{paper["id"]}/q-{question:02d}.jpg') as image:
                        self.assertTrue(800 < image.height < 1800)

    def test_round_74(self):
        self.check_round(74, 2025, '2025-05-24')

    def test_round_75(self):
        self.check_round(75, 2025, '2025-08-09')

    def test_round_76(self):
        self.check_round(76, 2025, '2025-10-18')

    def test_round_77(self):
        self.check_round(77, 2026, '2026-02-07')

    def test_round_78(self):
        self.check_round(78, 2026, '2026-05-23')


if __name__ == '__main__':
    unittest.main(verbosity=2)
