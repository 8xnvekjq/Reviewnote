import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const pkg = '@electric-sql/pglite';
const { PGlite } = await import(pkg);
const migration = readFileSync(new URL('../../supabase/migrations/20261014000000_pixel_card_rps.sql', import.meta.url), 'utf8');
const npcFirstWin = readFileSync(new URL('../../supabase/migrations/20261015000000_card_rps_npc_first_win.sql', import.meta.url), 'utf8');
const cases = JSON.parse(readFileSync(new URL('./fixtures/card-rps-cases.json', import.meta.url), 'utf8'));
const A='00000000-0000-0000-0000-00000000000a', B='00000000-0000-0000-0000-00000000000b', C='00000000-0000-0000-0000-00000000000c';

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;
    create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
    create schema pixel_private;revoke all on schema pixel_private from public,anon,authenticated;
    create table public.profiles(id uuid primary key,nickname text,display_name text,bonus_points integer not null default 0,point_adjustment integer not null default 0);
    insert into public.profiles values('${A}','가','가',100,0),('${B}','나','나',100,0),('${C}','다','다',100,0);
    grant usage on schema public to authenticated;`);
  await db.exec(migration.replace(/do \$\$ begin alter publication[\s\S]*?end \$\$;/,''));
  await db.exec(npcFirstWin);
  // 마이그레이션이 만든 RPC는 아래 호출들로 존재와 권한을 함께 검증한다.
  const as=async(uid:string,sql:string,args:unknown[]=[])=>{await db.exec(`reset role;select set_config('request.jwt.claim.sub','${uid}',false);set role authenticated;`);try{return (await db.query(sql,args)).rows;}finally{await db.exec('reset role');}};
  return {db,as};
}

test('SQL 판정 함수가 공용 한 판 사례를 모두 통과한다',async()=>{const {db}=await database();try{
  for(const c of cases.rounds){const r=(await db.query('select pixel_private.card_rps_resolve_round($1::text[],$2::text[]) r',[c.a,c.b])).rows[0].r as any;assert.equal(r.winner,c.winner,c.name);assert.deepEqual(r.clashes.map((x:any)=>[x.a,x.b,x.result]),c.clashes,c.name);}
}finally{await db.close();}});

test('친구 판돈, 제출 숨김, 승리 지급과 동시 경기 제한',async()=>{const {db,as}=await database();try{
  const invited=(await as(A,'select public.invite_card_rps($1::uuid,10) r',[B]))[0].r as any;assert.equal(invited.status,'invited');assert.equal((await db.query('select bonus_points+point_adjustment p from profiles where id=$1',[A])).rows[0].p,90);
  await assert.rejects(as(A,'select public.invite_card_rps($1::uuid,10)',[C]),/busy/);const accepted=(await as(B,'select public.respond_card_rps($1::uuid,true) r',[invited.matchId]))[0].r as any;assert.equal(accepted.status,'choosing');
  const waiting=(await as(A,"select public.submit_card_rps_cards($1::uuid,array['paper']) r",[invited.matchId]))[0].r as any;assert.equal(waiting.me.submitted,true);assert.equal(waiting.opponent.submitted,false);
  await assert.rejects(as(B,'select count(*)::int n from pixel_private.card_rps_submissions'),/permission denied/,'제출 원문은 직접 읽지 못한다');
  await as(B,"select public.submit_card_rps_cards($1::uuid,array['rock'])",[invited.matchId]);await as(A,"select public.submit_card_rps_cards($1::uuid,array['paper'])",[invited.matchId]);const done=(await as(B,"select public.submit_card_rps_cards($1::uuid,array['rock']) r",[invited.matchId]))[0].r as any;assert.equal(done.status,'finished');assert.equal(done.winnerId,A);assert.equal((await db.query('select bonus_points+point_adjustment p from profiles where id=$1',[A])).rows[0].p,110);
}finally{await db.close();}});

test('거절·만료 환불, NPC 연습 판, 시간 초과 기권',async()=>{const {db,as}=await database();try{
  let m=(await as(A,'select public.invite_card_rps($1::uuid,20) r',[B]))[0].r as any;await as(B,'select public.respond_card_rps($1::uuid,false)',[m.matchId]);assert.equal((await db.query('select bonus_points+point_adjustment p from profiles where id=$1',[A])).rows[0].p,100);
  m=(await as(A,'select public.invite_card_rps($1::uuid,20) r',[B]))[0].r as any;await db.query("update pixel_card_rps_matches set invite_expires_at=now()-interval '1 second' where id=$1",[m.matchId]);const expired=(await as(B,'select public.respond_card_rps($1::uuid,true) r',[m.matchId]))[0].r as any;assert.equal(expired.status,'expired');assert.equal((await db.query('select bonus_points+point_adjustment p from profiles where id=$1',[A])).rows[0].p,100);
  await db.query("insert into pixel_private.card_rps_npc_wins values($1,(now() at time zone 'Asia/Seoul')::date,5)",[A]);m=(await as(A,'select public.start_npc_card_rps() r'))[0].r as any;assert.equal(m.stake,0);assert.equal(m.prize,0);await as(A,"select public.submit_card_rps_cards($1::uuid,array['rock'])",[m.matchId]);
  await as(A,'select public.leave_card_rps($1::uuid)',[m.matchId]);m=(await as(A,'select public.start_npc_card_rps() r'))[0].r as any;await db.query("update pixel_card_rps_matches set deadline_at=now()-interval '1 second' where id=$1",[m.matchId]);const timed=(await as(A,'select public.get_card_rps_match($1::uuid) r',[m.matchId]))[0].r as any;assert.equal(timed.status,'finished');assert.equal(timed.endReason,'timeout');assert.equal(timed.winnerId,'npc_mouse');
}finally{await db.close();}});

test('승부차기는 비기면 다시 낼 수 있고, 신청 상태에서는 나가기로 판돈을 만들 수 없다',async()=>{const {db,as}=await database();try{
  const pts=async(u:string)=>(await db.query('select bonus_points+point_adjustment p from profiles where id=$1',[u])).rows[0].p;
  const inv=(await as(A,'select public.invite_card_rps($1::uuid,10) r',[B]))[0].r as any;
  await assert.rejects(as(B,'select public.leave_card_rps($1::uuid)',[inv.matchId]),/not_your_turn/);
  await assert.rejects(as(A,'select public.leave_card_rps($1::uuid)',[inv.matchId]),/not_your_turn/);
  await as(B,'select public.respond_card_rps($1::uuid,true)',[inv.matchId]);
  for(let i=0;i<3;i++){await as(A,"select public.submit_card_rps_cards($1::uuid,array['rock'])",[inv.matchId]);await as(B,"select public.submit_card_rps_cards($1::uuid,array['rock'])",[inv.matchId]);}
  let m=(await as(A,'select public.get_card_rps_match($1::uuid) r',[inv.matchId]))[0].r as any;assert.equal(m.status,'shootout');
  await as(A,"select public.submit_card_rps_shootout($1::uuid,'rock')",[inv.matchId]);await as(B,"select public.submit_card_rps_shootout($1::uuid,'rock')",[inv.matchId]);
  m=(await as(A,'select public.get_card_rps_match($1::uuid) r',[inv.matchId]))[0].r as any;assert.equal(m.status,'shootout');assert.equal(m.shootout.length,1);
  await as(A,"select public.submit_card_rps_shootout($1::uuid,'paper')",[inv.matchId]);m=(await as(B,"select public.submit_card_rps_shootout($1::uuid,'rock') r",[inv.matchId]))[0].r as any;
  assert.equal(m.status,'finished');assert.equal(m.endReason,'shootout');assert.equal(m.winnerId,A);assert.equal(await pts(A),110);assert.equal(await pts(B),90);
}finally{await db.close();}});

test('NPC 대결은 무료이고 상금은 사람마다 최초 1승만 준다',async()=>{const {db,as}=await database();try{
  const pts=async(u:string)=>(await db.query('select bonus_points+point_adjustment p from profiles where id=$1',[u])).rows[0].p;
  // 승패는 무작위 NPC 대신 정산 함수를 직접 불러 고정한다.
  const finish=async(id:string,winner:string)=>{await db.query("select pixel_private.card_rps_settle($1::uuid,$2,'wins')",[id,winner]);return (await as(A,'select public.get_card_rps_match($1::uuid) r',[id]))[0].r as any;};
  let m=(await as(A,'select public.start_npc_card_rps() r'))[0].r as any;assert.equal(m.stake,0);assert.equal(m.prize,20);assert.equal(await pts(A),100,'참가비를 받지 않는다');
  let done=await finish(m.matchId,'npc_mouse');assert.equal(done.pointDelta,0);assert.equal(await pts(A),100,'져도 잃지 않는다');
  m=(await as(A,'select public.start_npc_card_rps() r'))[0].r as any;assert.equal(m.prize,20,'보상받은 승리가 없으면 다음 판도 상금이 걸린다');
  done=await finish(m.matchId,A);assert.equal(done.pointDelta,20);assert.equal(await pts(A),120);
  await db.query("update pixel_private.card_rps_npc_wins set kst_date=kst_date-7 where user_id=$1",[A]);
  m=(await as(A,'select public.start_npc_card_rps() r'))[0].r as any;assert.equal(m.stake,0);assert.equal(m.prize,0,'다른 날이어도 두 번째 보상은 없다');
  done=await finish(m.matchId,A);assert.equal(done.pointDelta,0);assert.equal(await pts(A),120);
  m=(await as(A,'select public.start_npc_card_rps() r'))[0].r as any;done=await finish(m.matchId,'npc_mouse');assert.equal(done.pointDelta,0);assert.equal(await pts(A),120);
  assert.equal((await db.query('select sum(wins)::int n from pixel_private.card_rps_npc_wins where user_id=$1',[A])).rows[0].n,1);
  const other=(await as(B,'select public.start_npc_card_rps() r'))[0].r as any;assert.equal(other.prize,20,'다른 사람은 따로 최초 1승을 받는다');
}finally{await db.close();}});
