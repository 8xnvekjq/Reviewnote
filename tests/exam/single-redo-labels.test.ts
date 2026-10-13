import test from 'node:test';
import assert from 'node:assert/strict';
import { singleRedoLabels, formatRedoDate } from '../../src/features/exam/ui/singleRedo.ts';
import { mapExamResultItem } from '../../src/features/exam/examMappers.ts';

const at = '2026-10-12T16:36:00Z'; // 한국 시각 10월 13일 오전 1:36

test('다시 풀기 요약 문구: 없음·제출·진행 중', () => {
  assert.deepEqual(singleRedoLabels(undefined), { button: '이 문제 다시 풀기', badge: '', tone: null, notice: '' });
  assert.deepEqual(singleRedoLabels({ inProgress: false, latestSubmitted: null }), { button: '이 문제 다시 풀기', badge: '', tone: null, notice: '' });
  const wrong = singleRedoLabels({ inProgress: false, latestSubmitted: { submittedAt: at, isCorrect: false } });
  assert.equal(wrong.button, '한 번 더 다시 풀기');
  assert.equal(wrong.badge, '다시 풂 · 오답');
  assert.equal(wrong.tone, 'wrong');
  assert.equal(wrong.notice, `다시 푼 풀이 있음 · 오답 · ${formatRedoDate(at)}`);
  assert.match(formatRedoDate(at), /10월 13일/);
  const right = singleRedoLabels({ inProgress: true, latestSubmitted: { submittedAt: at, isCorrect: true } });
  assert.equal(right.button, '이어 풀기');
  assert.equal(right.badge, '다시 풂 · 정답');
  assert.match(right.notice, /^다시 푼 풀이 있음 · 정답 · .* · 제출하지 않은 다시 풀기가 있어요$/);
  const pending = singleRedoLabels({ inProgress: true, latestSubmitted: null });
  assert.deepEqual([pending.button, pending.badge, pending.tone], ['이어 풀기', '다시 푸는 중', 'pending']);
  assert.equal(formatRedoDate('잘못된 날짜'), '');
});

test('결과 문항 매핑: singleRedo는 서버가 준 경우에만', () => {
  assert.equal('singleRedo' in mapExamResultItem({ questionId: 'q', number: 1 }), false);
  assert.deepEqual(mapExamResultItem({ questionId: 'q', number: 1, singleRedo: { inProgress: true, latestSubmitted: null } }).singleRedo,
    { inProgress: true, latestSubmitted: null });
  assert.deepEqual(mapExamResultItem({ questionId: 'q', number: 1, singleRedo: { inProgress: false, latestSubmitted: { submittedAt: at, isCorrect: true } } }).singleRedo,
    { inProgress: false, latestSubmitted: { submittedAt: at, isCorrect: true } });
});
