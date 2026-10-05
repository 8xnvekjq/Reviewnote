import test from 'node:test';
import assert from 'node:assert/strict';
import { assistAlpha, emptyAssist, parseAssist, receiveAssist } from '../../src/features/exam/ink/inkAssist.ts';
import type { AssistMessage } from '../../src/features/exam/ink/inkAssist.ts';
const stroke = (seq = 0, done = false): AssistMessage => ({ version: 1, kind: 'stroke', questionId: 'q1', strokeId: 's1', points: [{ x: .2, y: .3 }], done, seq });
test('도와주기: 증분 조립·중복·문항 불일치·clear', () => {
  let state = receiveAssist(emptyAssist(), stroke(), 'q1', 100);
  assert.equal(state.writing, true);
  assert.equal(receiveAssist(state, stroke(), 'q1', 200), state);
  assert.equal(receiveAssist(state, stroke(1), 'q2', 200), state);
  state = receiveAssist(state, stroke(1, true), 'q1', 300);
  assert.equal(state.strokes.get('s1')?.points.length, 2);
  assert.equal(state.writing, false);
  assert.equal(receiveAssist(state, stroke(2), 'q1', 400), state, '끝난 획의 늦은 패킷은 무시');
  assert.equal(receiveAssist(state, { version: 1, kind: 'clear', questionId: 'q1' }, 'q1', 400).strokes.size, 0);
});
test('도와주기: 마지막 활동 10초 유지·700ms 전체 smoothstep·새 획으로 타이머 갱신', () => {
  let state = receiveAssist(emptyAssist(), stroke(0, true), 'q1', 100);
  assert.equal(assistAlpha(state, 10100), 1);
  assert.equal(assistAlpha(state, 10450), .5);
  assert.equal(assistAlpha(state, 10800), 0);
  state = receiveAssist(state, { ...stroke(), strokeId: 's2' }, 'q1', 10450);
  assert.equal(state.strokes.size, 2);
  assert.equal(assistAlpha(state, 10450), 1);
  state = receiveAssist(state, { ...stroke(), strokeId: 's3' }, 'q1', 22000);
  assert.equal(state.strokes.size, 1, '만료 후 새 획은 예전 획을 되살리지 않는다');
});
test('도와주기: 누른 채 멈춰도 생존 배치로 유지·연결 끊김은 자체 만료', () => {
  let state = receiveAssist(emptyAssist(), stroke(), 'q1', 0);
  state = receiveAssist(state, { ...stroke(1), points: [] }, 'q1', 9000);
  assert.equal(assistAlpha(state, 18000), 1);
  assert.equal(assistAlpha(state, 19700), 0);
});
test('도와주기: untrusted 메시지 검증·크기·좌표·개수·버전', () => {
  assert.deepEqual(parseAssist(stroke()), stroke());
  assert.ok(parseAssist({ ...stroke(), points: [] }));
  for (const value of [null, {}, { ...stroke(), version: 2 }, { ...stroke(), seq: -1 },
    { ...stroke(), seq: .5 }, { ...stroke(), questionId: '' }, { ...stroke(), done: 'yes' },
    { ...stroke(), points: Array(257).fill({ x: 0, y: 0 }) }, { ...stroke(), points: [{ x: NaN, y: 0 }] },
    { ...stroke(), points: [{ x: -1, y: 0 }] }, { ...stroke(), points: [{ x: 17, y: 0 }] },
    { ...stroke(), points: [{ x: 0, y: 33 }] }]) assert.equal(parseAssist(value), null);
  assert.equal(parseAssist({ ...stroke(), padding: 'x'.repeat(24_000) }), null, '원본 페이로드 상한');
  const cyclic: any = stroke(); cyclic.self = cyclic;
  assert.equal(parseAssist(cyclic), null);
});
