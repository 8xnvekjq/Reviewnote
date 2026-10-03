import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MATH_CURRICULUM } from '../../src/types/index.ts';
import { worksheetReferences } from '../../src/features/exam/ui/worksheetReferences.ts';
import { PAPER, QUESTIONS } from '../../scripts/exam/trig-creative/questions.mjs';
import { buildData, buildPublishSql, buildSeedSql, verifyQuestion } from '../../scripts/exam/build_trig_creative_worksheet.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const id = '2026-g3m-trig-creative';
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'); // autocrlf 체크아웃에서도 비교
const data = JSON.parse(fs.readFileSync(path.join(root, `src/features/exam/data/${id}.json`), 'utf8'));

// 문항 원본과 따로, 풀이를 손으로 옮겨 적은 식으로 정답을 다시 계산한다(표 값 / 정확한 값 / √3=1.732 / 정확한 √3).
const rad = (d: number) => d * Math.PI / 180;
const fns = { sin: Math.sin, cos: Math.cos, tan: Math.tan } as const;
const invs = { sin: Math.asin, cos: Math.acos, tan: Math.atan } as const;
type Fn = keyof typeof fns;
function kit(table: boolean) {
  const v = (fn: Fn, d: number) => table ? Math.round(fns[fn](rad(d)) * 1e4) / 1e4 : fns[fn](rad(d));
  const nearest = (fn: Fn, x: number) => {
    if (!table) return Math.round(invs[fn](x) * 180 / Math.PI);
    let best = 1;
    for (let d = 1; d < 90; d++) if (Math.abs(v(fn, d) - x) < Math.abs(v(fn, best) - x)) best = d;
    return best;
  };
  return { s: (d: number) => v('sin', d), c: (d: number) => v('cos', d), t: (d: number) => v('tan', d), r3: table ? 1.732 : Math.sqrt(3), nearest };
}
type Kit = ReturnType<typeof kit>;
const safe = (angles: number[]) => angles.filter(a => a >= 70 && a <= 78).reduce((x, y) => x + y, 0);
const RECOMPUTE: Array<[number, 'round' | 'ceil', (k: Kit) => number]> = [
  [35, 'round', k => 192 - 1500 * k.s(6)],
  [75, 'round', k => 180 - 1200 * k.s(5)],
  [422, 'round', k => 7000 * k.t(3) - 200 + (455 - 200)],
  [580, 'round', k => 100 * (12 * k.t(90 - 58) + 1.5 - 3.2)],
  [637, 'round', k => 100 * (16 * k.t(90 - 61) + 1.6 - 4.1)],
  [52, 'round', k => (14 * 2.8 + 1.2) * k.t(52)],
  [56, 'round', k => { const x = 20 / (k.r3 - 1); return 2 * x + 1; }],
  [34, 'round', k => 12 * k.r3 + 1.2 + 12],
  [53, 'round', k => 30 * k.r3 + 1.4],
  [65, 'round', k => 10 * (6 / k.t(20) - 10)],
  [111, 'round', k => 10 * (7.5 / k.t(18) - 12)],
  [578, 'ceil', k => 1000 / k.r3],
  [150, 'round', k => safe([k.nearest('cos', 0.24), k.nearest('cos', 0.45), k.nearest('tan', 10), k.nearest('sin', 0.96)])],
  [148, 'round', k => safe([k.nearest('cos', 0.225), k.nearest('cos', 0.47), k.nearest('tan', 5), k.nearest('sin', 5.2 / 5.5)])],
  [219, 'round', k => 200 + Math.max(k.nearest('tan', 0.2), k.nearest('sin', 0.32), k.nearest('tan', 0.3))],
  [521, 'round', k => 100 * 3474 / k.c(87) / 12742],
  [391, 'round', k => 100 * 3480 / k.c(86) / 12760],
  [396, 'round', k => 880 * 360 / k.nearest('tan', 0.14) / 100],
];

