import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { effectNotes, scheduleEffect, SFX_GAIN } from '../../src/features/pixel-room/bgm/sfx.ts';
import { midiToHz } from '../../src/features/pixel-room/bgm/song.ts';
import { decideHaptics, idleHaptics, reelInZone } from '../../src/features/pixel-world-phaser/logic/reelHaptics.ts';
import { createReelGame } from '../../src/features/pixel-world-phaser/logic/reelGame.ts';

test('effects schedule pitches, offsets, gentle gain and envelopes', () => {
  const expected = { bite: [84,57,100], catch: [72,76,79,84], fanfare: [72,76,79,84,88,91,72], levelUp: [72,76,79,84,79,84,88], reelClick: [98,74] } as const;
  for (const effect of ['bite','catch','fanfare','levelUp','reelClick'] as const) {
    const starts: number[] = [], stops: number[] = [], pitches: number[] = [], ramps: number[] = [];
    const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime(_value: number, time: number) { ramps.push(time); } });
    const gains: any[] = [];
    const ctx: any = { currentTime: 2, destination: {}, createGain() { const node = { gain: param(), connect() {}, disconnect() {} }; gains.push(node); return node; },
      createOscillator() { return { frequency: { ...param(), setValueAtTime(value: number) { pitches.push(value); } }, connect() {}, disconnect() {}, start(time: number) { starts.push(time); }, stop(time: number) { stops.push(time); } }; } };
    scheduleEffect(ctx, effect);
    const notes = effectNotes(effect);
    assert.deepEqual(notes.map(n => n.midi), expected[effect]);
    assert.deepEqual(pitches, expected[effect].map(midiToHz));
    assert.deepEqual(starts, notes.map(n => 2 + n.at));
    assert.deepEqual(stops, notes.map(n => 2 + n.at + n.duration + .01));
    assert.equal(gains[0].gain.value, SFX_GAIN);
    assert.ok(ramps.length >= notes.length);
  }
});
test('haptics only pulse in the active circle, throttle reentry, stop on exit/end; bite is silent', () => {
  let state = idleHaptics();
  const step = (now: number, active: boolean, inside: boolean) => { const next = decideHaptics(state, now, active, inside); state = next.state; return next.command; };
  assert.equal(step(0, false, true), null);
  assert.equal(step(1, true, false), null);
  assert.equal(step(10, true, true), 15);
  assert.equal(step(100, true, true), null);
  assert.equal(step(101, true, false), 0);
  assert.equal(step(102, true, true), null);
  assert.equal(step(190, true, true), 15);
  assert.equal(step(191, false, true), 0);
  assert.equal(step(400, false, true), null);
  const game = createReelGame(); assert.equal(reelInZone(game), true);
  assert.equal(reelInZone({ ...game, fishX: game.zoneSize + .001 }), false);
  assert.equal(reelInZone({ ...game, fishX: game.zoneSize }), true);
});
// 브라우저 OfflineAudioContext가 필요해 개발 서버(PWP_BASE)가 있을 때만 돈다.
test('real OfflineAudioContext renders non-silent bounded effects and WAV previews', { skip: !process.env.PWP_BASE && 'PWP_BASE dev server not set' }, async () => {
  await promisify(execFile)(process.execPath, ['tests/pixel-world-phaser/sfx-offline.mjs']);
});

test('릴 소리: 원 안에서 게임 중일 때만, 게이지가 찰수록 빨라진다', async () => {
  const { decideReelClick, reelClickInterval } = await import('../../src/features/pixel-world-phaser/logic/reelHaptics.ts');
  assert.equal(reelClickInterval(0), 120); assert.equal(reelClickInterval(1), 55); assert.equal(reelClickInterval(2), 55);
  let last = -Infinity, clicks: number[] = [];
  for (let t = 0; t <= 1000; t += 16) { const r = decideReelClick(last, t, true, true, 0); last = r.lastClick; if (r.click) clicks.push(t); }
  for (let i = 1; i < clicks.length; i++) assert.ok(clicks[i] - clicks[i - 1] >= 120);
  const slow = clicks.length;
  last = -Infinity; clicks = [];
  for (let t = 0; t <= 1000; t += 16) { const r = decideReelClick(last, t, true, true, 1); last = r.lastClick; if (r.click) clicks.push(t); }
  assert.ok(clicks.length > slow * 1.6, '게이지가 차면 더 자주 딸깍');
  assert.deepEqual(decideReelClick(500, 1000, true, false, .5), { lastClick: -Infinity, click: false });
  assert.deepEqual(decideReelClick(500, 1000, false, true, .5), { lastClick: -Infinity, click: false });
  assert.equal(decideReelClick(-Infinity, 1000, true, true, .5).click, true, '원 안으로 다시 들어오면 바로 딸깍');
});
