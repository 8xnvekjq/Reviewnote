import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { PGlite } = await import('@electric-sql/pglite');
test('admin submission RPC keeps latest submitted per student including mine and enforces permissions', async () => {
  const db = new PGlite();
  const admin = '00000000-0000-0000-0000-000000000001';
  const student = '00000000-0000-0000-0000-000000000002';
  const q = '00000000-0000-0000-0000-000000000003';
  const ids = [4, 5, 6, 7, 8].map(n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`);
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      create function private.is_current_user_admin() returns boolean language sql stable as $$ select coalesce(auth.uid()='${admin}'::uuid,false) $$;
      create table auth.users(id uuid primary key, email text);
      create table public.profiles(id uuid primary key, display_name text, nickname text, email text);
      create table public.exam_attempts(id uuid primary key, student_id uuid, paper_id text, status text, submitted_at timestamptz);
      create table public.exam_questions(id uuid primary key, number integer, image_url text);
      create table public.exam_attempt_items(attempt_id uuid, question_id uuid, answer text, is_correct boolean);
      grant usage on schema public to anon, authenticated;
      insert into auth.users values ('${admin}', 'teacher@example.com'), ('${student}', 'student@example.com');
      insert into profiles values ('${student}', ' 김학생 ', null, null);
      insert into exam_questions values ('${q}',1,'/q.png');
      insert into exam_attempts values
        ('${ids[0]}','${student}','paper','submitted','2026-01-01'),
        ('${ids[1]}','${student}','paper','submitted','2026-02-01'),
        ('${ids[2]}','${student}','paper','in_progress',null),
        ('${ids[3]}','${admin}','paper','submitted','2026-01-01'),
        ('${ids[4]}','${student}','other','submitted','2026-03-01');
      insert into exam_attempt_items values ('${ids[1]}','${q}','2',false), ('${ids[3]}','${q}','1',true);`);
    await db.exec(fs.readFileSync(new URL('../../supabase/migrations/20261009210000_exam_admin_replay_compare.sql', import.meta.url), 'utf8'));
    const as = async (uid: string | null) => {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid ?? ''}',false); set role ${uid ? 'authenticated' : 'anon'};`);
      try { return (await db.query('select public.admin_list_paper_submissions($1) r', ['paper'])).rows[0].r as any[]; }
      finally { await db.exec('reset role'); }
    };
    await assert.rejects(as(student), /EXAM_ADMIN_REQUIRED/);
    await assert.rejects(as(null), /permission denied/);
    const rows = await as(admin);
    assert.deepEqual(rows.map(row => row.attemptId), [ids[1], ids[3]]);
    assert.equal(rows[0].studentName, '김학생'); assert.equal(rows[1].studentName, 'teacher');
    assert.equal(rows[1].isMine, true); assert.equal(rows[0].isMine, false);
    assert.deepEqual(rows[0].questions, [{ questionId: q, number: 1, imageUrl: '/q.png', answer: '2', isCorrect: false }]);
    const flags = (await db.query(`select prosecdef, proconfig, has_function_privilege('anon',oid,'execute') anon from pg_proc where proname='admin_list_paper_submissions'`)).rows[0];
    assert.equal(flags.prosecdef, true); assert.deepEqual(flags.proconfig, ['search_path=""']); assert.equal(flags.anon, false);
  } finally { await db.close(); }
});
