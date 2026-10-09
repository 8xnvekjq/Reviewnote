import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const pkg = '@electric-sql/pglite';
const { PGlite } = await import(pkg);
const { pgcrypto } = await import(`${pkg}/contrib/pgcrypto`);
const sql = (name: string) => fs.readFileSync(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const STUDENT = '00000000-0000-0000-0000-00000000000a';

test('고3 10월 학평: 재적용·문항/정답·선택별 배점·1등급 경계 학생 제출 (PGlite)', async () => {
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
    await db.exec(sql('20261010140000_exam_csat_2025_10_g3'));
    await db.exec(sql('20261010140000_exam_csat_2025_10_g3'));
    const pid = '2025-10-g3-math';
    const data = JSON.parse(fs.readFileSync(new URL(`../../src/features/exam/data/${pid}.json`, import.meta.url), 'utf8'));
    // 정답표와 해설 결론을 대조한 값. 생성 JSON과 별도로 회귀를 검사한다.
    const expectedAnswers = {
      common: ['3','5','4','1','1','5','5','2','3','2','3','2','4','1','4','6','14','120','11','3','81','63'],
      '확률과 통계': ['2','3','5','4','1','2','180','17'],
      '미적분': ['5','1','3','4','2','2','686','8'],
      '기하': ['5','2','4','1','3','3','48','320'],
    };
    for (const [section, expected] of Object.entries(expectedAnswers)) {
      assert.deepEqual(data.questions.filter((q: any) => q.section === section).map((q: any) => q.answer), expected);
    }
    const expectedRaw = {
      '확률과 통계': [88,80,70,58,38,22,16,14], '미적분': [82,75,66,53,34,18,12,9], '기하': [86,78,69,56,38,22,16,13],
    };
    assert.deepEqual(data.gradeCuts.rawByElective, expectedRaw);
    for (const elective of data.electives) {
      assert.deepEqual(data.gradeCuts.standardByElective[elective], [132,126,118,108,92,79,74,72]);
      assert.deepEqual(data.gradeCuts.percentileByElective[elective], [96,89,77,60,40,23,9,4]);
    }
    const rows: any[] = (await db.query(`select q.*,k.answer from exam_questions q
      left join exam_answer_keys k on k.question_id=q.id where q.paper_id=$1`, [pid])).rows;
    assert.equal(rows.length, 46);
    assert.ok(rows.every(q => q.answer != null));
    for (const q of data.questions) {
      const row = rows.find(r => r.section === q.section && r.number === q.number);
      assert.equal(row.answer, q.answer);
      assert.equal(Number(row.points), q.points);
      assert.equal(row.answer_type, q.answerType);
      assert.equal(row.image_url, q.imageUrl);
      assert.ok(fs.existsSync(new URL(`../../public${q.imageUrl}`, import.meta.url)));
    }
    const paper: any = (await db.query('select * from exam_papers where id=$1', [pid])).rows[0];
    assert.equal(paper.published, false);
    assert.equal(paper.kind, 'csat');
    assert.equal(paper.year, 2026);
    assert.equal(paper.grade, 3);
    assert.equal(paper.time_limit_minutes, 100);
    assert.deepEqual(paper.grade_cuts, data.gradeCuts);
    assert.equal(paper.grade_cuts.topByElective, undefined);
    const asStudent = async (query: string, args: unknown[] = []): Promise<any> => {
      await db.exec(`select set_config('request.jwt.claim.sub','${STUDENT}',false); set role authenticated;`);
      try { return (await db.query(query, args)).rows[0]?.r; } finally { await db.exec('reset role'); }
    };
    await assert.rejects(asStudent('select start_exam_attempt($1,$2,$3) r', [pid, 'real', '미적분']), /EXAM_PAPER_NOT_FOUND/);
    // 테스트 DB에서만 공개하여 실제 학생 권한·RPC로 검증한다.
    await db.query('update exam_papers set published=true where id=$1', [pid]);
    const common = rows.filter(q => q.section === 'common');
    assert.equal(common.length, 22);
    assert.equal(common.reduce((sum, q) => sum + Number(q.points), 0), 74);
    for (const elective of data.electives) {
      const electiveRows = rows.filter(q => q.section === elective);
      assert.equal(electiveRows.length, 8);
      assert.equal(electiveRows.reduce((sum, q) => sum + Number(q.points), 0), 26);
      const cut = data.gradeCuts.rawByElective[elective][0];
      for (const score of [100, cut, cut - 1, 0]) {
        const attempt = await asStudent('select start_exam_attempt($1,$2,$3) r', [pid, 'real', elective]);
        assert.equal(attempt.elective, elective);
        assert.equal(attempt.questions.length, 30);
        assert.equal(attempt.timeLimitMinutes, 100);
        assert.ok(attempt.questions.every((q: any) => q.answer === undefined && (q.section === 'common' || q.section === elective)));
        const subsets = new Map<number, string[]>([[0, []]]);
        for (const q of attempt.questions) for (const [sum, ids] of [...subsets]) {
          if (sum + q.points <= score) subsets.set(sum + q.points, [...ids, q.id]);
        }
        assert.ok(subsets.has(score));
        const ids = subsets.get(score)!;
        const items = attempt.questions.map((q: any) => ({ questionId: q.id,
          answer: ids.includes(q.id) ? rows.find(r => r.id === q.id).answer : null,
          unsure: false, timeSpentMs: 10, visits: 1 }));
        const result = await asStudent('select submit_exam_attempt($1,$2::jsonb,null) r', [attempt.id, JSON.stringify(items)]);
        assert.equal(result.score, score);
        assert.equal(result.estimatedGrade, score >= cut ? 1 : score === cut - 1 ? 2 : 9);
        assert.deepEqual(result.gradeCut.rawByGrade, data.gradeCuts.rawByElective[elective]);
        assert.deepEqual(result.gradeCut.standardByGrade, data.gradeCuts.standardByElective[elective]);
        assert.deepEqual(result.gradeCut.percentileByGrade, data.gradeCuts.percentileByElective[elective]);
        assert.equal(result.gradeCut.topStandard, null);
        assert.equal(result.gradeCut.topPercentile, null);
        const history = await asStudent('select list_my_paper_history($1,null) r', [pid]);
        assert.equal(history.at(-1).estimatedGrade, result.estimatedGrade);
      }
    }
  } finally { await db.close(); }
});
