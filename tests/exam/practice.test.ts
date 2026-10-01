import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  answerFromDigits, clampDigit, countAnswered, createStopwatch, crossedAlerts, digitsFromAnswer, displayAnswer, elapsedFor,
  estimateGrade, formatClock, formatDuration, isAnswerCorrect, mistakeCandidates, normalizeShortAnswer, padStatus,
  pauseStopwatch, praiseLine, remainingMs, snapWheel, switchStopwatch, toggleChoice, wheelSteps,
} from '../../src/features/exam/ui/examLogic.ts';

const MIN = 60_000;
const START = '2026-10-02T09:00:00.000Z';
const t0 = Date.parse(START);

test('remaining time counts down from startedAt + limit, clamps at 0, and is null in free mode', () => {
  assert.equal(remainingMs(START, 100, t0), 100 * MIN);
  assert.equal(remainingMs(START, 100, t0 + 30 * MIN), 70 * MIN);
  assert.equal(remainingMs(START, 100, t0 + 101 * MIN), 0);
  assert.equal(remainingMs(START, null, t0), null);
  assert.equal(remainingMs('not a date', 100, t0), 100 * MIN);
});

test('10분·5분 alerts fire once, only when crossed, never on the first reading', () => {
  assert.deepEqual(crossedAlerts(null, 9 * MIN), []);
  assert.deepEqual(crossedAlerts(10 * MIN + 400, 10 * MIN - 100), [10 * MIN]);
  assert.deepEqual(crossedAlerts(10 * MIN - 100, 10 * MIN - 600), []);
  assert.deepEqual(crossedAlerts(5 * MIN + 1, 5 * MIN), [5 * MIN]);
  // 잠깐 탭을 떠났다 오면 두 시점을 한꺼번에 지날 수 있다
  assert.deepEqual(crossedAlerts(11 * MIN, 4 * MIN), [10 * MIN, 5 * MIN]);
  assert.deepEqual(crossedAlerts(3 * MIN, null), []);
});

test('clock and duration formatting', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(61_999), '01:01');
  assert.equal(formatClock(100 * MIN), '100:00');
  assert.equal(formatClock(-5), '00:00');
  assert.equal(formatDuration(40_000), '40초');
  assert.equal(formatDuration(12 * MIN + 5000), '12분 5초');
  assert.equal(formatDuration(83 * MIN), '1시간 23분');
});

test('stopwatch accumulates only the open question and survives switching back and forth', () => {
  let sw = createStopwatch({ a: 1000 });
  sw = switchStopwatch(sw, 'a', t0);
  assert.equal(elapsedFor(sw, 'a', t0 + 500), 1500);
  sw = switchStopwatch(sw, 'b', t0 + 2000);           // a: 1000 + 2000
  assert.equal(elapsedFor(sw, 'a', t0 + 9000), 3000); // a 는 더 이상 흐르지 않음
  assert.equal(elapsedFor(sw, 'b', t0 + 3000), 1000);
  sw = switchStopwatch(sw, 'a', t0 + 5000);           // b: 3000
  sw = pauseStopwatch(sw, t0 + 6000);                 // a: 4000, 멈춤(탭 숨김)
  assert.equal(elapsedFor(sw, 'a', t0 + 60_000), 4000);
  assert.equal(sw.times.b, 3000);
  sw = switchStopwatch(sw, sw.activeId, t0 + 70_000); // 다시 보이면 이어서
  assert.equal(elapsedFor(sw, 'a', t0 + 71_000), 5000);
  // 멈춘 상태에서 또 멈춰도 그대로
  const paused = pauseStopwatch(pauseStopwatch(sw, t0 + 72_000), t0 + 99_000);
  assert.equal(paused.times.a, 6000);
});

test('short answers are normalized: leading zeros dropped, 0~999 only', () => {
  assert.equal(normalizeShortAnswer('007'), '7');
  assert.equal(normalizeShortAnswer('000'), '0');
  assert.equal(normalizeShortAnswer('231'), '231');
  assert.equal(normalizeShortAnswer(' 42 '), '42');
  assert.equal(normalizeShortAnswer(''), null);
  assert.equal(normalizeShortAnswer(null), null);
  assert.equal(normalizeShortAnswer('1000'), null);
  assert.equal(normalizeShortAnswer('-3'), null);
  assert.equal(normalizeShortAnswer('2.5'), null);
});

test('digit wheels ↔ answer string round-trip', () => {
  assert.deepEqual(digitsFromAnswer('231'), [2, 3, 1]);
  assert.deepEqual(digitsFromAnswer('7'), [0, 0, 7]);
  assert.deepEqual(digitsFromAnswer('40'), [0, 4, 0]);
  assert.deepEqual(digitsFromAnswer(null), [0, 0, 0]);
  assert.equal(answerFromDigits([0, 0, 7]), '7');
  assert.equal(answerFromDigits([2, 3, 1]), '231');
  assert.equal(answerFromDigits([0, 0, 0]), '0');
  assert.equal(answerFromDigits([12, -1, 3]), '903');
  for (let n = 0; n <= 999; n += 37) assert.equal(answerFromDigits(digitsFromAnswer(String(n))), String(n));
  assert.equal(clampDigit(Number.NaN), 0);
});

