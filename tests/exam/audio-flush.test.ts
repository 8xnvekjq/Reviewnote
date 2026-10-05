import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForAudioUploads } from '../../src/features/exam/audio/audioFlush.ts';

const pending = <T>() => new Promise<T>(() => {});
test('upload gate waits for clips before reporting success', async () => {
  let finish!: (value: { ok: boolean; failed: number }) => void;
  let settled = false;
  const upload = new Promise<{ ok: boolean; failed: number }>(resolve => { finish = resolve; });
  const waiting = waitForAudioUploads(() => upload, pending()).then(value => { settled = true; return value; });
  await Promise.resolve();
  assert.equal(settled, false);
  finish({ ok: true, failed: 0 });
  assert.deepEqual(await waiting, { ok: true, failed: 0 });
});
test('continue bypasses a stuck upload and a stuck stop', async () => {
  assert.equal(await waitForAudioUploads(() => pending(), Promise.resolve('continue')), 'continue');
});
test('timeout and unexpected recorder errors enter the failure path', async () => {
  assert.deepEqual(await waitForAudioUploads(() => pending(), pending(), 5), { ok: false, failed: 1 });
  assert.deepEqual(await waitForAudioUploads(async () => { throw new Error('storage'); }, pending()), { ok: false, failed: 1 });
});
