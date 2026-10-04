import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PeerSolutionSession, peerSolutionLabel, peerSolutionLabelParts } from '../../src/features/exam/ui/peerSolution.ts';
import { getTitleBadgeStyle } from '../../src/utils/gachaCatalog.ts';
import { buildInkTimeline, inkDelta } from '../../src/features/exam/ink/inkReplay.ts';
import type { InkStroke, PeerSolution } from '../../src/features/exam/contract.ts';

const drawing = (count = 3): InkStroke[] => Array.from({ length: count }, (_, i) => ({
  id: `source-stroke-${i}`, tool: 'pen', color: '#123456', size: 4,
  points: Array.from({ length: 40 }, (_, n) => ({ x: n / 100, y: i / 10, pressure: .5, t: n * 20 })),
}));
const solution: PeerSolution = { label: { character: '하치와레', title: '도전자', grade: '고2', isTeacher: false }, strokes: drawing(), solutionKey: 'opaque' };

test('anonymous labels omit missing fields and show teacher fallback', () => {
  assert.equal(peerSolutionLabel(solution.label), '👩 도전자(고2)');
  assert.equal(peerSolutionLabel({ ...solution.label, title: null, grade: null }), '👩 익명 학생');
  assert.equal(peerSolutionLabel({ ...solution.label, title: null }), '👩 익명 학생(고2)');
  assert.equal(peerSolutionLabel({ ...solution.label, isTeacher: true }), '🎓 선생님 풀이');
  assert.match(peerSolutionLabel({ ...solution.label, character: '모르는캐릭터' }), /^\p{Extended_Pictographic}/u, 'unknown characters still get a face');
  // 결합(ZWJ) 이모지는 쓰지 않는다 — 기기·글꼴에 따라 갈라지거나 글씨와 겹친다.
  for (const character of ['치이카와','하치와레','우사기','모몽가','쿠리만쥬','랏코','시사','후루혼','모르는캐릭터'])
    for (const isTeacher of [false, true]) assert.ok(!peerSolutionLabel({ ...solution.label, character, isTeacher }).includes('\u200d'), `${character} ${isTeacher}`);
});

