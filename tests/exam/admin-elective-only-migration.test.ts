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

test('관리자 선택과목만 풀기: 그 선택과목 문항만, 관리자만, 이어 풀기 규칙 그대로 (PGlite)',async()=>{
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
 '20261006160000_exam_teacher_audio_reset','20261006180000_exam_teacher_check_publish','20261009200000_exam_peer_for_correct','20261010130000_exam_admin_elective_only']) await db.exec(sql(name));
 const as=async(uid:string|null,query:string,args:unknown[]=[])=>{
  await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid??''}',false); set role ${uid?'authenticated':'anon'};`);
  try{return (await db.query(query,args)).rows;}finally{await db.exec('reset role');}
 };
 const start=async(uid:string)=>(await as(uid,`select start_exam_attempt('2025-06-math','free','미적분') r`))[0].r;
 const startOnly=async(uid:string,elective='미적분',mode='free')=>(await as(uid,'select admin_start_elective_only_attempt($1,$2,$3) r',['2025-06-math',mode,elective]))[0].r;
 const items=async(attempt:string)=>(await db.query<{section:string;n:number}>('select q.section, count(*)::int n from exam_attempt_items i join exam_questions q on q.id=i.question_id where i.attempt_id=$1 group by q.section',[attempt])).rows;
 // 관리자: 미적분만 → 미적분 구역 문항만(공통 없음).
 const only=await startOnly(AD);
 const mine=await items(only.id);
 assert.deepEqual(mine.map(r=>r.section),['미적분']);
 assert.ok(mine[0].n>0);
 assert.ok(only.questions.every((q:{section:string})=>q.section==='미적분'));
 // 진행 중이면 그 응시를 이어 연다(새로 만들지 않는다).
 assert.equal((await startOnly(AD,'기하')).id,only.id);
 // 학생은 쓸 수 없다. 선택과목이 틀리면 거절.
 await assert.rejects(startOnly(S1),/EXAM_ADMIN_REQUIRED/);
 await db.query("update exam_attempts set status='submitted', submitted_at=now() where id=$1",[only.id]);
 await assert.rejects(startOnly(AD,'없는과목'),/EXAM_INVALID_ELECTIVE/);
 // 일반 시작은 그대로 공통+선택.
 const full=await start(S1);
 assert.deepEqual((await items(full.id)).map(r=>r.section).sort(),['common','미적분'].sort());
 const grants=(await db.query<{anon:boolean;auth:boolean}>(`select has_function_privilege('anon','public.admin_start_elective_only_attempt(text,text,text)','execute') anon,
   has_function_privilege('authenticated','public.admin_start_elective_only_attempt(text,text,text)','execute') auth`)).rows[0];
 assert.equal(grants.anon,false); assert.equal(grants.auth,true);
 } finally {await db.close();}
});