test('trig worksheet: 18 questions (6 types × 3), integer answers 0..999, metadata for 중3 worksheet', () => {
  assert.equal(QUESTIONS.length, 18);
  assert.deepEqual(QUESTIONS.map((q: { code: string }) => q.code), ['A', 'B', 'C', 'D', 'E', 'F'].flatMap(t => ['①', '②', '③'].map(n => `${t}-${n}`)));
  assert.equal(data.id, id); assert.equal(data.kind, 'worksheet'); assert.equal(data.grade, 9); assert.equal(data.schoolGrade, '중3');
  assert.equal(data.published, false); assert.equal(data.timeLimitMinutes, null); assert.deepEqual(data.electives, []);
  assert.equal(data.questionCount, 18); assert.equal(data.questions.length, 18);
  assert.equal(data.maxScore, data.questions.reduce((sum: number, q: { points: number }) => sum + q.points, 0));
  for (const [i, q] of data.questions.entries()) {
    assert.equal(q.number, i + 1);
    assert.match(q.answer, /^(0|[1-9]\d{0,2})$/, `${q.number}`);
    assert.equal(q.answerType, 'digits');
    assert.equal(q.sourceLabel, `리뷰노트 변형 문항 · 유형 ${QUESTIONS[i].code}`);
    assert.ok(MATH_CURRICULUM[q.curriculumGrade]?.includes(q.curriculumChapter));
    assert.ok(fs.existsSync(path.join(root, 'public', q.imageUrl)), q.imageUrl);
    assert.equal('solution' in q, false, 'solutions stay out of src/public');
  }
  for (const q of QUESTIONS) {
    assert.match(q.example, /^예를 들어,/);
    assert.ok(q.background.length > 150 && q.problem.length > 150, `${q.code} 지문 길이`);
  }
});

test('trig worksheet: answers recomputed independently match with table values and exact values, away from rounding edges', () => {
  for (const [i, [answer, rule, f]] of RECOMPUTE.entries()) {
    for (const table of [true, false]) {
      const raw = f(kit(table));
      const got = rule === 'ceil' ? Math.ceil(raw - 1e-9) : Math.round(raw);
      assert.equal(got, answer, `${i + 1}번 ${table ? '표' : '정확'} ${raw}`);
      const frac = raw - Math.floor(raw);
      if (Number.isInteger(answer) && Math.abs(raw - Math.round(raw)) > 1e-9) {
        if (rule === 'round') assert.ok(Math.abs(frac - 0.5) > 0.05, `${i + 1}번 반올림 경계 ${raw}`);
        else assert.ok(Math.min(frac, 1 - frac) > 0.05, `${i + 1}번 올림 경계 ${raw}`);
      }
    }
    assert.equal(data.questions[i].answer, String(answer));
  }
  for (const q of QUESTIONS) assert.deepEqual(verifyQuestion(q).problems, [], q.code);
});

test('trig worksheet: generated JSON/seed/publish SQL are up to date and seed stays private', () => {
  const generated = buildData();
  assert.deepEqual(generated, data);
  const seed = read(`supabase/migrations/${PAPER.migrationTimestamp}_exam_trig_creative_worksheet_seed.sql`);
  assert.equal(seed, buildSeedSql(generated));
  assert.match(seed, /,false,'worksheet','리뷰노트',9,18,90\.0,'삼각비의 활용'\)/);
  assert.equal((seed.match(/insert into public\.exam_answer_keys/g) ?? []).length, 18);
  assert.equal(read('scripts/exam/publish_trig_creative_worksheet.sql'), buildPublishSql(generated));
  assert.ok(!fs.readdirSync(path.join(root, 'supabase/migrations')).some(f => f.startsWith(PAPER.migrationTimestamp) && !f.endsWith('_exam_trig_creative_worksheet_seed.sql')));
});

test('trig worksheet: trig table is linked as a separate image', () => {
  const [link] = worksheetReferences(id);
  assert.deepEqual(link, { label: '삼각비 표', href: `/exams/${id}/trig-table.png` });
  assert.ok(fs.existsSync(path.join(root, 'public', link.href)));
  assert.deepEqual(worksheetReferences('youngpa-worksheet-limits'), []);
});
