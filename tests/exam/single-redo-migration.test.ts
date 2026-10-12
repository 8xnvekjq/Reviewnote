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

test('한 문제 다시 풀기의 권한·집계 분리·정답 풀이 선택·필기와 음성 리플레이 검증',async()=>{
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

 create table public.profiles(id uuid primary key,equipped_title text,school_grade text,display_name text,nickname text,email text);
 create schema vault; create table vault.decrypted_secrets(name text,decrypted_secret text);
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
 '20261006160000_exam_teacher_audio_reset','20261006180000_exam_teacher_check_publish','20261009200000_exam_peer_for_correct']) await db.exec(sql(name));
 for (const name of ['20261009150000_exam_discord_alert','20261009210000_exam_admin_replay_compare','20261009220000_exam_admin_activity_mine',
 '20261010120000_exam_mock_2025_10','20261010130000_exam_admin_elective_only','20261011210000_exam_resume_discord',
 '20261011270000_exam_peer_admin_review','20261012200000_exam_mine_previous_solution','20261013000000_exam_teacher_single_redo']) {
   await db.exec(sql(name).replace('create extension if not exists pg_net;', ''));
 }
 const as=async(uid:string|null,query:string,args:unknown[]=[])=>{
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid??''}',false); set role ${uid?'authenticated':'anon'};`);
  try{return (await db.query(query,args)).rows;}finally{await db.exec('reset role');}
 };
 const start=async(uid:string)=>(await as(uid,`select start_exam_attempt('2025-06-math','free','미적분') r`))[0].r;
 const hash=(to:InkStroke[])=>createHash('sha256').update(to.map(s=>s.id).join('\n')).digest('hex');
 let batch=1000;
 const save=async(attempt:string,uid:string,question:string,revision:number,from:InkStroke[],to:InkStroke[],at:number)=>
  as(uid,'select save_exam_ink_delta_v2($1,$2,$3,false,$4::jsonb,$5,$6) r',[attempt,question,revision,JSON.stringify(encodeInkEvents([{...inkDelta(from,to,'draw',at),id:id(++batch)}])),id(batch),hash(to)]);
 const solve=async(attempt:string,uid:string,question:string)=>{
  await save(attempt,uid,question,0,[],strokes.slice(0,1),100000);
  await save(attempt,uid,question,1,strokes.slice(0,1),strokes,120000);
 };
 let clipN=2000;
 const addClip=async(attempt:string,question:string)=>{
  const clip=id(++clipN), path=`${attempt}/${question}/${clip}.webm`;
  await as(AD,"insert into storage.objects(bucket_id,name) values('exam-solution-audio',$1)",[path]);
  await as(AD,`insert into exam_solution_audio(id,attempt_id,question_id,started_at_ms,duration_ms,mime,size_bytes,storage_path) values($1,$2,$3,95000,5000,'audio/webm;codecs=opus',1000,$4)`,[clip,attempt,question,path]);
  return {id:clip,path};
 };
 const key=async(question:string)=>(await db.query('select answer from exam_answer_keys where question_id=$1',[question])).rows[0].answer as string;
 const wrong=async(question:string)=>(await key(question))==='1'?'2':'1';
 const check=(uid:string,attempt:string,question:string,answer:string)=>as(uid,'select check_exam_answer($1,$2,$3) r',[attempt,question,answer]);
 const submitAll=(uid:string,attempt:{id:string;questions:{id:string}[]})=>as(uid,'select submit_exam_attempt($1,$2::jsonb,null)',[attempt.id,
  JSON.stringify(attempt.questions.map(x=>({questionId:x.id,answer:'1',unsure:false,timeSpentMs:60000,visits:1})))]);
 const original=await start(AD), q=original.questions[0].id, q2=original.questions[1].id;
 await solve(original.id,AD,q); await solve(original.id,AD,q2);
 await check(AD,original.id,q,await key(q)); await check(AD,original.id,q2,await key(q2));
 await submitAll(AD,original);
 const student=await start(S1); await submitAll(S1,student);
 const redo=async(source=original.id,question=q,uid=AD)=>(await as(uid,'select admin_start_single_redo($1,$2) r',[source,question]))[0].r;
 const candidates=async(question=q)=>(await as(S1,'select list_peer_solutions_v2($1,$2) r',[student.id,question]))[0].r;
 const teacher=async(question=q)=>(await candidates(question)).find((r:any)=>r.label.isTeacher);
 const first=await teacher(), first2=await teacher(q2);
 assert.ok(first && first2);
 const before=(await db.query('select * from exam_attempts where id=$1',[original.id])).rows[0];
 await assert.rejects(redo(original.id,q,S1),/EXAM_ADMIN_REQUIRED/);
 await assert.rejects(redo(original.id,q,''),/permission denied/);
 await assert.rejects(redo(student.id,q),/EXAM_REDO_SOURCE_REQUIRED/);
 await assert.rejects(redo(original.id,id(9999)),/EXAM_REDO_SOURCE_REQUIRED/);
 const regular=await start(AD);
 const one=await redo();
 assert.notEqual(one.id,original.id); assert.notEqual(one.id,regular.id);
 assert.equal(one.attemptKind,'single_redo'); assert.equal(one.questions.length,1);
 assert.equal(one.questions[0].id,q); assert.equal(one.items.length,1);
 assert.equal((await redo()).id,one.id);
 assert.equal((await start(AD)).id,regular.id);
 assert.equal((await as(AD,"select get_active_exam_attempt('2025-06-math') r"))[0].r.id,regular.id);
 await assert.rejects(check(AD,one.id,q,await key(q)),/EXAM_REDO_SUBMIT_REQUIRED/);
 await assert.rejects(as(AD,'select submit_exam_attempt($1,$2::jsonb,null)',[one.id,'[]']),/EXAM_REDO_ANSWER_REQUIRED/);
 await solve(one.id,AD,q); const wrongClip=await addClip(one.id,q);
 const submit=async(attempt:string,answer:string)=>(await as(AD,'select submit_exam_attempt($1,$2::jsonb,null) r',[attempt,
   JSON.stringify([{questionId:q,answer,unsure:false,timeSpentMs:5000,visits:1}])]))[0].r;
 await submit(one.id,await wrong(q));
 assert.equal((await teacher()).solutionKey,first.solutionKey,'오답 다시 풀기는 이전 정답 풀이를 가리지 않는다');
 assert.equal((await teacher(q2)).solutionKey,first2.solutionKey,'다른 문항은 유지한다');
 assert.equal((await as(S1,'select * from exam_solution_audio where id=$1',[wrongClip.id])).length,0);
 assert.equal((await as(S1,'select * from storage.objects where name=$1',[wrongClip.path])).length,0);

 const two=await redo(); assert.notEqual(two.id,one.id);
 await solve(two.id,AD,q); const clip=await addClip(two.id,q);
 assert.equal((await teacher()).solutionKey,first.solutionKey,'제출 전에는 공개하지 않는다');
 const result=await submit(two.id,await key(q));
 assert.equal(result.items.length,1); assert.equal(result.items[0].isCorrect,true);
 const latest=await teacher(); assert.notEqual(latest.solutionKey,first.solutionKey); assert.equal(latest.hasAudio,true);
 assert.equal((await teacher(q2)).solutionKey,first2.solutionKey);
 const replay=(await as(S1,'select get_peer_solution_by_key_v2($1,$2,$3) r',[student.id,q,latest.solutionKey]))[0].r;
 assert.equal(replay.strokes.length,3); assert.equal(replay.batches.length,2);
 assert.equal(replay.audioClips[0].storagePath,clip.path); assert.equal(replay.audioClips[0].offsetMs,-5000);
 assert.equal((await as(S1,'select * from storage.objects where name=$1',[clip.path])).length,1);
 await assert.rejects(as(S1,'select get_peer_solution_by_key_v2($1,$2,$3)',[student.id,q,first.solutionKey]),/EXAM_PEER_CHANGED/);
 await assert.rejects(as(AD,'select add_exam_questions_to_mistakes($1,$2::uuid[],$3)',[two.id,[q],'https://example.test']),/EXAM_REDO_SOURCE_REQUIRED/);
 const row=(await db.query('select score, estimated_grade from exam_attempts where id=$1',[two.id])).rows[0];
 assert.equal(row.score,null); assert.equal(row.estimated_grade,null);
 assert.deepEqual((await db.query('select * from exam_attempts where id=$1',[original.id])).rows[0],before);
 assert.equal((await db.query('select count(*)::int n from private.exam_discord_notices where attempt_id=any($1)',[[one.id,two.id]])).rows[0].n,0);
 assert.equal((await db.query('select private.exam_discord_message($1,\'submit\') m',[two.id])).rows[0].m,null);
 const summaries=await as(AD,"select list_my_exam_results('2025-06-math') r");
 assert.deepEqual(summaries[0].r.map((r:any)=>r.attemptId),[original.id]);
 const history=(await as(AD,"select list_my_paper_history('2025-06-math',null) r"))[0].r;
 assert.equal(history.length,2);
 const submissions=(await as(AD,"select admin_list_paper_submissions('2025-06-math') r"))[0].r;
 assert.equal(submissions.find((r:any)=>r.isMine).attemptId,original.id);
 const activity=(await as(AD,'select admin_list_exam_paper_activity() r'))[0].r;
 const mine=activity.find((r:any)=>r.paperId==='2025-06-math').students.find((r:any)=>r.isMine);
 assert.equal(mine.attemptId,original.id); assert.equal(mine.attemptCount,2);
 const attempts=(await as(AD,'select admin_list_student_exam_attempts($1,0) r',[AD]))[0].r;
 assert.equal(attempts.length,2);
 const papers=(await as(AD,'select list_exam_papers_for_me() r'))[0].r;
 assert.equal(papers.find((p:any)=>p.id==='2025-06-math').resultCount,1);
 assert.equal((await db.query('select private.exam_attempt_round($1) r',[regular.id])).rows[0].r,2);
 assert.equal((await db.query('select private.exam_attempt_round($1) r',[two.id])).rows[0].r,null);
 // 자유 모드의 기존 선생님 오답도 필기·음성 모두 숨긴다.
 await solve(regular.id,AD,q); const checkedClip=await addClip(regular.id,q);
 await check(AD,regular.id,q,await wrong(q));
 assert.equal((await teacher()).solutionKey,latest.solutionKey);
 assert.equal((await as(S1,'select * from storage.objects where name=$1',[checkedClip.path])).length,0);
 // 관리자 본인 이전 풀이 접근과 학생 결과 검토 권한을 유지한다.
 assert.ok((await as(AD,'select list_peer_solutions_v2($1,$2) r',[original.id,q]))[0].r.some((r:any)=>r.label.isTeacher));
 assert.ok((await as(AD,'select list_peer_solutions_v2($1,$2) r',[student.id,q]))[0].r.some((r:any)=>r.label.isTeacher));
 } finally { await db.close(); }
});
