import json
import tempfile
import unittest
from pathlib import Path

import fitz
from import_school import NeedsExceptions
from import_worksheet import ROOT, parse_answer, prepare, run


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
                seed = next((Path(tmp) / 'supabase/migrations').glob('*_seed.sql')).read_text(encoding='utf-8')
                self.assertNotIn('private.', seed)
                self.assertNotIn('solutionKey', seed)
                self.assertIn('private-solutions/', (target / 'review.html').read_text(encoding='utf-8'))
                with self.assertRaisesRegex(ValueError, 'Existing worksheet'):
                    run(config, tmp)


if __name__ == '__main__':
    unittest.main()
