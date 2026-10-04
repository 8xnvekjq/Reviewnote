import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MATH_CURRICULUM } from '../../src/types/index.ts';
import { worksheetReferences } from '../../src/features/exam/ui/worksheetReferences.ts';
import { QUESTIONS as BASE } from '../../scripts/exam/trig-creative/questions.mjs';
import { MIGRATION_TIMESTAMP, QUESTIONS_1, QUESTIONS_2 } from '../../scripts/exam/trig-creative/questions-v2.mjs';
import { V2_PUBLISH_FILE, V2_SEED_FILE, V2_SHEETS, buildData, buildV2PublishSql, buildV2SeedSql, verifyQuestion } from '../../scripts/exam/build_trig_creative_worksheet.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const ids = ['2026-g3m-trig-creative-1', '2026-g3m-trig-creative-2'] as const;
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'); // autocrlf 체크아웃에서도 비교
const datas = ids.map(id => JSON.parse(fs.readFileSync(path.join(root, `src/features/exam/data/${id}.json`), 'utf8')));

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
type Rule = 'round' | 'ceil' | 'sum-of-rounded';
const safe = (angles: number[]) => angles.filter(a => a >= 70 && a <= 78).reduce((x, y) => x + y, 0);
const grade = (b: number) => (b <= 12 ? 1 : b <= 20 ? 2 : 3);

// [정답, 규칙, 식, (sum-of-rounded일 때) 각각 반올림하는 부분들]
type Row = [number, Rule, (k: Kit) => number, ((k: Kit) => number[])?];
const RECOMPUTE_1: Row[] = [
  [400, 'round', k => 100 * (90 + 1100 * k.s(6) - 1500 * k.t(4)) / 2500 * 100],
  [262, 'round', k => 596 / k.t(3) / 100 + 6000 * k.t(3) + 24 - 190],
  [501, 'round', k => 100 * (21 * k.t(27) + 1.5 - (14 * k.t(33) + 1.5 - 3.4))],
  [317, 'round', k => 10 * (43.8 / k.t(26) - 43.8 / k.t(37))],
  [90, 'round', k => { const x = 21.6 / (k.r3 - 1); return 100 * (x + 1.1 - 30) + x; }],
  [274, 'round', k => 42 * k.r3 + 1.4 + 42 * k.r3 / k.t(20)],
  [111, 'round', k => 10 * (23 - ((4 / k.t(20) - 7) + (9 / k.t(22) - 9 / k.t(32))))],
  [702, 'ceil', k => 100 * (2.4 + 8 / k.r3)],
  [220, 'round', k => safe([k.nearest('cos', 1.4 / 5.5), k.nearest('sin', 0.95), k.nearest('tan', 5), k.nearest('cos', 1.5 / 3.6), k.nearest('sin', 4.5 / 4.7)])],
  [342, 'round', k => {
    const ga = Math.max(k.nearest('tan', 0.2), k.nearest('sin', 0.375), k.nearest('tan', 0.28));
    const na = Math.max(k.nearest('tan', 0.18), k.nearest('tan', 0.2), k.nearest('sin', 0.22));
    return 100 * grade(ga) + 10 * grade(na) + Math.max(ga, na);
  }],
  [260, 'round', k => 100 * 3474 / 12742 * (1 / k.c(88) - 1 / k.c(87))],
  [121, 'round', k => (39600 * k.nearest('tan', 0.35) / 360 - 880) / 10],
];
const RECOMPUTE_2: Row[] = [
  [160, 'round', k => { const H = 135 + 800 * k.s(4); return 1000 * H / 2600 + H - 1200 * k.s(5); }],
  [633, 'round', k => 100 * (16.5 * k.t(29) - 14.5 * k.t(11))],
  [32, 'round', k => { const x = 12 - 0.6 * k.r3; return k.r3 * x + 2.4 + x; }],
  [62, 'round', k => 10 * (5.9 / k.t(18) - 12)],
  [151, 'round', k => safe([k.nearest('cos', 0.95 / 4.5), k.nearest('tan', 3.25), k.nearest('sin', 0.99), k.nearest('cos', 1.3 / 3)])],
  [451, 'sum-of-rounded', k => { const r = 3480 / k.c(86) / 12760; return Math.round(100 * r) + Math.round(r ** 3); },
    k => { const r = 3480 / k.c(86) / 12760; return [100 * r, r ** 3]; }],
];

