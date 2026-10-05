import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
let PGlite: any;
try { const pkg = '@electric-sql/pglite'; PGlite = (await import(pkg)).PGlite; } catch { /* 기존 로컬 테스트 의존성 */ }
test('assist RLS: 응시 소유자 read·관리자 write·presence/anon/넓은 기존 정책 차단·Live 회귀', { skip: !PGlite }, async () => {
  const db = new PGlite();
  const admin = '00000000-0000-0000-0000-000000000001';
  const student = '00000000-0000-0000-0000-000000000002';
  const other = '00000000-0000-0000-0000-000000000003';
  const active = '10000000-0000-0000-0000-000000000001';
  const submitted = '10000000-0000-0000-0000-000000000002';
  try {
    await db.exec(`create role authenticated; create role anon;
      create schema auth; create schema private; create schema realtime;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
      create function private.is_current_user_admin() returns boolean language sql stable as $$ select coalesce(auth.uid()='${admin}'::uuid,false) $$;
      create table public.exam_attempts(id uuid primary key, student_id uuid, paper_id text, status text);
      alter table public.exam_attempts enable row level security;
      create policy own_attempt on public.exam_attempts for select to authenticated using(student_id=(select auth.uid()));
      create table realtime.messages(extension text);
      alter table realtime.messages enable row level security;
      grant usage on schema auth,private,realtime to authenticated,anon;
      grant select on public.exam_attempts to authenticated;
      grant select,insert on realtime.messages to authenticated,anon;
      insert into exam_attempts values ('${active}','${student}','paper','in_progress'),('${submitted}','${student}','finished','submitted');
      insert into realtime.messages values ('broadcast'),('presence');
      create policy broad_read on realtime.messages for select to authenticated,anon using(true);
      create policy broad_write on realtime.messages for insert to authenticated,anon with check(true);`);
    for (const name of ['20261004150000_exam_live_broadcast.sql', '20261004180000_exam_live_broadcast_fix.sql', '20261005140000_exam_live_assist.sql']) {
      await db.exec(fs.readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    }
    const as = async (uid: string, topic: string, sql: string) => {
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('realtime.topic',$2,false)", [uid, topic]);
      await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`);
      try { return await db.query(sql); } finally { await db.exec('reset role'); }
    };
    const read = async (uid: string, topic: string) => (await as(uid, topic, 'select distinct extension from realtime.messages')).rows.map((r: any) => r.extension).sort();
    const send = (uid: string, topic: string, extension = 'broadcast') => as(uid, topic, `insert into realtime.messages values ('${extension}')`);
    const topic = `exam-assist:${active}`;
    assert.deepEqual(await read(student, topic), ['broadcast'], '본인 private 채널 join 가능');
    assert.deepEqual(await read(admin, topic), ['broadcast']);
    for (const uid of [other, '']) assert.deepEqual(await read(uid, topic), []);
    for (const uid of [student, other, '']) await assert.rejects(send(uid, topic), /row-level security/);
    await send(admin, topic);
    for (const uid of [student, admin]) await assert.rejects(send(uid, topic, 'presence'), /row-level security/);
    assert.deepEqual(await read(student, `exam-assist:${submitted}`), []);
    for (const bad of ['exam-assist:', 'exam-assist:bad-uuid', `${topic}:extra`, 'exam-assist:10000000-0000-0000-0000-00000000000Z']) {
      assert.deepEqual(await read(student, bad), []);
      assert.deepEqual(await read(admin, bad), []);
      await assert.rejects(send(admin, bad), /row-level security/);
    }
    assert.deepEqual(await read(student, 'exam-live:paper'), ['presence']);
    assert.deepEqual(await read(admin, 'exam-live:paper'), ['broadcast','presence']);
    assert.deepEqual(await read(student, 'exam-live-watch:paper'), ['broadcast']);
    assert.deepEqual(await read(other, 'exam-live-watch:paper'), []);
    await send(student, 'exam-live:paper');
    await assert.rejects(send(student, 'exam-live-watch:paper'), /row-level security/);
    assert.deepEqual(await read('', 'exam-live:paper'), []);
    await send(other, 'public-online', 'presence');
    assert.deepEqual(await read('', 'public-online'), ['broadcast','presence']);
  } finally { await db.close(); }
});
