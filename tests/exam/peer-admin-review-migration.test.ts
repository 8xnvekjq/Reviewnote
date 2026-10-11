import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// 관리자가 학생 결과를 검토할 때도 다른 학생 풀이 후보를 받는지(PGlite). 필요한 표만 최소로 흉내 낸다.
const pkg = '@electric-sql/pglite';
const { PGlite } = await import(pkg);
const sql = (name: string) => fs.readFileSync(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

test('admin can list peer candidates for a student attempt; the attempt owner is excluded (PGlite)', async () => {
  const db = new PGlite();
  const admin = id(90), s1 = id(1), s2 = id(2), s3 = id(3), q = id(100);
  try {
    await db.exec(`
      create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      create table private.app_admins(user_id uuid primary key);
      insert into private.app_admins values ('${admin}');
      create function private.exam_solve_ms(total bigint, first numeric, last numeric) returns bigint language sql as $$ select total $$;
      create function private.exam_normalize_answer(a text) returns text language sql as $$ select a $$;
      create table public.mistakes(user_id uuid, reviews jsonb);
      create table public.exam_papers(id text primary key, kind text);
      create table public.exam_questions(id uuid primary key, paper_id text);
      create table public.exam_answer_keys(question_id uuid primary key, answer text);
      create table public.exam_attempts(id uuid primary key, student_id uuid, paper_id text, status text, mode text default 'free', submitted_at timestamptz);
      create table public.exam_attempt_items(attempt_id uuid, question_id uuid, is_correct boolean, time_spent_ms bigint default 5000, answer text, checked_at timestamptz);
      create table public.exam_attempt_ink(attempt_id uuid, question_id uuid, revision int default 1, stroke_count int default 3, point_count int default 60,
        first_input_at_ms numeric, last_input_at_ms numeric);
      insert into exam_papers values ('paper','school');
      insert into exam_questions values ('${q}','paper');
      insert into exam_answer_keys values ('${q}','7');
    `);
    for (const [n, user] of [[1, s1], [2, s2], [3, s3]] as const) {
      await db.query(`insert into exam_attempts values ($1,$2,'paper','submitted','free',now() - $3 * interval '1 minute')`, [id(200 + n), user, n]);
      await db.query(`insert into exam_attempt_items(attempt_id,question_id,is_correct,answer) values ($1,$2,true,'7')`, [id(200 + n), q]);
      await db.query('insert into exam_attempt_ink(attempt_id,question_id) values ($1,$2)', [id(200 + n), q]);
    }
    await db.exec(sql('20261011270000_exam_peer_admin_review'));
    const authors = async (uid: string, attempt: string) => {
      await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false)`);
      return (await db.query<{ author_id: string }>('select author_id from private.exam_peer_candidates($1,$2) order by author_id', [attempt, q])).rows.map(r => r.author_id);
    };
    assert.deepEqual(await authors(s1, id(201)), [s2, s3], 'student still sees other students only');
    assert.deepEqual(await authors(admin, id(201)), [s2, s3], 'admin reviewing s1 sees others, not s1');
    await assert.rejects(authors(s2, id(201)), /EXAM_PEER_NOT_ALLOWED/, 'a student cannot open another student attempt');
  } finally { await db.close(); }
});
