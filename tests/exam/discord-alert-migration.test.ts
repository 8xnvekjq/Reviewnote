import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
let PGlite: any;
try { const pkg = '@electric-sql/pglite'; PGlite = (await import(pkg)).PGlite; } catch { /* 기존 suite와 동일한 선택 의존성 */ }

const ADMIN = '00000000-0000-0000-0000-0000000000ad';
const STUDENT = '00000000-0000-0000-0000-000000000001';
const TESTER = '00000000-0000-0000-0000-000000000002';

test('응시 시작·이어 풀기·제출 디스코드 알림 — 관리자 제외, 이어 풀기 3분 제한, 100점 환산·등급 (PGlite)', { skip: !PGlite }, async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema private; create schema vault; create schema net;
      create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
      create table private.app_admins (user_id uuid primary key);
      insert into private.app_admins values ('${ADMIN}');
      create function private.is_current_user_admin() returns boolean language sql stable security definer set search_path = '' as $$
        select exists (select 1 from private.app_admins a where a.user_id = auth.uid()) $$;
      create table vault.decrypted_secrets (name text, decrypted_secret text);
      create table net.sent (url text, body jsonb, headers jsonb);
      create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
        returns bigint language sql as $$ insert into net.sent values (url, body, headers) returning 1::bigint $$;
      create table public.profiles (id uuid primary key, display_name text, nickname text, email text);
      insert into auth.users values ('${ADMIN}', 'admin@x.com'), ('${STUDENT}', 'kim@x.com'), ('${TESTER}', 'test@reviewnote.com');
      insert into public.profiles values ('${STUDENT}', ' 김 학생 ', null, null);
      create table public.exam_papers (id text primary key, title text, kind text, practice_era text, max_score numeric, question_count int,
        published boolean, electives text[] default '{}', time_limit_minutes int, hanneung_level text);
      insert into public.exam_papers values
        ('school122', '중3-2 대비 1회', 'school', null, 122, 2, true, '{}', 60, null),
        ('suneung', '2026 수능', 'suneung', null, 100, 1, true, '{}', 100, null),
        ('hanneung', '한능검 74회', 'hanneung', null, 100, 1, true, '{}', 80, 'advanced');
      create table public.exam_questions (id text primary key, paper_id text, section text default 'common', points numeric);
      insert into public.exam_questions values ('q1', 'school122', 'common', 61), ('q2', 'school122', 'common', 61),
        ('s1', 'suneung', 'common', 100), ('h1', 'hanneung', 'common', 100);
      create table public.exam_attempts (id uuid primary key default gen_random_uuid(), student_id uuid, paper_id text, mode text, elective text,
        started_at timestamptz default now(), time_limit_minutes int, status text default 'in_progress', submitted_at timestamptz,
        score numeric, correct_count int, total_count int, total_time_ms bigint, estimated_grade smallint);
      create unique index on public.exam_attempts (student_id, paper_id) where status = 'in_progress';
      create table public.exam_attempt_items (attempt_id uuid, question_id text, answer text);
      create function private.exam_attempt_payload(p uuid) returns jsonb language sql as $$ select jsonb_build_object('attemptId', p) $$;
      grant usage on schema public to anon, authenticated;
    `);
    const migration = fs.readFileSync(new URL('../../supabase/migrations/20261009150000_exam_discord_alert.sql', import.meta.url), 'utf8');
    assert.match(migration, /create extension if not exists pg_net;/);
    await db.exec(migration.replace('create extension if not exists pg_net;', ''));
    await db.exec('grant execute on function public.start_exam_attempt(text, text, text) to authenticated');

    const start = async (uid: string, paper: string, mode = 'free') => {
      await db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
      try { return (await db.query('select public.start_exam_attempt($1, $2, null) r', [paper, mode])).rows[0].r.attemptId as string; }
      finally { await db.exec('reset role'); }
    };
    const sent = async () => (await db.query<{ content: string }>("select body->>'content' content from net.sent order by ctid")).rows.map(r => r.content);
    const submit = (id: string, score: number, correct: number, total: number, ms: number, grade: number | null) => db.query(
      `update public.exam_attempts set status = 'submitted', submitted_at = now(), score = $2, correct_count = $3, total_count = $4,
         total_time_ms = $5, estimated_grade = $6 where id = $1`, [id, score, correct, total, ms, grade]);

    // 웹훅 주소가 Vault에 없으면 아무것도 보내지 않고, 응시는 그대로 된다.
    const quiet = await start(STUDENT, 'suneung', 'real');
    assert.ok(quiet);
    assert.deepEqual(await sent(), []);
    await db.query("insert into vault.decrypted_secrets values ('discord_exam_webhook', ' https://discord.com/api/webhooks/1/abc ')");

    // 관리자는 시작·이어 풀기·제출 모두 알림 없음.
    const adminAttempt = await start(ADMIN, 'school122');
    await start(ADMIN, 'school122');
    await submit(adminAttempt, 61, 1, 2, 5000, null);
    assert.deepEqual(await sent(), []);

    // 학생: 시작 → 바로 다시 열기(3분 안)는 알림 없음 → 3분 지나 이어 풀기는 알림.
    const attempt = await start(STUDENT, 'school122', 'real');
    await start(STUDENT, 'school122');
    await db.query("update private.exam_discord_notices set sent_at = now() - interval '4 minutes'");
    await db.query("update public.exam_attempt_items set answer = '3' where attempt_id = $1 and question_id = 'q1'", [attempt]);
    await start(STUDENT, 'school122');
    await submit(attempt, 106, 1, 2, 2532000, null);
    // 제출된 시도를 다시 고쳐도(상태 변화 없음) 또 보내지 않는다.
    await db.query('update public.exam_attempts set score = 106 where id = $1', [attempt]);

    let messages = await sent();
    assert.equal(messages.length, 3);
    assert.match(messages[0], /^🟢 \*\*김 학생\*\* 응시 시작 — 중3-2 대비 1회 \(실전 · 2문항\) · \d+\/\d+ \d\d:\d\d$/);
    assert.match(messages[1], /^🔄 \*\*김 학생\*\* 이어 풀기 — 중3-2 대비 1회 \(답 1\/2\) · /);
    assert.match(messages[2], /^✅ \*\*김 학생\*\* 제출 — 중3-2 대비 1회 · \*\*86\.9점\*\* \(원점수 106 \/ 122점\) · 정답 1\/2 · 풀이 42분 12초 · /);

    // test 계정(관리자 아님)은 알림이 온다. 수능은 추정 등급, 한능검은 급수.
    await submit(quiet, 92, 1, 1, 45000, 2);
    const tester = await start(TESTER, 'hanneung');
    await submit(tester, 55, 0, 1, 61000, null);
    messages = await sent();
    assert.match(messages[3], /^✅ \*\*김 학생\*\* 제출 — 2026 수능 · \*\*92점\*\* \/ 100점 · 추정 2등급 · 정답 1\/1 · 풀이 45초 · /);
    assert.match(messages[4], /^🟢 \*\*test\*\* 응시 시작 — 한능검 74회 \(자유 · 1문항\)/);
    assert.match(messages[5], /^✅ \*\*test\*\* 제출 — 한능검 74회 · \*\*55점\*\* \/ 100점 · 급수 없음\(60점 미만\) · 정답 0\/1 · 풀이 1분 1초 · /);

    const body = (await db.query<{ url: string; body: any }>('select url, body from net.sent limit 1')).rows[0];
    assert.equal(body.url, 'https://discord.com/api/webhooks/1/abc');
    assert.deepEqual(body.body.allowed_mentions, { parse: [] });

    // 디스코드 전송이 실패해도 응시는 막지 않는다.
    await db.exec("create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint language plpgsql as $$ begin raise exception 'boom'; end $$");
    assert.ok(await start(TESTER, 'suneung'));

    const flags = (await db.query<{ proname: string; prosecdef: boolean; anon: boolean; authenticated: boolean }>(`select proname, prosecdef,
      has_function_privilege('anon', oid, 'execute') anon, has_function_privilege('authenticated', oid, 'execute') authenticated
      from pg_proc where proname like 'exam_discord_%' order by proname`)).rows;
    assert.deepEqual(flags.map(f => [f.proname, f.prosecdef, f.anon, f.authenticated]), [
      ['exam_discord_message', true, false, false], ['exam_discord_notify', true, false, false], ['exam_discord_on_submit', true, false, false],
    ]);
  } finally { await db.close(); }
});