test('server face wins over legacy character; titles reuse the app-wide title badge effect', () => {
  assert.equal(peerSolutionLabel({ ...solution.label, face: '🐶' }), '🐶 도전자(고2)');
  assert.equal(peerSolutionLabel({ face: '🦊', title: null, grade: null, isTeacher: false }), '🦊 익명 학생');
  assert.match(peerSolutionLabel({ title: null, grade: null, isTeacher: false }), /^\p{Extended_Pictographic} 익명 학생$/u, 'neither face nor character still shows a face');
  const god = peerSolutionLabelParts({ ...solution.label, face: '🐱', title: '수학의 신' });
  assert.deepEqual(god.title, { text: '수학의 신', ...getTitleBadgeStyle('수학의 신') });
  assert.match(god.title!.style, /animate-pulse/, '수학의 신 keeps its flashy effect');
  assert.equal(peerSolutionLabelParts({ ...solution.label, title: '  ' }).title, null);
  assert.equal(peerSolutionLabelParts({ ...solution.label, isTeacher: true }).face, '🎓');
  // 머리 줄 컴포넌트는 새 이펙트가 아니라 공용 칭호 배지 클래스(getTitleBadgeStyle)를 그대로 쓴다.
  const view = fs.readFileSync(new URL('../../src/features/exam/ui/PeerSolutionView.tsx', import.meta.url), 'utf8');
  assert.match(view, /<PeerSolutionLabel label=\{solution\.label\} \/>/);
  assert.match(view, /className=\{`exam-peer-title [^`]*\$\{parts\.title\.style\}`\}/);
  assert.match(view, /\{parts\.title\.icon\}/);
});

test('result session loads only on demand, deduplicates, caches null/replay and retries failures', async () => {
  let reads = 0, plays = 0;
  const api = {
    getPeerSolution: async (_a: string, q: string) => { reads++; if (q === 'failure' && reads === 3) throw new Error('offline'); return q === 'none' ? null : solution; },
    getPeerSolutionReplay: async (a: string, q: string, key: string) => {
      assert.equal(a, 'my-attempt'); assert.equal(q, 'q'); assert.equal(key, 'opaque'); plays++;
      return { strokes: drawing(), batches: [], revision: 0 };
    },
  };
  const session = new PeerSolutionSession(api, 'my-attempt');
  assert.equal(reads, 0); assert.equal(plays, 0);
  assert.deepEqual(await Promise.all([session.get('q'), session.get('q')]), [solution, solution]);
  assert.equal(reads, 1); assert.equal(plays, 0);
  assert.equal(await session.get('none'), null); assert.equal(await session.get('none'), null); assert.equal(reads, 2);
  await assert.rejects(session.get('failure'), /offline/); await session.get('failure'); assert.equal(reads, 4);
  await Promise.all([session.replay('q','opaque'),session.replay('q','opaque')]); assert.equal(plays, 1);
  await new PeerSolutionSession(api, 'my-attempt').get('q'); assert.equal(reads, 5, 'new result screen has no cached peer ink');
});

let PGlite: any;
try { const pkg = '@electric-sql/pglite'; PGlite = (await import(pkg)).PGlite; } catch { /* matches existing migration tests */ }

test('peer RPC validates ownership, wrong/submitted/non-hanneung, quality, student priority and anonymous replay (PGlite)', { skip: !PGlite }, async () => {
  const db = new PGlite();
  const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
  const me = id(1), other = id(2), teacher = id(3), mine = id(10), peer = id(11), adminAttempt = id(12), q = id(20);
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table private.app_admins(user_id uuid primary key);
      create table public.profiles(id uuid primary key, equipped_title text, school_grade text, display_name text, nickname text, email text);
      create table public.exam_papers(id text primary key, kind text);
      create table public.exam_questions(id uuid primary key, paper_id text);
      create table public.exam_attempts(id uuid primary key, student_id uuid, paper_id text, status text, submitted_at timestamptz default now());
      create table public.exam_attempt_items(attempt_id uuid, question_id uuid, is_correct boolean, time_spent_ms bigint, primary key(attempt_id,question_id));
      create index exam_attempt_items_question_idx on public.exam_attempt_items(question_id);
      create table public.exam_attempt_ink(attempt_id uuid, question_id uuid, revision integer, strokes jsonb, primary key(attempt_id,question_id));
      create table public.exam_ink_replay_batches(id uuid, attempt_id uuid, question_id uuid, revision integer, base_revision integer, baseline jsonb, events jsonb);
      grant usage on schema public to anon, authenticated;
      insert into private.app_admins values ('${teacher}');
      insert into exam_papers values ('paper','suneung'),('history','hanneung'),('era','hanneung');
      insert into exam_questions values ('${q}','paper');
      insert into profiles values ('${other}','도전자','고2','실제이름','닉네임','private@example.com'), ('${teacher}',null,null,'선생실명',null,null);
      insert into exam_attempts values ('${mine}','${me}','paper','submitted'), ('${peer}','${other}','paper','submitted'), ('${adminAttempt}','${teacher}','paper','submitted');
      insert into exam_attempt_items values ('${mine}','${q}',false,30000), ('${peer}','${q}',true,20000), ('${adminAttempt}','${q}',true,90000);
    `);
    await db.exec(fs.readFileSync(new URL('../../supabase/migrations/20261004140000_exam_peer_solution.sql',import.meta.url),'utf8'));
    await db.exec(fs.readFileSync(new URL('../../supabase/migrations/20261004200000_exam_peer_solution_stable_face.sql',import.meta.url),'utf8'));
    const permissions = (await db.query(`select
      has_function_privilege('anon','public.get_peer_solution(uuid,uuid)','execute') as anon_read,
      has_function_privilege('anon','public.get_peer_solution_replay(uuid,uuid,text)','execute') as anon_replay,
      has_function_privilege('authenticated','private.pick_exam_peer_solution(uuid,uuid)','execute') as helper,
      has_function_privilege('authenticated','public.get_peer_solution(uuid,uuid)','execute') as student_read`)).rows[0];
    assert.deepEqual(permissions,{anon_read:false,anon_replay:false,helper:false,student_read:true});
    const rpc = async (uid = me, replayKey?: string) => {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid}',false); set role ${uid ? 'authenticated' : 'anon'};`);
      try {
        return (await db.query(replayKey === undefined ? 'select get_peer_solution($1,$2) r' : 'select get_peer_solution_replay($1,$2,$3) r',
          replayKey === undefined ? [mine,q] : [mine,q,replayKey])).rows[0].r;
      } finally { await db.exec('reset role'); }
    };
    assert.equal(await rpc(), null);
    await assert.rejects(rpc(''), /permission denied/);
    await assert.rejects(rpc(other), /EXAM_PEER_NOT_ALLOWED/);
    await assert.rejects(db.exec('set role authenticated; select private.pick_exam_peer_solution(null,null)'), /permission denied/);
    await db.exec('reset role');
    const strokes = drawing();
    for (const a of [peer,adminAttempt]) await db.query('insert into exam_attempt_ink values ($1,$2,1,$3::jsonb)',[a,q,JSON.stringify(a === peer ? strokes : drawing(20))]);
    const selected = await rpc();
    assert.equal(selected.label.isTeacher, false, 'student outranks far more detailed admin');
    assert.equal(selected.label.title, '도전자'); assert.equal(selected.label.grade, '고2');
    assert.ok(['치이카와','하치와레','우사기','모몽가','쿠리만쥬','랏코','시사','후루혼'].includes(selected.label.character));
    assert.match(selected.label.face, /^\p{Extended_Pictographic}$/u, 'one single-codepoint face');
    assert.ok(!selected.label.face.includes('‍') && selected.label.face !== '🎓');
    assert.deepEqual(await rpc(), selected, 'stable across matching read/replay');
    const assertAnonymous = (value: unknown) => {
      const text = JSON.stringify(value);
      for (const forbidden of [me,other,teacher,mine,peer,adminAttempt,'attempt_id','attemptId','student_id','studentId','실제이름','닉네임','private@example.com','source-stroke']) assert.ok(!text.includes(forbidden), forbidden);
    };
    assertAnonymous(selected);
    for (const [sql, restore] of [
      [`update exam_attempt_items set is_correct=true where attempt_id='${mine}'`, `update exam_attempt_items set is_correct=false where attempt_id='${mine}'`],
      [`update exam_attempts set status='in_progress' where id='${mine}'`, `update exam_attempts set status='submitted' where id='${mine}'`],
      [`update exam_papers set kind='hanneung' where id='paper'`, `update exam_papers set kind='suneung' where id='paper'`],
      [`update exam_questions set paper_id='history'`, `update exam_questions set paper_id='paper'`],
      [`update exam_attempts set paper_id='era' where id='${mine}'`, `update exam_attempts set paper_id='paper' where id='${mine}'`],
    ]) {
      await db.exec(sql); await assert.rejects(rpc(), /EXAM_PEER_NOT_ALLOWED/);
      await assert.rejects(rpc(me,selected.solutionKey), /EXAM_PEER_NOT_ALLOWED/); await db.exec(restore);
    }
    for (const [sql, restore] of [
      [`update exam_attempt_items set time_spent_ms=19999 where attempt_id='${peer}'`,`update exam_attempt_items set time_spent_ms=20000 where attempt_id='${peer}'`],
      [`update exam_attempts set status='in_progress' where id='${peer}'`,`update exam_attempts set status='submitted' where id='${peer}'`],
      [`update exam_attempt_items set is_correct=false where attempt_id='${peer}'`,`update exam_attempt_items set is_correct=true where attempt_id='${peer}'`],
      [`update exam_attempts set paper_id='history' where id='${peer}'`,`update exam_attempts set paper_id='paper' where id='${peer}'`],
      [`update exam_attempts set student_id='${me}' where id='${peer}'`,`update exam_attempts set student_id='${other}' where id='${peer}'`],
    ]) {
      await db.exec(sql); assert.equal((await rpc()).label.isTeacher,true); await db.exec(restore);
    }
    for (const insufficient of [drawing(2), drawing().map(s => ({...s,points:[]}))]) {
      await db.query('update exam_attempt_ink set strokes=$1::jsonb where attempt_id=$2',[JSON.stringify(insufficient),peer]);
      assert.equal((await rpc()).label.isTeacher,true,'too few strokes or too little ink falls back');
    }
    await db.query('update exam_attempt_ink set strokes=$1::jsonb where attempt_id=$2',[JSON.stringify(strokes.map(s => ({...s, attempt_id:peer,email:'private@example.com'}))),peer]);
    assertAnonymous(await rpc());
    const events = [
      ...strokes.map((s,i) => ({id:peer,kind:'draw',at:1800000000000+i*1000,added:[{index:i,stroke:s}],removed:[],attempt_id:peer})),
      inkDelta(strokes,strokes.slice(1),'erase',1800000004000),
      inkDelta(strokes.slice(1),strokes,'undo',1800000005000),
    ];
    await db.query('insert into exam_ink_replay_batches values ($1,$2,$3,1,0,$4::jsonb,$5::jsonb)',[id(30),peer,q,'[]',JSON.stringify(events)]);
    const replay = await rpc(me,selected.solutionKey);
    assertAnonymous(replay); assert.equal(replay.batches[0].events[0].at,0);
    const timeline = buildInkTimeline(replay);
    assert.deepEqual(timeline.at(timeline.steps.length), replay.strokes);
    assert.equal(timeline.approximate, false, 'anonymous replay preserves actual event sequence');
    assert.deepEqual(timeline.at(4), replay.strokes.slice(1), 'removed ids are remapped consistently');
    assert.deepEqual(replay.strokes,selected.strokes);
    await assert.rejects(rpc(me,'tampered'),/EXAM_PEER_CHANGED/);
    await db.exec(`update exam_attempt_ink set revision=2 where attempt_id='${peer}'`);
    await assert.rejects(rpc(me,selected.solutionKey),/EXAM_PEER_CHANGED/);
    await db.exec(`delete from exam_attempt_ink where attempt_id='${peer}'`);
    const fallback = await rpc(); assert.equal(fallback.label.isTeacher,true); assert.equal(fallback.label.face,'🎓');
    assert.equal(fallback.label.title,null); assert.equal(fallback.label.grade,null);
    await db.exec(`delete from exam_attempt_ink`); assert.equal(await rpc(),null);
    // Six ordinary candidates: only the five most detailed can win; requester/question hashing mixes picks.
    for (let n=0;n<6;n++) {
      await db.query(`insert into exam_attempts values ($1,$2,'paper','submitted');`,[id(40+n),id(50+n)]);
      await db.query(`insert into exam_attempt_items values ($1,$2,true,30000);`,[id(40+n),q]);
      await db.query(`insert into exam_attempt_ink values ($1,$2,1,$3::jsonb);`,[id(40+n),q,JSON.stringify(drawing(3+n))]);
    }
    const chosenSizes = new Set<number>();
    const facesBySize = new Map<number, Set<string>>();
    for (let n=0;n<16;n++) {
      const requester = id(100+n);
      await db.query('update exam_attempts set student_id=$1 where id=$2',[requester,mine]);
      const chosen = await rpc(requester);
      assert.ok(chosen.strokes.length>=4 && chosen.strokes.length<=8,'winner is in top five');
      assert.equal(chosen.label.title,null); assert.equal(chosen.label.grade,null);
      chosenSizes.add(chosen.strokes.length);
      facesBySize.set(chosen.strokes.length, (facesBySize.get(chosen.strokes.length) ?? new Set<string>()).add(chosen.label.face));
      assert.deepEqual(await rpc(requester), chosen,'same requester/question picks consistently');
    }
    assert.ok(chosenSizes.size>1,'different requesters see different detailed solutions');
    // 그림마다 작성자가 다르다 — 얼굴은 요청자가 아니라 작성자를 따른다.
    for (const [size, faces] of facesBySize) assert.equal(faces.size, 1, `author of ${size}-stroke drawing keeps one face`);
  } finally { await db.close(); }
});