const awayFromHalf = (x: number) => Math.abs(x - Math.floor(x) - 0.5) > 0.05;

test('trig v2: 1차 12문항(①·③) · 2차 6문항(②), 배경·예시는 기존 문항 그대로, 실생활 문제만 새로', () => {
  assert.deepEqual(QUESTIONS_1.map((q: { code: string }) => q.code), ['A', 'B', 'C', 'D', 'E', 'F'].flatMap(t => [`${t}-①`, `${t}-③`]));
  assert.deepEqual(QUESTIONS_2.map((q: { code: string }) => q.code), ['A', 'B', 'C', 'D', 'E', 'F'].map(t => `${t}-②`));
  for (const q of [...QUESTIONS_1, ...QUESTIONS_2]) {
    const base = BASE.find((b: { code: string }) => b.code === q.code);
    assert.equal(q.background, base.background, `${q.code} 배경 그대로`);
    assert.equal(q.example, base.example, `${q.code} 예시 그대로`);
    assert.match(q.example, /^예를 들어,/);
    assert.notEqual(q.problem, base.problem, `${q.code} 실생활 문제는 새로`);
    assert.ok(q.problem.length > base.problem.length, `${q.code} 지문이 기존보다 길다`);
    assert.ok(q.problem.length > 300, `${q.code} 지문 길이`);
  }
});

test('trig v2: paper 메타데이터(중3 worksheet, 자유 모드, 문항당 5점, 출처 라벨)', () => {
  const expected = [
    { title: '중3-2 삼각비 창의융합 형성평가 대비 (1차)', count: 12, label: (q: { code: string }) => `리뷰노트 변형 문항 · 유형 ${q.code}`, qs: QUESTIONS_1 },
    { title: '중3-2 삼각비 창의융합 형성평가 대비 (2차)', count: 6, label: (q: { type: string }) => `리뷰노트 변형 문항 · 2차 유형 ${q.type}`, qs: QUESTIONS_2 },
  ];
  for (const [p, data] of datas.entries()) {
    const e = expected[p];
    assert.equal(data.id, ids[p]); assert.equal(data.title, e.title);
    assert.equal(data.kind, 'worksheet'); assert.equal(data.grade, 9); assert.equal(data.schoolGrade, '중3');
    assert.equal(data.published, false); assert.equal(data.timeLimitMinutes, null); assert.deepEqual(data.electives, []);
    assert.equal(data.questionCount, e.count); assert.equal(data.questions.length, e.count);
    assert.equal(data.maxScore, e.count * 5);
    assert.deepEqual(data.referenceLinks, [{ label: '삼각비 표', url: `/exams/${ids[p]}/trig-table.png` }]);
    for (const [i, q] of data.questions.entries()) {
      assert.equal(q.number, i + 1); assert.equal(q.points, 5);
      assert.match(q.answer, /^(0|[1-9]\d{0,2})$/, `${q.number}`);
      assert.equal(q.answerType, 'digits');
      assert.equal(q.sourceLabel, e.label(e.qs[i]));
      assert.ok(MATH_CURRICULUM[q.curriculumGrade]?.includes(q.curriculumChapter));
      assert.equal(q.imageUrl, `/exams/${ids[p]}/q-${String(i + 1).padStart(2, '0')}.png`);
      assert.ok(fs.existsSync(path.join(root, 'public', q.imageUrl)), q.imageUrl);
      assert.equal('solution' in q, false, 'solutions stay out of src/public');
    }
  }
});

