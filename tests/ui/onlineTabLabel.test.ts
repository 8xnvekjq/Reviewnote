import test from 'node:test';
import assert from 'node:assert/strict';
import { onlineDisplayName, onlineTabLabel } from '../../src/utils/onlineTabLabel.ts';

test('최근 탭 라벨 — 학생 탭은 이름, 관리자·알 수 없는 값은 숨김', () => {
  assert.equal(onlineTabLabel('pixelRoom'), 'Pixel World');
  assert.equal(onlineTabLabel('examPractice'), '기출문제 풀이');
  assert.equal(onlineTabLabel('notes'), '오답노트');
  assert.equal(onlineTabLabel('help'), '서로 도와주기');
  for (const hidden of ['admin', 'pixelRoomLegacy', 'toString', '', null, undefined]) assert.equal(onlineTabLabel(hidden), null);
});

test('온라인 이름 — 관리자만 5글자 넘으면 줄임', () => {
  assert.equal(onlineDisplayName('킹아르토리아토끼거세팬도라곤', true), '킹아르토리…');
  assert.equal(onlineDisplayName('다섯글자임', true), '다섯글자임');
  assert.equal(onlineDisplayName('킹아르토리아토끼거세팬도라곤', false), '킹아르토리아토끼거세팬도라곤');
});
