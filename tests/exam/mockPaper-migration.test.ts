import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const pkg = '@electric-sql/pglite';
const { PGlite } = await import(pkg);
const { pgcrypto } = await import(`${pkg}/contrib/pgcrypto`);
const sql = (name: string) => fs.readFileSync(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const STUDENT = '00000000-0000-0000-0000-00000000000a';

test('학력평가 마이그레이션·학생 실전 제출·선택과목별 수능 채점 (PGlite)', async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
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
-- Supabase 기본 권한을 재현한다.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema private grant all on functions to anon, authenticated, service_role;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a','s1'),('00000000-0000-0000-0000-00000000000b','s2'),('00000000-0000-0000-0000-0000000000ad','admin');
insert into private.app_admins values ('00000000-0000-0000-0000-0000000000ad');
`);
    for (const name of ['20261002120000_exam_practice', '20261002180000_exam_practice_v2',
      '20261002190000_exam_papers_batch2', '20261002200000_exam_rounds', '20261002210000_exam_school_papers',
      '20261003000000_exam_hanneung', '20261003100000_exam_era_schema', '20261003130000_exam_worksheets',
      '20261004115900_exam_school_question_validation']) await db.exec(sql(name));
    // 최신 시작 RPC의 알림은 로컬 스텁으로 실행한다. 외부 전송 없음.
    await db.exec(`create schema vault; create schema net;
      create table vault.decrypted_secrets(name text,decrypted_secret text);
      create function net.http_post(url text,body jsonb default '{}',params jsonb default '{}',headers jsonb default '{}',timeout_milliseconds int default 5000)
        returns bigint language sql as $$ select 1::bigint $$;
      create table public.profiles(id uuid primary key,display_name text,nickname text,email text);`);
    await db.exec(sql('20261009150000_exam_discord_alert').replace('create extension if not exists pg_net;', ''));
    await db.exec(sql('20261010120000_exam_mock_2025_10'));
    await db.exec(sql('20261010120000_exam_mock_2025_10'));
    const as = async (query: string, args: unknown[] = []) => {
      await db.exec(`select set_config('request.jwt.claim.sub','${STUDENT}',false); set role authenticated;`);
      try { return (await db.query(query, args)).rows[0]?.r; } finally { await db.exec('reset role'); }
    };
    for (const grade of [1, 2]) {
      const pid = `2025-10-g${grade}-math`;
      const rows = (await db.query(`select q.number,q.points,q.answer_type,k.answer from exam_questions q
        join exam_answer_keys k on k.question_id=q.id where q.paper_id=$1 order by q.number`, [pid])).rows;
      assert.equal(rows.length, 30);
      assert.equal(rows.reduce((sum: number, q: any) => sum + Number(q.points), 0), 100);
      const data = JSON.parse(fs.readFileSync(new URL(`../../src/features/exam/data/${pid}.json`, import.meta.url), 'utf8'));
      assert.deepEqual(rows.map((q: any) => q.answer), data.questions.map((q: any) => q.answer));
      assert.equal((await db.query('select published from exam_papers where id=$1', [pid])).rows[0].published, false);
      await assert.rejects(as('select start_exam_attempt($1,$2,null) r', [pid, 'real']), /EXAM_PAPER_NOT_FOUND/);
      // 운영에는 비공개로 남기고 테스트 DB에서만 공개한다.
      await db.query('update exam_papers set published=true where id=$1', [pid]);
      const cuts = data.gradeCuts;
      for (const score of [100, 88, 87, 0]) {
        const attempt = await as('select start_exam_attempt($1,$2,null) r', [pid, 'real']);
        assert.equal(attempt.kind, 'mock');
        assert.equal(attempt.elective, null);
        assert.equal(attempt.timeLimitMinutes, 100);
        assert.equal(attempt.questions.length, 30);
        assert.ok(attempt.questions.every((q: any) => q.section === 'common' && q.answer === undefined));
        // 목표 점수를 만드는 부분집합으로 실제 문항 답안을 제출한다.
        const subsets = new Map<number, number[]>([[0, []]]);
        for (const q of rows) for (const [sum, ns] of [...subsets]) if (sum + Number(q.points) <= score) subsets.set(sum + Number(q.points), [...ns, Number(q.number)]);
        assert.ok(subsets.has(score));
        const ns = subsets.get(score)!;
        const items = attempt.questions.map((q: any) => ({ questionId: q.id, answer: ns.includes(q.number) ? rows[q.number - 1].answer : null, unsure: false, timeSpentMs: 10, visits: 1 }));
        const result = await as('select submit_exam_attempt($1,$2::jsonb,null) r', [attempt.id, JSON.stringify(items)]);
        assert.equal(result.score, score);
        assert.equal(result.estimatedGrade, score >= 88 ? 1 : score === 87 ? 2 : 9);
        assert.deepEqual(result.gradeCut.rawByGrade, cuts.raw);
        assert.deepEqual(result.gradeCut.standardByGrade, cuts.standard);
        assert.deepEqual(result.gradeCut.percentileByGrade, cuts.percentile);
        assert.equal(result.gradeCut.topStandard, cuts.top.standard);
        assert.equal(result.gradeCut.topPercentile, 100);
        const history = await as('select list_my_paper_history($1,null) r', [pid]);
        assert.equal(history.at(-1).estimatedGrade, result.estimatedGrade);
        const summaries = await as('select list_my_exam_results($1) r', [pid]);
        assert.equal(summaries[0].kind, 'mock');
      }
    }
    for (const elective of ['확률과 통계', '미적분', '기하']) {
      const attempt = await as('select start_exam_attempt($1,$2,$3) r', ['2025-06-math', 'real', elective]);
      const keys = (await db.query('select question_id,answer from exam_answer_keys')).rows;
      const subsets = new Map<number, string[]>([[0, []]]);
      for (const q of attempt.questions) for (const [sum, ids] of [...subsets]) if (sum + q.points <= 80) subsets.set(sum + q.points, [...ids, q.id]);
      const ids = subsets.get(80)!;
      assert.ok(ids);
      const items = attempt.questions.map((q: any) => ({ questionId: q.id, answer: ids.includes(q.id) ? keys.find((k: any) => k.question_id === q.id).answer : null }));
      const result = await as('select submit_exam_attempt($1,$2::jsonb,null) r', [attempt.id, JSON.stringify(items)]);
      const cuts = (await db.query('select grade_cuts from exam_papers where id=$1', ['2025-06-math'])).rows[0].grade_cuts;
      assert.equal(attempt.elective, elective);
      assert.equal(result.score, 80);
      assert.deepEqual(result.gradeCut.rawByGrade, cuts.rawByElective[elective]);
      assert.equal(result.estimatedGrade, cuts.rawByElective[elective].findIndex((cut: number) => 80 >= cut) + 1);
    }
  } finally { await db.close(); }
});
