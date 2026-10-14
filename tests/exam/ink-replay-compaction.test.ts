import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { buildInkClock, buildInkTimeline, inkDelta } from '../../src/features/exam/ink/inkReplay.ts';
import { decodeInkPayload, encodeInkEvents, encodeInkStroke } from '../../src/features/exam/ink/inkCodec.ts';
import { audioTimelineBounds, clipPosition } from '../../src/features/exam/audio/audioMath.ts';
import type { InkReplayData, InkStroke } from '../../src/features/exam/contract.ts';
import { largeReplayFixture, replayFixture, replayUuid as id } from './ink-replay-compact-fixtures.ts';

const sql = (name: string) => fs.readFileSync(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const me = id(1), other = id(2), admin = id(3), mine = id(10), teacher = id(11), q = id(20), q2 = id(21);

function identicalReplay(before: InkReplayData, after: InkReplayData) {
  const a = buildInkTimeline(before), b = buildInkTimeline(after);
  assert.deepEqual(b.steps, a.steps);
  assert.equal(b.approximate, a.approximate);
  for (let n = a.steps.length; n >= 0; n--) assert.deepEqual(b.at(n), a.at(n));
  for (const audio of [undefined, { origin: before.audioOriginMs ?? 0, clips: before.audioClips ?? [] }]) {
    const x = buildInkClock(a, audio), y = buildInkClock(b, audio);
    assert.deepEqual([y.total, y.starts, y.ends, y.pauses, y.audioClips], [x.total, x.starts, x.ends, x.pauses, x.audioClips]);
    const times = new Set([0, x.total, ...x.starts.flatMap(t => [t - 1, t, t + .5]), ...x.ends.flatMap(t => [t - .5, t, t + 1])]);
    for (let t = 0; t <= x.total; t += 137) times.add(t);
    for (const t of times) {
      assert.deepEqual(y.frame(t), x.frame(t));
      assert.equal(y.toReal(t), x.toReal(t));
      assert.equal(y.toReplay(t), x.toReplay(t));
      assert.equal(y.completedAt(t), x.completedAt(t));
      const bounds = audioTimelineBounds(x.audioClips);
      for (let i = 0; i < x.audioClips.length; i++) assert.deepEqual(clipPosition(y.audioClips[i], t, bounds.shift), clipPosition(x.audioClips[i], t, bounds.shift));
    }
  }
}

test('compaction preserves replay, audio, retries, edits, reset, chunking and authorization (PGlite)', async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema private; create schema extensions;
      create extension pgcrypto schema extensions;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function private.is_current_user_admin() returns boolean language sql stable as $$ select coalesce(auth.uid()='${admin}'::uuid,false) $$;
      create function private.exam_normalize_answer(text) returns text language sql immutable as $$ select btrim($1) $$;
      grant usage on schema auth,private to authenticated,anon;
      create table private.app_admins(user_id uuid primary key);
      insert into private.app_admins values ('${admin}');
      create table profiles(id uuid primary key,equipped_title text,school_grade text);
      create table mistakes(user_id uuid,reviews jsonb);
      create table exam_papers(id text primary key,kind text);
      create table exam_questions(id uuid primary key,paper_id text);
      create table exam_answer_keys(question_id uuid primary key,answer text);
      create table exam_attempts(id uuid primary key,student_id uuid,paper_id text,status text,mode text default 'free',
        started_at timestamptz default now(),submitted_at timestamptz);
      alter table exam_attempts enable row level security;
      grant select on exam_attempts to authenticated;
      create policy own_attempt on exam_attempts for select to authenticated
        using(student_id=auth.uid() or private.is_current_user_admin());
      create table exam_attempt_items(attempt_id uuid,question_id uuid,is_correct boolean,unsure boolean default false,
        time_spent_ms bigint default 900000,answer text,checked_at timestamptz,primary key(attempt_id,question_id));
      create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key,bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant usage on schema public to authenticated,anon;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      alter default privileges in schema public grant all on functions to anon,authenticated,service_role;
      alter default privileges in schema private grant all on functions to anon,authenticated,service_role;
      insert into exam_papers values ('paper','school');
      insert into exam_questions values ('${q}','paper'),('${q2}','paper');
      insert into exam_answer_keys values ('${q}','7'),('${q2}','7');
      insert into exam_attempts(id,student_id,paper_id,status) values ('${mine}','${me}','paper','in_progress'),('${teacher}','${admin}','paper','in_progress');
      insert into exam_attempt_items(attempt_id,question_id,is_correct,answer) values ('${mine}','${q}',false,'1'),('${teacher}','${q}',true,'7'),('${teacher}','${q2}',true,'7');
    `);
    for (const name of ['20261003010000_exam_ink_sync_admin','20261003020000_exam_ink_replay','20261003050000_exam_ink_delta',
      '20261004010000_exam_ink_shapes','20261004130000_exam_admin_live_view','20261004140000_exam_peer_solution',
      '20261004220000_exam_peer_solution_unsure','20261005000000_exam_peer_solution_animal_faces','20261005100000_exam_ink_capacity',
      '20261005120000_exam_ink_compact','20261006100000_exam_peer_picker','20261006110000_exam_solve_time',
      '20261006120000_exam_teacher_audio','20261006160000_exam_teacher_audio_reset','20261006180000_exam_teacher_check_publish']) await db.exec(sql(name));

    const rpc = async (uid: string | null, query: string, args: unknown[] = []) => {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid ?? ''}',false); set role ${uid ? 'authenticated' : 'anon'};`);
      try { return (await db.query<{ r: any }>(query,args)).rows[0]?.r; } finally { await db.exec('reset role'); }
    };
    const read = async (attempt = teacher, question = q, suffix = '_v2') => decodeInkPayload<InkReplayData>(
      await rpc(attempt === mine ? me : admin, `select get_exam_ink_replay${suffix}($1,$2) r`, [attempt,question]));
    const fixture = replayFixture();
    const load = async (attempt: string, question: string, data = fixture) => {
      await db.query('insert into exam_attempt_ink(attempt_id,question_id,strokes,revision,stroke_count,point_count) values($1,$2,$3,$4,$5,$6)',
        [attempt,question,JSON.stringify(data.strokes.map(encodeInkStroke)),data.revision,data.strokes.length,data.strokes.length * 150]);
      for (const b of data.batches) await db.query(`insert into exam_ink_replay_batches(id,attempt_id,question_id,base_revision,revision,baseline,events,strokes_hash)
        values($1,$2,$3,$4,$5,$6,$7,'fixture-hash')`,[id(Number(b.id.slice(-12)) + (question === q2 ? 100 : 0) + (attempt === mine ? 200 : 0)),
        attempt,question,b.baseRevision,b.revision,b.baseline === null ? null : JSON.stringify(b.baseline.map(encodeInkStroke)),JSON.stringify(encodeInkEvents(b.events))]);
    };
    await load(teacher,q); await load(teacher,q2); await load(mine,q);
    await db.query(`insert into exam_solution_audio(id,attempt_id,question_id,started_at_ms,duration_ms,mime,size_bytes,storage_path)
      values($1,$2,$3,$4,85000,'audio/webm',1000,$5)`,[id(4000),teacher,q,fixture.batches[0].events[0].at - 2000,`${teacher}/${q}/${id(4000)}.webm`]);
    await db.exec(`update exam_attempts set status='submitted',submitted_at=now() where id='${teacher}'`);
    const before = await read();
    const beforeLegacy = await read(teacher,q,'');
    await db.exec(`update exam_attempt_items set checked_at=now() where attempt_id='${mine}'`);
    const peerKey = (await rpc(me,'select list_peer_solutions_v2($1,$2) r',[mine,q])).find((r: any) => r.label.isTeacher).solutionKey;
    const peerBefore = decodeInkPayload<InkReplayData>(await rpc(me,'select get_peer_solution_by_key_v2($1,$2,$3) r',[mine,q,peerKey]));
    const liveBefore = await rpc(admin,'select admin_get_live_ink_v2($1,$2,0) r',[teacher,q]);
    const inkBefore = await rpc(admin,'select get_exam_ink_v2($1) r',[teacher]);
    await db.exec(sql('20261021110000_exam_ink_replay_compact'));
    const count = async (table: string, attempt = teacher) => Number((await db.query<{ n: number }>(`select count(*)::int n from ${table} where attempt_id=$1`,[attempt])).rows[0].n);
    const physical = async () => (await db.query(`select pg_total_relation_size('exam_ink_replay_batches')::int batches,
      pg_total_relation_size('exam_ink_replay_compact')::int compact`)).rows[0];
    const sizeBefore = await physical();
    const logicalBefore = Number((await db.query<any>(`select sum(octet_length(events::text)+coalesce(octet_length(baseline::text),0)) n
      from exam_ink_replay_batches where attempt_id=$1`,[teacher])).rows[0].n);
    const stats = (await db.query<{ questions_compacted: number; bytes_before: number; bytes_after: number }>('select * from private.compact_exam_ink_replay(1)')).rows[0];
    assert.equal(stats.questions_compacted,1);
    assert.equal(await count('exam_ink_replay_compact'),1);
    assert.equal(await count('exam_ink_replay_batches'),16);
    assert.equal(await count('exam_ink_replay_batches',mine),16,'in-progress history stays untouched');
    assert.ok(Number(stats.bytes_after) < Number(stats.bytes_before));
    // Benchmark both original functions before replacing them, including an actual
    // authorized v2 RPC read. Use a transaction rollback to reuse identical rows.
    const largeAttempt = id(12);
    const large = largeReplayFixture();
    await db.query(`insert into exam_attempts(id,student_id,paper_id,status) values($1,$2,'paper','in_progress')`,[largeAttempt,admin]);
    await db.query('insert into exam_attempt_items(attempt_id,question_id,is_correct,answer) values($1,$2,true,\'7\')',[largeAttempt,q]);
    await load(largeAttempt,q,large);
    await db.exec(`alter table exam_attempts disable trigger exam_replay_compact_submit;
      alter table exam_attempt_ink disable trigger exam_replay_compact_save;
      update exam_attempts set status='submitted' where id='${largeAttempt}';`);
    const largeRead = () => rpc(admin,'select get_exam_ink_replay_v2($1,$2) r',[largeAttempt,q]);
    const largeBefore = await largeRead();
    const fixtureBytes = (await db.query<any>(`select octet_length(strokes::text) final_bytes,
      (select sum(octet_length(events::text)) from exam_ink_replay_batches where attempt_id=$1) event_bytes
      from exam_attempt_ink where attempt_id=$1`,[largeAttempt])).rows[0];
    assert.ok(fixtureBytes.final_bytes >= 2_000_000);
    const timed = async (fn: () => Promise<unknown>) => {
      const start = performance.now(); const result = await fn();
      return { ms: performance.now() - start, result };
    };
    await db.exec('begin');
    const oldPack = await timed(() => db.query('select * from private.compact_exam_ink_replay_question($1,$2)',[largeAttempt,q]));
    const oldPayload = (await db.query<any>('select payload from exam_ink_replay_compact where attempt_id=$1',[largeAttempt])).rows[0].payload;
    const oldRead = await timed(largeRead);
    assert.deepEqual(oldRead.result,largeBefore);
    await db.exec('rollback');
    // Isolate the proposed cause: same per-stroke helper and calls, but a one-
    // stroke map instead of the entire final document (EXPLAIN ANALYZE executes it).
    const lookupPlan = async (whole: boolean) => (await db.query<any>(`explain (analyze, buffers, format json)
      with final as materialized (select s,n from exam_attempt_ink i,
        lateral jsonb_array_elements(i.strokes) with ordinality x(s,n) where i.attempt_id=$1),
      map as materialized (select jsonb_object_agg(s->>'id',jsonb_build_array(n-1,s)) m from final)
      select sum(pg_column_size(private.exam_replay_pack_stroke(s,${whole ? 'm' : "jsonb_build_object(s->>'id',jsonb_build_array(n-1,s))"})))
      from final cross join map`,[largeAttempt])).rows[0]['QUERY PLAN'][0];
    const wholeMapPlan = await lookupPlan(true), oneStrokePlan = await lookupPlan(false);
    const unpackLookupPlan = async (whole: boolean) => (await db.query<any>(`explain (analyze, buffers, format json)
      with document as materialized (select strokes from exam_attempt_ink where attempt_id=$1),
      final as materialized (select s,n from document,
        lateral jsonb_array_elements(strokes) with ordinality x(s,n))
      select sum(pg_column_size(private.exam_replay_unpack_stroke(${whole ? 'to_jsonb(n-1),strokes' : "'0'::jsonb,jsonb_build_array(s)"})))
      from final cross join document`,[largeAttempt])).rows[0]['QUERY PLAN'][0];
    const wholeArrayPlan = await unpackLookupPlan(true), oneStrokeArrayPlan = await unpackLookupPlan(false);
    const disabledTriggers = async () => (await db.query(`select tgname,tgenabled from pg_trigger
      where tgname in ('exam_replay_compact_submit','exam_replay_compact_save') order by tgname`)).rows;
    const disabledBefore = await disabledTriggers();
    await db.exec(sql('20261021120000_exam_ink_replay_compact_perf'));
    assert.deepEqual(await disabledTriggers(),disabledBefore,'migration preserves disabled production trigger state');
    const rssBefore = process.memoryUsage().rss / 2 ** 20;
    const newPack = await timed(() => db.query('select * from private.compact_exam_ink_replay_question($1,$2)',[largeAttempt,q]));
    assert.deepEqual((await db.query<any>('select payload from exam_ink_replay_compact where attempt_id=$1',[largeAttempt])).rows[0].payload,oldPayload,'identical v1 storage');
    const newRead = await timed(largeRead);
    const rssAfter = process.memoryUsage().rss / 2 ** 20;
    assert.deepEqual(newRead.result,largeBefore,'all large replay fields identical');
    const decodedBefore = decodeInkPayload<InkReplayData>(largeBefore);
    const decodedAfter = decodeInkPayload<InkReplayData>(newRead.result);
    const largeTimelineBefore = buildInkTimeline(decodedBefore), largeTimelineAfter = buildInkTimeline(decodedAfter);
    assert.deepEqual(largeTimelineAfter.steps,largeTimelineBefore.steps);
    for (const step of [0,1,49,50,649,650,699,700]) assert.deepEqual(largeTimelineAfter.at(step),largeTimelineBefore.at(step));
    const largeClockBefore = buildInkClock(largeTimelineBefore), largeClockAfter = buildInkClock(largeTimelineAfter);
    assert.deepEqual([largeClockAfter.total,largeClockAfter.starts,largeClockAfter.ends],
      [largeClockBefore.total,largeClockBefore.starts,largeClockBefore.ends]);
    for (const t of [0,largeClockBefore.total/2,largeClockBefore.total]) assert.deepEqual(largeClockAfter.frame(t),largeClockBefore.frame(t));
    console.log('PGLITE_LARGE_PERF',JSON.stringify({ batches:160,events:700,finalStrokes:650,...fixtureBytes,
      before:{ compactionMs:oldPack.ms,readRpcMs:oldRead.ms },after:{ compactionMs:newPack.ms,readRpcMs:newRead.ms },
      lookupExplainMs:{ wholeMap:wholeMapPlan['Execution Time'],oneStrokeMap:oneStrokePlan['Execution Time'] },
      unpackLookupExplainMs:{ wholeArray:wholeArrayPlan['Execution Time'],oneStrokeArray:oneStrokeArrayPlan['Execution Time'] },
      rssMiB:{ beforeOptimizedPack:rssBefore,afterOptimizedRead:rssAfter },
      processPeakRssMiB:process.resourceUsage().maxRSS/1024 }));
    assert.ok(newPack.ms < 1000,`large compaction took ${newPack.ms} ms`);
    assert.ok(newRead.ms < 1000,`large expanded RPC read took ${newRead.ms} ms`);
    await db.query('delete from exam_attempt_ink where attempt_id=$1',[largeAttempt]);
    // Only the test reenables these to exercise the original lifecycle tests.
    await db.exec(`alter table exam_attempts enable trigger exam_replay_compact_submit;
      alter table exam_attempt_ink enable trigger exam_replay_compact_save;`);
    assert.deepEqual(await read(), before);
    assert.deepEqual(await read(teacher,q,''), beforeLegacy);
    identicalReplay(before,await read());
    const peerAfter = decodeInkPayload<InkReplayData>(await rpc(me,'select get_peer_solution_by_key_v2($1,$2,$3) r',[mine,q,peerKey]));
    assert.deepEqual(peerAfter,peerBefore); identicalReplay(peerBefore,peerAfter);
    assert.deepEqual(await rpc(admin,'select admin_get_live_ink_v2($1,$2,0) r',[teacher,q]),liveBefore);
    assert.deepEqual(await rpc(admin,'select get_exam_ink_v2($1) r',[teacher]),inkBefore);
    const remaining = (await db.query<any>('select * from private.compact_exam_ink_replay(50)')).rows[0];
    assert.equal(remaining.questions_compacted,1);
    assert.equal((await db.query<any>('select * from private.compact_exam_ink_replay(50)')).rows[0].questions_compacted,0);
    const sizeAfter = await physical();
    const payload = (await db.query<any>('select payload from exam_ink_replay_compact where attempt_id=$1 and question_id=$2',[teacher,q])).rows[0].payload;
    const refs = payload.flatMap((b: any[]) => b[4].flatMap((e: any[]) => e[4].map((a: any[]) => a[1])));
    assert.ok(refs.some((s: unknown) => typeof s === 'number'));
    assert.ok(refs.some((s: unknown) => typeof s === 'object'),'erased and moved old versions retain full data');
    console.log('PGLITE_SAVINGS',JSON.stringify({rowsBefore:32,rowsAfter:2,bytesBefore:Number(stats.bytes_before)+Number(remaining.bytes_before),
      bytesAfter:Number(stats.bytes_after)+Number(remaining.bytes_after),logicalBefore,
      logicalAfter:Number((await db.query<any>('select sum(octet_length(payload::text)) n from exam_ink_replay_compact where attempt_id=$1',[teacher])).rows[0].n),
      sizeBefore,sizeAfter}));

    await assert.rejects(rpc(other,'select get_exam_ink_replay_v2($1,$2) r',[teacher,q]),/EXAM_ATTEMPT_NOT_FOUND/);
    await assert.rejects(rpc(null,'select get_exam_ink_replay_v2($1,$2) r',[teacher,q]),/permission denied/);
    assert.equal(await rpc(other,'select count(*)::int r from exam_ink_replay_compact'),0);
    assert.equal(await rpc(admin,'select count(*)::int r from exam_ink_replay_compact'),2);
    await assert.rejects(rpc(me,'select private.compact_exam_ink_replay(1) r'),/permission denied/);
    await assert.rejects(rpc(me,'select * from private.exam_ink_replay_expanded'),/permission denied/);
    await assert.rejects(db.query('select * from private.compact_exam_ink_replay(0)'),/EXAM_REPLAY_COMPACT_LIMIT/);
    const hash = (strokes: InkStroke[]) => createHash('sha256').update(strokes.map(s => s.id).join('\n')).digest('hex');
    const last = fixture.batches.at(-1)!;
    assert.equal(await rpc(admin,'select save_exam_ink_delta_v2($1,$2,$3,false,$4,$5,$6) r',
      [teacher,q,last.baseRevision,JSON.stringify(encodeInkEvents(last.events)),last.id,hash(fixture.strokes)]),16,'retry after compaction');
    const newStrokes = before.strokes.map((s,i) => i ? s : { ...s,color:'#ff0000' });
    const event = encodeInkEvents([inkDelta(before.strokes,newStrokes,'draw',fixture.batches.at(-1)!.events.at(-1)!.at + 5000)]);
    assert.equal(await rpc(admin,'select save_exam_ink_delta_v2($1,$2,16,false,$3,$4,$5) r',[teacher,q,JSON.stringify(event),id(5000),hash(newStrokes)]),17);
    assert.equal(await count('exam_ink_replay_batches'),0,'admin edit is re-compacted at commit');
    const edited = await read();
    identicalReplay(before,{ ...edited,batches:edited.batches.slice(0,-1),strokes:before.strokes,revision:before.revision });
    assert.deepEqual(buildInkTimeline(edited).at(81),newStrokes);
    await rpc(admin,'select reset_exam_question_solution($1,$2) r',[teacher,q]);
    assert.equal(await count('exam_ink_replay_compact'),1,'reset deletes only that question');
    assert.deepEqual((await read()).batches,[]); assert.deepEqual((await read()).strokes,[]);

    // 실제 저장 뒤 제출 전이는 같은 트랜잭션 안에서 최종 상태만 압축한다.
    assert.equal(await rpc(me,'select save_exam_ink_delta_v2($1,$2,16,false,$3,$4,$5) r',
      [mine,q,JSON.stringify(event),id(5001),hash(newStrokes)]),17);
    assert.equal(await count('exam_ink_replay_batches',mine),17,'in-progress writer continues using ordinary batches');
    assert.equal(await count('exam_ink_replay_compact',mine),0);
    const mineBefore = await read(mine);
    await db.exec(`update exam_attempts set status='submitted' where id='${mine}'`);
    assert.equal(await count('exam_ink_replay_batches',mine),0);
    identicalReplay(mineBefore,await read(mine));
    await assert.rejects(rpc(me,'select save_exam_ink_delta_v2($1,$2,17,false,$3,$4,$5) r',[mine,q,JSON.stringify(event),id(5002),hash(newStrokes)]),/EXAM_INK_SUBMITTED/);
    assert.equal(await rpc(me,'select count(*)::int r from exam_ink_replay_compact'),1,'student sees only own compact rows');

    // 비연속 revision, 비어 있거나 비어 있지 않은 baseline, restore와 최종 불일치를 보존한다.
    await db.exec(`update exam_attempts set status='in_progress' where id='${teacher}'; delete from exam_attempt_ink where attempt_id='${teacher}' and question_id='${q}';`);
    const [a,b] = fixture.strokes;
    const gap: InkReplayData = { revision:10,strokes:[a,b],batches:[
      { id:id(2000),baseRevision:2,revision:3,baseline:[a],events:[inkDelta([a],[a,b],'restore',20000)] },
      { id:id(2001),baseRevision:7,revision:8,baseline:[],events:[inkDelta([], [a],'draw',80000),inkDelta([a],[],'clear',81000)] },
      { id:id(2002),baseRevision:8,revision:9,baseline:null,events:[inkDelta([], [b],'draw',100000)] },
    ] };
    await load(teacher,q,gap);
    // 예전 points 획과 p 획이 함께 있는 문서도 재인코딩 없이 읽는다.
    await db.query('update exam_attempt_ink set strokes=$1 where attempt_id=$2 and question_id=$3',
      [JSON.stringify([a,encodeInkStroke(b)]),teacher,q]);
    const gapBefore = await read();
    await db.exec(`update exam_attempts set status='submitted' where id='${teacher}'`);
    const gapAfter = await read();
    assert.deepEqual(gapAfter,gapBefore); identicalReplay(gapBefore,gapAfter);
    assert.equal(buildInkTimeline(gapAfter).approximate,true);
    assert.equal(await count('exam_ink_replay_batches'),0);
    await db.exec('set role service_role');
    assert.equal((await db.query<any>('select * from private.compact_exam_ink_replay(1)')).rows[0].questions_compacted,0);
    await db.exec('reset role');
  } finally { await db.close(); }
});
