import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { inkDelta, buildInkTimeline } from '../../src/features/exam/ink/inkReplay.ts';
import { encodeInkEvents, encodeInkStroke, decodeInkPayload } from '../../src/features/exam/ink/inkCodec.ts';
import type { InkStroke, InkReplayData } from '../../src/features/exam/contract.ts';

// 설치된 로컬 PGlite로만 검사한다. 운영 DB는 사용하지 않는다.
const pkg = '@electric-sql/pglite';
const { PGlite } = await import(pkg);
const { pgcrypto } = await import(`${pkg}/contrib/pgcrypto`);
const sql = (name: string) => fs.readFileSync(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8');
const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const drawing = (count = 3, points = 20): InkStroke[] => Array.from({ length: count }, (_, n) => ({
  id: `source-${n}`, tool: 'pen', color: '#123456', size: 4,
  points: Array.from({ length: points }, (_, i) => ({ x: i / 100, y: n / 10, pressure: .5, t: i * 20 })),
}));

test('peer picker migration: eligibility, ordering, privacy, counts, replay and grants (PGlite)', async () => {
  const db = new PGlite({ extensions: { pgcrypto } });
  const me = id(1), admin = id(90), q = id(100), mine = id(101);
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema private; create schema extensions;
      create extension pgcrypto schema extensions;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
      create function private.is_current_user_admin() returns boolean language sql stable as $$ select auth.uid()='${admin}'::uuid $$;
      create table private.app_admins(user_id uuid primary key);
      insert into private.app_admins values ('${admin}');
      create table public.profiles(id uuid primary key, equipped_title text, school_grade text, display_name text);
      create table public.mistakes(user_id uuid, reviews jsonb);
      create table public.exam_papers(id text primary key, kind text);
      create table public.exam_questions(id uuid primary key, paper_id text);
      create table public.exam_answer_keys(question_id uuid primary key, answer text);
      create table public.exam_attempts(id uuid primary key, student_id uuid, paper_id text, status text, mode text default 'free',
        started_at timestamptz default now(), submitted_at timestamptz);
      create table public.exam_attempt_items(attempt_id uuid, question_id uuid, is_correct boolean, unsure boolean default false,
        time_spent_ms bigint default 5000, answer text, checked_at timestamptz, primary key(attempt_id,question_id));
      create index exam_attempt_items_question_idx on public.exam_attempt_items(question_id);
      grant usage on schema public to authenticated, anon;
      insert into exam_papers values ('paper','school'),('other','school');
      insert into exam_questions values ('${q}','paper');
      insert into exam_answer_keys values ('${q}','7');
      insert into exam_attempts(id,student_id,paper_id,status,submitted_at) values ('${mine}','${me}','paper','submitted',now());
      insert into exam_attempt_items(attempt_id,question_id,is_correct,answer) values ('${mine}','${q}',false,'1');
    `);
    const normalize = sql('20261002120000_exam_practice').match(/create or replace function private.exam_normalize_answer\(p_answer text\)[\s\S]*?\$function\$;/)![0];
    await db.exec(normalize);
    for (const migration of ['20261003010000_exam_ink_sync_admin','20261003020000_exam_ink_replay',
      '20261003050000_exam_ink_delta','20261004010000_exam_ink_shapes','20261004130000_exam_admin_live_view',
      '20261004140000_exam_peer_solution','20261004220000_exam_peer_solution_unsure',
      '20261005000000_exam_peer_solution_animal_faces','20261005100000_exam_ink_capacity','20261005120000_exam_ink_compact']) await db.exec(sql(migration));

    const add = async (n: number, options: { user?: string; status?: string; mode?: string; answer?: string; checked?: boolean; correct?: boolean; strokes?: InkStroke[]; completed?: number; paper?: string; activity?: number } = {}) => {
      const user = options.user ?? id(n), attempt = id(200 + n), status = options.status ?? 'submitted';
      const activity = `2026-10-05T10:${String(options.activity ?? n % 60).padStart(2,'0')}:00Z`;
      await db.query('insert into exam_attempts(id,student_id,paper_id,status,mode,submitted_at) values ($1,$2,$3,$4,$5,$6)',
        [attempt, user, options.paper ?? 'paper', status, options.mode ?? 'free', status === 'submitted' ? activity : null]);
      await db.query('insert into exam_attempt_items(attempt_id,question_id,is_correct,answer,checked_at) values ($1,$2,$3,$4,$5)',
        [attempt,q,options.correct ?? true,options.answer ?? '7',options.checked ? activity : null]);
      const strokes = options.strokes ?? drawing();
      await db.query('insert into exam_attempt_ink(attempt_id,question_id,strokes) values ($1,$2,$3::jsonb)',
        [attempt,q,JSON.stringify(strokes.map((s,i) => i === 0 ? s : encodeInkStroke(s)))]);
      await db.query('insert into profiles values ($1,$2,$3,$4) on conflict do nothing', [user,`칭호${n}`,'고2',`secret-name-${n}`]);
      for (let i = 0; i < (options.completed ?? 0); i++) await db.query('insert into mistakes values ($1,$2)',[user,'["O","O","O"]']);
      return attempt;
    };
    // 백필 전에 저장한 혼합 형식과 임계값 미달 자료.
    const first = await add(2, { completed: 8, activity: 10 });
    const free = await add(3, { completed: 7, status: 'in_progress', checked: true, answer: '007', correct: false });
    await add(4, { completed: 6 }); await add(5, { completed: 5 }); await add(6, { completed: 4 });
    const teacher = await add(7, { user: admin, correct: false });
    const olderTeacher = await add(20, { user:admin, activity:1 });
    await add(21, { user:admin, activity:59, strokes:drawing(2,40) });
    await add(8, { user: admin, status: 'in_progress', checked: true, completed: 100 });
    await add(9, { user: me, completed: 100 });
    await add(10, { status: 'in_progress', checked: false, completed: 100 });
    await add(11, { status: 'in_progress', checked: true, answer: '6', completed: 100 });
    await add(12, { status: 'in_progress', checked: true, mode: 'real', completed: 100 });
    await add(13, { correct: false, completed: 100 });
    await add(14, { strokes: drawing(2,40), completed: 100 });
    await add(15, { strokes: drawing(3,19), completed: 100 });
    await add(16, { paper: 'other', completed: 100 });
    await db.exec(sql('20261006100000_exam_peer_picker'));
    assert.deepEqual((await db.query('select stroke_count,point_count from exam_attempt_ink where attempt_id=$1',[first])).rows[0], { stroke_count:3, point_count:60 });
    const rpc = async (query: string, args: unknown[] = [], uid: string | null = me) => {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid ?? ''}',false); set role ${uid ? 'authenticated' : 'anon'};`);
      try { return (await db.query(query,args)).rows[0]?.r; } finally { await db.exec('reset role'); }
    };
    const list = () => rpc('select list_peer_solutions_v2($1,$2) r',[mine,q]);
    const read = (key: string, attempt = mine) => rpc('select get_peer_solution_by_key_v2($1,$2,$3) r',[attempt,q,key]);
    const rows = await list();
    assert.deepEqual(rows.map((r: any) => r.label.title), ['칭호2','칭호3','칭호4','칭호5',null]);
    assert.equal(rows[4].label.isTeacher,true); assert.equal(rows[4].label.face,'🎓');
    assert.equal(rows[4].solutionKey,createHash('md5').update(`${me}:${q}:${mine}:${teacher}:1`).digest('hex'),'most recent submitted teacher with enough ink');
    assert.equal(rows[0].timeSpentMs,5000,'no twenty-second minimum');
    for (const row of rows) { assert.deepEqual(Object.keys(row).sort(),['label','solutionKey','timeSpentMs']); assert.match(row.solutionKey,/^[a-f0-9]{32}$/); }
    assert.ok(!JSON.stringify(rows).includes('secret-name'));
    for (const n of [1,2,3,90,101,202]) assert.ok(!JSON.stringify(rows).includes(id(n)));
    // 작은 테스트 자료에서 순차 스캔 대신 사용할 수 있는 인덱스 경로도 확인한다.
    const candidateQuery = sql('20261006100000_exam_peer_picker').match(/return query\s+([\s\S]*?)\r?\nend;\r?\n\$\$;/)![1]
      .replaceAll('p_question_id',`'${q}'::uuid`).replaceAll('v_paper',"'paper'");
    assert.ok(!/\bstrokes\b/.test(candidateQuery),'the candidate query never references the toasted drawing');
    await db.exec('set enable_seqscan=off');
    const plan = (await db.query(`explain (analyze, buffers, format json) ${candidateQuery}`)).rows[0]['QUERY PLAN'][0];
    await db.exec('reset enable_seqscan');
    const indexes = new Set<string>();
    const walk = (node: any) => { if (node['Index Name']) indexes.add(node['Index Name']); for (const child of node.Plans ?? []) walk(child); };
    walk(plan.Plan);
    assert.ok(indexes.has('exam_attempt_items_question_idx')); assert.ok(indexes.has('mistakes_exam_completed_user_idx'));
    console.log(`Peer candidate indexed EXPLAIN: ${plan['Execution Time']} ms; ${[...indexes].join(', ')}`);
    const replay = decodeInkPayload<InkReplayData>(await read(rows[0].solutionKey));
    assert.equal(replay.strokes.length,3); assert.deepEqual(buildInkTimeline(replay).at(3),replay.strokes);
    assert.ok(!JSON.stringify(replay).includes('source-'));
    const legacy = await rpc('select get_peer_solution($1,$2) r',[mine,q]);
    assert.equal(legacy.solutionKey,rows[0].solutionKey); assert.ok(legacy.strokes.every((s: any) => s.points && !s.p));
    assert.equal((await rpc('select get_peer_solution_replay($1,$2,$3) r',[mine,q,legacy.solutionKey])).strokes.length,3);
    assert.equal((await read(rows[4].solutionKey)).strokes.length,3,'teacher need not have correct item');

    // 같은 학생은 가장 최근의 자격 있는 제출을 고른다.
    const newer = await add(17, { user:id(2), activity:59 });
    await db.exec('update exam_attempt_ink set stroke_count=3,point_count=60 where stroke_count=0');
    const newerRows = await list(); assert.notEqual(newerRows[0].solutionKey,rows[0].solutionKey);
    await assert.rejects(read(rows[0].solutionKey),/EXAM_PEER_CHANGED/);
    const secondViewer = await add(18, { user:me, correct:false });
    const secondList = await rpc('select list_peer_solutions_v2($1,$2) r',[secondViewer,q]);
    assert.notEqual(secondList[0].solutionKey,newerRows[0].solutionKey,'keys are scoped to the viewing attempt');
    await assert.rejects(read(newerRows[0].solutionKey,secondViewer),/EXAM_PEER_CHANGED/);
    const alternateViewer = await add(19, { correct:false });
    const alternateList = await rpc('select list_peer_solutions_v2($1,$2) r',[alternateViewer,q],id(19));
    const alternatePeer = alternateList.find((r: any)=>r.label.title==='칭호2');
    assert.notEqual(alternatePeer.solutionKey,newerRows[0].solutionKey,'keys are scoped to the viewing user');
    assert.equal(alternatePeer.label.face,newerRows[0].label.face,'faces remain stable across viewers');
    // 앞 세 칸이 모두 O인 행만 날짜 조건 없이 센다.
    await db.query('insert into mistakes values ($1,$2)',[id(6),'["O","O","X"]']);
    assert.equal((await list())[3].label.title,'칭호5');
    // 동점은 활동 시각을 우선하며 그 다음 해시 순서도 고정된다.
    await db.query('insert into mistakes values ($1,$2)',[id(6),'["O","O","O"]']);
    const recentTie = await list(); assert.equal(recentTie[3].label.title,'칭호6','activity breaks equal completed counts');
    await db.query('update exam_attempts set submitted_at=(select submitted_at from exam_attempts where id=$1) where id=$2',[id(205),id(206)]);
    const hashTie = await list(); assert.deepEqual(await list(),hashTie,'equal counts and activity use deterministic hashes');
    await db.query('delete from mistakes where user_id=$1',[id(3)]);
    const tie = await list(); assert.equal(tie.length,5); assert.deepEqual(await list(),tie);
    await assert.rejects(read(newerRows[1].solutionKey),/EXAM_PEER_CHANGED/,'a peer outside current top four is rejected');

    for (const [change,restore] of [
      ["update exam_attempt_items set is_correct=true,unsure=false where attempt_id=$1", "update exam_attempt_items set is_correct=false where attempt_id=$1"],
      ["update exam_attempts set student_id='"+id(30)+"' where id=$1", "update exam_attempts set student_id='"+me+"' where id=$1"],
    ]) { await db.query(change,[mine]); await assert.rejects(list(),/EXAM_PEER_NOT_ALLOWED/); await db.query(restore,[mine]); }
    await db.exec("update exam_papers set kind='hanneung' where id='paper'"); await assert.rejects(list(),/EXAM_PEER_NOT_ALLOWED/);
    await db.exec("update exam_papers set kind='school' where id='paper'");
    await db.query("update exam_attempt_items set is_correct=true,unsure=true where attempt_id=$1",[mine]); assert.equal((await list()).length,5);
    await db.query("update exam_attempts set status='in_progress',submitted_at=null where id=$1",[mine]);
    await assert.rejects(list(),/EXAM_PEER_NOT_ALLOWED/,'unchecked viewers are denied');
    await db.query("update exam_attempt_items set checked_at=now(),answer='007',unsure=false where attempt_id=$1",[mine]);
    await assert.rejects(list(),/EXAM_PEER_NOT_ALLOWED/,'correct free viewer denied despite stale is_correct');
    await db.query("update exam_attempt_items set unsure=true where attempt_id=$1",[mine]); assert.equal((await list()).length,5);
    await db.query("update exam_attempt_items set answer='6',unsure=false where attempt_id=$1",[mine]); assert.equal((await list()).length,5);
    await db.query("update exam_attempts set mode='real' where id=$1",[mine]); await assert.rejects(list(),/EXAM_PEER_NOT_ALLOWED/);
    await db.query("update exam_attempts set mode='free' where id=$1",[mine]);
    await assert.rejects(rpc('select list_peer_solutions_v2($1,$2) r',[mine,q],null),/permission denied/);
    await assert.rejects(rpc('select get_peer_solution_by_key_v2($1,$2,$3) r',[mine,q,rows[0].solutionKey],null),/permission denied/);
    await assert.rejects(read('forged'),/EXAM_PEER_CHANGED/);
    await assert.rejects(rpc('select list_peer_solutions_v2($1,$2) r',[mine,q],id(31)),/EXAM_PEER_NOT_ALLOWED/);
    await assert.rejects(read((await list())[0].solutionKey,newer),/EXAM_PEER_NOT_ALLOWED/);
    // 자유 모드 후보의 revision 변경은 키를 만료시키고 저장·지우기는 집계도 갱신한다.
    await db.query('insert into mistakes values ($1,$2),($1,$2),($1,$2),($1,$2),($1,$2),($1,$2),($1,$2),($1,$2),($1,$2)',[id(3),'["O","O","O"]']);
    const before = (await list())[0];
    const old = drawing(), next = drawing(4,25);
    const hash = (strokes: InkStroke[]) => createHash('sha256').update(strokes.map(s=>s.id).join('\n')).digest('hex');
    const save = (rev: number, from: InkStroke[], to: InkStroke[], batch: string) => rpc('select save_exam_ink_delta_v2($1,$2,$3,false,$4::jsonb,$5,$6) r',
      [free,q,rev,JSON.stringify(encodeInkEvents([inkDelta(from,to,'draw')])),batch,hash(to)],id(3));
    assert.equal(await save(1,old,next,id(800)),2);
    assert.deepEqual((await db.query('select stroke_count,point_count from exam_attempt_ink where attempt_id=$1',[free])).rows[0],{stroke_count:4,point_count:100});
    await assert.rejects(read(before.solutionKey),/EXAM_PEER_CHANGED/); assert.notEqual((await list())[0].solutionKey,before.solutionKey);
    const updatedReplay = decodeInkPayload<InkReplayData>(await read((await list())[0].solutionKey));
    const updatedTimeline = buildInkTimeline(updatedReplay);
    assert.deepEqual(updatedTimeline.at(updatedTimeline.steps.length),updatedReplay.strokes,'compact baseline and events reconstruct the selected drawing');
    assert.ok(!JSON.stringify(updatedReplay).includes('source-'));
    assert.equal(await save(2,next,[],id(801)),3);
    assert.deepEqual((await db.query('select stroke_count,point_count from exam_attempt_ink where attempt_id=$1',[free])).rows[0],{stroke_count:0,point_count:0});
    assert.ok(!(await list()).some((r: any)=>r.label.title==='칭호3'));
    const legacyInk = drawing(3,30);
    assert.equal(await rpc('select save_exam_ink($1,$2,$3::jsonb,0,false) r',[mine,q,JSON.stringify(legacyInk)]),1);
    assert.deepEqual((await db.query('select stroke_count,point_count from exam_attempt_ink where attempt_id=$1',[mine])).rows[0],{stroke_count:3,point_count:90});
    await db.query('delete from exam_attempts where id=$1',[teacher]);
    assert.equal((await list()).find((r: any)=>r.label.isTeacher).solutionKey,createHash('md5').update(`${me}:${q}:${mine}:${olderTeacher}:1`).digest('hex'));
    await db.query('delete from exam_attempts where id=$1',[olderTeacher]);
    assert.ok(!(await list()).some((r: any)=>r.label.isTeacher),'an in-progress admin cannot replace the submitted teacher');
    const privileges = (await db.query("select prosecdef,proconfig,has_function_privilege('anon',oid,'execute') anon from pg_proc where proname in ('list_peer_solutions_v2','get_peer_solution_by_key_v2','exam_peer_candidates')")).rows;
    assert.equal(privileges.length,3); for (const f of privileges) { assert.equal(f.prosecdef,true); assert.ok(f.proconfig.includes('search_path=""')); assert.equal(f.anon,false); }
    assert.equal((await db.query("select has_function_privilege('authenticated','private.exam_peer_candidates(uuid,uuid)','execute') r")).rows[0].r,false);
    assert.ok(teacher);
  } finally { await db.close(); }
});
