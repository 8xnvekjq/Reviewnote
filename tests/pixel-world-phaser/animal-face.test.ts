import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { animalFaceHash, userAnimalFace, PEER_ANIMAL_FACES } from '../../src/utils/animalFace.ts';
import { protocolExtras } from '../../src/features/pixel-room/plaza/presenceProtocol.ts';
import { createPlazaStoreState, plazaStoreReducer } from '../../src/features/pixel-room/plaza/presenceStore.ts';
import { avatarLayerPlan, avatarTextureKey } from '../../src/features/pixel-world-phaser/logic/avatarPlan.ts';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog.ts';

const ids = ['7f91f87f-17a0-4d6f-8715-263663d00dc0', 'f7df1fa8-8e97-49fc-a95b-b42e5fa28255',
  'cdf67bf0-5186-4810-98af-6591e87e8dfd', '6dddcb5d-fb7b-4e41-b69e-6cc6770d280f'];
const overrides = ['🦦', '🦒', '🐰', '🐱'];
const other = '00000000-0000-0000-0000-000000000001';
const empty = { top: null, bottom: null, shoes: null, hair: null, skin: null, eyes: null };

test('MD5 twin matches Postgres byte order and overrides take precedence', () => {
  for (const id of [...ids, other, 'ffffffff-ffff-ffff-ffff-ffffffffffff']) {
    const hash = Number.parseInt(createHash('md5').update('exam-peer-face:' + id).digest('hex').slice(0, 8), 16);
    assert.equal(animalFaceHash(id), hash);
    assert.equal(userAnimalFace(id), PEER_ANIMAL_FACES[hash % 33]);
    assert.equal(userAnimalFace(id.toUpperCase()), userAnimalFace(id));
  }
  ids.forEach((id, i) => assert.equal(userAnimalFace(id, overrides[i]), overrides[i]));
  assert.equal(userAnimalFace(other, '<script>'), userAnimalFace(other));
  assert.equal(userAnimalFace(other, '🎓'), userAnimalFace(other));
});

test('presence encodes and decodes optional face without changing legacy coordinates', () => {
  const legacy = { x: 2, y: 3 };
  assert.deepEqual(protocolExtras(legacy), {});
  const state = { ...legacy, version: 2 as const, position: { x: 2.1, y: 3 }, pet: null, riding: false };
  const encoded = protocolExtras({ ...state, face: '🦒' });
  assert.equal(encoded.face, '🦒');
  assert.deepEqual(protocolExtras({ ...state, ...JSON.parse(JSON.stringify(encoded)) }), encoded);
  assert.equal(protocolExtras(state).face, undefined);
  assert.deepEqual(protocolExtras({ ...legacy, face: '🐱' }), { face: '🐱' });
  for (const face of ['🎓', '🐱🐱', 'x'.repeat(100)]) assert.equal(protocolExtras({ ...state, face }).face, undefined);
  const player = { ...state, ...encoded, sessionId: other, appearance: empty, direction: 'Front' as const, moving: false, seq: 1, updatedAt: 100 };
  let store = plazaStoreReducer(createPlazaStoreState(), { type: 'presence-join', players: [{ player, presenceRef: 'join' }] });
  assert.equal(store.players.get(other)?.face, '🦒');
  const oldPlayer = { ...player, face: undefined, seq: 2 };
  store = plazaStoreReducer(store, { type: 'presence-join', players: [{ player: oldPlayer, presenceRef: 'legacy' }] });
  assert.equal(store.players.get(other)?.face, undefined);
});

test('bald and deep skin select distinct atlas rows and texture keys', () => {
  const look = { ...empty, hair: 'bald', skin: 'deep' };
  const plan = avatarLayerPlan(look);
  assert.deepEqual(plan.find(p => p.layer === 'hair'), { layer: 'hair', kind: 'sheet', row: 29 });
  assert.deepEqual(plan.find(p => p.layer === 'body'), { layer: 'body', kind: 'sheet', row: 5 });
  assert.notEqual(avatarTextureKey(look), avatarTextureKey(empty));
  assert.equal(PIXEL_CATALOG.find(i => i.itemId === 'hair_bald')?.price, 0);
});

