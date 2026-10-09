import test from 'node:test';
import assert from 'node:assert/strict';
import { onlineTabLabel } from '../../src/utils/onlineTabLabel.ts';

test('최근 탭 라벨 — 학생 탭은 이름, 관리자·알 수 없는 값은 숨김', () => {
  assert.equal(onlineTabLabel('pixelRoom'), 'Pixel World');
  assert.equal(onlineTabLabel('examPractice'), '기출문제 풀이');
  assert.equal(onlineTabLabel('notes'), '오답노트');
  for (const hidden of ['admin', 'pixelRoomLegacy', 'toString', '', null, undefined]) assert.equal(onlineTabLabel(hidden), null);
});
