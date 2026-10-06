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

test('teacher audio delete/reset RLS, atomic reset RPC and admin-only ink edits on a submitted attempt (PGlite)',async()=>{
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
 '20261005000000_exam_peer_solution_animal_faces','20261005100000_exam_ink_capacity','20261005120000_exam_ink_compact','20261006100000_exam_peer_picker','20261006110000_exam_solve_time','20261006120000_exam_teacher_audio',
 '20261006160000_exam_teacher_audio_reset']) await db.exec(sql(name));
 const as=async(uid:string|null,query:string,args:unknown[]=[])=>{
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid??''}',false); set role ${uid?'authenticated':'anon'};`);
  try{return (await db.query(query,args)).rows;}finally{await db.exec('reset role');}
 };
 const start=async(uid:string)=>(await as(uid,`select start_exam_attempt('2025-06-math','free','미적분') r`))[0].r;
 const mine=await start(S1), teacher=await start(AD), q=teacher.questions[0].id, q2=teacher.questions[1].id;
 const hash=(to:InkStroke[])=>createHash('sha256').update(to.map(s=>s.id).join('\n')).digest('hex');
 const save=async(attempt:string,uid:string,question:string,revision:number,from:InkStroke[],to:InkStroke[],at:number,batch:number)=>
  as(uid,'select save_exam_ink_delta_v2($1,$2,$3,false,$4::jsonb,$5,$6) r',[attempt,question,revision,JSON.stringify(encodeInkEvents([{...inkDelta(from,to,'draw',at),id:id(batch)}])),id(batch),hash(to)]);
 for(const question of [q,q2]) {
  await save(teacher.id,AD,question,0,[],strokes.slice(0,1),100000,question===q?1000:1100);
  await save(teacher.id,AD,question,1,strokes.slice(0,1),strokes,120000,question===q?1001:1101);
 }
 const clip=(n:number,question=q,attempt=teacher.id,started=95000+n)=>({id:id(n),path:`${attempt}/${question}/${id(n)}.webm`,attempt,question,started});
 const addClip=async(uid:string,c:ReturnType<typeof clip>)=>{
  await as(uid,"insert into storage.objects(bucket_id,name) values('exam-solution-audio',$1)",[c.path]);
  await as(uid,`insert into exam_solution_audio(id,attempt_id,question_id,started_at_ms,duration_ms,mime,size_bytes,storage_path) values($1,$2,$3,$4,5000,'audio/webm;codecs=opus',1000,$5)`,[c.id,c.attempt,c.question,c.started,c.path]);
 };
 const [c1,c2,c3,other]=[clip(2001),clip(2002,q,teacher.id,80000),clip(2003),clip(2004,q2)];
 for(const c of [c1,c2,c3,other]) await addClip(AD,c);
 const answers=teacher.questions.map((x:{id:string})=>({questionId:x.id,answer:'1',unsure:false,timeSpentMs:60000,visits:1}));
 await as(AD,'select submit_exam_attempt($1,$2::jsonb,null)',[teacher.id,JSON.stringify(answers)]);
 await db.query("update exam_attempts set status='submitted',submitted_at=now() where id=$1",[mine.id]);
 await db.query('update exam_attempt_items set is_correct=false where attempt_id=$1 and question_id=$2',[mine.id,q]);
 const count=async(table:string)=>Number((await db.query(`select count(*)::int n from ${table}`)).rows[0].n);

 // 학생은 아무것도 지울 수 없다(보이는 행이라도).
 assert.equal((await as(S1,'delete from exam_solution_audio returning id')).length,0,'students cannot delete clip rows');
 assert.equal((await as(S1,"delete from storage.objects where bucket_id='exam-solution-audio' returning id")).length,0,'students cannot delete objects');
 await assert.rejects(as(null,'delete from exam_solution_audio'),/permission denied/);
 await assert.rejects(as(S1,'select reset_exam_question_solution($1,$2)',[teacher.id,q]),/EXAM_ATTEMPT_NOT_FOUND/);
 await assert.rejects(as(S1,'select reset_exam_question_solution($1,$2)',[mine.id,q]),/EXAM_ATTEMPT_NOT_FOUND/,'students cannot reset even their own attempt');
 await assert.rejects(as(null,'select reset_exam_question_solution($1,$2)',[teacher.id,q]),/permission denied/);
 assert.equal(await count('exam_solution_audio'),4);

 // 관리자도 다른 사람 응시의 녹음·객체는 못 지운다.
 const foreign=clip(2005,q,mine.id);
 await db.query("insert into storage.objects(bucket_id,name) values('exam-solution-audio',$1)",[foreign.path]);
 assert.equal((await as(AD,'delete from storage.objects where name=$1 returning id',[foreign.path])).length,0);
 await assert.rejects(as(AD,'select reset_exam_question_solution($1,$2)',[mine.id,q]),/EXAM_ATTEMPT_NOT_FOUND/);

 // 녹음 하나 지우기: 행 → 객체. 남은 녹음의 offset은 필기 시작 기준 그대로.
 assert.deepEqual((await as(AD,'delete from exam_solution_audio where id=$1 returning storage_path',[c1.id])).map(r=>r.storage_path),[c1.path]);
 assert.equal((await as(AD,'delete from storage.objects where name=$1 returning id',[c1.path])).length,1);
 const replay=async(question=q)=>(await as(AD,'select get_exam_ink_replay_v2($1,$2) r',[teacher.id,question]))[0].r;
 const afterOne=await replay();
 assert.deepEqual(afterOne.audioClips.map((c:{id:string;offsetMs:number})=>[c.id,c.offsetMs]),[[c2.id,-20000],[c3.id,-2997]]);
 assert.equal(afterOne.audioOriginMs,100000);
 const peers=async()=>(await as(S1,'select list_peer_solutions_v2($1,$2) r',[mine.id,q]))[0].r.find((x:{label:{isTeacher:boolean}})=>x.label.isTeacher);
 assert.equal((await peers()).hasAudio,true);
 const peerAudio=(await as(S1,'select get_peer_solution_by_key_v2($1,$2,$3) r',[mine.id,q,(await peers()).solutionKey]))[0].r.audioClips;
 assert.deepEqual(peerAudio.map((c:{id:string})=>c.id),[c2.id,c3.id]);

 // 처음부터 다시: 그 문항 녹음·재생 기록·필기만 한 번에 지우고, 다른 문항은 그대로.
 const before=(await db.query('select revision from exam_attempt_ink where attempt_id=$1 and question_id=$2',[teacher.id,q])).rows[0].revision;
 const reset=(await as(AD,'select reset_exam_question_solution($1,$2) r',[teacher.id,q]))[0].r;
 assert.deepEqual(reset,{revision:before+1,storagePaths:[c2.path,c3.path].sort()});
 assert.deepEqual((await db.query('select id from exam_solution_audio order by id')).rows.map(r=>r.id),[other.id],"only that question's clips are gone");
 assert.equal(Number((await db.query('select count(*)::int n from exam_ink_replay_batches where attempt_id=$1 and question_id=$2',[teacher.id,q])).rows[0].n),0);
 assert.equal(Number((await db.query('select count(*)::int n from exam_ink_replay_batches where attempt_id=$1 and question_id=$2',[teacher.id,q2])).rows[0].n),2);
 assert.deepEqual((await db.query('select strokes,stroke_count,point_count,first_input_at_ms,last_input_at_ms from exam_attempt_ink where attempt_id=$1 and question_id=$2',[teacher.id,q])).rows[0],
  {strokes:[],stroke_count:0,point_count:0,first_input_at_ms:null,last_input_at_ms:null});
 const empty=await replay();
 assert.deepEqual(empty.audioClips,[]); assert.deepEqual(empty.batches,[]); assert.deepEqual(empty.strokes,[]); assert.equal(empty.audioOriginMs,0);
 assert.equal(await peers(),undefined,'an emptied teacher solution is no longer listed');
 assert.equal((await replay(q2)).audioClips.length,1);
 // 객체는 클라이언트가 Storage API로 지운다(정책 확인).
 for(const path of reset.storagePaths) assert.equal((await as(AD,'delete from storage.objects where name=$1 returning id',[path])).length,1);
 // 빈 문항을 다시 처음부터 해도 문제없다.
 assert.deepEqual((await as(AD,'select reset_exam_question_solution($1,$2) r',[teacher.id,q]))[0].r,{revision:before+2,storagePaths:[]});

 // 옛 revision의 batch는 충돌로 거절되고, 새 revision에서 다시 푼 풀이와 녹음은 깨끗한 시계로 재생된다.
 await assert.rejects(save(teacher.id,AD,q,before,strokes,strokes.slice(0,1),130000,1002),/EXAM_INK_CONFLICT/);
 await save(teacher.id,AD,q,before+2,[],strokes.slice(0,1),500000,1003);
 await save(teacher.id,AD,q,before+3,strokes.slice(0,1),strokes,510000,1004);
 await addClip(AD,clip(2006,q,teacher.id,499000));
 const fresh=await replay();
 assert.equal(fresh.audioOriginMs,500000);
 assert.deepEqual(fresh.audioClips.map((c:{offsetMs:number})=>c.offsetMs),[-1000]);
 assert.equal(fresh.batches[0].baseRevision,before+2); assert.deepEqual(fresh.batches[0].baseline,[]);
 const listed=await peers();
 assert.equal(listed.hasAudio,true);
 const peer=(await as(S1,'select get_peer_solution_by_key_v2($1,$2,$3) r',[mine.id,q,listed.solutionKey]))[0].r;
 assert.equal(peer.batches[0].events[0].at,0); assert.equal(peer.audioClips[0].offsetMs,-1000);
 assert.equal((await db.query('select first_input_at_ms from exam_attempt_ink where attempt_id=$1 and question_id=$2',[teacher.id,q])).rows[0].first_input_at_ms,500000);

 // 제출한 학생 응시는 여전히 필기를 고칠 수 없다(관리자 본인만 예외).
 await assert.rejects(save(mine.id,S1,q,0,[],strokes.slice(0,1),100000,1200),/EXAM_INK_SUBMITTED/);
 assert.equal(await count('exam_solution_audio'),2);
 } finally {await db.close();}
});