test('trig v2: 정답을 따로 옮겨 적은 식으로 다시 계산 — 표 값·정확한 값 같은 정수, 반올림 경계 여유', () => {
  for (const [p, rows] of [RECOMPUTE_1, RECOMPUTE_2].entries()) {
    assert.equal(rows.length, datas[p].questions.length);
    for (const [i, [answer, rule, f, parts]] of rows.entries()) {
      for (const table of [true, false]) {
        const k = kit(table);
        const raw = f(k);
        const got = rule === 'ceil' ? Math.ceil(raw - 1e-9) : Math.round(raw);
        assert.equal(got, answer, `${ids[p]} ${i + 1}번 ${table ? '표' : '정확'} ${raw}`);
        if (Math.abs(raw - Math.round(raw)) > 1e-9) {
          if (rule === 'ceil') assert.ok(Math.min(raw % 1, 1 - (raw % 1)) > 0.05, `${i + 1}번 올림 경계 ${raw}`);
          else assert.ok(awayFromHalf(raw), `${ids[p]} ${i + 1}번 반올림 경계 ${raw}`);
        }
        for (const part of parts?.(k) ?? []) assert.ok(awayFromHalf(part), `${ids[p]} ${i + 1}번 부분 반올림 경계 ${part}`);
      }
      assert.equal(datas[p].questions[i].answer, String(answer), `${ids[p]} ${i + 1}번 데이터 정답`);
    }
  }
  for (const q of [...QUESTIONS_1, ...QUESTIONS_2]) assert.deepEqual(verifyQuestion(q).problems, [], q.code);
});

test('trig v2: 생성된 JSON·시드·공개 SQL이 최신이고, 시드는 비공개 · 공개 SQL은 기존 학습지를 내린다', () => {
  const generated = V2_SHEETS.map((sheet: unknown) => buildData(sheet));
  assert.deepEqual(generated, datas);
  assert.equal(V2_SEED_FILE, `supabase/migrations/${MIGRATION_TIMESTAMP}_exam_trig_creative_v2_seed.sql`);
  assert.equal(MIGRATION_TIMESTAMP, '20261004210000');
  const seed = read(V2_SEED_FILE);
  assert.equal(seed, buildV2SeedSql(generated));
  assert.match(seed, /'2026-g3m-trig-creative-1','중3-2 삼각비 창의융합 형성평가 대비 \(1차\)',.*,false,'worksheet','리뷰노트',9,12,60\.0,'삼각비의 활용'\)/);
  assert.match(seed, /'2026-g3m-trig-creative-2','중3-2 삼각비 창의융합 형성평가 대비 \(2차\)',.*,false,'worksheet','리뷰노트',9,6,30\.0,'삼각비의 활용'\)/);
  assert.equal((seed.match(/insert into public\.exam_answer_keys/g) ?? []).length, 18);
  assert.doesNotMatch(seed, /'2026-g3m-trig-creative'[,)]/, '기존 학습지는 시드에서 건드리지 않는다');
  assert.doesNotMatch(seed, /published\s*=\s*true|,true,'worksheet'/);
  const publish = read(V2_PUBLISH_FILE);
  assert.equal(publish, buildV2PublishSql(generated));
  assert.match(publish, /set published=true where id in \('2026-g3m-trig-creative-1','2026-g3m-trig-creative-2'\) and kind='worksheet'/);
  assert.match(publish, /set published=false where id='2026-g3m-trig-creative' and kind='worksheet'/);
  assert.ok(!fs.readdirSync(path.join(root, 'supabase/migrations')).some(f => f.startsWith(MIGRATION_TIMESTAMP) && !f.endsWith('_exam_trig_creative_v2_seed.sql')));
});

test('trig v2: 두 학습지 모두 각자 경로의 삼각비 표 버튼', () => {
  for (const id of ids) {
    const [link] = worksheetReferences(id);
    assert.deepEqual(link, { label: '삼각비 표', href: `/exams/${id}/trig-table.png` });
    assert.ok(fs.existsSync(path.join(root, 'public', link.href)));
  }
});
