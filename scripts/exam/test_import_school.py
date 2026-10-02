"""Run with python scripts/exam/test_import_school.py; no DB or AI required."""
import copy
import json
import re
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from PIL import Image, ImageChops

from import_school import START, ROOT, NeedsExceptions, blank_boundary, crop_questions, detect_layout, find_starts, ink_rows, make_data, parse_cover, prepare_config, read_cover, resolve_pdf, run, seed_sql
import fitz

# 기준 시험지 두 개(1차 출력과 비교). 새로 추가되는 학교 설정은 각자 확인 화면으로 검증한다.
CONFIGS = [ROOT / 'scripts/exam/school-configs' / f'{name}.json' for name in ('2024-yeongpa-g2-s2-mid-calc1', '2026-dongbuk-g1-s2-mid-common2')]


def strip_blank_rows(image):
    indices = [y for y, ink in enumerate(ink_rows(image)) if ink]
    result = Image.new('RGB', (image.width, len(indices)), 'white')
    for i, y in enumerate(indices):
        result.paste(image.crop((0, y, image.width, y + 1)), (0, i))
    return result


def sql_body(sql):
    # Compare just the seed; Dongbuk's old migration also creates schema/RPCs.
    body = sql[sql.index('insert into public.exam_papers'):]
    # 5 and 5.0 are the same SQL numeric value. Leave quoted text untouched.
    return re.sub(r'(?<=, )(\d+)\.0(?=, )', r'\1', body).strip()


class CoverTests(unittest.TestCase):
    def test_inline_aliases(self):
        for labels in [('선택형', '서답형'), ('객관식', '주관식'), ('선택형', '서술형')]:
            self.assertEqual(parse_cover(f'{labels[0]} 18문항 80점\n{labels[1]} 4문항 20점'), dict(questionCount=22, points=100))

    def test_table_and_adjacent_subject_digit(self):
        self.assertEqual(parse_cover('선택형\n서답형\n도함수활용1\n18문항\n19점\n2문항\n6점'), dict(questionCount=20, points=25))

    def test_missing_cover(self):
        self.assertIsNone(parse_cover('공통수학2\n1. 문제 [4.4점]'))

    def test_count_without_points(self):
        self.assertEqual(parse_cover('선택형 18문항\n서답형 2문항'), dict(questionCount=20, points=None))

    def test_header_fallback_excludes_body(self):
        with fitz.open() as doc:
            page = doc.new_page()
            page.insert_text((40, 150), '1. Problem', fontsize=10)
            page.insert_text((40, 200), '선택형 99문항 99점', fontname='korea', fontsize=10)
            self.assertIsNone(read_cover(doc))
            page = doc.new_page()
            page.insert_text((40, 40), '선택형 18문항 80점 서답형 4문항 20점', fontname='korea', fontsize=10)
            self.assertEqual(read_cover(doc), dict(questionCount=22, points=100))

    def configs(self):
        for path in sorted((ROOT / 'scripts/exam/school-configs').glob('20*.json')):
            config = json.loads(path.read_text(encoding='utf-8'))
            yield path, config, resolve_pdf(config, path)

    def test_three_real_covers(self):
        expected = {'dunchon': dict(questionCount=22, points=100), 'yeongpa': dict(questionCount=20, points=25), 'dongbuk': None}
        for _, config, pdf in self.configs():
            with self.subTest(school=config['slug']), fitz.open(pdf) as doc:
                self.assertEqual(read_cover(doc), expected[config['slug']])

    def test_omitted_count_identical_output_bytes(self):
        for _, config, pdf in self.configs():
            if config['slug'] == 'dongbuk':
                continue
            self.assertNotIn('questionCount', config['paper'])
            config['pdf'] = str(pdf)
            with tempfile.TemporaryDirectory() as tmp:
                folder = Path(tmp)
                path = folder / 'config.json'
                outputs = []
                for explicit in (True, False):
                    candidate = copy.deepcopy(config)
                    if explicit:
                        candidate['paper']['questionCount'] = 22 if config['slug'] == 'dunchon' else 21
                    path.write_text(json.dumps(candidate), encoding='utf-8')
                    out = folder / str(explicit)
                    run(path, out, True)
                    outputs.append({p.relative_to(out): p.read_bytes() for p in out.rglob('*') if p.is_file()})
                self.assertEqual(outputs[0], outputs[1])
                sheet = next(value.decode('utf-8') for key, value in outputs[0].items() if key.suffix == '.html')
                self.assertIn('표지 문항 수/배점(읽은 값)', sheet)
                self.assertIn('최종 문항 수', sheet)

    def test_config_cover_mismatch_leaves_no_output(self):
        for _, config, pdf in self.configs():
            if config['slug'] == 'dongbuk':
                continue
            config['pdf'] = str(pdf)
            config['paper']['questionCount'] = 99
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / 'bad.json'
                path.write_text(json.dumps(config), encoding='utf-8')
                out = Path(tmp) / 'out'
                with self.assertRaisesRegex(ValueError, 'cover-derived final question count'):
                    run(path, out)
                self.assertFalse(out.exists())

    def test_no_cover_uses_detected_count_and_warns(self):
        _, config, pdf = next(c for c in self.configs() if c[1]['slug'] == 'dongbuk')
        config['paper'].pop('questionCount')
        with fitz.open(pdf) as doc:
            prepared, starts = prepare_config(doc, config)
            data, warnings = make_data(doc, prepared, starts)
        self.assertEqual(data['questionCount'], 21)
        self.assertIn('표지에서 문항 수를 못 읽어 감지값 사용 — 확인 필요', warnings)

    def test_cover_point_scale_mismatch_leaves_no_output(self):
        for _, config, pdf in self.configs():
            if config['slug'] == 'dongbuk':
                continue
            config['pdf'] = str(pdf)
            config['pointScale'] = 2
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / 'bad.json'
                path.write_text(json.dumps(config), encoding='utf-8')
                out = Path(tmp) / 'out'
                with self.assertRaisesRegex(ValueError, 'cover original points.*pointScale.*maxScore'):
                    run(path, out)
                self.assertFalse(out.exists())


