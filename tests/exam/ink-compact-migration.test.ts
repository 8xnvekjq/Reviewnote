import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { encodeInkStroke, decodeInkStroke, decodeInkPayload, encodeInkEvents } from '../../src/features/exam/ink/inkCodec.ts';
import { inkDelta, buildInkTimeline } from '../../src/features/exam/ink/inkReplay.ts';
import { applyLiveInk } from '../../src/features/exam/ink/inkLive.ts';
import type { InkStroke, InkReplayData, LiveInkResponse } from '../../src/features/exam/contract.ts';

let PGlite: any, pgcrypto: any;
try {
  const pkg = '@electric-sql/pglite';
  PGlite = (await import(pkg)).PGlite;
  pgcrypto = (await import(`${pkg}/contrib/pgcrypto`)).pgcrypto;
} catch { /* 기존 마이그레이션 테스트와 같은 선택 의존성 */ }
const sql = (name: string) => fs.readFileSync(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const stroke = (n: number): InkStroke => ({ id: `s${n}`, tool: 'pen', color: '#123456', size: 4,
  points: Array.from({ length: 40 }, (_, i) => ({ x: -.123456 + i * .002, y: 1.654321 + n * .01, pressure: i % 2 ? .5 : .72, t: i * 8.333 })) });

test('compact migration saves mixed ink and preserves old/new read, replay, peer, Live and authorization (PGlite)', { skip: !PGlite }, async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const me=id(1), other=id(2), admin=id(3), mine=id(10), peer=id(11), q=id(20);
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema private; create schema extensions;
      create extension pgcrypto schema extensions;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function private.is_current_user_admin() returns boolean language sql stable as $$ select coalesce(auth.uid()='${admin}'::uuid,false) $$;
      create table private.app_admins(user_id uuid primary key);
      insert into private.app_admins values ('${admin}');
      create table public.profiles(id uuid primary key, equipped_title text, school_grade text);
      create table public.exam_papers(id text primary key, kind text);
      create table public.exam_questions(id uuid primary key, paper_id text);
      create table public.exam_attempts(id uuid primary key, student_id uuid, paper_id text, status text,
        started_at timestamptz default now(), submitted_at timestamptz default now());
      create table public.exam_attempt_items(attempt_id uuid, question_id uuid, is_correct boolean, unsure boolean default false,
        time_spent_ms bigint, primary key(attempt_id,question_id));
      grant usage on schema public to authenticated, anon;
      insert into exam_papers values ('paper','suneung');
      insert into exam_questions values ('${q}','paper');
      insert into exam_attempts(id,student_id,paper_id,status) values ('${mine}','${me}','paper','in_progress'),('${peer}','${other}','paper','in_progress');
      insert into exam_attempt_items values ('${mine}','${q}',false,false,30000),('${peer}','${q}',true,false,30000);
      insert into profiles values ('${other}','도전자','고2');
    `);
    for (const migration of ['20261003010000_exam_ink_sync_admin','20261003020000_exam_ink_replay',
      '20261003050000_exam_ink_delta','20261004010000_exam_ink_shapes','20261004130000_exam_admin_live_view',
      '20261004140000_exam_peer_solution','20261004220000_exam_peer_solution_unsure',
      '20261005000000_exam_peer_solution_animal_faces','20261005100000_exam_ink_capacity','20261005120000_exam_ink_compact']) {
      await db.exec(sql(migration));
    }
    // 재적용 가능하며 권한도 그대로다.
    await db.exec(sql('20261005120000_exam_ink_compact'));
    const as = async (uid: string | null, query: string, params: unknown[] = []) => {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid ?? ''}',false); set role ${uid ? 'authenticated' : 'anon'};`);
      try { return (await db.query(query,params)).rows[0]?.r; } finally { await db.exec('reset role'); }
    };
    const save = async (uid: string, attempt: string, revision: number, events: unknown[], result: InkStroke[], batch: string, v2=true) =>
      as(uid,`select save_exam_ink_delta${v2 ? '_v2' : ''}($1,$2,$3,false,$4::jsonb,$5,$6) r`,
        [attempt,q,revision,JSON.stringify(events),batch,createHash('sha256').update(result.map(s=>s.id).join('\n')).digest('hex')]);
    const legacy=stroke(0), compact=stroke(1), extra=stroke(2);
    assert.equal(await save(me,mine,0,[inkDelta([], [legacy],'draw')],[legacy],id(100),false),1);
    const event=inkDelta([legacy],[legacy,compact],'draw');
    const wire=encodeInkEvents([event]);
    assert.equal(await save(me,mine,1,wire,[legacy,compact],id(101)),2);
    assert.equal(await save(me,mine,1,wire,[legacy,compact],id(101)),2,'exact batch retry is idempotent');
    const raw=(await as(me,'select get_exam_ink_v2($1) r',[mine]))[0];
    assert.ok('points' in raw.strokes[0]); assert.ok('p' in raw.strokes[1]);
    const decoded=[legacy,decodeInkStroke(encodeInkStroke(compact))];
    assert.deepEqual((await as(me,'select get_exam_ink($1) r',[mine]))[0].strokes,decoded);
    assert.deepEqual((await as(me,'select get_exam_ink_questions($1,$2) r',[mine,[q]]))[0].strokes,decoded);
    assert.deepEqual(decodeInkPayload<any>(await as(me,'select get_exam_ink_questions_v2($1,$2) r',[mine,[q]]))[0].strokes,decoded);
    assert.equal((await as(me,'select get_exam_ink_index_v2($1) r',[mine]))[0].revision,2);
    for (const suffix of ['', '_v2']) {
      const replay=decodeInkPayload<InkReplayData>(await as(me,`select get_exam_ink_replay${suffix}($1,$2) r`,[mine,q]));
      const timeline=buildInkTimeline(replay);
      assert.deepEqual(timeline.at(timeline.steps.length),decoded);
      const full=decodeInkPayload<LiveInkResponse>(await as(admin,`select admin_get_live_ink${suffix}($1,$2,null) r`,[mine,q]));
      const delta=decodeInkPayload<LiveInkResponse>(await as(admin,`select admin_get_live_ink${suffix}($1,$2,0) r`,[mine,q]));
      assert.deepEqual(applyLiveInk(null,full),applyLiveInk({revision:0,strokes:[]},delta));
      await assert.rejects(as(other,`select get_exam_ink${suffix}($1) r`,[mine]),/EXAM_ATTEMPT_NOT_FOUND/);
      await assert.rejects(as(me,`select admin_get_live_ink${suffix}($1,$2,null) r`,[mine,q]),/EXAM_ADMIN_REQUIRED/);
      await assert.rejects(as(null,`select get_exam_ink${suffix}($1) r`,[mine]),/permission denied/);
    }
    // 열린 구형 탭의 delta 추가는 이미 저장된 p 획을 보존한다.
    assert.equal(await save(me,mine,2,[inkDelta(decoded,[...decoded,extra],'draw')],[...decoded,extra],id(102),false),3);
    assert.ok('p' in (await as(me,'select get_exam_ink_v2($1) r',[mine]))[0].strokes[1]);
    await assert.rejects(save(me,mine,1,wire,decoded,id(103)),/EXAM_INK_CONFLICT/);
    const replacement=inkDelta([...decoded,extra],[compact],'undo');
    assert.equal(await save(me,mine,3,encodeInkEvents([replacement]),[compact],id(104)),4);
    assert.deepEqual((await as(me,'select get_exam_ink($1) r',[mine]))[0].strokes,[decodeInkStroke(encodeInkStroke(compact))]);
    const peerDrawing=[stroke(10),stroke(11),stroke(12)];
    assert.equal(await save(other,peer,0,encodeInkEvents([inkDelta([],peerDrawing,'draw')]),peerDrawing,id(105)),1);
    await db.exec("update exam_attempts set status='submitted'");
    for (const suffix of ['', '_v2']) {
      const solution=await as(me,`select get_peer_solution${suffix}($1,$2) r`,[mine,q]);
      assert.ok(solution, 'compact point-count header participates in peer quality ranking');
      assert.equal('p' in solution.strokes[0],suffix === '_v2');
      const replay=decodeInkPayload<InkReplayData>(await as(me,`select get_peer_solution_replay${suffix}($1,$2,$3) r`,[mine,q,solution.solutionKey]));
      const timeline=buildInkTimeline(replay);
      assert.deepEqual(timeline.at(timeline.steps.length),replay.strokes);
      assert.ok(!JSON.stringify(replay).includes(other));
    }
    // 누락된 replay 구간은 압축 baseline에서 시작해도 복원된다.
    await db.exec(`update exam_attempts set status='in_progress'; delete from exam_ink_replay_batches where attempt_id='${mine}'`);
    assert.equal(await save(me,mine,4,encodeInkEvents([inkDelta([compact],[compact,extra],'draw')]),[compact,extra],id(106)),5);
    const baseline=decodeInkPayload<InkReplayData>(await as(me,'select get_exam_ink_replay_v2($1,$2) r',[mine,q]));
    assert.deepEqual(baseline.batches[0].baseline,[decodeInkStroke(encodeInkStroke(compact))]);
    for (const invalid of [{ ...encodeInkStroke(compact), points: [] }, { ...encodeInkStroke(compact), p:'1.1.@@' },
      { ...encodeInkStroke(compact), p:'1.100001.' }, { ...encodeInkStroke(compact), p:null }]) {
      await assert.rejects(db.query('select private.validate_exam_replay_strokes($1::jsonb)',[JSON.stringify([invalid])]),/EXAM_INK_INVALID/);
    }
    await assert.rejects(db.query('select private.validate_exam_replay_strokes($1::jsonb)',[JSON.stringify(Array.from({length:2001},(_,n)=>({...encodeInkStroke(compact),id:`s${n}`})))]),/EXAM_INK_TOO_LARGE/);
    const tooBig={...encodeInkStroke(compact),p:'1.1.'+'A'.repeat(2133345)};
    await assert.rejects(db.query('select private.validate_exam_replay_strokes($1::jsonb)',[JSON.stringify([tooBig])]),/EXAM_INK_TOO_LARGE/);
    const largeQuestion=id(21);
    await db.query('insert into exam_attempt_items values ($1,$2,false,false,30000)',[mine,largeQuestion]);
    const legacyDocument=Array.from({length:537},(_,n)=> {
      const s=stroke(n);
      return {...s,points:Array.from({length:70},(_,i)=>s.points[i%40])};
    });
    const legacyText=JSON.stringify(legacyDocument);
    const legacyBytes=(await db.query('select octet_length($1::jsonb::text) r',[legacyText])).rows[0].r;
    assert.ok(legacyBytes > 2097152 && legacyBytes < 4194304, `existing large legacy document: ${legacyBytes}`);
    const legacyEvents=[inkDelta([],legacyDocument,'draw')];
    const hash=createHash('sha256').update(legacyDocument.map(s=>s.id).join('\n')).digest('hex');
    assert.equal(await as(me,'select save_exam_ink_delta($1,$2,0,false,$3::jsonb,$4,$5) r',
      [mine,largeQuestion,JSON.stringify(legacyEvents),id(107),hash]),1);
    // 실제 기존 큰 문항도 같은 id로 신형 전체 교체할 수 있다.
    const rewrite={id:'reencode',kind:'draw',at:0,removed:legacyDocument.map(s=>s.id),added:legacyDocument.map((s,index)=>({index,stroke:s}))};
    assert.equal(await as(me,'select save_exam_ink_delta_v2($1,$2,1,false,$3::jsonb,$4,$5) r',
      [mine,largeQuestion,JSON.stringify(encodeInkEvents([rewrite])),id(108),hash]),2);
    const saved=(await db.query('select octet_length(strokes::text) r from exam_attempt_ink where attempt_id=$1 and question_id=$2',[mine,largeQuestion])).rows[0].r;
    console.log(`PGlite jsonb text capacity: ${legacyBytes} -> ${saved} bytes (${(legacyBytes/saved).toFixed(2)}x)`);
    assert.ok(saved < legacyBytes / 5);
    const oversized=Array.from({length:1100},(_,n)=>({...legacyDocument[n%537],id:`big${n}`}));
    await assert.rejects(db.query('select private.validate_exam_replay_strokes($1::jsonb)',[JSON.stringify(oversized)]),/EXAM_INK_TOO_LARGE/);
    const bound=(await db.query("select prosecdef, proconfig, has_function_privilege('anon',oid,'execute') anon from pg_proc where proname like '%ink%v2' or proname like 'get_peer_solution%v2'")).rows;
    assert.equal(bound.length,8);
    for (const f of bound) { assert.equal(f.prosecdef,true); assert.ok(f.proconfig.includes('search_path=""')); assert.equal(f.anon,false); }
    assert.equal((await db.query("select relrowsecurity r from pg_class where oid='exam_attempt_ink'::regclass")).rows[0].r,true);
    // SQL/TS 코덱의 손상 데이터·빈 점 처리도 같다.
    for (const p of ['1.0.','1.1.A','1.1.____','2.0.','1.1.gACAAIAAgAA']) {
      assert.deepEqual((await db.query('select private.exam_ink_expand_points($1) r',[p])).rows[0].r,[]);
    }
  } finally { await db.close(); }
});