test('wheel snapping follows the drag and adds a bounded flick', () => {
  const H = 34;
  assert.equal(snapWheel(5, 0, 0, H), 5);
  assert.equal(snapWheel(5, -H, 0, H), 6);         // 위로 한 칸 끌면 +1
  assert.equal(snapWheel(5, H * 2, 0, H), 3);      // 아래로 두 칸 → -2
  assert.equal(snapWheel(5, -H * 0.4, 0, H), 5);   // 반 칸 못 가면 제자리
  assert.equal(snapWheel(2, -10, -1, H), 6);       // 빠르게 튕기면 몇 칸 더(-10-140=-150px ≈ 4.4칸)
  assert.equal(snapWheel(0, H * 3, 0, H), 0);      // 0 아래로는 안 감
  assert.equal(snapWheel(8, -H * 5, -4, H), 9);    // 9 위로도 안 감
  assert.equal(snapWheel(3, -H, 0, 0), 3);
  assert.deepEqual(wheelSteps(95), { steps: 2, rest: 15 });
  assert.deepEqual(wheelSteps(-45), { steps: -1, rest: -5 });
  assert.deepEqual(wheelSteps(10), { steps: 0, rest: 10 });
});

test('choice toggle: tap selects, tap again clears, only one at a time', () => {
  assert.equal(toggleChoice(null, 3), '3');
  assert.equal(toggleChoice('3', 3), null);
  assert.equal(toggleChoice('3', 5), '5');
});

test('number pad status: 🤔 wins over answered, then answered/empty', () => {
  assert.equal(padStatus(undefined), 'empty');
  assert.equal(padStatus({ answer: null, unsure: false }), 'empty');
  assert.equal(padStatus({ answer: '2', unsure: false }), 'answered');
  assert.equal(padStatus({ answer: '2', unsure: true }), 'unsure');
  assert.equal(padStatus({ answer: null, unsure: true }), 'unsure');
  assert.equal(countAnswered([{ answer: '1' }, { answer: null }, { answer: '0' }]), 2);
});

test('estimated grade uses the elective raw cuts (컷 이상이면 그 등급)', () => {
  const data = JSON.parse(readFileSync(new URL('../../src/features/exam/data/2025-06-math.json', import.meta.url), 'utf8'));
  const calc: number[] = data.gradeCuts.rawByElective['미적분']; // [80,70,59,49,32,19,12,8]
  assert.equal(estimateGrade(100, calc), 1);
  assert.equal(estimateGrade(80, calc), 1);
  assert.equal(estimateGrade(79, calc), 2);
  assert.equal(estimateGrade(49, calc), 4);
  assert.equal(estimateGrade(8, calc), 8);
  assert.equal(estimateGrade(7, calc), 9);
  assert.equal(estimateGrade(0, calc), 9);
});

test('grading compares normalized answers', () => {
  assert.equal(isAnswerCorrect('231', '231', false), true);
  assert.equal(isAnswerCorrect('0231', '231', false), true);
  assert.equal(isAnswerCorrect(null, '7', false), false);
  assert.equal(isAnswerCorrect('4', '4', true), true);
  assert.equal(isAnswerCorrect('3', '4', true), false);
});

test('오답노트 후보 = 틀린 문제 + 🤔 문제, 번호 순', () => {
  const items = [
    { number: 5, isCorrect: true, unsure: true },
    { number: 2, isCorrect: false, unsure: false },
    { number: 9, isCorrect: true, unsure: false },
    { number: 1, isCorrect: false, unsure: true },
  ];
  assert.deepEqual(mistakeCandidates(items).map(item => item.number), [1, 2, 5]);
});

test('praise only for correct answers with a national wrong rate; answers display as ①~⑤', () => {
  assert.equal(praiseLine({ isCorrect: true, nationalWrongRate: 94.8 }), '전국 오답률 94.8% 문제를 맞혔어요!');
  assert.equal(praiseLine({ isCorrect: true, nationalWrongRate: 92 }), '전국 오답률 92% 문제를 맞혔어요!');
  assert.equal(praiseLine({ isCorrect: false, nationalWrongRate: 94.8 }), null);
  assert.equal(praiseLine({ isCorrect: true, nationalWrongRate: null }), null);
  assert.equal(displayAnswer('3', true), '③');
  assert.equal(displayAnswer('231', false), '231');
  assert.equal(displayAnswer(null, true), '—');
});