test('peer face is fixed per author across requesters and questions, varied across authors, anonymous and ZWJ-free (PGlite)', { skip: !PGlite }, async () => {
  const db = new PGlite();
  const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
  const author = id(2), authorAttempt = id(11), questions = [id(20), id(21), id(22)];
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table private.app_admins(user_id uuid primary key);
      create table public.profiles(id uuid primary key, equipped_title text, school_grade text, display_name text, nickname text, email text);
      create table public.exam_papers(id text primary key, kind text);
      create table public.exam_questions(id uuid primary key, paper_id text);
      create table public.exam_attempts(id uuid primary key, student_id uuid, paper_id text, status text, submitted_at timestamptz default now());
      create table public.exam_attempt_items(attempt_id uuid, question_id uuid, is_correct boolean, time_spent_ms bigint, primary key(attempt_id,question_id));
      create table public.exam_attempt_ink(attempt_id uuid, question_id uuid, revision integer, strokes jsonb, primary key(attempt_id,question_id));
      create table public.exam_ink_replay_batches(id uuid, attempt_id uuid, question_id uuid, revision integer, base_revision integer, baseline jsonb, events jsonb);
      grant usage on schema public to anon, authenticated;
      insert into exam_papers values ('paper','suneung');
      insert into profiles values ('${author}','수학의 신','고2','실제이름','닉네임','private@example.com');
    `);
    for (const file of ['20261004140000_exam_peer_solution.sql','20261004200000_exam_peer_solution_stable_face.sql'])
      await db.exec(fs.readFileSync(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
    const rpc = async (uid: string, attempt: string, q: string) => {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid}',false); set role authenticated;`);
      try { return (await db.query('select get_peer_solution($1,$2) r',[attempt,q])).rows[0].r; } finally { await db.exec('reset role'); }
    };
    // 한 작성자가 세 문항을 맞혔고, 서로 다른 요청자 여덟 명이 모두 틀렸다.
    await db.query(`insert into exam_attempts values ($1,$2,'paper','submitted')`,[authorAttempt,author]);
    for (const q of questions) {
      await db.query(`insert into exam_questions values ($1,'paper')`,[q]);
      await db.query('insert into exam_attempt_items values ($1,$2,true,30000)',[authorAttempt,q]);
      await db.query('insert into exam_attempt_ink values ($1,$2,1,$3::jsonb)',[authorAttempt,q,JSON.stringify(drawing())]);
    }
    const faces = new Set<string>();
    for (let r=0;r<8;r++) {
      const requester = id(100+r), attempt = id(200+r);
      await db.query(`insert into exam_attempts values ($1,$2,'paper','submitted')`,[attempt,requester]);
      for (const q of questions) {
        await db.query('insert into exam_attempt_items values ($1,$2,false,30000)',[attempt,q]);
        const got = await rpc(requester, attempt, q);
        assert.equal(got.label.title, '수학의 신'); assert.equal(got.label.isTeacher, false);
        faces.add(got.label.face);
        const text = JSON.stringify(got);
        for (const forbidden of [author,authorAttempt,requester,attempt,'student_id','studentId','attempt_id','attemptId','실제이름','닉네임','private@example.com']) assert.ok(!text.includes(forbidden), forbidden);
      }
    }
    assert.equal(faces.size, 1, 'same author → same face for every requester and question');
    const face = [...faces][0];
    assert.match(face, /^\p{Extended_Pictographic}$/u); assert.ok(!face.includes('‍'));

    // 한 문항에 작성자를 바꿔 가며 — 대부분 다른 얼굴, 선생님은 항상 🎓.
    const q = questions[0], requester = id(100), attempt = id(200);
    await db.query('delete from exam_attempt_ink where attempt_id=$1',[authorAttempt]);
    const authorFaces: string[] = [];
    for (let n=0;n<12;n++) {
      const a = id(300+n);
      await db.query(`insert into exam_attempts values ($1,$2,'paper','submitted')`,[a,id(400+n)]);
      await db.query('insert into exam_attempt_items values ($1,$2,true,30000)',[a,q]);
      await db.query('insert into exam_attempt_ink values ($1,$2,1,$3::jsonb)',[a,q,JSON.stringify(drawing())]);
      const got = await rpc(requester, attempt, q);
      assert.match(got.label.face, /^\p{Extended_Pictographic}$/u); assert.notEqual(got.label.face, '🎓');
      authorFaces.push(got.label.face);
      await db.query('delete from exam_attempt_ink where attempt_id=$1',[a]);
    }
    assert.ok(new Set(authorFaces).size >= 6, `different authors get varied faces: ${authorFaces.join('')}`);
    await db.query('insert into private.app_admins values ($1)',[id(500)]);
    await db.query(`insert into exam_attempts values ($1,$2,'paper','submitted')`,[id(501),id(500)]);
    await db.query('insert into exam_attempt_items values ($1,$2,true,30000)',[id(501),q]);
    await db.query('insert into exam_attempt_ink values ($1,$2,1,$3::jsonb)',[id(501),q,JSON.stringify(drawing())]);
    const teacher = await rpc(requester, attempt, q);
    assert.equal(teacher.label.isTeacher, true); assert.equal(teacher.label.face, '🎓');
  } finally { await db.close(); }
});

