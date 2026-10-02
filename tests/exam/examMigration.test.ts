import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { mapExamPaperHistory } from '../../src/features/exam/examMappers.ts';
import { buildHistoryRows } from '../../src/features/exam/ui/examLogic.ts';

// 기출문제 마이그레이션을 메모리 Postgres(PGlite)에 실제로 적용하고 RLS·RPC 흐름을 끝까지 돌려 본다.
// PGlite는 프로젝트 의존성이 아니라서 없으면 건너뛴다. 돌리려면:
//   npm i --no-save @electric-sql/pglite && node --test tests/exam/examMigration.test.ts
// auth/private/mistakes는 운영 스키마를 흉내 낸 최소 스텁이다.

type Db = {
  exec(sql: string): Promise<unknown>;
  query<T = any>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

let PGliteCtor: (new (options?: unknown) => Db) | null = null;
let pgcrypto: unknown = null;
try {
  const pkg = '@electric-sql/pglite';
  PGliteCtor = (await import(pkg)).PGlite;
  pgcrypto = (await import(`${pkg}/contrib/pgcrypto`)).pgcrypto; // Supabase처럼 extensions 스키마에 둔다(필기 id 해시).
} catch {
  PGliteCtor = null;
}

const root = path.resolve(import.meta.dirname, '../..');
const mig = fs.readFileSync(path.join(root, 'supabase/migrations/20261002120000_exam_practice.sql'), 'utf8');
const migV2 = fs.readFileSync(path.join(root, 'supabase/migrations/20261002180000_exam_practice_v2.sql'), 'utf8');
const migBatch2 = fs.readFileSync(path.join(root, 'supabase/migrations/20261002190000_exam_papers_batch2.sql'), 'utf8');
const migRounds = fs.readFileSync(path.join(root, 'supabase/migrations/20261002200000_exam_rounds.sql'), 'utf8');
const migSchool = fs.readFileSync(path.join(root, 'supabase/migrations/20261002210000_exam_school_papers.sql'), 'utf8');
const migHanneung = fs.readFileSync(path.join(root, 'supabase/migrations/20261003000000_exam_hanneung.sql'), 'utf8');

test('exam migration applies and the RPC flow behaves (PGlite)', { skip: PGliteCtor ? false : '@electric-sql/pglite 미설치' }, async () => {
const db = new PGliteCtor!({ extensions: { pgcrypto } });
await db.exec(`
create schema extensions; create extension pgcrypto schema extensions;
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
await db.exec(migV2); // v2(채점해 보기 잠금·진행 정도·최고점)를 이어서 적용 — 아래 v1 흐름도 v2 함수로 돈다.
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

// ── v2: 채점해 보기 잠금 · 시험지별 진행 정도 · 최고점 기준값 ──
await fails(null, `select list_exam_papers_for_me()`, [], /permission denied/);
const l0 = (await as(S2, `select list_exam_papers_for_me() r`))[0].r;
assert.deepEqual(l0, [{ id: '2025-06-math', title: '2025학년도 6월 모의평가 수학', examDate: '2024-06-04', source: '한국교육과정평가원', timeLimitMinutes: 100, electives: ['확률과 통계', '미적분', '기하'], inProgress: null, lastResult: null, resultCount: 0 }]);
// 두 번째(더 최근) 시험지 + 비공개 시험지
await db.exec(`
insert into exam_papers (id, title, exam_date, source, subject, school_grade, time_limit_minutes, electives, grade_cuts, published)
select '2099-06-math', '테스트 시험지', '2025-06-04', source, subject, school_grade, time_limit_minutes, electives,
       grade_cuts - 'topByElective', true from exam_papers where id = '2025-06-math';
insert into exam_questions (paper_id, number, section, image_url, is_choice, points, curriculum_grade, curriculum_chapter)
select '2099-06-math', number, section, image_url, is_choice, points, curriculum_grade, curriculum_chapter from exam_questions where paper_id = '2025-06-math';
insert into exam_answer_keys (question_id, answer)
select q2.id, k.answer from exam_questions q1 join exam_answer_keys k on k.question_id = q1.id
  join exam_questions q2 on q2.paper_id = '2099-06-math' and q2.section = q1.section and q2.number = q1.number
 where q1.paper_id = '2025-06-math';
insert into exam_papers (id, title, exam_date, source, subject, school_grade, time_limit_minutes, electives, published)
values ('hidden', '비공개', '2030-01-01', 's', '수학', '고3', 100, array['미적분'], false);
`);
// 두 시험지 동시 진행(시험지마다 진행 중 시도 하나씩)
const vA = (await as(S2, `select start_exam_attempt('2025-06-math','free','기하') r`))[0].r;
const vB = (await as(S2, `select start_exam_attempt('2099-06-math','real','미적분') r`))[0].r;
assert.notEqual(vA.id, vB.id); assert.equal(vB.paperId, '2099-06-math');
assert.equal((await as(S2, `select get_active_exam_attempt('2025-06-math') r`))[0].r.id, vA.id);
assert.equal((await as(S2, `select get_active_exam_attempt('2099-06-math') r`))[0].r.id, vB.id);
assert.equal((await as(S2, `select count(*)::int c from exam_attempts where status = 'in_progress'`))[0].c, 2);
assert.ok(vA.items.every(i => i.checked === null), 'fresh items carry no answer');
const gk = Object.fromEntries((await db.query(`select q.number, k.answer from exam_questions q join exam_answer_keys k on k.question_id=q.id where q.paper_id='2025-06-math' and q.section in ('common','기하')`)).rows.map(r => [r.number, r.answer]));
const qA = (n: number) => vA.questions[n - 1].id;
// 채점해 보기: 빈 답·형식 오류 거부(잠그지 않음), 정상 답은 저장 + 잠금
await fails(S2, `select check_exam_answer($1, $2, '')`, [vA.id, qA(1)], /EXAM_INVALID_ANSWER/);
await fails(S2, `select check_exam_answer($1, $2, null)`, [vA.id, qA(1)], /EXAM_INVALID_ANSWER/);
await fails(S2, `select check_exam_answer($1, $2, '9')`, [vA.id, qA(1)], /EXAM_INVALID_ANSWER/);
assert.equal((await db.query(`select checked_at from exam_attempt_items where attempt_id=$1 and question_id=$2`, [vA.id, qA(1)])).rows[0].checked_at, null);
await fails(S2, `select check_exam_answer($1, $2, '1')`, [vB.id, vB.questions[0].id], /EXAM_REAL_MODE_LOCKED/);
const wrong1 = gk[1] === '1' ? '2' : '1';
const k1 = (await as(S2, `select check_exam_answer($1, $2, $3) r`, [vA.id, qA(1), `0${gk[1]}`]))[0].r;
assert.deepEqual(k1, { isCorrect: true, correctAnswer: gk[1] });
const k1again = (await as(S2, `select check_exam_answer($1, $2, $3) r`, [vA.id, qA(1), wrong1]))[0].r;
assert.deepEqual(k1again, k1, 'locked item ignores the new answer');
const wrong30 = gk[30] === '7' ? '8' : '7';
const k30 = (await as(S2, `select check_exam_answer($1, $2, $3) r`, [vA.id, qA(30), wrong30]))[0].r;
assert.deepEqual(k30, { isCorrect: false, correctAnswer: gk[30] });
assert.deepEqual((await as(S2, `select check_exam_answer($1, $2, '') r`, [vA.id, qA(30)]))[0].r, k30, 'locked item answers even with an empty retry');
// 시도 payload: 잠긴 문항만 checked, 나머지는 null(정답 노출 없음)
const pA = (await as(S2, `select get_active_exam_attempt('2025-06-math') r`))[0].r;
const item = (n: number) => pA.items.find(i => i.questionId === qA(n));
assert.deepEqual(item(1).checked, { isCorrect: true, correctAnswer: gk[1] }); assert.equal(item(1).answer, gk[1]);
assert.deepEqual(item(30).checked, { isCorrect: false, correctAnswer: gk[30] }); assert.equal(item(30).answer, wrong30);
assert.equal(pA.items.filter(i => i.checked !== null).length, 2);
assert.ok(pA.items.filter(i => i.questionId !== qA(1) && i.questionId !== qA(30)).every(i => i.checked === null && !('correctAnswer' in i)));
// 잠긴 문항은 save로 답이 안 바뀌고, 🤔·시간·방문수는 바뀐다
const saveItems = [
  { questionId: qA(1), answer: wrong1, unsure: true, timeSpentMs: 3000, visits: 2 },
  { questionId: qA(30), answer: gk[30], unsure: true, timeSpentMs: 7000, visits: 4 },
  { questionId: qA(2), answer: '3', unsure: false, timeSpentMs: 1000, visits: 1 },
  { questionId: qA(3), answer: '05', unsure: false, timeSpentMs: 500, visits: 1 },
];
assert.equal((await as(S2, `select save_exam_progress($1, $2::jsonb, null) r`, [vA.id, JSON.stringify(saveItems)]))[0].r, true);
const lockedRows = (await db.query(`select question_id, answer, unsure, time_spent_ms, visits from exam_attempt_items where attempt_id=$1 and question_id = any($2::uuid[])`, [vA.id, [qA(1), qA(30)]])).rows;
const byQ = Object.fromEntries(lockedRows.map(r => [r.question_id, r]));
assert.equal(byQ[qA(1)].answer, gk[1]); assert.equal(byQ[qA(1)].unsure, true); assert.equal(Number(byQ[qA(1)].time_spent_ms), 3000); assert.equal(byQ[qA(1)].visits, 2);
assert.equal(byQ[qA(30)].answer, wrong30); assert.equal(Number(byQ[qA(30)].time_spent_ms), 7000);
// 진행 정도 목록: 시행일 최신순, 비공개 제외, 시험지별 진행 중 시도
await as(S2, `select save_exam_progress($1, $2::jsonb, null)`, [vB.id, JSON.stringify([{ questionId: vB.questions[4].id, answer: '2', unsure: false, timeSpentMs: 42, visits: 1 }])]);
const l1 = (await as(S2, `select list_exam_papers_for_me() r`))[0].r;
assert.deepEqual(l1.map(p => p.id), ['2099-06-math', '2025-06-math']);
assert.deepEqual(l1[1].inProgress, { attemptId: vA.id, mode: 'free', elective: '기하', startedAt: l1[1].inProgress.startedAt, timeLimitMinutes: null, answeredCount: 4, elapsedMs: 11500 });
assert.equal(Date.parse(l1[1].inProgress.startedAt), Date.parse(vA.startedAt));
assert.deepEqual({ ...l1[0].inProgress, startedAt: null }, { attemptId: vB.id, mode: 'real', elective: '미적분', startedAt: null, timeLimitMinutes: 100, answeredCount: 1, elapsedMs: 42 });
assert.equal(l1[1].lastResult, null); assert.equal(l1[1].resultCount, 0);
// 제출: 잠긴 문항은 제출 payload로도 답이 안 바뀐다 + 최고점 기준값
const subA = (await as(S2, `select submit_exam_attempt($1, $2::jsonb, null) r`, [vA.id, JSON.stringify(saveItems)]))[0].r;
const r30 = subA.items.find(i => i.number === 30); assert.equal(r30.answer, wrong30); assert.equal(r30.isCorrect, false);
assert.equal(subA.items.find(i => i.number === 1).isCorrect, true);
assert.equal(subA.gradeCut.topStandard, 151); assert.equal(subA.gradeCut.topPercentile, 100);
assert.deepEqual(subA.gradeCut.rawByGrade, [82, 72, 60, 50, 33, 21, 14, 10]);
await fails(S2, `select check_exam_answer($1, $2, '1')`, [vA.id, qA(5)], /EXAM_NOT_IN_PROGRESS/);
// 선택과목별 표준점수·백분위 컷(수능 등) + 하위 등급 미발표(7개) 컷
await db.query(`update exam_papers set grade_cuts = grade_cuts
  || jsonb_build_object('standardByElective', '{"미적분":[137,128,117,107,93,82,76]}'::jsonb,
                        'percentileByElective', '{"미적분":[97,90,77,60,40,23,11]}'::jsonb)
  || jsonb_build_object('rawByElective', (grade_cuts->'rawByElective') || '{"미적분":[80,70,59,49,32,19,12]}'::jsonb)
  where id = '2099-06-math'`);
const subB = (await as(S2, `select submit_exam_attempt($1, '[]'::jsonb, null) r`, [vB.id]))[0].r;
assert.equal(subB.gradeCut.topStandard, null); assert.equal(subB.gradeCut.topPercentile, null);
assert.deepEqual(subB.gradeCut.standardByGrade, [137, 128, 117, 107, 93, 82, 76]);
assert.deepEqual(subB.gradeCut.percentileByGrade, [97, 90, 77, 60, 40, 23, 11]);
assert.equal(subB.gradeCut.rawByGrade.length, 7);
assert.equal(subB.score, 0); assert.equal(subB.estimatedGrade, 8, '7 cuts: below the last cut is grade 8');
assert.deepEqual(subA.gradeCut.standardByGrade, [135, 126, 116, 107, 92, 81, 75, 71], 'falls back to shared standard');
assert.deepEqual(subA.gradeCut.percentileByGrade, [96, 89, 76, 61, 40, 22, 12, 4]);
for (const [sc, g] of [[100, 1], [80, 1], [79, 2], [12, 7], [11, 8], [0, 8]]) {
  assert.equal((await db.query(`select private.exam_estimate_grade('[80,70,59,49,32,19,12]'::jsonb, $1) g`, [sc])).rows[0].g, g);
}
assert.equal((await as(S1, `select get_exam_result($1) r`, [f.id]))[0].r.gradeCut.topStandard, 145, '확률과 통계 최고점');
assert.equal((await as(S1, `select get_exam_result($1) r`, [a1.id]))[0].r.gradeCut.topPercentile, 100, '미적분 최고점');
const l2 = (await as(S2, `select list_exam_papers_for_me() r`))[0].r;
assert.equal(l2[1].inProgress, null); assert.equal(l2[1].resultCount, 1);
assert.deepEqual(l2[1].lastResult, { attemptId: vA.id, score: subA.score, estimatedGrade: subA.estimatedGrade, submittedAt: subA.submittedAt });
assert.equal(l2[0].inProgress, null); assert.equal(l2[0].resultCount, 1); assert.equal(l2[0].lastResult.attemptId, vB.id);
// 여러 번 제출했으면 가장 최근 것이 lastResult
const l3 = (await as(S1, `select list_exam_papers_for_me() r`))[0].r;
const s1Paper = l3.find(p => p.id === '2025-06-math');
assert.equal(s1Paper.resultCount, 2); assert.equal(s1Paper.lastResult.attemptId, f.id); assert.equal(s1Paper.inProgress, null);
assert.deepEqual(l3.find(p => p.id === '2099-06-math'), { ...l2[0], inProgress: null, lastResult: null, resultCount: 0 });

// 시험지 5개 추가 시드: v2 위에 적용되고, 다시 적용해도 중복이 생기지 않는다.
await db.exec(migBatch2);
await db.exec(migBatch2);
const BATCH2 = ['2025-09-math', '2025-11-math', '2026-06-math', '2026-09-math', '2026-11-math'];
for (const pid of BATCH2) {
  const c = (await db.query(`select (select count(*) from exam_questions where paper_id = $1)::int q,
      (select count(*) from exam_answer_keys k join exam_questions q on q.id = k.question_id where q.paper_id = $1)::int k,
      (select count(*) from exam_question_national_stats s join exam_questions q on q.id = s.question_id where q.paper_id = $1)::int st,
      (select count(*) from exam_questions where paper_id = $1 and curriculum_chapter is null)::int nochap`, [pid])).rows[0];
  assert.deepEqual(c, { q: 46, k: 46, st: 45, nochap: 0 }, pid);
  for (const e of ['확률과 통계', '미적분', '기하']) {
    const pts = (await db.query(`select sum(points)::int s from exam_questions where paper_id = $1 and (section = 'common' or section = $2)`, [pid, e])).rows[0].s;
    assert.equal(pts, 100, `${pid} ${e} 배점 합 100`);
  }
}
// 새 시험지로 실제 풀이 흐름: 2025 수능 미적분 만점 → 1등급, 결과 최고점·과목별 표준점수 컷.
const allKeys = (await db.query(`select q.id, k.answer from exam_questions q join exam_answer_keys k on k.question_id = q.id where q.paper_id = '2025-11-math' and q.section in ('common', '미적분')`)).rows;
const sN = (await as(S2, `select start_exam_attempt('2025-11-math', 'free', '미적분') r`))[0].r;
const fullN = (await as(S2, `select submit_exam_attempt($1, $2::jsonb, '{}') r`, [sN.id, JSON.stringify(allKeys.map(r => ({ questionId: r.id, answer: r.answer, unsure: false, timeSpentMs: 1000, visits: 1 })))]))[0].r;
assert.equal(fullN.score, 100); assert.equal(fullN.estimatedGrade, 1);
assert.equal(fullN.gradeCut.topStandard, 140, '2025 수능 미적분 최고점 표준점수');
assert.equal(fullN.gradeCut.standardByGrade[1], 123, '2025 수능 미적분 2등급 표준점수 컷(과목별 값)');
const papersNow = (await as(S2, `select list_exam_papers_for_me() r`))[0].r.map(p => p.id);
for (const pid of BATCH2) assert.ok(papersNow.includes(pid), pid);

// 회차 기록: 운영 v2·batch2 다음 적용. 다시 적용해도 기존 함수·권한을 유지한다.
await db.exec(migRounds);
await db.exec(migRounds);
await db.query(`update exam_attempts set started_at = case id when $1::uuid then '2026-01-01'::timestamptz else '2026-01-02'::timestamptz end
  where id in ($1, $2)`, [a1.id, f.id]);
const oldHistory = (await as(S1, `select list_my_paper_history('2025-06-math') r`))[0].r;
assert.deepEqual(oldHistory.map(a => a.round), [1, 2]);
assert.deepEqual(oldHistory.map(a => a.attemptId), [a1.id, f.id]);
assert.equal((await as(S1, `select get_exam_result($1) r`, [f.id]))[0].r.round, 2);
const upgraded = (await as(S2, `select get_exam_result($1) r`, [vA.id]))[0].r;
const { round: upgradedRound, ...unchanged } = upgraded;
assert.equal(upgradedRound, 1); assert.deepEqual(unchanged, subA, '결과 payload 기존 필드를 그대로 유지');
await fails(null, `select list_my_paper_history('2025-06-math')`, [], /permission denied/);
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '', false)`);
try { await assert.rejects(db.query(`select list_my_paper_history('2025-06-math')`), /EXAM_AUTH_REQUIRED/); }
finally { await db.exec('reset role'); }
await fails(S1, `select list_my_paper_history('2025-06-math', $1)`, [S2], /EXAM_ATTEMPT_NOT_FOUND/);
await fails(S1, `select list_my_paper_history('missing')`, [], /EXAM_PAPER_NOT_FOUND/);
const otherHistory = (await as(S2, `select list_my_paper_history('2025-06-math') r`))[0].r;
assert.deepEqual(otherHistory.map(a => a.attemptId), [vA.id], '학생은 자기 기록만');
assert.deepEqual((await as(AD, `select list_my_paper_history('2025-06-math', $1) r`, [S1]))[0].r, oldHistory, '관리자는 지정 학생 기록 조회');
assert.deepEqual((await as(AD, `select list_my_paper_history('2025-06-math') r`))[0].r, [], '기본 조회는 관리자도 자기 기록');
const round3 = (await as(S1, `select start_exam_attempt('2025-06-math','free','미적분') r`))[0].r;
await db.query(`update exam_attempts set started_at = '2026-01-03' where id = $1`, [round3.id]);
await as(S1, `select check_exam_answer($1, $2, $3)`, [round3.id, keys[1].id, keys[1].answer]);
const ongoing = (await as(S1, `select list_my_paper_history('2025-06-math') r`))[0].r.at(-1);
assert.equal(ongoing.round, 3); assert.equal(ongoing.status, 'in_progress');
assert.equal(ongoing.score, null); assert.equal(ongoing.estimatedGrade, null);
assert.equal(ongoing.items.length, 30); assert.equal(ongoing.items[0].answered, true);
assert.ok(ongoing.items.every(i => i.isCorrect === null), '채점해 본 문항도 진행 중 기록에서 정오 비노출');
assert.equal(JSON.stringify(ongoing).includes('correctAnswer'), false);
assert.equal(JSON.stringify(ongoing).includes('checked'), false);
const roundsCard = (await as(S1, `select list_exam_papers_for_me() r`))[0].r.find(p => p.id === '2025-06-math');
assert.equal(roundsCard.inProgress.round, 3); assert.equal(roundsCard.lastResult.round, 2);

const wrong2 = keys[2].answer === '1' ? '2' : '1';
const wrong23 = keys[23].answer === '1' ? '2' : '1';
function roundItems(attempt, correct23, time) {
  return attempt.questions.filter(q => [1, 2, 23].includes(q.number)).map(q => ({
    questionId: q.id, answer: q.number === 1 ? keys[1].answer : q.number === 2 ? wrong2 : correct23 ? keys[23].answer : wrong23,
    unsure: q.number === 2, timeSpentMs: time, visits: 1,
  }));
}
await as(S1, `select submit_exam_attempt($1, $2::jsonb, null)`, [round3.id, JSON.stringify(roundItems(round3, false, 540000))]);
const round4 = (await as(S1, `select start_exam_attempt('2025-06-math','real','기하') r`))[0].r;
await db.query(`update exam_attempts set started_at = '2026-01-04' where id = $1`, [round4.id]);
await as(S1, `select submit_exam_attempt($1, '[]'::jsonb, null)`, [round4.id]);
const round5 = (await as(S1, `select start_exam_attempt('2025-06-math','free','미적분') r`))[0].r;
await db.query(`update exam_attempts set started_at = '2026-01-05' where id = $1`, [round5.id]);
await as(S1, `select submit_exam_attempt($1, $2::jsonb, null)`, [round5.id, JSON.stringify(roundItems(round5, true, 240000))]);
const fiveRounds = (await as(S1, `select list_my_paper_history('2025-06-math') r`))[0].r;
assert.deepEqual(fiveRounds.map(a => a.round), [1, 2, 3, 4, 5]);
assert.deepEqual(fiveRounds.slice(2).map(a => a.elective), ['미적분', '기하', '미적분']);
assert.equal(fiveRounds[3].items[22].section, '기하');
assert.equal(fiveRounds[2].items[22].isCorrect, false); assert.equal(fiveRounds[4].items[22].isCorrect, true);
assert.equal(fiveRounds[2].items[22].timeSpentMs, 540000); assert.equal(fiveRounds[4].items[22].timeSpentMs, 240000);
assert.ok(fiveRounds.every(a => a.items.find(i => i.number === 22).isCorrect === false), '계속 틀린 문항 판정 재료');
const comparisonRows = buildHistoryRows(mapExamPaperHistory(fiveRounds), '미적분');
assert.equal(comparisonRows[21].persistentWrong, true);
assert.equal(comparisonRows[0].cells[4].newlyCorrect, true);
assert.equal(comparisonRows[22].cells[3].item, null, '다른 선택과목 회차는 비교에서 제외');
assert.equal(comparisonRows[22].cells[4].newlyCorrect, true);
assert.equal(comparisonRows[22].timeChange, '9분 → 4분');
assert.equal(fiveRounds[4].totalTimeMs, 720000); assert.equal(fiveRounds[4].items[1].unsure, true);
assert.equal(fiveRounds[3].items[0].answered, false);
assert.equal((await as(S1, `select get_exam_result($1) r`, [round5.id]))[0].r.round, 5);
assert.equal((await as(S1, `select list_exam_papers_for_me() r`))[0].r.find(p => p.id === '2025-06-math').lastResult.round, 5);
// 동시각에도 모든 payload가 동일한 결정적 순서를 쓴다.
await db.query(`update exam_attempts set started_at = '2026-01-05' where id = $1`, [round4.id]);
const tied = (await as(S1, `select list_my_paper_history('2025-06-math') r`))[0].r;
for (const a of tied) assert.equal((await as(S1, `select get_exam_result($1) r`, [a.attemptId]))[0].r.round, a.round);
const tiedLast = (await as(S1, `select list_exam_papers_for_me() r`))[0].r.find(p => p.id === '2025-06-math').lastResult;
assert.equal(tiedLast.round, tied.find(a => a.attemptId === tiedLast.attemptId).round);
const emptyNewPaper = (await as(S1, `select list_my_paper_history('2026-11-math') r`))[0].r;
assert.deepEqual(emptyNewPaper, [], '새 시험지는 빈 기록');
const newPaperRound = (await as(S2, `select list_my_paper_history('2025-11-math') r`))[0].r;
assert.equal(newPaperRound[0].round, 1, '시험지별로 회차를 다시 센다');
const permission = (await db.query(`select
  has_function_privilege('anon', 'public.list_my_paper_history(text,uuid)', 'execute') anon,
  has_function_privilege('authenticated', 'public.list_my_paper_history(text,uuid)', 'execute') student,
  has_function_privilege('authenticated', 'private.exam_attempt_round(uuid)', 'execute') helper,
  p.prosecdef, p.proconfig from pg_proc p where p.oid = 'public.list_my_paper_history(text,uuid)'::regprocedure`)).rows[0];
assert.equal(permission.anon, false); assert.equal(permission.student, true); assert.equal(permission.helper, false);
assert.equal(permission.prosecdef, true); assert.deepEqual(permission.proconfig, ['search_path=""']);

// 내신: 운영 4개 다음에 적용, 재적용 안전성·실제 RLS/RPC·소수 배점까지 확인.
await db.exec(migSchool);
await db.exec(migSchool);
const schoolId = '2026-dongbuk-g1-s2-mid-common2';
const schoolData = JSON.parse(fs.readFileSync(path.join(root, `src/features/exam/data/${schoolId}.json`), 'utf8'));
assert.equal((await as(S1, `select id from exam_papers where id=$1`, [schoolId])).length, 0);
assert.equal((await as(S1, `select id from exam_questions where paper_id=$1`, [schoolId])).length, 0);
assert.ok(!(await as(S1, `select list_exam_papers_for_me() r`))[0].r.some(p => p.id === schoolId));
await fails(S1, `select start_exam_attempt($1,'free',null)`, [schoolId], /EXAM_PAPER_NOT_FOUND/);
await fails(S1, `select list_my_paper_history($1)`, [schoolId], /EXAM_PAPER_NOT_FOUND/);
const schoolCard = (await as(AD, `select list_exam_papers_for_me() r`))[0].r.find(p => p.id === schoolId);
assert.equal(schoolCard.kind, 'school'); assert.equal(schoolCard.published, false);
assert.equal(schoolCard.year, 2026); assert.equal(schoolCard.questionCount, 21);
assert.equal(schoolCard.maxScore, 100); assert.equal(schoolCard.timeLimitMinutes, 50);
assert.equal(schoolCard.examDate, null); assert.deepEqual(schoolCard.electives, []);
assert.equal((await as(AD, `select id from exam_questions where paper_id=$1`, [schoolId])).length, 21);
await fails(S1, `select solution_text from exam_questions where paper_id=$1`, [schoolId], /permission denied/);
const schoolRows = (await db.query(`select q.*, k.answer from exam_questions q join exam_answer_keys k on k.question_id=q.id where paper_id=$1 order by number`, [schoolId])).rows;
assert.equal(schoolRows.length, 21);
for (const [index, row] of schoolRows.entries()) {
  const source = schoolData.questions[index];
  assert.equal(Number(row.points), source.points); assert.equal(row.answer, source.answer);
  assert.equal(row.answer_type, source.answerType); assert.deepEqual(row.choices, source.choices ?? null);
  assert.equal(row.curriculum_chapter, source.curriculumChapter);
}
assert.equal(schoolRows.reduce((sum, q) => sum + Number(q.points), 0), 100);
const schoolFree = (await as(AD, `select start_exam_attempt($1,'free',null) r`, [schoolId]))[0].r;
assert.equal(schoolFree.elective, null); assert.equal(schoolFree.questions.length, 21);
const ten = schoolFree.questions.find(q => q.number === 18);
assert.equal(ten.answerType, 'choice10'); assert.equal(ten.choices.length, 10);
assert.ok(!JSON.stringify(schoolFree.questions).includes('answer"'));
assert.ok(schoolFree.items.every(i => i.checked === null));
assert.equal((await as(S1, `select answer_type, choices from exam_questions where paper_id=$1`, [schoolId])).length, 0);
await fails(AD, `select check_exam_answer($1,$2,'11')`, [schoolFree.id, ten.id], /EXAM_INVALID_ANSWER/);
await fails(AD, `select check_exam_answer($1,$2,'0')`, [schoolFree.id, ten.id], /EXAM_INVALID_ANSWER/);
const checkedTen = (await as(AD, `select check_exam_answer($1,$2,'10') r`, [schoolFree.id, ten.id]))[0].r;
assert.deepEqual(checkedTen, { isCorrect: false, correctAnswer: '7' });
assert.deepEqual((await as(AD, `select check_exam_answer($1,$2,'7') r`, [schoolFree.id, ten.id]))[0].r, checkedTen, '10번째 선지도 유효하며 채점 뒤 잠금');
await as(AD, `select submit_exam_attempt($1,'[]'::jsonb,null)`, [schoolFree.id]);
const schoolReal = (await as(AD, `select start_exam_attempt($1,'real',null) r`, [schoolId]))[0].r;
assert.equal(schoolReal.timeLimitMinutes, 50);
await fails(AD, `select check_exam_answer($1,$2,'7')`, [schoolReal.id, ten.id], /EXAM_REAL_MODE_LOCKED/);
const schoolAnswers = [1, 18].map(n => ({ questionId: schoolReal.questions.find(q => q.number === n).id, answer: schoolData.questions[n-1].answer, unsure: n === 18, timeSpentMs: 100, visits: 1 }));
await as(AD, `select save_exam_progress($1,$2::jsonb,$3::int[])`, [schoolReal.id, JSON.stringify(schoolAnswers), [18, 21, 22, 99]]);
const schoolSaved = (await as(AD, `select get_active_exam_attempt($1) r`, [schoolId]))[0].r;
assert.deepEqual(schoolSaved.visitOrder, [18, 21]);
const schoolResult = (await as(AD, `select submit_exam_attempt($1,$2::jsonb,null) r`, [schoolReal.id, JSON.stringify(schoolAnswers)]))[0].r;
assert.equal(schoolResult.score, 9.4); assert.equal(schoolResult.correctCount, 2);
assert.equal(schoolResult.totalCount, 21); assert.equal(schoolResult.maxScore, 100);
assert.equal(schoolResult.estimatedGrade, null); assert.equal(schoolResult.gradeCut, null);
assert.equal(schoolResult.items.find(i => i.number === 18).isCorrect, true);
assert.deepEqual(schoolResult.items.find(i => i.number === 18).choices, ten.choices);
assert.equal((await as(AD, `select list_my_exam_results($1) r`, [schoolId]))[0].r[0].estimatedGrade, null);
const schoolHistory = (await as(AD, `select list_my_paper_history($1) r`, [schoolId]))[0].r;
assert.deepEqual(schoolHistory.map(a => a.estimatedGrade), [null, null]);
assert.equal(schoolHistory[1].year, 2026); assert.equal(schoolHistory[1].items.length, 21);
assert.equal(schoolHistory[1].items[17].answerType, 'choice10');
assert.equal((await as(AD, `select list_exam_papers_for_me() r`))[0].r.find(p => p.id === schoolId).lastResult.estimatedGrade, null);
const schoolMistake = (await as(AD, `select add_exam_questions_to_mistakes($1,$2::uuid[],'https://reviewnote.test') r`, [schoolReal.id, [ten.id]]))[0].r[0];
const savedMistake = (await as(AD, `select analysis, grade, chapter from mistakes where id=$1`, [schoolMistake.mistakeId]))[0];
assert.equal(savedMistake.analysis.finalAnswer, '$\\sqrt{23}$', '변환한 정답은 원래 수식으로 오답노트에 저장');
assert.equal(savedMistake.grade, '공통수학2'); assert.equal(savedMistake.chapter, '원의 방정식');
assert.equal((await as(AD, `select add_exam_questions_to_mistakes($1,$2::uuid[],'https://reviewnote.test') r`, [schoolReal.id, [ten.id]]))[0].r[0].created, false);
const schoolFullAttempt = (await as(AD, `select start_exam_attempt($1,'free',null) r`, [schoolId]))[0].r;
const schoolFullItems = schoolFullAttempt.questions.map(q => ({ questionId: q.id, answer: schoolData.questions[q.number-1].answer }));
const schoolFull = (await as(AD, `select submit_exam_attempt($1,$2::jsonb,null) r`, [schoolFullAttempt.id, JSON.stringify(schoolFullItems)]))[0].r;
assert.equal(schoolFull.score, 100); assert.equal(schoolFull.correctCount, 21); assert.equal(schoolFull.estimatedGrade, null);
// 새 RPC에서도 기존 수능 만점·등급·30문항과 기존 회차를 유지한다.
const csatAgain = (await as(S2, `select start_exam_attempt('2025-11-math','free','미적분') r`))[0].r;
const csatFull = (await as(S2, `select submit_exam_attempt($1,$2::jsonb,null) r`, [csatAgain.id, JSON.stringify(allKeys.map(r => ({ questionId: r.id, answer: r.answer })))]))[0].r;
assert.equal(csatFull.score, 100); assert.equal(csatFull.estimatedGrade, 1);
assert.equal(csatFull.totalCount, 30); assert.equal(csatFull.kind, 'csat');
assert.equal(csatFull.gradeCut.topStandard, 140);
assert.equal((await as(S1, `select get_exam_result($1) r`, [f.id]))[0].r.round, 2);
await fails(null, `select start_exam_attempt($1,'free',null)`, [schoolId], /permission denied/);
await fails(S1, `select private.exam_valid_typed_answer('7','choice10')`, [], /permission denied/);
await fails(S1, `select get_exam_result($1)`, [schoolReal.id], /EXAM_ATTEMPT_NOT_FOUND/);
await db.exec(migHanneung);
await db.exec(migHanneung);
for (const level of ['advanced', 'basic']) {
  const paperId = `2026-hanneung-79-${level}`;
  const data = JSON.parse(fs.readFileSync(path.join(root, `src/features/exam/data/${paperId}.json`), 'utf8'));
  const card = (await as(S1, `select list_exam_papers_for_me() r`))[0].r.find(paper => paper.id === paperId);
  assert.equal(card.published, true);
  assert.equal(card.hanneungLevel, level);
  assert.equal(card.timeLimitMinutes, level === 'basic' ? 70 : 80);
  assert.equal(card.questionCount, 50);
  assert.deepEqual(card.electives, []);
  const seeded = (await db.query(`select q.number,q.points,q.image_url,q.answer_type,k.answer from exam_questions q join exam_answer_keys k on k.question_id=q.id where q.paper_id=$1 order by number`, [paperId])).rows;
  assert.equal(seeded.length, 50);
  for (const [index, row] of seeded.entries()) {
    assert.equal(row.answer, data.questions[index].answer);
    assert.equal(Number(row.points), data.questions[index].points);
    // 첫 한능검 시드는 원본 페이지였다. 심화는 20261003040000에서 문항별 이미지로 바뀐다(아래에서 검증).
    assert.equal(row.image_url, `/exams/${paperId}/page-${String(data.questions[index].pageNumber).padStart(2, '0')}.png`);
    assert.equal(row.answer_type, level === 'basic' ? 'choice4' : 'choice5');
  }
  const attempt = (await as(S1, `select start_exam_attempt($1,'real',null) r`, [paperId]))[0].r;
  assert.equal(attempt.questions.length, 50);
  assert.equal(attempt.timeLimitMinutes, card.timeLimitMinutes);
  assert.equal(attempt.hanneungLevel, level);
  assert.ok(!JSON.stringify(attempt.questions).includes('answer"'));
  assert.ok(attempt.items.every(item => item.checked === null));
  await fails(S2, `select get_exam_result($1)`, [attempt.id], /EXAM_ATTEMPT_NOT_FOUND/);
  await fails(S1, `select check_exam_answer($1,$2,'1')`, [attempt.id, attempt.questions[0].id], /EXAM_REAL_MODE_LOCKED/);
  const answers = attempt.questions.map(question => ({ questionId: question.id, answer: data.questions[question.number - 1].answer }));
  await as(S1, `select save_exam_progress($1,$2::jsonb,$3::int[])`, [attempt.id, JSON.stringify(answers), [23, 49, 50, 51]]);
  const saved = (await as(S1, `select get_active_exam_attempt($1) r`, [paperId]))[0].r;
  assert.deepEqual(saved.visitOrder, [23, 49, 50]);
  assert.equal(saved.items.length, 50);
  const result = (await as(S1, `select submit_exam_attempt($1,$2::jsonb,null) r`, [attempt.id, JSON.stringify(answers)]))[0].r;
  assert.equal(result.score, 100);
  assert.equal(result.correctCount, 50);
  assert.equal(result.estimatedGrade, level === 'basic' ? 4 : 1);
  assert.equal(result.gradeCut, null);
  assert.equal(result.hanneungLevel, level);
  const history = (await as(S1, `select list_my_paper_history($1) r`, [paperId]))[0].r;
  assert.equal(history[0].items.length, 50);
  assert.equal(history[0].hanneungLevel, level);
  assert.equal(buildHistoryRows(mapExamPaperHistory(history), '미적분', 50)[49].cells[0].item?.isCorrect, true);
  assert.equal((await as(S1, `select list_my_exam_results($1) r`, [paperId]))[0].r[0].estimatedGrade, result.estimatedGrade);
  assert.equal((await as(S1, `select list_exam_papers_for_me() r`))[0].r.find(paper => paper.id === paperId).lastResult.estimatedGrade, result.estimatedGrade);
  const free = (await as(S1, `select start_exam_attempt($1,'free',null) r`, [paperId]))[0].r;
  const invalid = level === 'basic' ? '5' : '6';
  await fails(S1, `select check_exam_answer($1,$2,$3)`, [free.id, free.questions[0].id, invalid], /EXAM_INVALID_ANSWER/);
  const wrong = data.questions[0].answer === '1' ? '2' : '1';
  const checked = (await as(S1, `select check_exam_answer($1,$2,$3) r`, [free.id, free.questions[0].id, wrong]))[0].r;
  assert.equal(checked.isCorrect, false);
  assert.equal(checked.correctAnswer, data.questions[0].answer);
  const failed = (await as(S1, `select submit_exam_attempt($1,'[]',null) r`, [free.id]))[0].r;
  assert.equal(failed.estimatedGrade, null);
  for (const [score, grade] of [[59, null], [60, 3], [69, 3], [70, 2], [79, 2], [80, 1], [100, 1]]) {
    const actual = (await db.query(`select private.exam_hanneung_grade($1,$2) grade`, [score, level])).rows[0].grade;
    assert.equal(actual, grade == null ? null : grade + (level === 'basic' ? 3 : 0));
  }
}
await assert.rejects(db.query(`update exam_questions set number=31 where paper_id='2025-06-math' and number=1`), /EXAM_INVALID_QUESTION/);
await fails(S1, `select private.exam_hanneung_grade(100,'basic')`, [], /permission denied/);
assert.equal((await as(S2, `select get_exam_result($1) r`, [csatAgain.id]))[0].r.estimatedGrade, 1);
assert.equal((await as(AD, `select get_exam_result($1) r`, [schoolFullAttempt.id]))[0].r.estimatedGrade, null);
// Cross-device ink, ownership, compare-and-swap and administrator read-only views.
await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261003010000_exam_ink_sync_admin.sql'), 'utf8'));
const inkAttempt = (await as(S1, `select start_exam_attempt('2026-hanneung-79-basic','free',null) r`))[0].r;
const iq = inkAttempt.questions[0].id;
const ink = JSON.stringify([{ id: 'stroke-1', tool: 'pen', color: '#1f2937', size: 4,
  points: [{ x: 0.1, y: 0.2, pressure: 0.5, t: 0 }] }]);
const saveInkSql = `select save_exam_ink($1,$2,$3::jsonb,$4,$5) r`;
assert.equal((await as(S1, saveInkSql, [inkAttempt.id, iq, ink, 0, false]))[0].r, 1);
assert.equal((await as(S1, `select get_exam_ink($1) r`, [inkAttempt.id]))[0].r[0].strokes[0].id, 'stroke-1');
assert.equal((await as(AD, `select get_exam_ink($1) r`, [inkAttempt.id]))[0].r[0].revision, 1);
await fails(S2, `select get_exam_ink($1)`, [inkAttempt.id], /EXAM_ATTEMPT_NOT_FOUND/);
await fails(S2, saveInkSql, [inkAttempt.id, iq, ink, 1, false], /EXAM_ATTEMPT_NOT_FOUND/);
await fails(AD, saveInkSql, [inkAttempt.id, iq, ink, 1, false], /EXAM_ATTEMPT_NOT_FOUND/);
await fails(null, `select get_exam_ink($1)`, [inkAttempt.id], /permission denied/);
await fails(S1, saveInkSql, [inkAttempt.id, iq, ink, 0, false], /EXAM_INK_CONFLICT/);
await fails(S1, saveInkSql, [inkAttempt.id, S2, ink, 0, false], /EXAM_QUESTION_NOT_FOUND/);
await fails(S1, saveInkSql, [inkAttempt.id, iq, '{}', 1, false], /EXAM_INK_INVALID/);
await fails(S1, saveInkSql, [inkAttempt.id, iq, '[{}]', 1, false], /EXAM_INK_INVALID/);
assert.equal((await as(S1, saveInkSql, [inkAttempt.id, iq, '[]', 1, false]))[0].r, 2);
assert.deepEqual((await as(S1, `select get_exam_ink($1) r`, [inkAttempt.id]))[0].r[0].strokes, []);
assert.equal((await as(S2, `select * from exam_attempt_ink`)).length, 0);
assert.equal((await as(AD, `select * from exam_attempt_ink`)).length, 1);
await fails(S1, `update exam_attempt_ink set strokes='[]'`, [], /permission denied/);
await fails(S1, `insert into exam_attempt_ink(attempt_id,question_id) values($1,$2)`, [inkAttempt.id, iq], /permission denied/);
await fails(S1, `delete from exam_attempt_ink`, [], /permission denied/);
await fails(null, `select * from exam_attempt_ink`, [], /permission denied/);
await fails(S1, `select admin_list_student_exam_attempts($1)`, [S2], /EXAM_ADMIN_REQUIRED/);
await fails(S1, `select admin_get_exam_attempt($1)`, [inkAttempt.id], /EXAM_ADMIN_REQUIRED/);
await fails(null, `select admin_get_exam_attempt($1)`, [inkAttempt.id], /permission denied/);
const adminAttempt = (await as(AD, `select admin_get_exam_attempt($1) r`, [inkAttempt.id]))[0].r;
assert.equal(adminAttempt.status, 'in_progress');
assert.equal(adminAttempt.questions.length, 50);
assert.ok(!JSON.stringify(adminAttempt.questions).includes('correctAnswer'));
const adminRows = (await as(AD, `select admin_list_student_exam_attempts($1) r`, [S1]))[0].r;
assert.ok(adminRows.some(row => row.attemptId === inkAttempt.id && row.score === null));
assert.ok(adminRows.some(row => row.status === 'submitted' && row.score != null));
assert.ok(adminRows.every(row => row.maxScore === 100));
assert.deepEqual((await as(AD, `select admin_list_student_exam_attempts($1,10000) r`, [S1]))[0].r, []);
const inkResult = (await as(S1, `select submit_exam_attempt($1,'[]',null) r`, [inkAttempt.id]))[0].r;
assert.equal((await as(AD, `select get_exam_result($1) r`, [inkAttempt.id]))[0].r.score, inkResult.score);
await fails(S1, saveInkSql, [inkAttempt.id, iq, ink, 2, false], /EXAM_INK_SUBMITTED/);
await fails(S1, saveInkSql, [inkAttempt.id, iq, ink, 2, true], /EXAM_INK_SUBMITTED/);
const iq2 = inkAttempt.questions[1].id;
assert.equal((await as(S1, saveInkSql, [inkAttempt.id, iq2, ink, 0, true]))[0].r, 1, 'one-time import for old submitted attempts');
await fails(S1, saveInkSql, [inkAttempt.id, iq2, ink, 1, true], /EXAM_INK_SUBMITTED/);
await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261003020000_exam_ink_replay.sql'), 'utf8'));
const replayAttempt = (await as(S1, `select start_exam_attempt('2026-hanneung-79-basic','free',null) r`))[0].r;
const rq = replayAttempt.questions[0].id;
const replaySql = `select save_exam_ink_replay($1,$2,$3::jsonb,$4,false,$5::jsonb,$6) r`;
const batchId = '11111111-0000-0000-0000-000000000001';
const batch2 = '11111111-0000-0000-0000-000000000002';
const stroke = JSON.parse(ink)[0];
const events = [{ id: 'draw', kind: 'draw', at: 1000, added: [{ index: 0, stroke }], removed: [] },
  { id: 'erase', kind: 'erase', at: 2000, added: [], removed: [stroke.id] },
  { id: 'undo', kind: 'undo', at: 3000, added: [{ index: 0, stroke }], removed: [] }];
const args = [replayAttempt.id, rq, ink, 0, JSON.stringify(events), batchId];
assert.equal((await as(S1, replaySql, args))[0].r, 1);
assert.equal((await as(S1, replaySql, args))[0].r, 1, 'retry is idempotent');
const replayData = (await as(AD, `select get_exam_ink_replay($1,$2) r`, [replayAttempt.id, rq]))[0].r;
assert.equal(replayData.batches.length, 1); assert.equal(replayData.batches[0].events.length, 3);
assert.deepEqual(replayData.strokes, JSON.parse(ink));
assert.equal((await as(S1, `select get_exam_ink($1) r`, [replayAttempt.id]))[0].r[0].lastBatchId, batchId);
await fails(S2, replaySql, args, /EXAM_ATTEMPT_NOT_FOUND/);
await fails(AD, replaySql, args, /EXAM_ATTEMPT_NOT_FOUND/);
await fails(S2, `select get_exam_ink_replay($1,$2)`, [replayAttempt.id, rq], /EXAM_ATTEMPT_NOT_FOUND/);
await fails(S1, `select get_exam_ink_replay($1,$2)`, [replayAttempt.id, S2], /EXAM_ATTEMPT_NOT_FOUND/);
await fails(null, `select get_exam_ink_replay($1,$2)`, [replayAttempt.id, rq], /permission denied/);
await fails(null, replaySql, args, /permission denied/);
await fails(S1, `select private.validate_exam_replay_strokes('[]')`, [], /permission denied/);
assert.equal((await as(S2, 'select * from exam_ink_replay_batches')).length, 0);
assert.equal((await as(AD, 'select * from exam_ink_replay_batches')).length, 1);
await fails(S1, `update exam_ink_replay_batches set events='[]'`, [], /permission denied/);
await fails(S1, `delete from exam_ink_replay_batches`, [], /permission denied/);
await fails(S1, replaySql, [replayAttempt.id, rq, '[]', 0, JSON.stringify(events), batchId], /EXAM_REPLAY_BATCH_MISMATCH/);
await fails(S1, replaySql, [replayAttempt.id, rq, ink, 0, JSON.stringify(events), batch2], /EXAM_INK_CONFLICT/);
const clear = [{ id: 'clear', kind: 'clear', at: 4000, added: [], removed: [stroke.id] }];
await fails(S1, replaySql, [replayAttempt.id, rq, ink, 1, JSON.stringify(clear), batch2], /EXAM_REPLAY_FINAL_MISMATCH/);
assert.equal((await as(S1, `select get_exam_ink($1) r`, [replayAttempt.id]))[0].r[0].revision, 1, 'bad event rolls back ink and log');
assert.equal((await as(S1, replaySql, [replayAttempt.id, rq, '[]', 1, JSON.stringify(clear), batch2]))[0].r, 2);
assert.equal((await as(S1, `select get_exam_ink_replay($1,$2) r`, [replayAttempt.id, rq]))[0].r.batches[1].baseline, null);
await as(S1, `select submit_exam_attempt($1,'[]',null)`, [replayAttempt.id]);
assert.equal((await as(S1, replaySql, args))[0].r, 1, 'a lost acknowledgement can be recovered after submission');
await fails(S1, replaySql, [replayAttempt.id, rq, ink, 2, JSON.stringify([events[0]]), '11111111-0000-0000-0000-000000000003'], /EXAM_INK_SUBMITTED/);
// 바뀐 내용만 받는 필기 저장(save_exam_ink_delta): 결과 strokes 대신 결과 획 id 목록의 SHA-256만 받는다.
const migDelta = fs.readFileSync(path.join(root, 'supabase/migrations/20261003050000_exam_ink_delta.sql'), 'utf8');
await db.exec(migDelta);
const deltaAttempt = (await as(S1, `select start_exam_attempt('2026-hanneung-79-basic','free',null) r`))[0].r;
const dq = deltaAttempt.questions[0].id;
const deltaSql = `select save_exam_ink_delta($1,$2,$3,$4,$5::jsonb,$6,$7) r`;
const idsHash = (ids: string[]) => createHash('sha256').update(ids.join('\n')).digest('hex');
const st = (id: string, x = 0.1) => ({ id, tool: 'pen', color: '#1f2937', size: 4, points: [{ x, y: 0.2, pressure: 0.5, t: 0 }] });
const ev = (id: string, kind: string, added: Array<{ index: number | string; stroke: unknown }>, removed: unknown[] = []) => ({ id, kind, at: 1000, added, removed });
const bid = (n: number) => `22222222-0000-0000-0000-${String(n).padStart(12, '0')}`;
const delta = (revision: number, events: unknown[], ids: string[], batch: string, question = dq, legacy = false) =>
  as(S1, deltaSql, [deltaAttempt.id, question, revision, legacy, JSON.stringify(events), batch, idsHash(ids)]);
const deltaFails = (uid: string | null, revision: number | null, events: unknown, hash: string, re: RegExp, batch: string | null = bid(5), question = dq, legacy = false) =>
  fails(uid, deltaSql, [deltaAttempt.id, question, revision, legacy, typeof events === 'string' ? events : JSON.stringify(events), batch, hash], re);
const inkRow = async (question = dq) =>
  (await db.query(`select strokes, revision from exam_attempt_ink where attempt_id=$1 and question_id=$2`, [deltaAttempt.id, question])).rows[0];
const batchOf = async (id: string) => (await db.query(`select * from exam_ink_replay_batches where id=$1`, [id])).rows[0];
const drawAB = [ev('d-a', 'draw', [{ index: 0, stroke: st('a') }]), ev('d-b', 'draw', [{ index: 1, stroke: st('b') }])];
assert.equal((await delta(0, drawAB, ['a', 'b'], bid(1)))[0].r, 1);
assert.equal((await delta(0, drawAB, ['a', 'b'], bid(1)))[0].r, 1, 'same batch retry is idempotent');
await deltaFails(S1, 0, [drawAB[0]], idsHash(['a']), /EXAM_REPLAY_BATCH_MISMATCH/, bid(1));
await deltaFails(S1, 0, drawAB, idsHash(['b', 'a']), /EXAM_REPLAY_BATCH_MISMATCH/, bid(1));
assert.deepEqual((await inkRow()).strokes, [st('a'), st('b')]);
const first = await batchOf(bid(1));
assert.deepEqual(first.baseline, [], 'first batch keeps the (empty) baseline like save_exam_ink_replay');
assert.equal(first.strokes_hash, (await db.query(`select md5(strokes::text) h from exam_attempt_ink where attempt_id=$1 and question_id=$2`, [deltaAttempt.id, dq])).rows[0].h, 'strokes_hash keeps meaning md5(strokes::text)');
assert.equal((await as(S1, `select get_exam_ink($1) r`, [deltaAttempt.id]))[0].r[0].lastBatchId, bid(1));
// 지우기(removed만) → 실행 취소로 되살리기 + 가운데 자리에 새 획
assert.equal((await delta(1, [ev('e-a', 'erase', [], ['a'])], ['b'], bid(2)))[0].r, 2);
assert.deepEqual((await inkRow()).strokes, [st('b')]);
assert.equal((await batchOf(bid(2))).baseline, null, 'continuous log has no baseline');
assert.equal((await delta(2, [ev('u-a', 'undo', [{ index: 0, stroke: st('a') }]), ev('d-c', 'draw', [{ index: 1, stroke: st('c') }])], ['a', 'c', 'b'], bid(3)))[0].r, 3);
assert.deepEqual((await inkRow()).strokes, [st('a'), st('c'), st('b')]);
// 같은 id를 지우고 다시 넣으면(획 수정) 새 본문으로 바뀐다
assert.equal((await delta(3, [ev('m-c', 'draw', [{ index: 1, stroke: st('c', 0.9) }], ['c'])], ['a', 'c', 'b'], bid(4)))[0].r, 4);
assert.deepEqual((await inkRow()).strokes, [st('a'), st('c', 0.9), st('b')]);
// 거절된 요청은 아무것도 남기지 않는다
const now = ['a', 'c', 'b'];
await deltaFails(S1, 4, [ev('x', 'clear', [], now)], idsHash(['a']), /EXAM_REPLAY_FINAL_MISMATCH/);
await deltaFails(S1, 4, [ev('x', 'clear', [], ['a'])], 'not-a-hash', /EXAM_REPLAY_INVALID/);
await deltaFails(S1, 4, [ev('x', 'clear', [], ['a'])], idsHash(['c', 'b']), /EXAM_REPLAY_INVALID/, null);
await deltaFails(S1, 3, [ev('x', 'erase', [], ['a'])], idsHash(['c', 'b']), /EXAM_INK_CONFLICT/);
await deltaFails(S1, null, [ev('x', 'erase', [], ['a'])], idsHash(['c', 'b']), /EXAM_INK_CONFLICT/);
await deltaFails(S1, 4, [ev('x', 'erase', [], ['zzz'])], idsHash(now), /EXAM_REPLAY_INVALID/);
await deltaFails(S1, 4, [ev('x', 'erase', [], [7])], idsHash(now), /EXAM_REPLAY_INVALID/);
await deltaFails(S1, 4, [ev('x', 'draw', [{ index: 0, stroke: st('b') }])], idsHash(['b', ...now]), /EXAM_REPLAY_INVALID/);
await deltaFails(S1, 4, [ev('x', 'draw', [{ index: 9, stroke: st('n') }])], idsHash([...now, 'n']), /EXAM_REPLAY_INVALID/);
await deltaFails(S1, 4, [ev('x', 'draw', [{ index: 1, stroke: st('n') }, { index: 1, stroke: st('m') }])], idsHash(['a', 'n', 'm', 'c', 'b']), /EXAM_REPLAY_INVALID/);
await deltaFails(S1, 4, [ev('x', 'draw', [{ index: '0', stroke: st('n') }])], idsHash(['n', ...now]), /EXAM_REPLAY_INVALID/);
await deltaFails(S1, 4, [ev('x', 'draw', [{ index: 0, stroke: { ...st('n'), color: 'red' } }])], idsHash(['n', ...now]), /EXAM_INK_INVALID/);
await deltaFails(S1, 4, [ev('x', 'draw', [{ index: 0, stroke: { ...st('n'), points: [{ x: 500, y: 0, pressure: 0.5, t: 0 }] } }])], idsHash(['n', ...now]), /EXAM_INK_INVALID/);
await deltaFails(S1, 4, [ev('x', 'draw', [{ index: 0, stroke: st('') }])], idsHash(['', ...now]), /EXAM_INK_INVALID/);
await deltaFails(S1, 4, [ev('x', 'scribble', [], ['a'])], idsHash(['c', 'b']), /EXAM_REPLAY_INVALID/);
await deltaFails(S1, 4, [{ ...ev('x', 'erase', [], ['a']), at: -1 }], idsHash(['c', 'b']), /EXAM_REPLAY_INVALID/);
await deltaFails(S1, 4, [ev('x', 'erase', [], ['a']), ev('x', 'erase', [], ['c'])], idsHash(['b']), /EXAM_REPLAY_INVALID/);
await deltaFails(S1, 4, '[]', idsHash(now), /EXAM_REPLAY_TOO_LARGE/);
await deltaFails(S1, 4, '{}', idsHash(now), /EXAM_REPLAY_INVALID/);
await deltaFails(S1, 0, drawAB, idsHash(['a', 'b']), /EXAM_QUESTION_NOT_FOUND/, bid(5), S2);
const bulk = Array.from({ length: 1998 }, (_, i) => ({ index: i + 3, stroke: st(`n${i}`) }));
await deltaFails(S1, 4, [ev('x', 'draw', bulk)], idsHash([...now, ...bulk.map(a => a.stroke.id)]), /EXAM_INK_TOO_LARGE/);
await deltaFails(S2, 4, [ev('x', 'erase', [], ['a'])], idsHash(['c', 'b']), /EXAM_ATTEMPT_NOT_FOUND/);
await deltaFails(AD, 4, [ev('x', 'erase', [], ['a'])], idsHash(['c', 'b']), /EXAM_ATTEMPT_NOT_FOUND/);
await deltaFails(null, 4, [ev('x', 'erase', [], ['a'])], idsHash(['c', 'b']), /permission denied/);
assert.equal((await inkRow()).revision, 4, 'rejected batches roll back');
assert.equal((await db.query(`select count(*)::int n from exam_ink_replay_batches where attempt_id=$1`, [deltaAttempt.id])).rows[0].n, 4);
// 전체 지우기 → 빈 필기(빈 문자열의 해시)
assert.equal((await delta(4, [ev('clear', 'clear', [], now)], [], bid(5)))[0].r, 5);
assert.deepEqual((await inkRow()).strokes, []);
const deltaReplay = (await as(AD, `select get_exam_ink_replay($1,$2) r`, [deltaAttempt.id, dq]))[0].r;
assert.deepEqual(deltaReplay.batches.map(b => b.revision), [1, 2, 3, 4, 5]);
assert.equal(deltaReplay.batches[2].events[1].added[0].stroke.id, 'c');
// 옛 함수가 저장한 batch를 새 함수로 재전송해도 같은 revision(옛 IndexedDB 초안의 upload)
const dq2 = deltaAttempt.questions[1].id;
const oldEvents = [ev('o-a', 'draw', [{ index: 0, stroke: st('a') }])];
assert.equal((await as(S1, replaySql, [deltaAttempt.id, dq2, JSON.stringify([st('a')]), 0, JSON.stringify(oldEvents), bid(6)]))[0].r, 1);
assert.equal((await delta(0, oldEvents, ['a'], bid(6), dq2))[0].r, 1);
// 옛 save_exam_ink(전체 저장) 뒤에는 기록이 이어지지 않으므로 baseline이 남고, 중복 id인 옛 필기도 본문을 잃지 않는다
assert.equal((await as(S1, saveInkSql, [deltaAttempt.id, dq2, JSON.stringify([st('a'), st('a', 0.5), st('z')]), 1, false]))[0].r, 2);
assert.equal((await delta(2, [ev('d-y', 'draw', [{ index: 3, stroke: st('y') }])], ['a', 'a', 'z', 'y'], bid(7), dq2))[0].r, 3);
assert.deepEqual((await inkRow(dq2)).strokes, [st('a'), st('a', 0.5), st('z'), st('y')]);
assert.deepEqual((await batchOf(bid(7))).baseline, [st('a'), st('a', 0.5), st('z')]);
// 제출 뒤: 잠금. 단 잃어버린 응답 복구와 1회 legacy import는 허용
await as(S1, `select submit_exam_attempt($1,'[]',null)`, [deltaAttempt.id]);
assert.equal((await delta(4, [ev('clear', 'clear', [], now)], [], bid(5)))[0].r, 5, 'lost acknowledgement recovered after submission');
await deltaFails(S1, 5, [ev('late', 'draw', [{ index: 0, stroke: st('late') }])], idsHash(['late']), /EXAM_INK_SUBMITTED/, bid(8));
await deltaFails(S1, 5, [ev('late', 'draw', [{ index: 0, stroke: st('late') }])], idsHash(['late']), /EXAM_INK_SUBMITTED/, bid(8), dq, true);
const dq3 = deltaAttempt.questions[2].id;
assert.equal((await delta(0, [ev('restore', 'restore', [{ index: 0, stroke: st('old') }])], ['old'], bid(9), dq3, true))[0].r, 1, 'one-time import for old submitted attempts');
await deltaFails(S1, 1, [ev('again', 'clear', [], ['old'])], idsHash([]), /EXAM_INK_SUBMITTED/, bid(10), dq3, true);
await deltaFails(S1, 0, [ev('new', 'draw', [{ index: 0, stroke: st('n') }])], idsHash(['n']), /EXAM_INK_SUBMITTED/, bid(11), deltaAttempt.questions[3].id);
// 마이그레이션 텍스트·카탈로그: 권한·lock_timeout·search_path·기존 함수 미수정
assert.match(migDelta, /security definer set search_path = '' set lock_timeout = '2s'/);
assert.match(migDelta, /revoke all on function public\.save_exam_ink_delta\(uuid, uuid, integer, boolean, jsonb, uuid, text\) from public, anon, authenticated/);
assert.match(migDelta, /grant execute on function public\.save_exam_ink_delta\(uuid, uuid, integer, boolean, jsonb, uuid, text\) to authenticated/);
assert.doesNotMatch(migDelta, /function public\.save_exam_ink(_replay)?\s*\(/, 'old save functions are left untouched');
assert.doesNotMatch(migDelta, /\b(alter|drop|create or replace)\b/i);
const deltaFn = (await db.query(`select p.prosecdef, p.proconfig, has_function_privilege('anon', p.oid, 'execute') anon,
  has_function_privilege('authenticated', p.oid, 'execute') auth from pg_proc p where p.proname = 'save_exam_ink_delta'`)).rows[0];
assert.equal(deltaFn.prosecdef, true);
assert.deepEqual([...deltaFn.proconfig].sort(), ['lock_timeout=2s', 'search_path=""']);
assert.equal(deltaFn.anon, false); assert.equal(deltaFn.auth, true);
// Exam practice panel (admin): latest attempt per student for each paper, submitted results first.
await db.exec(`create table public.profiles (id uuid primary key, email text, display_name text, nickname text);
insert into public.profiles values ('${S1}', 's1@x.com', '학생일', null), ('${S2}', 's2@x.com', '', '둘이');`);
await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261003030000_exam_admin_paper_activity.sql'), 'utf8'));
assert.equal((await as(S1, `select admin_list_exam_paper_activity() r`))[0].r, null, 'students get nothing');
await fails(null, `select admin_list_exam_paper_activity()`, [], /permission denied/);
const adminAttemptForActivity = (await as(AD, `select start_exam_attempt('2026-hanneung-79-basic','free',null) r`))[0].r;
const activity = (await as(AD, `select admin_list_exam_paper_activity() r`))[0].r;
const hanneungActivity = activity.find(row => row.paperId === '2026-hanneung-79-basic');
assert.ok(hanneungActivity, 'paper with attempts is listed');
assert.ok(hanneungActivity.students.every(row => row.studentId !== AD), 'admin attempts are excluded');
assert.ok(!JSON.stringify(activity).includes(adminAttemptForActivity.id));
const s1Row = hanneungActivity.students.find(row => row.studentId === S1);
assert.equal(s1Row.studentName, '학생일');
assert.equal(s1Row.status, 'submitted', 'a submitted attempt wins over a newer in-progress one');
assert.equal(typeof s1Row.score, 'number');
const s1Attempts = (await db.query(`select count(*)::int n from exam_attempts where student_id = $1 and paper_id = '2026-hanneung-79-basic'`, [S1])).rows[0].n;
assert.equal(s1Row.attemptCount, s1Attempts);
const latestSubmitted = (await db.query(`select id from exam_attempts where student_id = $1 and paper_id = '2026-hanneung-79-basic' and status = 'submitted' order by submitted_at desc, id desc limit 1`, [S1])).rows[0].id;
assert.equal(s1Row.attemptId, latestSubmitted);
for (const paper of activity) {
  const ids = paper.students.map(row => row.studentId);
  assert.equal(new Set(ids).size, ids.length, 'one row per student');
  const times = paper.students.map(row => Date.parse(row.submittedAt ?? row.startedAt));
  assert.deepEqual(times, [...times].sort((a, b) => b - a), 'most recent first');
}
// 한능검 심화는 문항별 이미지로 바뀌고(한 이미지에 한 문항), 기본은 페이지 통째 그대로.
await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261003040000_exam_hanneung_advanced_cropped.sql'), 'utf8'));
const advancedImages = (await db.query(`select number, image_url from exam_questions where paper_id = '2026-hanneung-79-advanced' order by number`)).rows;
assert.equal(advancedImages.length, 50);
assert.equal(new Set(advancedImages.map(row => row.image_url)).size, 50, 'one image per question');
assert.equal(advancedImages[0].image_url, '/exams/2026-hanneung-79-advanced/q-01.jpg');
assert.equal(advancedImages[49].image_url, '/exams/2026-hanneung-79-advanced/q-50.jpg');
for (const row of advancedImages) assert.ok(fs.existsSync(path.join(root, 'public', row.image_url)), row.image_url);
const basicImages = (await db.query(`select count(distinct image_url)::int n from exam_questions where paper_id = '2026-hanneung-79-basic'`)).rows[0].n;
assert.equal(basicImages, 12, 'basic keeps whole pages');
const advancedJson = JSON.parse(fs.readFileSync(path.join(root, 'src/features/exam/data/2026-hanneung-79-advanced.json'), 'utf8'));
assert.deepEqual(advancedJson.questions.map(q => q.imageUrl), advancedImages.map(row => row.image_url), 'data JSON matches the migration');
});
