import assert from 'node:assert/strict';
import test from 'node:test';
import { requestMap, requestChip, feedbackMessage } from '../../src/features/peerHelp/requester/model.ts';
import type { MyHelpRequest } from '../../src/features/peerHelp/api.ts';
const request: MyHelpRequest = { id: 'r', mistake_id: 'm', created_at: '', status: 'open', solution_count: 2, unseen_count: 2 };
test('request chips preserve unseen solutions even for closed and cancelled requests', () => {
  assert.equal(requestChip(request), '🙋 풀이 2개 도착');
  assert.equal(requestChip({ ...request, status: 'closed' }), '🙋 풀이 2개 도착');
  assert.equal(requestChip({ ...request, status: 'cancelled' }), '🙋 풀이 2개 도착');
  assert.equal(requestChip({ ...request, unseen_count: 0 }), '🙋 도움 요청 중 · 풀이 2개');
  assert.equal(requestChip({ ...request, status: 'closed', unseen_count: 0 }), null);
  assert.equal(requestChip(undefined), null);
});
test('request map indexes by mistake without losing status', () => {
  assert.deepEqual(requestMap([]), {});
  assert.equal(requestMap([request]).m, request);
  const older = { ...request, id: 'old', status: 'cancelled' as const, created_at: '2026-10-01' };
  const newer = { ...request, created_at: '2026-10-16' };
  assert.equal(requestMap([newer, older]).m, newer);
  assert.equal(requestMap([older, newer]).m, newer);
});
test('feedback only promises points actually returned by server', () => {
  assert.equal(feedbackMessage(0), '피드백 고마워요!');
  assert.equal(feedbackMessage(5), '피드백 고마워요! +5P');
});
