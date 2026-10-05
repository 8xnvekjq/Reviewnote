import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { inkDelta } from '../../src/features/exam/ink/inkReplay.ts';
import { encodeInkEvents } from '../../src/features/exam/ink/inkCodec.ts';
import type { InkStroke } from '../../src/features/exam/contract.ts';
const pkg = '@electric-sql/pglite';
const { PGlite } = await import(pkg);
const { pgcrypto } = await import(`${pkg}/contrib/pgcrypto`);
const sql = (name: string) => fs.readFileSync(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const S1='00000000-0000-0000-0000-00000000000a', AD='00000000-0000-0000-0000-0000000000ad';
const id=(n: number)=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const strokes: InkStroke[]=Array.from({length:3},(_,n)=>({id:`ink-${n}`,tool:'pen',color:'#123456',size:4,
 points:Array.from({length:20},(_,i)=>({x:i/100,y:n/10,pressure:.5,t:i*20}))}));

test('solve time scalar calculation caps the ten-second tail',async()=>{
 const db=new PGlite();
 try {
  await db.exec('create schema private');
  const migration=sql('20261006110000_exam_solve_time');
  await db.exec(migration.slice(migration.indexOf('create or replace function private.exam_solve_ms'),migration.indexOf('create or replace function public.save_exam_ink_delta')));
  for(const [total,first,last,expected] of [
   [1980000,100000,120000,30000], [25000,100000,120000,25000],
   [5000,100000,120000,5000], [60000,100000,100000,10000],
   [0,100000,120000,0], [12345,null,null,12345],
  ]) {
   const result=await db.query('select private.exam_solve_ms($1,$2,$3) ms',[total,first,last]);
   assert.equal(result.rows[0].ms,expected);
  }
 } finally {await db.close();}
});

test('solve time backfill/write maintenance and teacher audio table/Storage RLS (PGlite)',async()=>{
 const db=new PGlite({extensions:{pgcrypto}});
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
-- emulate Supabase default privileges (new tables/functions granted to anon/authenticated)
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema private grant all on functions to anon, authenticated, service_role;
insert into auth.users values ('00000000-0000-0000-0000-00000000000a','s1'),('00000000-0000-0000-0000-00000000000b','s2'),('00000000-0000-0000-0000-0000000000ad','admin');
insert into private.app_admins values ('00000000-0000-0000-0000-0000000000ad');

 create table public.profiles(id uuid primary key,equipped_title text,school_grade text);
 create schema storage;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated,anon;
 grant select,insert,update,delete on storage.objects to authenticated,anon;
 `);
 for(const name of ['20261002120000_exam_practice','20261002180000_exam_practice_v2','20261002200000_exam_rounds',
 '20261002210000_exam_school_papers','20261003000000_exam_hanneung','20261003100000_exam_era_schema','20261003130000_exam_worksheets',
 '20261003010000_exam_ink_sync_admin','20261003020000_exam_ink_replay','20261003050000_exam_ink_delta','20261004010000_exam_ink_shapes',
 '20261004130000_exam_admin_live_view','20261004140000_exam_peer_solution','20261004220000_exam_peer_solution_unsure',
 '20261005000000_exam_peer_solution_animal_faces','20261005100000_exam_ink_capacity','20261005120000_exam_ink_compact','20261006100000_exam_peer_picker']) await db.exec(sql(name));
 const as=async(uid:string|null,query:string,args:unknown[]=[])=>{
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid??''}',false); set role ${uid?'authenticated':'anon'};`);
  try{return (await db.query(query,args)).rows;}finally{await db.exec('reset role');}
 };
 const start=async(uid:string)=>(await as(uid,`select start_exam_attempt('2025-06-math','free','미적분') r`))[0].r;
 const mine=await start(S1), teacher=await start(AD), q=teacher.questions[0].id;
 const save=async(attempt:string,uid:string,revision:number,from:InkStroke[],to:InkStroke[],at:number,batch:number)=>
  as(uid,'select save_exam_ink_delta_v2($1,$2,$3,false,$4::jsonb,$5,$6) r',[attempt,q,revision,JSON.stringify(encodeInkEvents([{...inkDelta(from,to,'draw',at),id:id(batch)}])),id(batch),createHash('sha256').update(to.map(s=>s.id).join('\n')).digest('hex')]);
 await save(teacher.id,AD,0,[],strokes.slice(0,1),100000,1000);
 await save(teacher.id,AD,1,strokes.slice(0,1),strokes,120000,1001);
 await db.query('update exam_attempt_items set time_spent_ms=1980000 where attempt_id=$1 and question_id=$2',[teacher.id,q]);
 const progressDefinitions=async()=> (await db.query(`select proname,pg_get_functiondef(p.oid) definition
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where (n.nspname='public' and proname='save_exam_progress')
     or (n.nspname='private' and proname in ('exam_apply_items','exam_attempt_payload')) order by proname`)).rows;
 const beforeProgress=await progressDefinitions();
 const itemColumns=async()=> (await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='exam_attempt_items' order by ordinal_position")).rows;
 const beforeColumns=await itemColumns();
 await db.exec(sql('20261006110000_exam_solve_time'));
 assert.deepEqual(await progressDefinitions(),beforeProgress,'progress save and snapshot SQL remain identical to main');
 assert.deepEqual(await itemColumns(),beforeColumns,'no item timing columns or item trigger required');
 const item=async(attempt=teacher.id)=> (await db.query(`select private.exam_solve_ms(i.time_spent_ms,k.first_input_at_ms,k.last_input_at_ms) solve_ms,
   k.first_input_at_ms,k.last_input_at_ms from exam_attempt_items i left join exam_attempt_ink k using(attempt_id,question_id)
   where i.attempt_id=$1 and i.question_id=$2`,[attempt,q])).rows[0];
 assert.deepEqual(await item(),{solve_ms:30000,first_input_at_ms:100000,last_input_at_ms:120000},'old replay backfills bounds and cuts idle total');
 const fresh=await start('00000000-0000-0000-0000-00000000000b');
 await save(fresh.id,'00000000-0000-0000-0000-00000000000b',0,[],strokes.slice(0,1),100000,1010);
 await save(fresh.id,'00000000-0000-0000-0000-00000000000b',1,strokes.slice(0,1),strokes,120000,1011);
 await db.query('update exam_attempt_items set time_spent_ms=1980000 where attempt_id=$1 and question_id=$2',[fresh.id,q]);
 assert.deepEqual(await item(fresh.id),await item(),'old backfilled rows and new deltas compute identically');
 await save(fresh.id,'00000000-0000-0000-0000-00000000000b',2,strokes,strokes.slice(0,2),90000,1012);
 await save(fresh.id,'00000000-0000-0000-0000-00000000000b',3,strokes.slice(0,2),strokes,130000,1013);
 assert.deepEqual(await item(fresh.id),{solve_ms:50000,first_input_at_ms:90000,last_input_at_ms:130000},'late-arriving earlier input expands the first bound and new input expands the last');
 await db.query('update exam_attempt_items set time_spent_ms=12345 where attempt_id=$1 and question_id=$2',[mine.id,q]);
 assert.equal((await item(mine.id)).solve_ms,12345,'rows without replay timestamps retain visible time');
 const progress=async(total:number)=>as(AD,'select save_exam_progress($1,$2::jsonb,null) r',[teacher.id,JSON.stringify([{questionId:q,answer:'1',visits:1,timeSpentMs:total}])]);
 await progress(1980000); assert.equal((await item()).solve_ms,30000,'idle tail capped at ten seconds');
 await progress(25000); assert.equal((await item()).solve_ms,25000,'tail capped to actual visible total');
 await progress(5000); assert.equal((await item()).solve_ms,5000,'never exceeds visible total');
 await progress(60000);
 await save(teacher.id,AD,2,strokes,strokes.slice(0,2),150000,1002);
 assert.deepEqual(await item(),{solve_ms:60000,first_input_at_ms:100000,last_input_at_ms:150000},'delta maintains scalar bounds');
 // 같은 배치를 재시도해도 시각과 리비전은 바뀌지 않는다.
 await save(teacher.id,AD,2,strokes,strokes.slice(0,2),150000,1002);
 assert.equal((await item()).last_input_at_ms,150000);
 // 충분한 필기로 되돌리고 제출된 관리자만 공개한다.
 await save(teacher.id,AD,3,strokes.slice(0,2),strokes,155000,1003);
 assert.equal((await item()).solve_ms,60000,'new bounds still capped to time spent');
 await save(teacher.id,AD,4,strokes,strokes.slice(0,2),110000,1004);
 assert.deepEqual(await item(),{solve_ms:60000,first_input_at_ms:100000,last_input_at_ms:155000},'out-of-order input cannot shrink bounds');
 await save(teacher.id,AD,5,strokes.slice(0,2),strokes,155000,1005);
 await db.exec(sql('20261006120000_exam_teacher_audio'));
 assert.deepEqual((await db.query('select public,file_size_limit from storage.buckets')).rows[0],{public:false,file_size_limit:52428800});
 const clipId=id(2000),path=`${teacher.id}/${q}/${clipId}.webm`;
 const insertClip=(uid:string|null,clip=clipId,attempt=teacher.id,storagePath=path)=>as(uid,`insert into exam_solution_audio(id,attempt_id,question_id,started_at_ms,duration_ms,mime,size_bytes,storage_path) values($1,$2,$3,95000,70000,'audio/webm;codecs=opus',480000,$4)`,[clip,attempt,q,storagePath]);
 await assert.rejects(insertClip(S1),/row-level security/);
 await assert.rejects(insertClip(null),/permission denied/);
 await assert.rejects(insertClip(AD,id(2001),mine.id,`${mine.id}/${q}/${id(2001)}.webm`),/row-level security/,'admin cannot write another owner');
 await assert.rejects(as(S1,"insert into storage.objects(bucket_id,name) values('exam-solution-audio',$1)",[path]),/row-level security/);
 await assert.rejects(as(null,"insert into storage.objects(bucket_id,name) values('exam-solution-audio',$1)",[path]),/row-level security/);
 await assert.rejects(as(AD,"insert into storage.objects(bucket_id,name) values('exam-solution-audio',$1)",[`${mine.id}/${q}/${id(2001)}.webm`]),/row-level security/);
 await as(AD,"insert into storage.objects(bucket_id,name) values('exam-solution-audio',$1)",[path]);
 assert.equal((await as(S1,'select * from storage.objects')).length,0,'unregistered objects are hidden');
 await insertClip(AD);
 assert.equal((await as(S1,'select * from exam_solution_audio')).length,0,'unsubmitted teacher clip is hidden');
 assert.equal((await as(S1,'select * from storage.objects')).length,0);
 assert.equal((await as(AD,'select * from exam_solution_audio')).length,1);
 const own=(await as(AD,'select get_exam_ink_replay_v2($1,$2) r',[teacher.id,q]))[0].r;
 assert.equal(own.audioOriginMs,100000); assert.equal(own.audioClips[0].offsetMs,-5000);
 const audioOnlyQuestion=teacher.questions[1].id, audioOnlyId=id(2010),audioOnlyId2=id(2011);
 await as(AD,`insert into exam_solution_audio(id,attempt_id,question_id,started_at_ms,duration_ms,mime,size_bytes,storage_path) values
 ($1,$2,$3,200000,10000,'audio/mp4',1000,$4),($5,$2,$3,220000,5000,'audio/mp4',500,$6)`,
 [audioOnlyId,teacher.id,audioOnlyQuestion,`${teacher.id}/${audioOnlyQuestion}/${audioOnlyId}.m4a`,audioOnlyId2,`${teacher.id}/${audioOnlyQuestion}/${audioOnlyId2}.m4a`]);
 const noInk=(await as(AD,'select get_exam_ink_replay_v2($1,$2) r',[teacher.id,audioOnlyQuestion]))[0].r;
 assert.equal(noInk.audioOriginMs,200000); assert.deepEqual(noInk.audioClips.map((c:{offsetMs:number})=>c.offsetMs),[0,20000]);
 const answers=teacher.questions.map((x: {id:string})=>({questionId:x.id,answer:'1',unsure:false,timeSpentMs:60000,visits:1}));
 await as(AD,'select submit_exam_attempt($1,$2::jsonb,null)',[teacher.id,JSON.stringify(answers)]);
 assert.equal((await as(S1,'select * from exam_solution_audio')).length,3,'submitted admin clips visible to authenticated students');
 assert.equal((await as(S1,'select * from storage.objects')).length,1);
 await assert.rejects(as(null,'select * from exam_solution_audio'),/permission denied/);
 assert.equal((await as(null,'select * from storage.objects')).length,0);
 assert.equal((await as(AD,'update storage.objects set name=name returning id')).length,0,'no object overwrite policy');
 await db.query("update exam_attempts set status='submitted',submitted_at=now() where id=$1",[mine.id]);
 await db.query('update exam_attempt_items set is_correct=false where attempt_id=$1 and question_id=$2',[mine.id,q]);
 const rows=(await as(S1,'select list_peer_solutions_v2($1,$2) r',[mine.id,q]))[0].r;
 const row=rows.find((x:{label:{isTeacher:boolean}})=>x.label.isTeacher);
 assert.ok(row.hasAudio); assert.equal(row.timeSpentMs,60000);
 const selected=(await as(S1,'select get_peer_solution_by_key_v2($1,$2,$3) r',[mine.id,q,row.solutionKey]))[0].r;
 assert.equal(selected.audioClips[0].offsetMs,-5000); assert.equal(selected.batches[0].events[0].at,0);
 await db.query("update exam_attempts set status='in_progress',submitted_at=null where id=$1",[teacher.id]);
 assert.equal((await as(S1,'select * from storage.objects')).length,0);
 await assert.rejects(as(S1,'select get_peer_solution_by_key_v2($1,$2,$3) r',[mine.id,q,row.solutionKey]),/EXAM_PEER_CHANGED/);
 const candidate=sql('20261006110000_exam_solve_time').split('create or replace function private.exam_peer_candidates')[1];
 assert.ok(!/jsonb_array_elements|\bstrokes\b|exam_ink_replay_batches/.test(candidate),'listing uses scalars only');
 } finally {await db.close();}
});