test('peer RPC also opens for unsure-marked questions, including correct ones (PGlite)', { skip: !PGlite }, async () => {
  const db = new PGlite();
  const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
  const me = id(1), other = id(2), mine = id(10), peer = id(11), q = id(20);
  try {
    await db.exec(`
      create role anon; create role authenticated; create schema auth; create schema private;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table private.app_admins(user_id uuid primary key);
      create table public.profiles(id uuid primary key, equipped_title text, school_grade text, display_name text, nickname text, email text);
      create table public.exam_papers(id text primary key, kind text);
      create table public.exam_questions(id uuid primary key, paper_id text);
      create table public.exam_attempts(id uuid primary key, student_id uuid, paper_id text, status text, submitted_at timestamptz default now());
      create table public.exam_attempt_items(attempt_id uuid, question_id uuid, is_correct boolean, unsure boolean not null default false, time_spent_ms bigint, primary key(attempt_id,question_id));
      create table public.exam_attempt_ink(attempt_id uuid, question_id uuid, revision integer, strokes jsonb, primary key(attempt_id,question_id));
      create table public.exam_ink_replay_batches(id uuid, attempt_id uuid, question_id uuid, revision integer, base_revision integer, baseline jsonb, events jsonb);
      grant usage on schema public to anon, authenticated;
      insert into exam_papers values ('paper','suneung'),('history','hanneung');
      insert into exam_questions values ('${q}','paper');
      insert into profiles values ('${other}','도전자','고2',null,null,null);
      insert into exam_attempts values ('${mine}','${me}','paper','submitted'), ('${peer}','${other}','paper','submitted');
      insert into exam_attempt_items values ('${mine}','${q}',true,false,30000), ('${peer}','${q}',true,false,30000);
    `);
    for (const file of ['20261004140000_exam_peer_solution.sql','20261004200000_exam_peer_solution_stable_face.sql','20261004220000_exam_peer_solution_unsure.sql'])
      await db.exec(fs.readFileSync(new URL(`../../supabase/migrations/${file}`,import.meta.url),'utf8'));
    await db.query('insert into exam_attempt_ink values ($1,$2,1,$3::jsonb)',[peer,q,JSON.stringify(drawing())]);
    const helper = (await db.query(`select has_function_privilege('authenticated','private.pick_exam_peer_solution(uuid,uuid)','execute') as h`)).rows[0].h;
    assert.equal(helper, false, 'helper stays private after replace');
    const rpc = async (replayKey?: string) => {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub','${me}',false); set role authenticated;`);
      try {
        return (await db.query(replayKey === undefined ? 'select get_peer_solution($1,$2) r' : 'select get_peer_solution_replay($1,$2,$3) r',
          replayKey === undefined ? [mine,q] : [mine,q,replayKey])).rows[0].r;
      } finally { await db.exec('reset role'); }
    };
    const setMine = (correct: boolean, unsure: boolean) =>
      db.query('update exam_attempt_items set is_correct=$1, unsure=$2 where attempt_id=$3',[correct,unsure,mine]);

    await setMine(true, false);
    await assert.rejects(rpc(), /EXAM_PEER_NOT_ALLOWED/, 'correct and not unsure stays closed');
    await assert.rejects(rpc('x'), /EXAM_PEER_NOT_ALLOWED/);

    await setMine(true, true);
    const unsureCorrect = await rpc();
    assert.equal(unsureCorrect.label.title, '도전자', 'correct but unsure opens');
    assert.equal((await rpc(unsureCorrect.solutionKey)).strokes.length, 3, 'replay also allowed');

    await setMine(false, true);
    assert.equal((await rpc()).label.title, '도전자', 'wrong and unsure opens');
    await setMine(false, false);
    assert.equal((await rpc()).label.title, '도전자', 'wrong (existing rule) still opens');

    // 나머지 규칙은 그대로 — 애매 표시여도 제출 전·한능검·남의 응시는 거부.
    await setMine(true, true);
    for (const [sql, restore] of [
      [`update exam_attempts set status='in_progress' where id='${mine}'`, `update exam_attempts set status='submitted' where id='${mine}'`],
      [`update exam_papers set kind='hanneung' where id='paper'`, `update exam_papers set kind='suneung' where id='paper'`],
      [`update exam_questions set paper_id='history'`, `update exam_questions set paper_id='paper'`],
      [`update exam_attempts set student_id='${other}' where id='${mine}'`, `update exam_attempts set student_id='${me}' where id='${mine}'`],
    ]) {
      await db.exec(sql); await assert.rejects(rpc(), /EXAM_PEER_NOT_ALLOWED/, sql); await db.exec(restore);
    }
    // 후보는 여전히 '맞힌' 응시만 — 애매 표시는 후보 조건을 바꾸지 않는다.
    await db.exec(`update exam_attempt_items set is_correct=false, unsure=true where attempt_id='${peer}'`);
    assert.equal(await rpc(), null, 'unsure-but-wrong peers are not candidates');
  } finally { await db.close(); }
});
