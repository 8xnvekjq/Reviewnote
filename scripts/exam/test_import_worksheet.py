import json
import copy
import tempfile
import unittest
from pathlib import Path

import fitz
from import_school import NeedsExceptions
from import_worksheet import ROOT, collection_images, parse_answer, prepare, run


class WorksheetImportTests(unittest.TestCase):
    def test_answers_and_non_numeric_rejection(self):
        self.assertEqual(parse_answer('②'), ('choice5', '2'))
        self.assertEqual(parse_answer('➂'), ('choice5', '3'))
        self.assertEqual(parse_answer('009'), ('digits', '9'))
        for raw in ['1/2', '-3', 'a', '1000', '']:
            self.assertIsNone(parse_answer(raw))

    def test_non_numeric_requires_verified_exception(self):
        with fitz.open() as doc:
            p = doc.new_page(); p.insert_text((40, 80), '1.1) Question [3]')
            p = doc.new_page(); p.insert_text((40, 80), '1) a')
            # Stop before any output when a formula answer is unsupported.
            with self.assertRaises(NeedsExceptions):
                prepare(doc, {'paper': {}, 'layout': {'columns': [[30, 280]], 'bodyTop': 30, 'bodyBottom': 750}})

    def test_real_pdfs_counts_continuations_private_assets_and_overwrite_guard(self):
        for name, count in [('limits', 28), ('derivatives', 14)]:
            config = ROOT / 'scripts/exam/worksheet-configs' / (name + '.json')
            with tempfile.TemporaryDirectory(dir=ROOT / 'scratch') as tmp:
                data, warnings = run(config, tmp)
                self.assertEqual(len(data['questions']), count)
                self.assertFalse(any('edge' in w for w in warnings))
                self.assertEqual(data['maxScore'], sum(q['points'] for q in data['questions']))
                target = Path(tmp) / 'scripts/exam/worksheet-generated' / data['id']
                self.assertEqual(len(list((target / 'private-solutions').rglob('*.png'))), count)
                self.assertEqual(len(list((Path(tmp) / 'public').rglob('*.png'))), count)
                self.assertFalse(any('solution' in str(p) for p in (Path(tmp) / 'public').rglob('*')))
                if name == 'derivatives':
                    self.assertEqual(len(data['questions'][12]['solutionSegments']), 1)
                    self.assertEqual(len(data['questions'][13]['solutionSegments']), 2)
                self.assertTrue(all(q['sourceLabel'] for q in data['questions']))
                frontend = json.loads((Path(tmp) / 'src/features/exam/data' / f'{data["id"]}.json').read_text(encoding='utf-8'))
                self.assertTrue(all('answer' not in q and 'solutionKey' not in q and 'sourceAnswerText' not in q for q in frontend['questions']))
                seed = next((Path(tmp) / 'supabase/migrations').glob('*_seed.sql')).read_text(encoding='utf-8')
                self.assertNotIn('private.', seed)
                self.assertNotIn('solutionKey', seed)
                self.assertIn('private-solutions/', (target / 'review.html').read_text(encoding='utf-8'))
                with self.assertRaisesRegex(ValueError, 'Existing worksheet'):
                    run(config, tmp)

    @unittest.skipUnless((ROOT / 'reference-src/appendix.pdf').exists(), 'Local teacher reference PDF unavailable')
    def test_collection_filter_renumber_points_and_private_output(self):
        config = ROOT / 'scripts/exam/worksheet-configs/gaeplus-m3-s2-midfinal-1.json'
        with tempfile.TemporaryDirectory(dir=ROOT / 'scratch') as tmp:
            data, warnings = run(config, tmp, sheet=True)
            self.assertEqual(warnings, [])
            self.assertEqual(data['kind'], 'school')
            self.assertEqual(data['timeLimitMinutes'], 60)
            self.assertEqual(data['maxScore'], 122)
            qs = data['questions']
            self.assertEqual([q['number'] for q in qs], list(range(1, 30)))
            self.assertEqual([q['original'] for q in qs[:20]], list(range(1, 19)) + [20, 22])
            self.assertEqual([q['original'] for q in qs[20:]], list(range(1, 8)) + [19, 22])
            self.assertEqual([q['answer'] for q in qs if q['answerType'] == 'digits'], ['20', '0', '3', '65'])
            self.assertEqual(qs[20]['sourcePage'], 89)
            self.assertEqual(qs[-1]['curriculumChapter'], '원주각')
            self.assertEqual(len(qs[4]['solutionSegments']), 2)
            self.assertEqual(len(list((Path(tmp) / 'public').rglob('*.png'))), 29)
            frontend_path = Path(tmp) / 'src/features/exam/data' / f'{data["id"]}.json'
            frontend = json.loads(frontend_path.read_text(encoding='utf-8'))
            forbidden = {'answer', 'sourceAnswerText', 'solutionKey', 'solutionSegments', 'imageSegments'}
            self.assertTrue(all(not forbidden.intersection(q) for q in frontend['questions']))
            seed = next((Path(tmp) / 'supabase/migrations').glob('*_seed.sql')).read_text(encoding='utf-8')
            self.assertIn("false,'school'", seed)
            self.assertIn('60', seed)
            self.assertEqual(seed.count('insert into public.exam_answer_keys'), 29)

    @unittest.skipUnless((ROOT / 'reference-src/appendix.pdf').exists(), 'Local teacher reference PDF unavailable')
    def test_collection_rejects_fraction_and_stale_exception(self):
        config = json.loads((ROOT / 'scripts/exam/worksheet-configs/gaeplus-m3-s2-midfinal-1.json').read_text(encoding='utf-8'))
        with fitz.open(ROOT / 'reference-src/appendix.pdf') as doc:
            fraction = copy.deepcopy(config)
            fraction['sections'][0]['include'] = [19]
            # The key has numerator 7 and denominator 12 on separate lines;
            # it must not be accepted as the numeric answer 7 or 712.
            with self.assertRaises(NeedsExceptions):
                collection_images(doc, fraction)
            stale = copy.deepcopy(config)
            stale['sections'][1]['questions'][0]['sourceAnswerText'] = '66!'
            with self.assertRaisesRegex(ValueError, 'source answer text changed'):
                collection_images(doc, stale)
            mismatch = copy.deepcopy(config)
            mismatch['sections'][0]['questions'].append({'number': 1, 'answer': '4'})
            with self.assertRaisesRegex(ValueError, 'disagrees with PDF'):
                collection_images(doc, mismatch)

    def test_frontend_overwrite_guard_before_any_output(self):
        with tempfile.TemporaryDirectory(dir=ROOT / 'scratch') as tmp:
            config = json.loads((ROOT / 'scripts/exam/worksheet-configs/limits.json').read_text(encoding='utf-8'))
            existing = Path(tmp) / 'src/features/exam/data' / f'{config["paper"]["id"]}.json'
            existing.parent.mkdir(parents=True)
            existing.write_text('preserve', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, 'Existing frontend paper'):
                run(ROOT / 'scripts/exam/worksheet-configs/limits.json', tmp)
            self.assertEqual(existing.read_text(encoding='utf-8'), 'preserve')
            self.assertFalse((Path(tmp) / 'public').exists())


if __name__ == '__main__':
    unittest.main()
