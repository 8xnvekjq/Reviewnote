import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

let PGlite: any;
try { const pkg = '@electric-sql/pglite'; PGlite = (await import(pkg)).PGlite; } catch { /* optional local test dependency */ }
test('private broadcast RLS: own active paper only; ink receive/admin signal send isolated; old policies cannot bypass', { skip: !PGlite }, async () => {
  const db = new PGlite();
  const admin = '00000000-0000-0000-0000-000000000001';
  const student = '00000000-0000-0000-0000-000000000002';
  const other = '00000000-0000-0000-0000-000000000003';
  try {
    await db.exec(`
      create role authenticated; create role anon;
      create schema auth; create schema private; create schema realtime;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
      create function private.is_current_user_admin() returns boolean language sql stable as $$ select coalesce(auth.uid() = '${admin}'::uuid,false) $$;
      create table public.exam_attempts(student_id uuid, paper_id text, status text);
      create unique index exam_attempts_in_progress_unique on public.exam_attempts(student_id,paper_id) where status='in_progress';
      alter table public.exam_attempts enable row level security;
      create policy own_attempt on public.exam_attempts for select to authenticated using(student_id=(select auth.uid()));
      create table realtime.messages(extension text);
      alter table realtime.messages enable row level security;
      grant usage on schema auth,private,realtime to authenticated,anon;
      grant select on public.exam_attempts to authenticated;
      grant select,insert on realtime.messages to authenticated,anon;
      insert into exam_attempts values ('${student}','paper','in_progress'), ('${student}','finished','submitted'), ('${other}','other','in_progress');
      insert into realtime.messages values ('broadcast'),('presence');
    `);
    await db.exec(fs.readFileSync(new URL('../../supabase/migrations/20261004150000_exam_live_broadcast.sql', import.meta.url), 'utf8'));
    const as = async (uid: string, topic: string, sql: string) => {
      await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('realtime.topic',$2,false)", [uid,topic]);
      await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`);
      try { return await db.query(sql); } finally { await db.exec('reset role'); }
    };
    const receive = async (uid: string, topic: string) => (await as(uid,topic,'select * from realtime.messages')).rows.length;
    const send = (uid: string, topic: string, extension = 'broadcast') => as(uid,topic,`insert into realtime.messages values ('${extension}')`);
    assert.equal(await receive(student,'exam-live:paper'),0);
    await send(student,'exam-live:paper');
    for (const topic of ['exam-live:other','exam-live:finished','exam-live:paper:extra','exam-live:','exam-live-watch:paper']) await assert.rejects(send(student,topic),/row-level security/);
    assert.equal(await receive(student,'exam-live-watch:paper'),2);
    assert.equal(await receive(student,'exam-live-watch:other'),0);
    assert.equal(await receive(student,'exam-live-watch:finished'),0);
    assert.equal(await receive(admin,'exam-live:paper'),2);
    await send(admin,'exam-live:paper'); await send(admin,'exam-live-watch:paper');
    await assert.rejects(send(student,'exam-live:paper','presence'),/row-level security/);
    await assert.rejects(send('','exam-live:paper'),/row-level security/);
    // Emulate a deployment with existing broad public presence/broadcast grants.
    await db.exec(`create policy existing_read on realtime.messages for select to authenticated using(true);
      create policy existing_write on realtime.messages for insert to authenticated with check(true);
      create policy existing_anon_read on realtime.messages for select to anon using(true);
      create policy existing_anon_write on realtime.messages for insert to anon with check(true);`);
    assert.equal(await receive(student,'exam-live:paper'),0);
    assert.equal(await receive(student,'exam-live-watch:other'),0);
    await assert.rejects(send(student,'exam-live-watch:paper'),/row-level security/);
    await assert.rejects(send(student,'exam-live:other'),/row-level security/);
    assert.equal(await receive('','exam-live:paper'),0);
    assert.equal(await receive('','exam-live-watch:paper'),0);
    await assert.rejects(send('','exam-live:paper'),/row-level security/);
    await assert.rejects(send('','exam-live-watch:paper'),/row-level security/);
    assert.equal(await receive(student,'public-online'),5);
    assert.equal(await receive('','public-online'),5);
    await send(student,'public-online','presence');
  } finally { await db.close(); }
});

