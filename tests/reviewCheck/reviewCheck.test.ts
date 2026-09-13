import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterReviewCheckCandidates, pickRandomUpTo } from '../../src/utils/reviewCheck.ts';
import type { MistakeEntry } from '../../src/types/index.ts';

const STUDENT = 's1';
const PARAMS = { studentId: STUDENT, grade: '공통수학2', rangeChapters: ['평면좌표', '직선의 방정식'] };

function completedMistake(partial: Partial<MistakeEntry> & { id: string }): MistakeEntry {
  return {
    userId: STUDENT,
    title: partial.id,
    imageUrl: '',
    date: '2026-09-01',
    grade: PARAMS.grade,
    chapter: '평면좌표',
    reviews: ['O', 'O', 'O'],
    ...partial,
  } as MistakeEntry;
}

test('hidden 문제는 후보에서 제외한다', () => {
  const items = [completedMistake({ id: 'a' }), completedMistake({ id: 'b', isHidden: true })];
  const candidates = filterReviewCheckCandidates(items, PARAMS);
  assert.deepEqual(candidates.map(m => m.id), ['a']);
});

test('선택한 시험범위 밖의 단원은 후보에서 제외한다', () => {
  const items = [completedMistake({ id: 'a' }), completedMistake({ id: 'b', chapter: '집합' })];
  const candidates = filterReviewCheckCandidates(items, PARAMS);
  assert.deepEqual(candidates.map(m => m.id), ['a']);
});

test('복습 완료(O 3회)가 아니면 후보에서 제외한다', () => {
  const items = [
    completedMistake({ id: 'a' }),
    completedMistake({ id: 'b', reviews: ['O', 'O', ''] }),
    completedMistake({ id: 'c', reviews: ['O', 'X', 'O'] }),
  ];
  const candidates = filterReviewCheckCandidates(items, PARAMS);
  assert.deepEqual(candidates.map(m => m.id), ['a']);
});

test('이미 완벽! 상태인 문제는 후보에서 제외한다', () => {
  const items = [
    completedMistake({ id: 'a' }),
    completedMistake({ id: 'b', reviewCheckMasteredAt: '2026-09-01T00:00:00.000Z' }),
  ];
  const candidates = filterReviewCheckCandidates(items, PARAMS);
  assert.deepEqual(candidates.map(m => m.id), ['a']);
});

test('다른 학생 소유의 문제는 후보에서 제외한다', () => {
  const items = [completedMistake({ id: 'a' }), completedMistake({ id: 'b', userId: 'other-student' })];
  const candidates = filterReviewCheckCandidates(items, PARAMS);
  assert.deepEqual(candidates.map(m => m.id), ['a']);
});

test('후보 8개는 무작위로 5개까지만 뽑는다(더 채우지 않음)', () => {
  const candidates = Array.from({ length: 8 }, (_, i) => `id${i}`);
  const picked = pickRandomUpTo(candidates, 5);
  assert.equal(picked.length, 5);
  const unique = new Set(picked);
  assert.equal(unique.size, 5);
  picked.forEach(id => assert.ok(candidates.includes(id)));
});

test('후보 3개는 3개 그대로(부족해도 억지로 채우지 않음)', () => {
  const candidates = ['a', 'b', 'c'];
  const picked = pickRandomUpTo(candidates, 5);
  assert.equal(picked.length, 3);
});

test('후보 0개는 자연스러운 빈 배열', () => {
  const picked = pickRandomUpTo([], 5);
  assert.deepEqual(picked, []);
});

test('후보 1개는 1개', () => {
  const picked = pickRandomUpTo(['only'], 5);
  assert.deepEqual(picked, ['only']);
});
