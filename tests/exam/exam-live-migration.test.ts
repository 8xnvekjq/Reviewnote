import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { applyLiveInk } from '../../src/features/exam/ink/inkLive.ts';
import { inkDelta } from '../../src/features/exam/ink/inkReplay.ts';
import type { InkStroke } from '../../src/features/exam/contract.ts';

let PGlite: any;
try { const pkg = '@electric-sql/pglite'; PGlite = (await import(pkg)).PGlite; } catch { /* same optional dependency as existing migration suite */ }
test('admin Live RPC permissions, activity window, lightweight rows and contiguous deltas (PGlite)', { skip: !PGlite }, async () => {
  const db = new PGlite();
  const admin = '00000000-0000-0000-0000-000000000001';
  const student = '00000000-0000-0000-0000-000000000002';
  const attempt = '00000000-0000-0000-0000-000000000003';
  const question = '00000000-0000-0000-0000-000000000004';
  const second = '00000000-0000-0000-0000-000000000005';
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function private.is_current_user_admin() returns boolean language sql stable as $$ select coalesce(auth.uid() = '${admin}'::uuid, false) $$;
      create table private.app_admins(user_id uuid primary key);
      insert into private.app_admins values ('${admin}');
      create table auth.users(id uuid primary key, email text);
      create table public.profiles(id uuid primary key, display_name text, nickname text, email text);
      create table public.exam_attempts(id uuid primary key, student_id uuid, paper_id text, status text);
      create table public.exam_questions(id uuid primary key, number integer, image_url text);
      create table public.exam_attempt_items(attempt_id uuid, question_id uuid, answer text, primary key(attempt_id,question_id));
      create table public.exam_attempt_ink(attempt_id uuid, question_id uuid, revision integer, strokes jsonb, updated_at timestamptz, primary key(attempt_id,question_id));
      create table public.exam_ink_replay_batches(attempt_id uuid, question_id uuid, revision integer, base_revision integer, events jsonb, unique(attempt_id,question_id,revision));
      grant usage on schema public to anon, authenticated;
      insert into auth.users values ('${student}', 'email-name@example.com');
      insert into profiles values ('${student}', ' 학생 이름 ', '별명', null);
      insert into exam_attempts values ('${attempt}', '${student}', 'paper', 'in_progress');
      insert into exam_questions values ('${question}', 1, '/page.jpg'), ('${second}', 2, '/second.jpg');
      insert into exam_attempt_items values ('${attempt}', '${question}', null), ('${attempt}', '${second}', '1');
    `);
    await db.exec(fs.readFileSync(new URL('../../supabase/migrations/20261004130000_exam_admin_live_view.sql', import.meta.url), 'utf8'));
    const as = async (uid: string | null, sql: string, params: unknown[] = []) => {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
      try { return (await db.query(sql, params)).rows[0]?.r; } finally { await db.exec('reset role'); }
    };
    for (const [sql, params] of [
      ['select admin_list_live_exam_papers() r', []],
      ['select admin_get_live_exam($1) r', ['paper']],
      ['select admin_get_live_ink($1,$2,null) r', [attempt, question]],
    ] as const) {
      await assert.rejects(as(student, sql, [...params]), /EXAM_ADMIN_REQUIRED/);
      await assert.rejects(as(null, sql, [...params]), /permission denied/);
    }
    const a: InkStroke = { id: 'a', tool: 'pen', color: '#123456', size: 3, points: [] };
    const b = { ...a, id: 'b' };
    const events = [inkDelta([], [a], 'draw'), inkDelta([a], [a,b], 'draw'), inkDelta([a,b], [b], 'erase')];
    await db.query(`insert into exam_attempt_ink values ($1,$2,3,$3::jsonb,now()), ($1,$4,0,'[]',now()-interval '11 minutes')`, [attempt,question,JSON.stringify([b]),second]);
    for (let i = 0; i < events.length; i++) await db.query('insert into exam_ink_replay_batches values ($1,$2,$3,$4,$5::jsonb)', [attempt,question,i+1,i,JSON.stringify([events[i]])]);
    assert.deepEqual(await as(admin, 'select admin_list_live_exam_papers() r'), [{ paperId: 'paper', liveCount: 1 }]);
    const rows = await as(admin, 'select admin_get_live_exam($1) r', ['paper']);
    assert.equal(rows.length, 1); assert.equal(rows[0].studentName, '학생 이름');
    assert.equal(rows[0].questionId, question); assert.equal(rows[0].answeredCount, 1);
    assert.ok(!JSON.stringify(rows).includes('strokes')); assert.ok(!JSON.stringify(rows).includes('events'));
    await db.exec(`update profiles set display_name=''`);
    assert.equal((await as(admin, "select admin_get_live_exam('paper') r"))[0].studentName, '별명');
    await db.exec(`update profiles set nickname=null`);
    assert.equal((await as(admin, "select admin_get_live_exam('paper') r"))[0].studentName, 'email-name');
    await db.query(`update exam_attempt_ink set updated_at=now()+interval '1 second' where question_id=$1`, [second]);
    assert.equal((await as(admin, "select admin_get_live_exam('paper') r"))[0].questionId, second, 'latest-written question wins');
    await db.query(`update exam_attempt_ink set updated_at=now()-interval '11 minutes' where question_id=$1`, [second]);
    const full = await as(admin, 'select admin_get_live_ink($1,$2,null) r', [attempt,question]);
    const delta = await as(admin, 'select admin_get_live_ink($1,$2,0) r', [attempt,question]);
    assert.equal(delta.mode, 'delta'); assert.deepEqual(delta.batches.map(b => b.revision), [1,2,3]);
    assert.deepEqual(applyLiveInk({ revision: 0, strokes: [] }, delta), applyLiveInk(null, full));
    assert.deepEqual(await as(admin, 'select admin_get_live_ink($1,$2,3) r', [attempt,question]), { mode: 'delta', revision: 3, batches: [] });
    await db.exec('delete from exam_ink_replay_batches where revision=2');
    assert.equal((await as(admin, 'select admin_get_live_ink($1,$2,0) r', [attempt,question])).mode, 'full');
    assert.equal((await as(admin, 'select admin_get_live_ink($1,$2,4) r', [attempt,question])).mode, 'full');
    await db.exec(`update exam_attempt_ink set revision=25 where question_id='${question}'`);
    assert.equal((await as(admin, 'select admin_get_live_ink($1,$2,0) r', [attempt,question])).mode, 'full');
    await assert.rejects(as(admin, 'select admin_get_live_ink($1,$2,null) r', [attempt,admin]), /EXAM_ATTEMPT_NOT_FOUND/);
    await db.exec(`update exam_attempt_ink set updated_at=now()-interval '11 minutes'`);
    assert.deepEqual(await as(admin, 'select admin_list_live_exam_papers() r'), []);
    assert.deepEqual(await as(admin, "select admin_get_live_exam('paper') r"), []);
    await db.exec(`update exam_attempt_ink set updated_at=now(); update exam_attempts set status='submitted'`);
    assert.deepEqual(await as(admin, 'select admin_list_live_exam_papers() r'), []);
    assert.deepEqual(await as(admin, "select admin_get_live_exam('paper') r"), []);
    await db.exec(`update exam_attempts set status='in_progress', student_id='${admin}'`);
    assert.deepEqual(await as(admin, 'select admin_list_live_exam_papers() r'), []);
    const flags = (await db.query(`select prosecdef, proconfig, has_function_privilege('anon', oid, 'execute') anon from pg_proc where proname like 'admin_%live%'`)).rows;
    assert.equal(flags.length, 3);
    for (const flag of flags) { assert.equal(flag.prosecdef, true); assert.deepEqual(flag.proconfig, ['search_path=""']); assert.equal(flag.anon, false); }
    for (let i = 10; i < 24; i++) {
      const id = `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`;
      await db.query(`insert into exam_attempts values ($1,$1,'many','in_progress');`, [id]);
      await db.query(`insert into exam_attempt_items values ($1,$2,null)`, [id,question]);
      await db.query(`insert into exam_attempt_ink values ($1,$2,0,'[]',now()-($3 * interval '1 second'))`, [id,question,i]);
    }
    assert.deepEqual(await as(admin, 'select admin_list_live_exam_papers() r'), [{ paperId: 'many', liveCount: 14 }]);
    const many = await as(admin, "select admin_get_live_exam('many') r");
    assert.equal(many.length, 12, 'view limits membership to twelve cells');
    assert.deepEqual(many.map(row => row.attemptId), Array.from({ length: 12 }, (_, i) =>
      `00000000-0000-0000-0000-${String(i + 10).padStart(12, '0')}`), '12명 초과 시 이름과 무관하게 최근 활동 12명을 선택한다');
  } finally { await db.close(); }
});
