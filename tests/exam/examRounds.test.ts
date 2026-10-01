import test from 'node:test';
import assert from 'node:assert/strict';
import type { ExamElective, ExamPaperHistoryAttempt } from '../../src/features/exam/contract.ts';
import { mapExamPaperHistory, mapExamPaper, mapExamResult } from '../../src/features/exam/examMappers.ts';
import { buildHistoryRows, formatTimeChange, historyCellLabel, roundLabel } from '../../src/features/exam/ui/examLogic.ts';

function attempt(round: number, elective: ExamElective = '미적분', correct = false, status: ExamPaperHistoryAttempt['status'] = 'submitted'): ExamPaperHistoryAttempt {
  return {
    attemptId: `a${round}`, round, startedAt: `2026-10-0${round}T09:00:00Z`, submittedAt: null,
    elective, mode: 'free', status, score: status === 'submitted' ? 0 : null,
    estimatedGrade: status === 'submitted' ? 9 : null, totalTimeMs: round === 1 ? 540_000 : 240_000,
    items: Array.from({ length: 30 }, (_, i) => ({
      number: i + 1, section: i < 22 ? 'common' : elective,
      isCorrect: status === 'submitted' ? correct : null, answered: true,
      unsure: i === 1, timeSpentMs: round === 1 ? 540_000 : 240_000,
    })),
  };
}

test('회차 라벨과 시간 변화는 학생에게 읽기 쉽게 표시한다', () => {
  assert.equal(roundLabel(1), '1차'); assert.equal(roundLabel(12), '12차');
  for (const value of [undefined, 0, -1, 1.2, NaN]) assert.equal(roundLabel(value), '');
  assert.equal(formatTimeChange(540_000, 240_000), '9분 → 4분');
  assert.equal(formatTimeChange(10_000, 65_000), '10초 → 1분 5초');
});

test('모든 제출 회차 오답, 새로 맞힘, 미응답과 진행 중을 구분한다', () => {
  const first = attempt(1), second = attempt(2), active = attempt(3, '미적분', false, 'in_progress');
  first.items[0].answered = false;
  second.items[0].isCorrect = true;
  const rows = buildHistoryRows([active, second, first], '미적분');
  assert.equal(rows.length, 30);
  assert.equal(rows[0].persistentWrong, false);
  assert.equal(rows[0].cells[1].newlyCorrect, true, '미응답 오답 → 정답');
  assert.equal(rows[1].persistentWrong, true);
  assert.equal(rows[1].cells[2].newlyCorrect, false);
  assert.equal(rows[0].timeChange, '9분 → 4분', '진행 중 시간은 제출 회차 시간 변화에서 제외');
  assert.equal(historyCellLabel(first.items[0], true), 'X 미응답');
  assert.equal(historyCellLabel(second.items[1], true), 'X 🤔');
  assert.equal(historyCellLabel(active.items[0], false), '응답');
  active.items[0].answered = false; active.items[0].unsure = true;
  assert.equal(historyCellLabel(active.items[0], false), '미응답 🤔');
});

test('선택문항은 같은 과목 직전 제출과 비교하고 다른 과목 칸은 비운다', () => {
  const calc1 = attempt(1), geom = attempt(2, '기하', true), calc2 = attempt(3, '미적분', true);
  const calcRows = buildHistoryRows([calc1, geom, calc2], '미적분');
  assert.equal(calcRows[22].cells[1].item, null);
  assert.equal(historyCellLabel(calcRows[22].cells[1].item, true), '-');
  assert.equal(calcRows[22].cells[2].newlyCorrect, true);
  assert.equal(calcRows[22].timeChange, '9분 → 4분');
  assert.equal(calcRows[0].cells[2].newlyCorrect, false, '공통은 직전 기하 회차와 비교');
  const geomRows = buildHistoryRows([calc1, geom, calc2], '기하');
  assert.equal(geomRows[22].persistentWrong, false);
  assert.equal(geomRows[22].timeChange, null);
  assert.equal(geomRows[22].cells[2].item, null);
  assert.equal(buildHistoryRows([], '미적분')[0].persistentWrong, false);
  assert.equal(buildHistoryRows([attempt(1, '미적분', false, 'in_progress')], '미적분')[0].persistentWrong, false);
  assert.equal(buildHistoryRows([attempt(1, '미적분', false, 'in_progress')], '미적분')[0].timeChange, null);
  assert.equal(buildHistoryRows([calc1], '확률과 통계')[22].persistentWrong, false, '비교할 선택문항 없음');
});

test('기록 매퍼는 진행 중 정오·점수와 허용하지 않은 정답 필드를 숨긴다', () => {
  const pending = attempt(3, '기하', false, 'in_progress');
  pending.score = 100; pending.estimatedGrade = 1; pending.items[0].isCorrect = true;
  const mapped = mapExamPaperHistory([{ ...pending, correctAnswer: '4', items: pending.items.map(i => ({ ...i, correctAnswer: '4', answer: '1' })) }, attempt(1)]);
  assert.deepEqual(mapped.map(a => a.round), [1, 3]);
  assert.equal(mapped[1].items[0].isCorrect, null);
  assert.equal(mapped[1].score, null); assert.equal(mapped[1].estimatedGrade, null);
  assert.equal(JSON.stringify(mapped).includes('correctAnswer'), false);
  assert.equal(mapped[0].items[0].isCorrect, false);
  assert.deepEqual(mapExamPaperHistory(null), []);
});

test('카드 요약과 OMR 결과 매퍼는 서버 회차를 보존하고 이전 응답도 받는다', () => {
  const paper = mapExamPaper({ inProgress: { attemptId: 'a3', round: '3' }, lastResult: { attemptId: 'a2', round: 2 } });
  assert.equal(paper.inProgress?.round, 3); assert.equal(paper.lastResult?.round, 2);
  assert.equal(mapExamResult({ round: 2 }).round, 2);
  assert.equal(mapExamResult({}).round, undefined);
});
