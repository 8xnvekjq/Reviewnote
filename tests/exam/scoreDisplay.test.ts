import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreDisplay } from '../../src/features/exam/ui/scoreDisplay.ts';

test('100-point and missing-max papers preserve scores without a raw label', () => {
  for (const kind of ['school', 'worksheet'] as const) {
    for (const maxScore of [100, undefined]) {
      assert.deepEqual(scoreDisplay(86.95, { kind, maxScore }), {
        score: 86.95, maxScore: 100, converted: false, rawLabel: null,
      });
    }
  }
});

test('school and worksheet scores convert to one decimal and retain raw scores', () => {
  for (const kind of ['school', 'worksheet'] as const) {
    assert.deepEqual(scoreDisplay(106, { kind, maxScore: 122 }), {
      score: 86.9, maxScore: 100, converted: true, rawLabel: '(원점수 106 / 122점)',
    });
    for (const [raw, expected] of [[0, 0], [122, 100], [61, 50], [61.5, 50.4]]) {
      assert.equal(scoreDisplay(raw, { kind, maxScore: 122 }).score, expected);
    }
    assert.equal(String(scoreDisplay(61, { kind, maxScore: 122 }).score), '50');
    assert.equal(scoreDisplay(3.5, { kind, maxScore: 7.5 }).score, 46.7);
  }
});

test('csat, hanneung, practice eras and unknown kinds never convert', () => {
  for (const paper of [{ kind: 'csat' as const }, { kind: 'hanneung' as const }, {},
    { kind: 'school' as const, practiceEra: 'joseon-early' as const }]) {
    const display = scoreDisplay(61, { ...paper, maxScore: 122 });
    assert.equal(display.score, 61);
    assert.equal(display.converted, false);
    assert.equal(display.rawLabel, null);
  }
});

test('invalid maximum scores do not produce converted NaN or infinity', () => {
  for (const maxScore of [0, -1, NaN, Infinity]) {
    assert.equal(scoreDisplay(10, { kind: 'school', maxScore }).converted, false);
  }
});
