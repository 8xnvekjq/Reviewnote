import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampAiGradeVerdict, type RawAiGradeResult } from '../../src/utils/reviewCheckGrading.ts';

function raw(partial: Partial<RawAiGradeResult>): RawAiGradeResult {
  return {
    verdict: 'correct',
    normalizedStudentAnswer: null,
    canonicalAnswer: null,
    reason: null,
    confidence: 0.95,
    ...partial,
  };
}

test('confidence 0.95 + correct -> 그대로 correct', () => {
  const result = clampAiGradeVerdict(raw({ verdict: 'correct', confidence: 0.95 }));
  assert.equal(result.verdict, 'correct');
});

test('confidence 0.5 + correct -> manual_review로 강제', () => {
  const result = clampAiGradeVerdict(raw({ verdict: 'correct', confidence: 0.5 }));
  assert.equal(result.verdict, 'manual_review');
});

test('경계값 0.7은 통과, 0.7 미만은 강제', () => {
  assert.equal(clampAiGradeVerdict(raw({ verdict: 'incorrect', confidence: 0.7 })).verdict, 'incorrect');
  assert.equal(clampAiGradeVerdict(raw({ verdict: 'incorrect', confidence: 0.699999 })).verdict, 'manual_review');
});

test('verdict가 이미 manual_review면 confidence가 높아도 그대로 manual_review', () => {
  assert.equal(clampAiGradeVerdict(raw({ verdict: 'manual_review', confidence: 0.99 })).verdict, 'manual_review');
  assert.equal(clampAiGradeVerdict(raw({ verdict: 'manual_review', confidence: 0.1 })).verdict, 'manual_review');
  assert.equal(clampAiGradeVerdict(raw({ verdict: 'manual_review', confidence: null })).verdict, 'manual_review');
});

test('confidence가 NaN이면 claimed verdict와 무관하게 manual_review로 강제', () => {
  const result = clampAiGradeVerdict(raw({ verdict: 'correct', confidence: NaN }));
  assert.equal(result.verdict, 'manual_review');
});

test('confidence가 음수(-1)면 claimed verdict와 무관하게 manual_review로 강제', () => {
  const result = clampAiGradeVerdict(raw({ verdict: 'incorrect', confidence: -1 }));
  assert.equal(result.verdict, 'manual_review');
});

test('confidence가 1을 초과(1.5)하면 claimed verdict와 무관하게 manual_review로 강제', () => {
  const result = clampAiGradeVerdict(raw({ verdict: 'correct', confidence: 1.5 }));
  assert.equal(result.verdict, 'manual_review');
});

test('confidence가 없으면(null) claimed verdict와 무관하게 manual_review로 강제', () => {
  const result = clampAiGradeVerdict(raw({ verdict: 'correct', confidence: null }));
  assert.equal(result.verdict, 'manual_review');
});

test('알 수 없는 verdict 문자열은 manual_review로 강제', () => {
  const result = clampAiGradeVerdict(raw({ verdict: 'sort_of_correct', confidence: 0.95 }));
  assert.equal(result.verdict, 'manual_review');
});

test('강제 변환되어도 reason/canonicalAnswer 등 부가 정보는 보존된다(관리자에게 여전히 유용)', () => {
  const result = clampAiGradeVerdict(raw({
    verdict: 'correct',
    confidence: 0.3,
    reason: '분수와 소수 표현이 달라 확신이 낮음',
    canonicalAnswer: '1/2',
    normalizedStudentAnswer: '0.5',
  }));
  assert.equal(result.verdict, 'manual_review');
  assert.equal(result.reason, '분수와 소수 표현이 달라 확신이 낮음');
  assert.equal(result.canonicalAnswer, '1/2');
  assert.equal(result.normalizedStudentAnswer, '0.5');
});