test('animal face migration executes twice, shares overrides, preserves teacher faces and grants', async () => {
  const pkg = '@electric-sql/pglite';
  const { PGlite } = await import(pkg);
  const db = new PGlite();
  try {
    await db.exec(`create schema private; create schema pixel_private; create schema auth;
      create role anon; create role authenticated;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table profiles(id uuid primary key, equipped_title text, school_grade text);
      create table private.app_admins(user_id uuid);
      create table pixel_fish_catches(species_id text,length_cm numeric,user_id uuid,caught_at timestamptz);
      create table pixel_avatar_equipment(user_id uuid primary key,hair text,skin_tone text,eye_color text,updated_at timestamptz);
      create table pixel_item_catalog(item_id text primary key,category text,slot text,price int,asset_key text,display_name text,tier int,stackable boolean);
      create table exam_solution_audio(attempt_id uuid,question_id uuid);
      create function private.exam_peer_candidates(uuid,uuid) returns table(peer_id uuid,revision int,author_id uuid,teacher boolean,time_spent_ms bigint,sort_position int)
      language sql as $$ select p.id,1,p.id,exists(select 1 from private.app_admins a where a.user_id=p.id),5000::bigint,1 from public.profiles p $$;
      grant usage on schema public to authenticated,anon;
    `);
    for (const id of [...ids, other]) await db.query('insert into profiles(id) values ($1)', [id]);
    const migration = readFileSync(new URL('../../supabase/migrations/20261011100000_user_animal_face.sql', import.meta.url), 'utf8');
    await db.exec(migration); await db.exec(migration);
    for (const [i, id] of ids.entries()) {
      assert.equal((await db.query('select private.user_animal_face($1) face', [id])).rows[0].face, overrides[i]);
    }
    for (const id of [other, 'ffffffff-ffff-ffff-ffff-ffffffffffff']) {
      const row = (await db.query("select private.user_animal_face($1) face, ('x'||substr(md5('exam-peer-face:'||$1::uuid::text),1,8))::bit(32)::bigint hash", [id])).rows[0];
      assert.equal(Number(row.hash), animalFaceHash(id)); assert.equal(row.face, userAnimalFace(id));
    }
    await assert.rejects(db.query('update profiles set animal_face=$1 where id=$2', ['🐱🐱', other]), /profiles_animal_face_check/);
    await db.query('insert into private.app_admins values ($1)', [other]);
    await db.exec(`select set_config('request.jwt.claim.sub','${ids[0]}',false)`);
    for (const [i, id] of [...ids, other].entries()) await db.query('insert into pixel_fish_catches values ($1,30,$2,now())', ['fish' + i, id]);
    const board = (await db.query('select pixel_private.get_class_fish_board() r')).rows[0].r as any;
    assert.deepEqual(new Set(board.rows.map((r: any) => r.animal)), new Set([...overrides, '🎓']));
    assert.equal(Number(board.classSpecies), 4);
    const peers = (await db.query('select list_peer_solutions_v2($1,$1) r', [other])).rows[0].r as any[];
    assert.deepEqual(new Set(peers.map(r => r.label.face)), new Set([...overrides, '🎓']));
    await db.exec('set role authenticated');
    assert.equal((await db.query('select get_my_animal_face() face')).rows[0].face, '🦦');
    assert.equal(((await db.query("select set_pixel_base_appearance('deep','sky') r")).rows[0].r as any).ok, true);
    assert.equal(((await db.query('select equip_pixel_bald() r')).rows[0].r as any).itemId, 'hair_bald');
    await db.exec('reset role');
    for (const fn of ['get_my_animal_face()', 'equip_pixel_bald()', 'set_pixel_base_appearance(text,text)', 'list_peer_solutions_v2(uuid,uuid)']) {
      const grants = (await db.query('select has_function_privilege(\'anon\',$1,\'EXECUTE\') anon, has_function_privilege(\'authenticated\',$1,\'EXECUTE\') authenticated', [fn])).rows[0];
      assert.deepEqual(grants, { anon: false, authenticated: true });
    }
    assert.equal((await db.query("select has_function_privilege('authenticated','private.user_animal_face(uuid)','EXECUTE') allowed")).rows[0].allowed, false);
    await db.exec("select set_config('request.jwt.claim.sub','',false); set role authenticated");
    await assert.rejects(db.query('select get_my_animal_face()'), /Authentication required/);
  } finally { await db.close(); }
});
