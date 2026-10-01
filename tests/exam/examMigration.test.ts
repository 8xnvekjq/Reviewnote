import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// 기출문제 마이그레이션을 메모리 Postgres(PGlite)에 실제로 적용하고 RLS·RPC 흐름을 끝까지 돌려 본다.
// PGlite는 프로젝트 의존성이 아니라서 없으면 건너뛴다. 돌리려면:
//   npm i --no-save @electric-sql/pglite && node --test tests/exam/examMigration.test.ts
// auth/private/mistakes는 운영 스키마를 흉내 낸 최소 스텁이다.

type Db = {
  exec(sql: string): Promise<unknown>;
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

let PGliteCtor: (new () => Db) | null = null;
try {
  const pkg = '@electric-sql/pglite';
  PGliteCtor = (await import(pkg)).PGlite;
} catch {
  PGliteCtor = null;
}

const root = path.resolve(import.meta.dirname, '../..');
const mig = fs.readFileSync(path.join(root, 'supabase/migrations/20261002120000_exam_practice.sql'), 'utf8');

test('exam migration applies and the RPC flow behaves (PGlite)', { skip: PGliteCtor ? false : '@electric-sql/pglite 미설치' }, async () => {
const db = new PGliteCtor!();
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
create schema private;
revoke all on schema private from public;
create table private.app_admins (user_id uuid primary key);
create function private.is_current_user_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (select 1 from private.app_admins a where a.user_id = (select auth.uid())) $$;
revoke all on function private.is_current_user_admin() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_current_user_admin() to authenticated;
create table public.mistakes (
  id uuid default gen_random_uuid() primary key, user_id uuid references auth.users on delete cascade not null,
  title text not null, image_url text not null, analysis jsonb, date timestamptz default now() not null,
  reviews jsonb default '["", "", ""]'::jsonb, grade text, chapter text, root_causes text[] default '{}'::text[],
  user_action_plan text, updated_at timestamptz default now(), teacher_scaffolding_hint text,
  is_hidden boolean not null default false, answer_image_url text, review_check_mastered_at timestamptz);
alter table public.mistakes enable row level security;
create policy own on public.mistakes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant all on public.mistakes to authenticated;
grant usage on schema public to authenticated, anon;
-- emulate Supabase default privileges (new tables/functions granted to anon/authenticated)
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema private grant all on functions to anon, authenticated, service_role;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a','s1'),('00000000-0000-0000-0000-00000000000b','s2'),('00000000-0000-0000-0000-0000000000ad','admin');
insert into private.app_admins values ('00000000-0000-0000-0000-0000000000ad');
`);
await db.exec(mig);
const S1 = '00000000-0000-0000-0000-00000000000a', S2 = '00000000-0000-0000-0000-00000000000b', AD = '00000000-0000-0000-0000-0000000000ad';
async function as(uid: string | null, sql: string, params: unknown[] = []): Promise<any[]> {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
}
async function fails(uid: string | null, sql: string, params: unknown[], re: RegExp) {
  try { await as(uid, sql, params); } catch (e) { assert.match((e as Error).message, re); return; }
  throw new Error('expected failure: ' + sql);
}
const counts = (await db.query(`select (select count(*) from exam_questions)::int q, (select count(*) from exam_answer_keys)::int k, (select count(*) from exam_question_national_stats)::int s`)).rows[0];
assert.deepEqual(counts, { q: 46, k: 46, s: 45 });
// RLS
assert.equal((await as(S1, 'select * from exam_papers')).length, 1);
assert.equal((await as(S1, 'select id, number, curriculum_chapter from exam_questions')).length, 46);
await fails(S1, 'select solution_text from exam_questions', [], /permission denied/);
assert.equal((await as(S1, 'select * from exam_answer_keys')).length, 0);
assert.equal((await as(S1, 'select * from exam_question_national_stats')).length, 0);
assert.equal((await as(AD, 'select * from exam_answer_keys')).length, 46);
await fails(null, 'select * from exam_papers', [], /permission denied/);
await fails(null, `select start_exam_attempt('2025-06-math','real','미적분')`, [], /permission denied/);
await fails(S1, `select private.exam_result_payload(gen_random_uuid())`, [], /permission denied/);
await fails(S1, `insert into exam_attempts (student_id, paper_id, mode, elective) values ('${S1}','2025-06-math','free','기하')`, [], /permission denied/);
await fails(S1, `update exam_papers set title = 'x'`, [], /permission denied/);
// start
await fails(S1, `select start_exam_attempt('2025-06-math','real','물리')`, [], /EXAM_INVALID_ELECTIVE/);
await fails(S1, `select start_exam_attempt('2025-06-math','test','기하')`, [], /EXAM_INVALID_MODE/);
await fails(S1, `select start_exam_attempt('nope','real','미적분')`, [], /EXAM_PAPER_NOT_FOUND/);
assert.equal((await as(S1, `select get_active_exam_attempt('2025-06-math') r`))[0].r, null);
const a1 = (await as(S1, `select start_exam_attempt('2025-06-math','real','미적분') r`))[0].r;
assert.equal(a1.questions.length, 30); assert.equal(a1.items.length, 30);
assert.deepEqual(a1.questions.map(q => q.number), Array.from({ length: 30 }, (_, i) => i + 1));
assert.equal(a1.questions[22].section, '미적분'); assert.equal(a1.questions[22].imageUrl, '/exams/2025-06-math/calc-23.png');
assert.equal(a1.timeLimitMinutes, 100); assert.ok(a1.serverNow); assert.deepEqual(a1.visitOrder, []);
const again = (await as(S1, `select start_exam_attempt('2025-06-math','free','기하') r`))[0].r;
assert.equal(again.id, a1.id); assert.equal(again.mode, 'real');
assert.equal((await as(S1, `select get_active_exam_attempt('2025-06-math') r`))[0].r.id, a1.id);
assert.equal((await as(S2, `select get_active_exam_attempt('2025-06-math') r`))[0].r, null);
assert.equal((await as(S2, `select * from exam_attempts`)).length, 0);
assert.equal((await as(S2, `select * from exam_attempt_items`)).length, 0);
assert.equal((await as(AD, `select * from exam_attempt_items`)).length, 30);
// save
const keys = Object.fromEntries((await db.query(`select q.id, q.number, k.answer, q.points from exam_questions q join exam_answer_keys k on k.question_id=q.id where q.section in ('common','미적분')`)).rows.map(r => [r.number, r]));
const items = a1.questions.map(q => ({ questionId: q.id, answer: q.number <= 20 ? keys[q.number].answer : (q.isChoice ? '1' : '0'), unsure: q.number === 5, timeSpentMs: 1000, visits: 1 }));
items[16].answer = '023'; // q17 answer 23 with leading zero
items.push({ questionId: 'garbage', answer: '1' });
assert.equal((await as(S1, `select save_exam_progress($1, $2::jsonb, $3::int[]) r`, [a1.id, JSON.stringify(items), [1, 2, 3, 40]]))[0].r, true);
const bad = [{ questionId: a1.questions[1].id, answer: '9', unsure: 'x', timeSpentMs: -5, visits: 'a' }, { questionId: a1.questions[16].id, answer: 1000, unsure: true, timeSpentMs: 1e12, visits: 3.7 }];
assert.equal((await as(S1, `select save_exam_progress($1, $2::jsonb, null) r`, [a1.id, JSON.stringify(bad)]))[0].r, true);
const rowsBad = (await db.query(`select q.number, answer, unsure, time_spent_ms, visits from exam_attempt_items i join exam_questions q on q.id=i.question_id where attempt_id=$1 and q.number in (2,17) order by 1`, [a1.id])).rows;
assert.equal(rowsBad[0].answer, null); assert.equal(rowsBad[0].unsure, false); assert.equal(Number(rowsBad[0].time_spent_ms), 0);
assert.equal(rowsBad[1].answer, null); assert.equal(Number(rowsBad[1].time_spent_ms), 86400000); assert.equal(rowsBad[1].visits, 3);
// restore good answers for q2/q17
assert.equal((await as(S1, `select save_exam_progress($1, $2::jsonb, null) r`, [a1.id, JSON.stringify([items[1], items[16]])]))[0].r, true);
assert.deepEqual((await db.query(`select visit_order from exam_attempts where id=$1`, [a1.id])).rows[0].visit_order, [1, 2, 3]);
await fails(S2, `select save_exam_progress($1, '[]'::jsonb, null)`, [a1.id], /EXAM_ATTEMPT_NOT_FOUND/);
await fails(S1, `select check_exam_answer($1, $2, '4')`, [a1.id, a1.questions[0].id], /EXAM_REAL_MODE_LOCKED/);
await fails(S1, `select get_exam_result($1)`, [a1.id], /EXAM_NOT_SUBMITTED/);
// time over: save refused, submit accepted but ignores late items
await db.query(`update exam_attempts set started_at = now() - interval '103 minutes' where id=$1`, [a1.id]);
assert.equal((await as(S1, `select save_exam_progress($1, '[]'::jsonb, null) r`, [a1.id]))[0].r, false);
const late = items.slice(0, 30).map(it => ({ ...it, answer: null }));
const res = (await as(S1, `select submit_exam_attempt($1, $2::jsonb, null) r`, [a1.id, JSON.stringify(late)]))[0].r;
const expectScore = Array.from({ length: 20 }, (_, i) => i + 1).reduce((s, n) => s + keys[n].points, 0);
assert.ok(res.score >= expectScore); assert.equal(res.totalCount, 30); assert.equal(res.items.length, 30);
assert.equal(res.items[16].isCorrect, true, 'leading zero normalized');
assert.equal(res.items[4].unsure, true);
assert.deepEqual(res.gradeCut.rawByGrade, [80, 70, 59, 49, 32, 19, 12, 8]);
assert.equal(res.gradeCut.standardByGrade.length, 8);
const i30 = res.items.find(i => i.number === 30); assert.equal(i30.nationalWrongRate, 94.8); assert.equal(i30.correctAnswer, '25'); assert.equal(i30.nationalChoiceRates, null);
const i27 = res.items.find(i => i.number === 27); assert.deepEqual(i27.nationalChoiceRates, [11.3, 34.9, 7.2, 28.6, 18.0]);
assert.equal(res.items.find(i => i.number === 1).nationalWrongRate, null);
const res2 = (await as(S1, `select submit_exam_attempt($1, '[]'::jsonb, null) r`, [a1.id]))[0].r;
assert.equal(res2.score, res.score); assert.equal(res2.submittedAt, res.submittedAt);
assert.equal((await as(AD, `select get_exam_result($1) r`, [a1.id]))[0].r.score, res.score);
await fails(S2, `select get_exam_result($1)`, [a1.id], /EXAM_ATTEMPT_NOT_FOUND/);
assert.equal((await as(S1, `select save_exam_progress($1, '[]'::jsonb, null) r`, [a1.id]))[0].r, false);
const list = (await as(S1, `select list_my_exam_results(null) r`))[0].r; assert.equal(list.length, 1); assert.equal(list[0].paperTitle, '2025학년도 6월 모의평가 수학');
assert.deepEqual((await as(S2, `select list_my_exam_results('2025-06-math') r`))[0].r, []);
// add to mistakes
const wrong = res.items.filter(i => !i.isCorrect || i.unsure).map(i => i.questionId);
await fails(S1, `select add_exam_questions_to_mistakes($1, $2::uuid[], 'javascript:alert(1)')`, [a1.id, wrong], /EXAM_INVALID_ORIGIN/);
await fails(S1, `select add_exam_questions_to_mistakes($1, $2::uuid[], 'https://evil.app/x?y')`, [a1.id, wrong], /EXAM_INVALID_ORIGIN/);
await fails(S2, `select add_exam_questions_to_mistakes($1, $2::uuid[], 'https://x.app')`, [a1.id, wrong], /EXAM_ATTEMPT_NOT_FOUND/);
const added = (await as(S1, `select add_exam_questions_to_mistakes($1, $2::uuid[], 'https://reviewnote.app/') r`, [a1.id, [...wrong, S2]]))[0].r;
assert.equal(added.length, wrong.length); assert.ok(added.every(a => a.created));
const m = await as(S1, `select * from mistakes order by date, title`);
assert.ok(m.every(x => x.image_url.startsWith('https://reviewnote.app/exams/2025-06-math/')));
assert.ok(m.some(x => x.title === '2025학년도 6월 모의평가 수학(미적분) 30번'));
assert.ok(m.some(x => x.title === '2025학년도 6월 모의평가 수학 5번' && x.analysis.finalAnswer === '⑤'));
const again2 = (await as(S1, `select add_exam_questions_to_mistakes($1, $2::uuid[], 'https://reviewnote.app') r`, [a1.id, wrong]))[0].r;
assert.ok(again2.every(a => !a.created)); assert.equal((await as(S1, `select count(*)::int c from mistakes`))[0].c, wrong.length);
const rr = (await as(S1, `select get_exam_result($1) r`, [a1.id]))[0].r; assert.equal(rr.items.filter(i => i.addedMistakeId).length, wrong.length);
// deleting the mistake clears the link, then re-adding works
await as(S1, `delete from mistakes where id = $1`, [added[0].mistakeId]);
assert.equal((await db.query(`select added_mistake_id from exam_attempt_items where question_id=$1 and attempt_id=$2`, [added[0].questionId, a1.id])).rows[0].added_mistake_id, null);
const re = (await as(S1, `select add_exam_questions_to_mistakes($1, array[$2]::uuid[], 'http://127.0.0.1:5174') r`, [a1.id, added[0].questionId]))[0].r;
assert.equal(re[0].created, true);
// free mode
const f = (await as(S1, `select start_exam_attempt('2025-06-math','free','확률과 통계') r`))[0].r;
assert.notEqual(f.id, a1.id); assert.equal(f.timeLimitMinutes, null); assert.equal(f.questions[29].section, '확률과 통계');
const c2 = (await as(S1, `select check_exam_answer($1, $2, '0108') r`, [f.id, f.questions[29].id]))[0].r; assert.deepEqual(c2, { isCorrect: true, correctAnswer: '108' });
const c3 = (await as(S1, `select check_exam_answer($1, $2, '②') r`, [f.id, f.questions[0].id]))[0].r; assert.deepEqual(c3, { isCorrect: false, correctAnswer: '4' });
await fails(S1, `select check_exam_answer($1, $2, '1')`, [f.id, a1.questions[29].id], /EXAM_QUESTION_NOT_FOUND/);
await fails(S2, `select check_exam_answer($1, $2, '1')`, [f.id, f.questions[0].id], /EXAM_ATTEMPT_NOT_FOUND/);
await db.query(`update exam_attempts set started_at = now() - interval '10 days' where id=$1`, [f.id]);
assert.equal((await as(S1, `select save_exam_progress($1, '[]'::jsonb, null) r`, [f.id]))[0].r, true);
const fr = (await as(S1, `select submit_exam_attempt($1, $2::jsonb, array[30,1]) r`, [f.id, JSON.stringify([{ questionId: f.questions[29].id, answer: '108', unsure: false, timeSpentMs: 5, visits: 2 }])]))[0].r;
assert.equal(fr.score, 4); assert.equal(fr.correctCount, 1); assert.equal(fr.estimatedGrade, 9); assert.equal(fr.totalTimeMs, 5);
await fails(S1, `select check_exam_answer($1, $2, '1')`, [f.id, f.questions[0].id], /EXAM_NOT_IN_PROGRESS/);
// grade function
for (const [s, g] of [[100, 1], [87, 1], [86, 2], [77, 2], [76, 3], [10, 8], [9, 9], [0, 9]]) {
  assert.equal((await db.query(`select private.exam_estimate_grade('[87,77,64,54,35,22,15,10]'::jsonb, $1) g`, [s])).rows[0].g, g);
}
// chapters present
const ch = (await db.query(`select section, number, curriculum_grade, curriculum_chapter from exam_questions order by section, number`)).rows;
assert.ok(ch.every(r => r.curriculum_grade && r.curriculum_chapter));
});
