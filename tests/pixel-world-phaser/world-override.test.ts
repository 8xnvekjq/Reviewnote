import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { applyPersonalClock, applyWorldOverride, PHASE_MINUTES, phaseForMinutes, worldClockAt } from '../../src/features/pixel-world-phaser/logic/worldClock.ts';
import { createFishingAdapter, parseWorldClock } from '../../src/features/pixel-world-phaser/ui/fishingAdapter.ts';
import { createMockFishingAdapter } from '../../src/features/pixel-world-phaser/ui/fishingAdapterMock.ts';

test('전역 설정의 만료·부분 자동·개인 우선순위와 대표 시각', () => {
  const now = Date.parse('2026-10-09T03:00:00Z');
  const automatic = worldClockAt(now);
  for (const [phase, minutes] of Object.entries(PHASE_MINUTES)) {
    const o = { phase: phase as keyof typeof PHASE_MINUTES, weather: 'rain' as const, expiresAt: new Date(now + 1000).toISOString() };
    assert.equal(phaseForMinutes(minutes), phase);
    assert.deepEqual(applyWorldOverride(automatic, o, now), { ...automatic, phase, weather: 'rain', minutes });
    assert.deepEqual(applyWorldOverride(automatic, o, now + 1000), automatic);
  }
  assert.deepEqual(applyWorldOverride(automatic, { weather: 'clear', expiresAt: new Date(now + 1000).toISOString() }, now), { ...automatic, weather: 'clear' });
  assert.equal(applyPersonalClock({ ...automatic, phase: 'night', minutes: 1320 }, { clock: '08:00', weather: 'clear' }).phase, 'morning');
  assert.deepEqual(applyWorldOverride(automatic, { phase: 'night', expiresAt: 'bad' }, now), automatic);
});

test('어댑터 RPC와 모의 학생의 전역 시계', async () => {
  const store = { override: null };
  const admin = createMockFishingAdapter({ isAdmin: true, worldStore: store });
  const student = createMockFishingAdapter({ worldStore: store });
  assert.equal(await student.adminSetWorldOverride?.('rain', 'night', 3), false);
  assert.equal(await admin.adminSetWorldOverride?.('rain', 'night', 3), true);
  assert.equal((await student.state()).phase, 'night');
  assert.equal((await student.getWorldClock?.())?.weather, 'rain');
  const clock = await student.getWorldClock?.();
  assert.deepEqual(parseWorldClock(clock), clock);
  assert.equal(parseWorldClock({ ...clock, minutes: 1440 }), null);
  const calls: unknown[] = [];
  const adapter = createFishingAdapter({ rpc: async (name, args) => { calls.push([name, args]); return { data: name === 'get_pixel_world_clock' ? clock : null, error: null }; } });
  assert.equal(await adapter.adminSetWorldOverride?.('rain', 'night', 0), true);
  assert.deepEqual(calls[0], ['admin_set_pixel_world_override', { p_weather: 'rain', p_phase: 'night', p_hours: 0 }]);
  assert.deepEqual(await adapter.getWorldClock?.(), clock);
});

test('PGlite 전역 설정: 권한·학생 시계·만료·자동·개인 우선순위', async () => {
  const db = new PGlite();
  const admin = '00000000-0000-0000-0000-000000000001';
  const student = '00000000-0000-0000-0000-000000000002';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create schema private; create schema pixel_private;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function private.is_current_user_admin() returns boolean language sql stable as $$ select coalesce(auth.uid()='${admin}'::uuid,false) $$;`);
    // 기존 낚시 마이그레이션의 실제 시계 함수들을 불러온다.
    const sql = readFileSync(new URL('../../supabase/migrations/supabase_pixel_fishing.sql', import.meta.url), 'utf8');
    for (const name of ['fish_fnv1a', 'fish_weather_for', 'fish_phase_for', 'fish_clock']) {
      const start = sql.indexOf(`create or replace function pixel_private.${name}(`);
      await db.exec(sql.slice(start, sql.indexOf('$$;', sql.indexOf('as $$', start)) + 3));
    }
    await db.exec(readFileSync(new URL('../../supabase/migrations/20261009230000_pixel_world_override.sql', import.meta.url), 'utf8'));
    const user = async (id: string) => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false); set role authenticated;`); };
    const clock = async () => (await db.query<{ c: any }>('select public.get_pixel_world_clock() c')).rows[0].c;
    await user(student);
    const automatic = await clock();
    await assert.rejects(db.exec("select public.admin_set_pixel_world_override('rain','night',3)"), /PIXEL_ADMIN_REQUIRED/);
    await assert.rejects(db.exec('select * from pixel_private.world_override'), /permission denied/);
    await user(admin);
    await db.exec("select public.admin_set_pixel_world_override('rain','night',3)");
    await user(student);
    const changed = await clock();
    assert.equal(changed.weather, 'rain'); assert.equal(changed.phase, 'night'); assert.equal(changed.minutes, 1320);
    await db.exec('reset role');
    const fish = (await db.query<any>("select * from pixel_private.fish_clock('08:00','clear')")).rows[0];
    assert.equal(fish.phase, 'night'); assert.equal(fish.weather, 'rain');
    await user(admin); await db.exec('reset role');
    const personal = (await db.query<any>("select * from pixel_private.fish_clock('08:00','clear')")).rows[0];
    assert.equal(personal.phase, 'morning'); assert.equal(personal.weather, 'clear');
    await db.exec("update pixel_private.world_override set expires_at=now()-interval '1 second'");
    await user(student); assert.deepEqual({ ...(await clock()), serverNow: null }, { ...automatic, serverNow: null });
    await user(admin); await db.exec("select public.admin_set_pixel_world_override(null,'evening',0)");
    const partial = await clock(); assert.equal(partial.weather, automatic.weather); assert.equal(partial.minutes, 1110);
    assert.equal(new Date(partial.override.expiresAt).getUTCHours(), 15);
    await db.exec("select public.admin_set_pixel_world_override('clear',null,100)");
    const weatherOnly = await clock(); assert.equal(weatherOnly.phase, automatic.phase); assert.equal(weatherOnly.minutes, automatic.minutes);
    assert.ok(Math.abs(Date.parse(weatherOnly.override.expiresAt)-Date.parse(weatherOnly.serverNow)-24*3600000)<10);
    await assert.rejects(db.exec("select public.admin_set_pixel_world_override('bad','night',3)"), /PIXEL_OVERRIDE_INVALID/);
    await db.exec('select public.admin_set_pixel_world_override(null,null)'); assert.equal((await clock()).override, null);
    await db.exec('reset role');
    for (const fn of ['public.admin_set_pixel_world_override(text,text,integer)', 'public.get_pixel_world_clock()']) {
      const grants = (await db.query<any>(`select has_function_privilege('anon',$1,'execute') anon, has_function_privilege('authenticated',$1,'execute') authenticated`, [fn])).rows[0];
      assert.deepEqual(grants, { anon: false, authenticated: true });
    }
    assert.equal((await db.query<any>("select relrowsecurity from pg_class where oid='pixel_private.world_override'::regclass")).rows[0].relrowsecurity, true);
    await db.exec('set role anon'); await assert.rejects(db.exec('select public.get_pixel_world_clock()'), /permission denied/);
  } finally { await db.close(); }
});
