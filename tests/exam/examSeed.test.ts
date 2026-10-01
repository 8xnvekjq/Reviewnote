import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MATH_CURRICULUM } from '../../src/types/index.ts';

// 마이그레이션 시드가 검증된 원본 JSON(정답·배점·객관식 여부·이미지·전국 오답률)과 어긋나지 않는지,
// 문항 단원이 오답노트 커리큘럼 이름 그대로인지 확인한다.

const root = path.resolve(import.meta.dirname, '../..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261002120000_exam_practice.sql'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(root, 'src/features/exam/data/2025-06-math.json'), 'utf8'));
const images = JSON.parse(fs.readFileSync(path.join(root, 'src/features/exam/data/2025-06-math.images.json'), 'utf8'));
const sections = ['common', '확률과 통계', '미적분', '기하'] as const;

const questionRows = [...sql.matchAll(/^ {2}\('2025-06-math', (\d+), '([^']+)', '([^']+)', (true|false), (\d), '([^']+)', '([^']+)'\)/gm)]
  .map(([, n, section, imageUrl, isChoice, points, grade, chapter]) => ({ n: Number(n), section, imageUrl, isChoice: isChoice === 'true', points: Number(points), grade, chapter }));
const keyRows = [...sql.matchAll(/^ {2}\((\d+), '([^']+)', '([^']+)'\)/gm)]
  .map(([, n, section, answer]) => ({ n: Number(n), section, answer }));
const statRows = [...sql.matchAll(/^ {2}\((\d+), '([^']+)', '([^']+)', ([\d.]+), (?:'([^']+)'::jsonb|null::jsonb), (\d+)\)/gm)]
  .map(([, n, section, elective, wrongRate, rates, rank]) => ({ n: Number(n), section, elective, wrongRate: Number(wrongRate), rates: rates ? JSON.parse(rates) : null, rank: Number(rank) }));

test('seed has 46 questions matching the image list, points and choice flags', () => {
  assert.equal(questionRows.length, 46);
  for (const section of sections) {
    for (const [n, img] of Object.entries(images[section]) as Array<[string, { file: string }]>) {
      const row = questionRows.find((r) => r.section === section && r.n === Number(n));
      assert.ok(row, `${section} ${n}`);
      assert.equal(row.imageUrl, `/exams/2025-06-math/${img.file}`);
      assert.equal(row.points, data.points[n]);
      assert.equal(row.isChoice, data.isChoice[n]);
      assert.ok(fs.existsSync(path.join(root, 'public', row.imageUrl)), row.imageUrl);
    }
  }
});

test('seed answer keys match the verified answers', () => {
  assert.equal(keyRows.length, 46);
  for (const row of keyRows) assert.equal(row.answer, data.answers[row.section][String(row.n)], `${row.section} ${row.n}`);
});

test('every question uses an existing MATH_CURRICULUM grade/chapter', () => {
  for (const row of questionRows) {
    assert.ok(MATH_CURRICULUM[row.grade]?.includes(row.chapter), `${row.section} ${row.n}: ${row.grade} / ${row.chapter}`);
    if (row.section === 'common') assert.ok(['대수', '미적분Ⅰ'].includes(row.grade));
    if (row.section === '확률과 통계') assert.equal(row.grade, '확률과 통계');
    if (row.section === '미적분') assert.equal(row.grade, '미적분Ⅱ');
    if (row.section === '기하') assert.equal(row.grade, '기하');
  }
});

test('national stats are per elective and match EBSi lists', () => {
  assert.equal(statRows.length, 45);
  for (const elective of ['확률과 통계', '미적분', '기하']) {
    for (const src of data.wrongRates.byElective[elective]) {
      const row = statRows.find((r) => r.elective === elective && r.n === src.number);
      assert.ok(row, `${elective} ${src.number}`);
      assert.equal(row.section, src.number <= 22 ? 'common' : elective);
      assert.equal(row.wrongRate, src.wrongRate);
      assert.deepEqual(row.rates, src.choiceRates);
      assert.equal(row.rank, src.rank);
    }
  }
});

test('grade cuts are seeded verbatim', () => {
  const m = sql.match(/'(\{"source":[^']*)'::jsonb/);
  assert.ok(m);
  assert.deepEqual(JSON.parse(m[1]), data.gradeCuts);
});
