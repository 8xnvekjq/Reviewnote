import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SECRET_SPOTS, SECRET_SPOT_RADIUS, CAST_MAX_PX, secretSpotAvailable, secretSpotAt } from '../../src/features/pixel-world-phaser/logic/hotspots.ts';
import { RIVER_COLS, RIVER_ROWS, riverWater } from '../../src/features/pixel-world-phaser/logic/riverWorld.ts';
import { FISH_CATALOG } from '../../src/features/pixel-world-phaser/logic/fishCatalog.ts';
import { createFishingAdapter } from '../../src/features/pixel-world-phaser/ui/fishingAdapter.ts';
import { createMockFishingAdapter } from '../../src/features/pixel-world-phaser/ui/fishingAdapterMock.ts';
const sql = (name: string) => readFileSync(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8');
const user = '11111111-1111-1111-1111-111111111111';
const peer = '22222222-2222-2222-2222-222222222222';
async function database() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create schema private;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function private.is_current_user_admin() returns boolean language sql as $$ select true $$;
      create function private.user_animal_face(uuid) returns text language sql as $$ select '🐶'::text $$;
      create table private.app_admins(user_id uuid);
      create table auth.users(id uuid primary key);
      create table public.profiles(id uuid primary key);
      create table public.pixel_pet_equipment(user_id uuid primary key, active_pet text);
      create table public.pixel_item_ownership(user_id uuid, item_id text, primary key(user_id,item_id));
      create table public.pixel_item_catalog(item_id text primary key,category text,slot text,price int,asset_key text,display_name text,tier int,stackable boolean);
      grant usage on schema auth, public to authenticated;
      insert into auth.users values ('${user}'),('${peer}');
      insert into public.profiles values ('${user}'),('${peer}');
      select set_config('request.jwt.claim.sub','${user}',false);`);
    for (const name of ['supabase_pixel_fishing.sql', 'supabase_pixel_fishing_v2.sql', 'supabase_pixel_fishing_v3.sql', 'supabase_pixel_fishing_v4.sql']) await db.exec(sql(name));
    const bait = sql('supabase_pixel_level_bait.sql');
    await db.exec(bait.slice(0, bait.indexOf('create or replace function pixel_private.get_pixel_fishing_state')) + '\ncommit;');
    await db.exec(sql('20261011150000_pixel_pet_effects_v2.sql'));
    await db.exec(sql('20261011120000_fish_board_teacher_rainbow_only.sql'));
    await db.exec(sql('20261011170000_pixel_fishing_expansion.sql'));
    return db;
}


test('secret spots are water beyond every bank and dock cast', () => {
 for (const spot of SECRET_SPOTS) {
  const p = { x: spot.cell.x * 16 + 8, y: spot.cell.y * 16 + 8 };
  assert.equal(secretSpotAt(p), spot.id);
  for (let y=0;y<RIVER_ROWS;y++) for(let x=0;x<RIVER_COLS;x++) {
   if (riverWater({x,y})) continue;
   // Nearest point on the whole land tile; 28px conservatively covers the rod origin offset.
   const dx=Math.max(x*16-p.x,0,p.x-(x+1)*16),dy=Math.max(y*16-p.y,0,p.y-(y+1)*16);
   assert.ok(Math.hypot(dx,dy)>CAST_MAX_PX+SECRET_SPOT_RADIUS+28, `${spot.id} near ${x},${y}`);
  }
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)assert.ok(riverWater({x:spot.cell.x+dx,y:spot.cell.y+dy}));
 }
});
test('conditions and exactly one species per secret pool', () => {
 for(const spot of SECRET_SPOTS)assert.deepEqual(FISH_CATALOG.filter(f=>f.secretSpot===spot.id).map(f=>f.id),[spot.speciesId]);
 for(const phase of ['morning','day','evening','night'] as const)for(const weather of ['clear','cloudy','rain'] as const){
  assert.equal(secretSpotAvailable('secret_whirlpool',phase,weather),true);
  assert.equal(secretSpotAvailable('secret_bridge_shade',phase,weather),phase==='night');
  assert.equal(secretSpotAvailable('secret_reed_isle',phase,weather),weather==='rain');
 }
 assert.equal(secretSpotAvailable('forged','night','rain'),false);
});
test('adapter maps optional mount and spot without changing old arguments', async()=>{
 const calls:any[]=[]; const adapter=createFishingAdapter({rpc:async(fn,args)=>{calls.push({fn,args});return {data:null,error:null};}});
 await adapter.start(null); await adapter.start('pet_duck',null,{spotId:'secret_whirlpool',mountedDuck:true});
 assert.deepEqual(calls[0].args,{p_pet:null});
 assert.deepEqual(calls[1].args,{p_pet:'pet_duck',p_secret_spot:'secret_whirlpool',p_mounted_duck:true});
});
test('migration runs twice and server rejects forged mounts, isolates pools, keeps throttle',async()=>{
 const db=await database();
 try {
  await db.exec(sql('20261009230000_pixel_world_override.sql'));
  await db.exec(sql('20261011190000_pixel_fishing_hotspots.sql'));
  await db.exec(sql('20261011200000_pixel_fishing_spots_three.sql'));
  await db.exec(sql('20261104100000_pixel_fishing_secret_spots.sql'));
  await db.exec(sql('20261104100000_pixel_fishing_secret_spots.sql'));
  await db.exec(`insert into pixel_pet_equipment values ('${user}','pet_duck'); insert into pixel_item_ownership values ('${user}','pet_duck')`);
  const start=async(spot:string|null,duck=true,phase:string|null='23:00',weather:string|null='rain')=>(await db.query<any>('select public.start_pixel_cast($1,$2,$3,null,$4,$5) r',['pet_duck',phase,weather,spot,duck])).rows[0].r;
  await assert.rejects(start('forged'));
  await assert.rejects(start('secret_whirlpool',false));
  assert.equal(Number((await db.query<any>("select pixel_private.fish_difficulty('eddy_dragon',300) d")).rows[0].d),5);
  assert.equal((await db.query<any>("select has_function_privilege('anon','public.start_pixel_cast(text,text,text,integer,text,boolean)','EXECUTE') allowed")).rows[0].allowed,false);
  // Make secret species common for deterministic sampling: only pool eligibility is under test here.
  await db.exec("update pixel_fish_species set rarity='common' where id in ('eddy_dragon','bridge_moon_eel','rain_reed_koi')");
  for(const [spot,phase,weather,expected] of [[null,'23:00','rain',null],['secret_whirlpool','13:00','clear','eddy_dragon'],['secret_bridge_shade','13:00','rain',null],['secret_bridge_shade','23:00','clear','bridge_moon_eel'],['secret_reed_isle','13:00','clear',null],['secret_reed_isle','13:00','rain','rain_reed_koi']] as const){
   const found=new Set<string>();
   for(let i=0;i<100;i++){
    await db.exec('delete from pixel_fish_casts;delete from pixel_private.fish_start_throttle');
    const cast=await start(spot,true,phase,weather);assert.equal(cast.ok,true);
    const rows=await db.query<any>('select species_id from pixel_fish_casts');const id=rows.rows[0].species_id;
    if(['eddy_dragon','bridge_moon_eel','rain_reed_koi'].includes(id)){assert.equal(id,expected);found.add(id);}
    assert.equal((await start(spot,true,phase,weather)).reason,'pending');
    await db.exec('delete from pixel_fish_casts');
    assert.equal((await start(spot,true,phase,weather)).reason,'pending');
   }
   if(expected)assert.ok(found.has(expected),`never selected ${expected}`);
  }
  await db.exec("select public.admin_set_pixel_world_override('rain','night',3)");
  const globallySeen=new Set<string>();
  for(let i=0;i<100;i++){
   await db.exec('delete from pixel_fish_casts;delete from pixel_private.fish_start_throttle');
   assert.equal((await start('secret_bridge_shade',true,null,null)).ok,true);
   const row=(await db.query<any>('select species_id,phase,weather from pixel_fish_casts')).rows[0];
   assert.equal(row.phase,'night');assert.equal(row.weather,'rain');globallySeen.add(row.species_id);
  }
  assert.ok(globallySeen.has('bridge_moon_eel'));
  await db.exec('delete from pixel_fish_casts;delete from pixel_private.fish_start_throttle');
  assert.equal((await db.query<any>('select public.start_pixel_cast(null) r')).rows[0].r.ok,true);
 }finally{await db.close();}
});

test('mock pool excludes secrets without mount and allows only the matching conditioned species',async()=>{
 for(const spot of [null,...SECRET_SPOTS.map(s=>s.id)]){
  let now=1800000000000;
  const adapter=createMockFishingAdapter({seed:42,now:()=>now,activePet:'pet_duck',isAdmin:true,override:{clock:'23:00',weather:'rain'}});
  const seen=new Set<string>();
  for(let i=0;i<1500;i++){
   const result=await adapter.start('pet_duck',null,spot?{spotId:spot,mountedDuck:true}:undefined);assert.equal(result.ok,true);
   const id=adapter.peek()!.speciesId;const fish=FISH_CATALOG.find(f=>f.id===id)!;
   if(fish.secretSpot){assert.equal(fish.secretSpot,spot);seen.add(id);}
   if(result.ok)await adapter.finish(result.castId,false);now+=3000;
  }
  if(spot)assert.ok(seen.has(SECRET_SPOTS.find(s=>s.id===spot)!.speciesId));
 }
});