class LabelTests(unittest.TestCase):
    def test_bracket_tag_before_number(self):
        # 둔촌고: 서답형 번호 앞에 "[서답형3]" 줄이 붙는다.
        self.assertEqual(START.match('[서답형3]\n21.\n21) 중심이').group(2), '21')
        self.assertEqual(START.match('3.\n3) 수직선').group(2), '3')
        self.assertIsNone(START.match('[보기] ㄱ. 원'))


class CroppingTests(unittest.TestCase):
    def test_walk_above_raised_formula(self):
        rows = [False] * 200
        rows[80:88] = [True] * 8  # superscript well above the number line
        rows[93:110] = [True] * 17
        boundary = blank_boundary(rows, 100, 0, 18)
        self.assertLess(boundary, 80)
        self.assertGreater(boundary, 0)

    def test_previous_question_excluded(self):
        rows = [False] * 200
        rows[10:40] = [True] * 30
        rows[100:120] = [True] * 20
        boundary = blank_boundary(rows, 108, 0, 18)
        self.assertGreater(boundary, 40)
        self.assertLess(boundary, 100)


class NewLayoutTests(unittest.TestCase):
    def synthetic_import(self, two_columns=False, ruled=False):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            pdf = folder / 'unseen-school.pdf'
            doc = fitz.open()
            for pn in range(2):
                page = doc.new_page(width=600,height=840)
                page.insert_text((40,40),'Unseen School Exam',fontname='korea',fontsize=10)
                page.insert_text((280,815),f'-{pn+1}-',fontname='korea',fontsize=10)
                page.draw_line((30,770),(570,770))
                if pn == 0:
                    page.draw_rect(fitz.Rect(30,30,570,70))
                if ruled:
                    page.draw_line((300,80),(300,765))
                for local in range(2):
                    n = pn*2+local+1
                    x = 40 if local == 0 or not two_columns else 320
                    y = 120 if two_columns else 120+local*180
                    page.insert_text((x,y),f'{n}. Find integer {n}.',fontname='korea',fontsize=10)
                    page.insert_text((x,y+25),'Write an integer. [25점]',fontname='korea',fontsize=10)
            page = doc.new_page(width=600,height=840)
            page.insert_text((40,50),'정답',fontname='korea',fontsize=10)
            for n in range(1,5):
                page.insert_text((40,90+n*25),f'{n}. {n+10}',fontname='korea',fontsize=10)
            doc.save(pdf)
            doc.close()
            paper = dict(id='unseen-school',title='Unseen School',kind='school',schoolName='New',year=2026,grade=1,semester=2,examTerm='mid',subject='Math',source='New',schoolGrade='고1',examDate=None,timeLimitMinutes=50,questionCount=4,maxScore=100,electives=[],published=False)
            config = dict(schemaVersion=1,pdf=str(pdf),paper=paper,slug='unseen',migrationTimestamp='20261003120000',curriculumGrade='공통수학2',pointScale=1)
            path = folder / 'config.json'
            path.write_text(json.dumps(config),encoding='utf-8')
            with fitz.open(pdf) as source:
                expanded, starts = prepare_config(source,config)
            self.assertEqual(expanded['layout']['questionPages'],[1,2])
            self.assertEqual(expanded['layout']['answerPages'],[3])
            self.assertEqual(len(expanded['layout']['columns']),2 if two_columns else 1)
            self.assertGreater(expanded['layout']['pageBodyTop']['1'],70)
            self.assertLess(expanded['layout']['bodyBottom'],770)
            self.assertEqual(set(c for _,c,_ in starts.values()),{0,1} if two_columns else {0})
            data, _ = run(path,folder/'out',True)
            self.assertEqual([q['answer'] for q in data['questions']],['11','12','13','14'])
            self.assertTrue(all(q['answerType']=='digits' and q['points']==25 for q in data['questions']))
            self.assertTrue(all('curriculumChapter' not in q for q in data['questions']))
            for q in data['questions']:
                with Image.open(folder/'out/public'/q['imageUrl'].lstrip('/')) as image:
                    self.assertLess(image.height,250, 'Header/cover/footer must not appear in a question')

    def test_new_single_column_without_layout_or_questions(self):
        self.synthetic_import()

    def test_new_two_columns_without_rules(self):
        self.synthetic_import(two_columns=True)

    def test_new_two_columns_with_center_rule(self):
        self.synthetic_import(two_columns=True,ruled=True)


class RealPdfTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.results = []
        for path in CONFIGS:
            config = json.loads(path.read_text(encoding='utf-8'))
            try:
                pdf = resolve_pdf(config, path)
            except ValueError as error:
                cls.temp.cleanup()
                raise unittest.SkipTest(str(error))
            out = Path(cls.temp.name) / config['slug']
            data, warnings = run(path, out, True)
            with fitz.open(pdf) as doc:
                config, _ = prepare_config(doc, config)
            cls.results.append((path, config, pdf, out, data, warnings))

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_data_fields_equal(self):
        for _, config, _, _, data, _ in self.results:
            with self.subTest(config=config['slug']):
                current = json.loads((ROOT / 'src/features/exam/data' / f'{data["id"]}.json').read_text(encoding='utf-8'))
                self.assertEqual(data, current)

    def test_seed_equal(self):
        for _, config, _, _, data, _ in self.results:
            old_name = '20261002210000_exam_school_papers.sql' if config['slug'] == 'dongbuk' else '20261003060000_exam_yeongpa_school_seed.sql'
            old = (ROOT / 'supabase/migrations' / old_name).read_text(encoding='utf-8')
            self.assertEqual(sql_body(seed_sql(data)), sql_body(old))

    def test_images_only_padding_differs(self):
        for _, _, _, out, data, _ in self.results:
            for q in data['questions']:
                with self.subTest(paper=data['id'], question=q['number']):
                    relative = Path('public') / q['imageUrl'].lstrip('/')
                    with Image.open(ROOT / relative) as source, Image.open(out / relative) as generated:
                        old = source.convert('RGB')
                        new = generated.convert('RGB')
                        a, b = strip_blank_rows(old), strip_blank_rows(new)
                        self.assertEqual(a.size, b.size)
                        self.assertIsNone(ImageChops.difference(a, b).getbbox())
                        self.assertEqual(new.height - old.height, 12)
                        self.assertFalse(any(ink_rows(new)[:3] + ink_rows(new)[-3:]))

    def test_review_and_publish(self):
        for _, config, _, out, data, _ in self.results:
            sheet = (out / f'review-{data["id"]}.html').read_text(encoding='utf-8')
            self.assertEqual(sheet.count('<article>'), 21)
            self.assertIn('정답', sheet)
            self.assertIn('원래', sheet)
            self.assertIn('color:#b00020', sheet)
            old = (ROOT / 'scripts/exam' / f'publish_{config["slug"]}.sql').read_text(encoding='utf-8')
            self.assertEqual(old, (out / 'scripts/exam' / f'publish_{config["slug"]}.sql').read_text(encoding='utf-8'))

    def reject(self, mutate, message):
        for _, base, _, _, _, _ in self.results:
            config = copy.deepcopy(base)
            mutate(config)
            with tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / 'invalid.json'
                path.write_text(json.dumps(config, ensure_ascii=False), encoding='utf-8')
                out = Path(tmp) / 'output'
                with self.assertRaisesRegex(ValueError, message):
                    run(path, out, True)
                self.assertFalse(out.exists(), 'Invalid import must not leave outputs')

    def test_wrong_count(self):
        self.reject(lambda c: c['paper'].update(questionCount=22), 'question count')

    def test_missing_pdf_question(self):
        self.reject(lambda c: c['questions'][0].update(original=999), 'Found original question count')

    def test_wrong_valid_range_answer(self):
        self.reject(lambda c: c['questions'][0].update(answer='2'), 'PDF/config answer mismatch')

    def test_wrong_source_math(self):
        self.reject(lambda c: next(q for q in c['questions'] if q['answerType'] == 'choice10').update(sourceAnswerText='incorrect'), 'source answer mismatch')

    def test_wrong_choice10_selection(self):
        self.reject(lambda c: next(q for q in c['questions'] if q['answerType'] == 'choice10').update(answer='10'), 'selected choice')

    def test_wrong_total(self):
        self.reject(lambda c: c['paper'].update(maxScore=99), 'Points total')

    def test_wrong_points(self):
        self.reject(lambda c: c['questions'][0].update(points=99), 'points mismatch')

    def test_automatic_reading_without_manual(self):
        for _, base, pdf, _, _, _ in self.results:
            config = copy.deepcopy(base)
            for spec in config['questions']:
                if spec['answerType'] != 'choice10':
                    del spec['answer']
                del spec['points']
            with fitz.open(pdf) as doc:
                data, _ = make_data(doc, config, find_starts(doc, config['layout']))
            self.assertEqual(len(data['questions']), 21)
            self.assertEqual(sum(q['points'] for q in data['questions']), 100)

    def test_fallback_and_missing_answer(self):
        for _, base, pdf, _, _, _ in self.results:
            config = copy.deepcopy(base)
            config['layout']['answerPages'] = []
            with fitz.open(pdf) as doc:
                starts = find_starts(doc, config['layout'])
                data, warnings = make_data(doc, config, starts)
                self.assertEqual(len(data['questions']), 21)
                self.assertTrue(any('manual review' in w for w in warnings))
                del config['questions'][0]['answer']
                with self.assertRaisesRegex(ValueError, 'no parsed or manual answer'):
                    make_data(doc, config, starts)

    def test_swapped_split_points(self):
        _, base, pdf, _, _, _ = next(item for item in self.results if item[1]['slug'] == 'yeongpa')
        config = copy.deepcopy(base)
        config['questions'][18]['points'], config['questions'][19]['points'] = config['questions'][19]['points'], config['questions'][18]['points']
        with fitz.open(pdf) as doc, self.assertRaisesRegex(ValueError, 'points mismatch'):
            make_data(doc, config, find_starts(doc, config['layout']))

    def test_answer_ranges(self):
        for _, base, pdf, _, _, _ in self.results:
            for kind, invalid in [('choice5', '0'), ('choice10', '11'), ('digits', '1000')]:
                config = copy.deepcopy(base)
                config['layout']['answerPages'] = []
                next(q for q in config['questions'] if q['answerType'] == kind)['answer'] = invalid
                with fitz.open(pdf) as doc, self.assertRaisesRegex(ValueError, 'invalid ' + kind):
                    make_data(doc, config, find_starts(doc, config['layout']))

    def test_edge_and_height_warnings(self):
        for _, base, pdf, _, _, _ in self.results:
            config = copy.deepcopy(base)
            # Force the body floor through the first question's visible text.
            with fitz.open(pdf) as doc:
                starts = find_starts(doc, config['layout'])
                left, right = config['layout']['columns'][0]
                pix = doc[0].get_pixmap(matrix=fitz.Matrix(3, 3), clip=fitz.Rect(left, 0, right, config['layout']['bodyBottom']), alpha=False)
                rows = ink_rows(Image.frombytes('RGB', (pix.width, pix.height), pix.samples))
                first = round(starts[1][2] * 3)
                cut = next(y for y in range(first + 5, first + 40) if rows[y])
                config['layout']['pageBodyTop'] = {'1': cut / 3}
                _, warnings = crop_questions(doc, config, starts)
                self.assertTrue(any('source edge' in w for w in warnings))
        yeongpa = next(item for item in self.results if item[1]['slug'] == 'yeongpa')
        self.assertTrue(any('unusual image height' in w for w in yeongpa[-1]))

    def test_cli_fails(self):
        for _, base, _, _, _, _ in self.results:
            for field, value in [('questionCount', 22), ('answer', '2')]:
                config = copy.deepcopy(base)
                target = config['paper'] if field == 'questionCount' else config['questions'][0]
                target[field] = value
                with tempfile.TemporaryDirectory() as tmp:
                    path = Path(tmp) / 'bad.json'
                    path.write_text(json.dumps(config), encoding='utf-8')
                    result = subprocess.run([sys.executable, str(ROOT / 'scripts/exam/import_school.py'), str(path), '--out-dir', str(Path(tmp) / 'out')], capture_output=True)
                    self.assertEqual(result.returncode, 1)
                    self.assertIn(b'ERROR:', result.stderr)

    def test_sparse_settings_and_auto_layout(self):
        for path, config, _, _, _, _ in self.results:
            minimal = json.loads(path.read_text(encoding='utf-8'))
            self.assertNotIn('layout', minimal)
            self.assertEqual(len(minimal['questions']), 1 if config['slug'] == 'dongbuk' else 3)
            self.assertTrue(all('chapter' not in q and 'points' not in q for q in minimal['questions']))
            expected_pages = list(range(1, 6 if config['slug'] == 'dongbuk' else 7))
            self.assertEqual(config['layout']['questionPages'], expected_pages)
            self.assertEqual(config['layout']['answerPages'], [expected_pages[-1] + 1])
            self.assertEqual(config['layout']['columns'], [[42,291],[302,550]] if config['slug'] == 'dongbuk' else [[42,294],[302,554]])

    def test_first_output_pixel_and_sql_equality(self):
        for path, config, _, out, data, _ in self.results:
            baseline = json.loads(path.read_text(encoding='utf-8'))
            dongbuk = config['slug'] == 'dongbuk'
            baseline['layout'] = dict(questionPages=list(range(1,6 if dongbuk else 7)), answerPages=[6 if dongbuk else 7], columns=[[42,291],[302,550]] if dongbuk else [[42,294],[302,554]], bodyTop=80 if dongbuk else 68, bodyBottom=785 if dongbuk else 760, blankRunPx=18)
            if not dongbuk:
                baseline['layout']['pageBodyTop'] = {'1':80}
            with tempfile.TemporaryDirectory() as tmp:
                cfg = Path(tmp) / 'baseline.json'
                cfg.write_text(json.dumps(baseline), encoding='utf-8')
                expected, _ = run(cfg, Path(tmp) / 'out')
                self.assertEqual(expected, data)
                self.assertEqual(seed_sql(expected), seed_sql(data))
                for q in data['questions']:
                    relative = Path('public') / q['imageUrl'].lstrip('/')
                    with Image.open(out / relative) as a, Image.open(Path(tmp) / 'out' / relative) as b:
                        self.assertEqual(a.size, b.size)
                        self.assertIsNone(ImageChops.difference(a,b).getbbox())

    def test_no_exceptions_requests_only_written_answers(self):
        for path, base, pdf, _, _, _ in self.results:
            minimal = json.loads(path.read_text(encoding='utf-8'))
            del minimal['questions']
            minimal.pop('chapters')
            with fitz.open(pdf) as doc, self.assertRaises(NeedsExceptions) as failure:
                prepare_config(doc, minimal)
            error = failure.exception
            self.assertEqual(error.originals, [18] if base['slug'] == 'dongbuk' else [19,20])
            self.assertEqual(len(error.normal_questions), 20 if base['slug'] == 'dongbuk' else 18)
            self.assertTrue(all('answer' in q and q['points'] > 0 for q in error.normal_questions))
            self.assertIn('이 문항은 설정에 예외로 적어 주세요', str(error))
            with tempfile.TemporaryDirectory() as tmp:
                cfg = Path(tmp) / 'minimum.json'
                cfg.write_text(json.dumps(minimal), encoding='utf-8')
                result = subprocess.run([sys.executable, str(ROOT / 'scripts/exam/import_school.py'), str(cfg), '--out-dir', str(Path(tmp) / 'out')], capture_output=True, encoding='utf-8', env={**__import__('os').environ, 'PYTHONIOENCODING':'utf-8'})
                self.assertEqual(result.returncode, 1)
                self.assertIn('이 문항은 설정에 예외로 적어 주세요', result.stderr)
                self.assertFalse((Path(tmp) / 'out').exists())

    def test_layout_overrides_are_partial_and_take_priority(self):
        for _, base, pdf, _, _, _ in self.results:
            with fitz.open(pdf) as doc:
                effective, auto = detect_layout(doc, {'bodyBottom':700, 'pageBodyTop':{'1':85}, 'columns':[[40,290],[300,555]]})
            self.assertEqual(effective['bodyBottom'],700)
            self.assertTrue(all(value == 700 for value in effective['pageBodyBottom'].values()))
            self.assertEqual(effective['pageBodyTop']['1'],85)
            self.assertEqual(effective['pageBodyTop']['2'],auto['pageBodyTop']['2'])
            self.assertEqual(effective['columns'],[[40,290],[300,555]])
            self.assertEqual(effective['questionPages'],base['layout']['questionPages'])
            with fitz.open(pdf) as doc:
                effective, auto = detect_layout(doc, {'questionPages':[1], 'answerPages':[]})
            self.assertEqual(effective['questionPages'],[1])
            self.assertEqual(effective['answerPages'],[])
            self.assertEqual(auto['questionPages'],base['layout']['questionPages'])
            self.assertEqual(auto['answerPages'],base['layout']['answerPages'])

    def test_auto_values_visible_in_review(self):
        for _, config, _, out, data, _ in self.results:
            sheet = (out / f'review-{data["id"]}.html').read_text(encoding='utf-8')
            self.assertIn('레이아웃 자동 감지', sheet)
            self.assertIn('<table>', sheet)
            for field in ['questionPages','answerPages','columns','bodyTop','bodyBottom','pageBodyTop']:
                self.assertIn('<th>' + field + '</th>', sheet)

    def test_repository_overwrite_guard_and_force(self):
        for _, base, pdf, _, _, _ in self.results:
            config = copy.deepcopy(base)
            config['pdf'] = str(pdf)
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                cfg = root / 'config.json'
                cfg.write_text(json.dumps(config), encoding='utf-8')
                target = root / 'src/features/exam/data' / f'{config["paper"]["id"]}.json'
                target.parent.mkdir(parents=True)
                target.write_text('sentinel',encoding='utf-8')
                with patch('import_school.ROOT',root):
                    with self.assertRaisesRegex(ValueError, '--force'):
                        run(cfg)
                    self.assertEqual(target.read_text(),'sentinel')
                    self.assertFalse((root / 'supabase').exists())
                    run(cfg, force=True)
                    self.assertEqual(json.loads(target.read_text(encoding='utf-8'))['id'],config['paper']['id'])
                    self.assertEqual(len(list((root / 'supabase/migrations').glob('*.sql'))),1)
                    with self.assertRaisesRegex(ValueError, '--force'):
                        run(cfg)
                    run(cfg, force=True)
                    self.assertEqual(len(list((root / 'supabase/migrations').glob('*.sql'))),1)

    def test_repository_cli_requires_force(self):
        for path, _, _, _, _, _ in self.results:
            result = subprocess.run([sys.executable, str(ROOT / 'scripts/exam/import_school.py'), str(path)], capture_output=True)
            self.assertEqual(result.returncode, 1)
            self.assertIn(b'--force', result.stderr)
        help_result = subprocess.run([sys.executable, str(ROOT / 'scripts/exam/import_school.py'), '--help'], capture_output=True)
        self.assertEqual(help_result.returncode, 0)
        self.assertIn(b'--force', help_result.stdout)


if __name__ == '__main__':
    unittest.main(verbosity=2)
