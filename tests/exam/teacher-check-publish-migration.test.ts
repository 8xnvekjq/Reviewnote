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
const S2='00000000-0000-0000-0000-00000000000b';

test('teacher 채점해 보기 publishes that question only (ink + audio); submitted behavior and student rules unchanged (PGlite)',async()=>{
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
 '20261006160000_exam_teacher_audio_reset','20261006180000_exam_teacher_check_publish','20261009200000_exam_peer_for_correct']) await db.exec(sql(name));
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
 const old=await start(AD), q=old.questions[0].id, q2=old.questions[1].id;
 // 옛날에 제출한 선생님 응시(q만 풀이).
 await solve(old.id,AD,q);
 await submitAll(AD,old);
 await db.query("update exam_attempts set submitted_at=now()-interval '1 day' where id=$1",[old.id]);
 // 학생 S1: 제출, q·q2 모두 오답 → 다른 풀이를 볼 수 있다.
 const mine=await start(S1);
 await submitAll(S1,mine);
 await db.query('update exam_attempt_items set is_correct=false where attempt_id=$1',[mine.id]);
 // 새 선생님 응시(진행 중, 자유 모드): q·q2 모두 필기+녹음.
 const teacher=await start(AD);
 assert.notEqual(teacher.id,old.id);
 for(const question of [q,q2]) await solve(teacher.id,AD,question);
 const [cq,cq2]=[await addClip(teacher.id,q),await addClip(teacher.id,q2)];
 const keyFor=async(peer:string,question:string)=>{
  const rev=(await db.query('select revision from exam_attempt_ink where attempt_id=$1 and question_id=$2',[peer,question])).rows[0].revision;
  return createHash('md5').update(`${S1}:${question}:${mine.id}:${peer}:${rev}`).digest('hex');
 };
 type Row={solutionKey:string;hasAudio:boolean;label:{isTeacher:boolean;face:string}};
 const list=async(question:string)=>(await as(S1,'select list_peer_solutions_v2($1,$2) r',[mine.id,question]))[0].r as Row[];
 const teacherRow=async(question:string)=>(await list(question)).find(x=>x.label.isTeacher);
 const visibleClips=async()=>(await as(S1,'select id from exam_solution_audio order by id')).map(r=>r.id);
 const visibleObjects=async()=>(await as(S1,'select name from storage.objects order by name')).map(r=>r.name);

 // 채점 전: 진행 중 응시는 비공개, 옛 제출 응시가 선생님 풀이로 뽑힌다.
 assert.equal((await teacherRow(q))?.solutionKey,await keyFor(old.id,q));
 assert.equal((await teacherRow(q))?.hasAudio,false);
 assert.equal(await teacherRow(q2),undefined);
 assert.deepEqual(await visibleClips(),[]); assert.deepEqual(await visibleObjects(),[]);

 // 선생님이 q를 (틀린 답으로) 채점해 보기 → q만 공개된다. 선생님 풀이는 정답 여부와 상관없다.
 assert.equal((await check(AD,teacher.id,q,await wrong(q)))[0].r.isCorrect,false);
 const row=await teacherRow(q);
 assert.ok(row); assert.equal(row.solutionKey,await keyFor(teacher.id,q),'the newer checked in-progress item beats the older submitted attempt');
 assert.equal(row.hasAudio,true); assert.equal(row.label.face,'🎓');
 assert.equal((await list(q)).at(-1)?.label.isTeacher,true,'teacher stays last (position 5)');
 const peer=(await as(S1,'select get_peer_solution_by_key_v2($1,$2,$3) r',[mine.id,q,row.solutionKey]))[0].r;
 assert.deepEqual(peer.audioClips.map((c:{id:string})=>c.id),[cq.id]);
 assert.ok(peer.batches.length>0);
 assert.equal(await teacherRow(q2),undefined,'unchecked question stays private');
 assert.deepEqual(await visibleClips(),[cq.id],'only the checked question clip row is readable');
 assert.deepEqual(await visibleObjects(),[cq.path],'only the checked question object is readable');
 assert.equal((await as(AD,'select count(*)::int n from exam_solution_audio'))[0].n,2,'admins keep reading everything');
 assert.equal((await as(null,'select * from storage.objects')).length,0,'anon reads nothing');

 // 가장 최근 선생님 풀이 선택: 채점 시각이 옛 제출보다 이르면 옛 제출이 뽑힌다.
 await db.query("update exam_attempt_items set checked_at=now()-interval '2 days' where attempt_id=$1 and question_id=$2",[teacher.id,q]);
 assert.equal((await teacherRow(q))?.solutionKey,await keyFor(old.id,q));
 assert.equal((await list(q)).filter(x=>x.label.isTeacher).length,1,'only one teacher solution');
 await db.query('update exam_attempt_items set checked_at=now() where attempt_id=$1 and question_id=$2',[teacher.id,q]);
 assert.equal((await teacherRow(q))?.solutionKey,await keyFor(teacher.id,q));

 // 실전 모드 진행 중 응시는 checked_at이 있어도(비정상 데이터) 열리지 않는다.
 await db.query("update exam_attempts set mode='real',time_limit_minutes=100 where id=$1",[teacher.id]);
 assert.equal((await teacherRow(q))?.solutionKey,await keyFor(old.id,q));
 assert.deepEqual(await visibleClips(),[]); assert.deepEqual(await visibleObjects(),[]);
 await db.query("update exam_attempts set mode='free',time_limit_minutes=null where id=$1",[teacher.id]);

 // 학생 규칙은 그대로: 진행 중 자유 모드에서 채점한 오답은 안 보이고 정답만 보인다.
 const other=await start(S2);
 for(const question of [q,q2]) await solve(other.id,S2,question);
 await check(S2,other.id,q,await wrong(q));
 await check(S2,other.id,q2,await key(q2));
 assert.equal((await list(q)).filter(x=>!x.label.isTeacher).length,0,'checked wrong student answer stays hidden');
 assert.equal((await list(q2)).filter(x=>!x.label.isTeacher).length,1,'checked correct student answer is shown');
 assert.equal(await teacherRow(q2),undefined);
 // 맞힌 학생도 다른 풀이를 본다(20261009200000): 자유 모드에서 정답으로 채점한 문항, 제출한 시험의 정답 문항. 채점 전 문항은 여전히 막힌다.
 const listAs=(uid:string,attempt:string,question:string)=>as(uid,'select list_peer_solutions_v2($1,$2) r',[attempt,question]);
 assert.ok(Array.isArray((await listAs(S2,other.id,q2))[0].r),'checked correct viewer allowed');
 await assert.rejects(listAs(S2,other.id,other.questions[2].id),/EXAM_PEER_NOT_ALLOWED/,'unchecked question stays closed');
 await db.query('update exam_attempt_items set is_correct=true,unsure=false where attempt_id=$1',[mine.id]);
 assert.ok((await list(q)).length>0,'submitted correct viewer allowed');
 await db.query('update exam_attempt_items set is_correct=false where attempt_id=$1',[mine.id]);
 // 학생은 녹음을 쓸 수 없다.
 await assert.rejects(as(S2,`insert into exam_solution_audio(id,attempt_id,question_id,started_at_ms,duration_ms,mime,size_bytes,storage_path) values($1,$2,$3,0,1,'audio/webm',1,$4)`,
  [id(3000),other.id,q2,`${other.id}/${q2}/${id(3000)}.webm`]),/row-level security/);

 // 채점한 문항을 처음부터 다시: checked_at은 남지만 빈 필기는 최소 기준에 못 미쳐 숨고, 옛 제출 풀이로 돌아간다.
 const reset=(await as(AD,'select reset_exam_question_solution($1,$2) r',[teacher.id,q]))[0].r;
 assert.deepEqual(reset.storagePaths,[cq.path]);
 assert.ok((await db.query('select checked_at from exam_attempt_items where attempt_id=$1 and question_id=$2',[teacher.id,q])).rows[0].checked_at);
 assert.equal((await teacherRow(q))?.solutionKey,await keyFor(old.id,q));
 // 다시 풀고 녹음하면 바로 다시 공개된다.
 const rev=(await db.query('select revision from exam_attempt_ink where attempt_id=$1 and question_id=$2',[teacher.id,q])).rows[0].revision;
 await save(teacher.id,AD,q,rev,[],strokes.slice(0,1),500000);
 await save(teacher.id,AD,q,rev+1,strokes.slice(0,1),strokes,510000);
 const again=await addClip(teacher.id,q);
 assert.equal((await teacherRow(q))?.solutionKey,await keyFor(teacher.id,q));
 assert.deepEqual(await visibleClips(),[again.id]);

 // 제출하면 지금과 똑같이 모든 문항이 열린다.
 await submitAll(AD,teacher);
 assert.equal((await teacherRow(q2))?.solutionKey,await keyFor(teacher.id,q2));
 assert.deepEqual((await visibleClips()).sort(),[again.id,cq2.id].sort());
 assert.deepEqual((await visibleObjects()).sort(),[again.path,cq2.path].sort());
 // 옛 제출 기준 함수는 그대로 남아 있다.
 assert.equal((await as(S1,'select private.exam_audio_can_read($1) r',[teacher.id]))[0].r,true);
 await db.query("update exam_attempts set status='in_progress',submitted_at=null where id=$1",[teacher.id]);
 assert.equal((await as(S1,'select private.exam_audio_can_read($1) r',[teacher.id]))[0].r,false,'old helper keeps submitted-only semantics');
 } finally {await db.close();}
});
