import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESENCE_TRACK_MAX, PRESENCE_TRACK_WINDOW_MS, presenceTrackDelay, recordPresenceTrack } from '../../src/features/pixel-room/plaza/presenceTrackBudget.ts';

test('30초에 4번까지는 바로 보내고, 5번째는 가장 오래된 기록이 창을 벗어날 때까지 기다린다', () => {
  let history: number[] = [];
  for (let i = 0; i < PRESENCE_TRACK_MAX; i++) {
    assert.equal(presenceTrackDelay(history, 1000 + i * 1000), 0);
    history = recordPresenceTrack(history, 1000 + i * 1000);
  }
  const wait = presenceTrackDelay(history, 5000);
  assert.ok(wait > 0 && 5000 + wait >= 1000 + PRESENCE_TRACK_WINDOW_MS);
  assert.equal(presenceTrackDelay(history, 5000 + wait), 0);
});

test('어떤 순서로 요청해도 30초 창 안의 실제 전송은 4번을 넘지 않는다(서버 한도 5번)', () => {
  let history: number[] = [];
  const sent: number[] = [];
  for (let now = 0; now < 120_000; now += 700) {
    if (presenceTrackDelay(history, now) === 0) { history = recordPresenceTrack(history, now); sent.push(now); }
  }
  for (const start of sent) assert.ok(sent.filter(t => t >= start && t < start + PRESENCE_TRACK_WINDOW_MS).length <= PRESENCE_TRACK_MAX);
  assert.ok(recordPresenceTrack(history, 1e9).length === 1, '오래된 기록은 버린다');
});
