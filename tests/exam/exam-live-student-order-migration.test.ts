import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

let PGlite: any;
try { const pkg = '@electric-sql/pglite'; PGlite = (await import(pkg)).PGlite; } catch { /* 기존 suite와 동일한 선택 의존성 */ }
test('누적 복습 완료 집계 RPC 관리자 권한과 50명 제한 (PGlite)', { skip: !PGlite }, async () => {
  const db = new PGlite();
  const admin = '00000000-0000-0000-0000-000000000001';
  const student = '00000000-0000-0000-0000-000000000002';
  const second = '00000000-0000-0000-0000-000000000003';
  const absent = '00000000-0000-0000-0000-000000000004';
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function private.is_current_user_admin() returns boolean language sql stable as $$ select auth.uid() = '${admin}'::uuid $$;
      create table public.mistakes(user_id uuid, reviews jsonb, date timestamptz);
      alter table public.mistakes enable row level security;
      grant usage on schema public to anon, authenticated;
    `);
    await db.exec(fs.readFileSync(new URL('../../supabase/migrations/20261005130000_exam_live_student_order.sql', import.meta.url), 'utf8'));
    for (const reviews of [['O','O','O'], ['O','O','O','X'], ['O','O','X'], ['O','O'], [], null, ['O','X','O','O'], ['o','O','O']]) {
      await db.query("insert into mistakes values ($1,$2::jsonb,'2020-01-01')", [student, JSON.stringify(reviews)]);
    }
    await db.query("insert into mistakes values ($1,'[\"O\",\"O\",\"O\"]',now())", [second]);
    const as = async (uid: string | null, studentIds: unknown) => {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
      try { return (await db.query('select public.admin_get_live_student_order($1::uuid[]) r', [studentIds])).rows[0].r; }
      finally { await db.exec('reset role'); }
    };
    assert.deepEqual(await as(admin, [student,second,absent]), [
      { studentId: student, completedCount: 2 }, { studentId: second, completedCount: 1 }, { studentId: absent, completedCount: 0 },
    ]);
    assert.deepEqual(await as(admin, null), []); assert.deepEqual(await as(admin, []), []);
    assert.deepEqual(await as(admin, [student,student,null]), [{ studentId: student, completedCount: 2 }]);
    assert.deepEqual(await as(admin, [null]), []);
    assert.deepEqual(await as(admin, Array(50).fill(student)), [{ studentId: student, completedCount: 2 }]);
    await assert.rejects(as(admin, Array(51).fill(student)), /EXAM_LIVE_STUDENT_LIMIT/);
    for (const list of [null, [], [student], Array(51).fill(student)]) {
      await assert.rejects(as(student, list), /EXAM_ADMIN_REQUIRED/);
      await assert.rejects(as(null, list), /permission denied/);
    }
    // uid 없는 authenticated 요청은 NULL 관리자 판정을 우회하지 못한다.
    await db.exec("select set_config('request.jwt.claim.sub', '', false); set role authenticated;");
    await assert.rejects(db.query("select public.admin_get_live_student_order('{}')"), /EXAM_ADMIN_REQUIRED/);
    await db.exec('reset role');
    const flag = (await db.query(`select prosecdef, provolatile, proconfig,
      has_function_privilege('anon', oid, 'execute') anon,
      has_function_privilege('authenticated', oid, 'execute') authenticated
      from pg_proc where proname = 'admin_get_live_student_order'`)).rows[0];
    assert.equal(flag.prosecdef, true); assert.equal(flag.provolatile, 's');
    assert.deepEqual(flag.proconfig, ['search_path=""']); assert.equal(flag.anon, false); assert.equal(flag.authenticated, true);
  } finally { await db.close(); }
});
