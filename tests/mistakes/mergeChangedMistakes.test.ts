import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeChangedMistakes } from '../../src/features/mistakes/mistakeMerge.ts';

const row = (id: string, date: string, title = id) => ({ id, date, title });

test('바뀐 줄만 바꾸고, 지워진 줄은 빼고, 새 줄은 날짜 순 자리에 넣는다', () => {
  const prev = [row('c', '2026-10-03'), row('b', '2026-10-02'), row('a', '2026-10-01')];
  const out = mergeChangedMistakes(prev, ['b', 'a', 'd'], new Map([
    ['b', row('b', '2026-10-02', 'b 수정')],
    ['d', row('d', '2026-10-04')],
  ]));
  assert.deepEqual(out.map(m => `${m.id}:${m.title}`), ['d:d', 'c:c', 'b:b 수정'], 'a는 지워졌고 d는 맨 앞(최신)');
  // 바뀐 게 없는 줄은 같은 객체 그대로(불필요한 다시 그리기 방지)
  assert.equal(out[1], prev[0]);
  // 새 줄이 없으면 순서 그대로
  assert.deepEqual(mergeChangedMistakes(prev, ['c'], new Map([['c', row('c', '2026-10-03', 'c2')]])).map(m => m.title), ['c2', 'b', 'a']);
});
