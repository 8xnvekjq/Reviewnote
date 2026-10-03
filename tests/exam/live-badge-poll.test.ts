import test from 'node:test';
import assert from 'node:assert/strict';
import type { AdminPaperActivity } from '../../src/features/exam/contract.ts';
import type { PollEnvironment } from '../../src/features/exam/ui/livePolling.ts';
import { LIVE_BADGE_POLL_MS, startLiveBadgePolling } from '../../src/features/exam/ui/liveBadgePolling.ts';

const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

function fakeEnv() {
  const timers = new Map<number, { callback: () => void; ms: number }>();
  const listeners = new Set<() => void>();
  let next = 0;
  const state = { hidden: false };
  const env: PollEnvironment = {
    hidden: () => state.hidden,
    schedule: (callback, ms) => { timers.set(++next, { callback, ms }); return next; },
    cancel: timer => { timers.delete(timer as number); },
    subscribe: callback => { listeners.add(callback); return () => listeners.delete(callback); },
  };
  return {
    env, timers, listeners,
    setHidden(hidden: boolean) { state.hidden = hidden; for (const listener of [...listeners]) listener(); },
    delays: () => [...timers.values()].map(timer => timer.ms),
    fire() { const all = [...timers.entries()]; timers.clear(); for (const [, timer] of all) timer.callback(); },
  };
}

test('badge poll starts right after admin check, repeats every 12s, pauses hidden, refreshes once on return', async () => {
  const fake = fakeEnv();
  let liveCalls = 0, liveCount = 0;
  const counts: Array<Map<string, number>> = [];
  const activity: AdminPaperActivity[][] = [];
  const stop = startLiveBadgePolling({
    listPaperActivity: async () => [],
    listLivePapers: async () => { liveCalls++; return liveCount ? [{ paperId: 'p1', liveCount }] : []; },
  }, fake.env, { activity: rows => activity.push(rows), counts: c => counts.push(c) });
  await flush();
  assert.equal(activity.length, 1);
  assert.equal(liveCalls, 1, 'first Live request right away');
  assert.deepEqual(fake.delays(), [LIVE_BADGE_POLL_MS], 'only the Live timer remains, at 12s');
  assert.equal(LIVE_BADGE_POLL_MS, 12000);

  liveCount = 2; fake.fire(); await flush();
  assert.equal(liveCalls, 2);
  assert.equal(counts.at(-1)!.get('p1'), 2, 'a student who started drawing shows up on the next tick');

  fake.setHidden(true); await flush();
  assert.deepEqual(fake.delays(), [], 'hidden tab: no timers');
  fake.setHidden(false); await flush();
  assert.equal(liveCalls, 3, 'one immediate refresh on return');

  liveCount = 0; fake.fire(); await flush();
  assert.equal(counts.at(-1)!.size, 0, 'badge disappears when the server drops the paper (10 min idle)');

  stop();
  assert.deepEqual(fake.delays(), []);
  assert.equal(fake.listeners.size, 0);
  fake.setHidden(false); await flush();
  assert.equal(liveCalls, 4);
});

test('no overlapping requests: visibility flips during an in-flight Live request do not double it', async () => {
  const fake = fakeEnv();
  let liveCalls = 0;
  let resolve: () => void = () => {};
  const stop = startLiveBadgePolling({
    listPaperActivity: async () => [],
    listLivePapers: () => { liveCalls++; return new Promise(res => { resolve = () => res([]); }); },
  }, fake.env, { activity: () => {}, counts: () => {} });
  await flush();
  assert.equal(liveCalls, 1);
  fake.setHidden(true); fake.setHidden(false); fake.setHidden(false); await flush();
  assert.equal(liveCalls, 1, 'still the same request');
  resolve(); await flush();
  assert.deepEqual(fake.delays(), [LIVE_BADGE_POLL_MS]);
  stop();
});

test('a failed admin check is retried with backoff instead of hiding the badge until reload; failures back off', async () => {
  const fake = fakeEnv();
  let checks = 0, liveCalls = 0, liveFails = true;
  const stop = startLiveBadgePolling({
    listPaperActivity: async () => { checks++; if (checks === 1) throw new Error('offline'); return []; },
    listLivePapers: async () => { liveCalls++; if (liveFails) throw new Error('offline'); return []; },
  }, fake.env, { activity: () => {}, counts: () => {} });
  await flush();
  assert.equal(checks, 1); assert.equal(liveCalls, 0);
  assert.deepEqual(fake.delays(), [24000], 'check retry backs off');
  fake.fire(); await flush();
  assert.equal(checks, 2); assert.equal(liveCalls, 1);
  assert.deepEqual(fake.delays(), [24000], 'check stopped; Live failure backs off to 24s');
  fake.fire(); await flush();
  assert.deepEqual(fake.delays(), [48000]);
  fake.fire(); await flush();
  assert.deepEqual(fake.delays(), [60000], 'capped at 60s');
  liveFails = false; fake.fire(); await flush();
  assert.deepEqual(fake.delays(), [12000], 'success resets to 12s');
  assert.equal(checks, 2, 'admin check runs only until it succeeds');
  stop();
});

test('students (server returns null) never poll the admin-only Live list', async () => {
  const fake = fakeEnv();
  let liveCalls = 0;
  const stop = startLiveBadgePolling({
    listPaperActivity: async () => null,
    listLivePapers: async () => { liveCalls++; return []; },
  }, fake.env, { activity: () => assert.fail('no activity for students'), counts: () => {} });
  await flush();
  fake.setHidden(true); fake.setHidden(false); await flush();
  assert.equal(liveCalls, 0);
  assert.deepEqual(fake.delays(), []);
  assert.equal(fake.listeners.size, 0);
  stop();
});

test('hidden at mount: nothing is requested until the tab becomes visible', async () => {
  const fake = fakeEnv();
  fake.setHidden(true);
  let checks = 0;
  const stop = startLiveBadgePolling({
    listPaperActivity: async () => { checks++; return []; },
    listLivePapers: async () => [],
  }, fake.env, { activity: () => {}, counts: () => {} });
  await flush();
  assert.equal(checks, 0);
  fake.setHidden(false); await flush();
  assert.equal(checks, 1);
  stop();
});
