import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { paperGrade, PAPER_SECTIONS, SECTION_LABEL } from '../../src/features/exam/ui/paperGrouping.ts';
import { sortPapersNewest, isFilterSection } from '../../src/features/exam/ui/paperFilters.ts';
import { mapExamPaper, mapExamResult } from '../../src/features/exam/examMappers.ts';
import { estimateStandardScore } from '../../src/features/exam/ui/examLogic.ts';
import { scoreDisplay } from '../../src/features/exam/ui/scoreDisplay.ts';

test('학력평가는 학년별 별도 구역에서 최신순, 내신 필터·점수 환산과 독립', () => {
  assert.equal(paperGrade({ kind: 'mock', grade: 1 }), 1);
  assert.equal(paperGrade({ kind: 'mock', grade: 2 }), 2);
  assert.equal(paperGrade({ kind: 'csat', grade: 1 }), 3);
  assert.equal(SECTION_LABEL.mock, '학력평가');
  assert.ok(PAPER_SECTIONS.includes('mock'));
  assert.equal(isFilterSection('mock'), false);
  assert.equal(isFilterSection('school'), true);
  assert.equal(isFilterSection('worksheet'), true);
  const a = mapExamPaper({ id: 'a', kind: 'mock', grade: 2, examDate: '2025-10-14', electives: [] });
  const b = mapExamPaper({ id: 'b', kind: 'mock', grade: 2, examDate: '2026-10-14', electives: [] });
  assert.equal(a.kind, 'mock');
  assert.deepEqual(sortPapersNewest('mock', [a, b]).map(p => p.id), ['b', 'a']);
  assert.equal(scoreDisplay(88, { kind: 'mock', maxScore: 100 }).converted, false);
});

test('선택과목 없는 학력평가 등급 경계 및 표준점수·백분위', () => {
  for (const grade of [1, 2]) {
    const data = JSON.parse(fs.readFileSync(new URL(`../../src/features/exam/data/2025-10-g${grade}-math.json`, import.meta.url), 'utf8'));
    const cut = data.gradeCuts;
    assert.equal(data.questions.length, 30);
    assert.equal(data.questions.reduce((sum: number, q: { points: number }) => sum + q.points, 0), 100);
    assert.equal(data.published, false);
    for (const [score, expected] of [[100, 1], [88, 1], [87, 2], [0, 9]]) {
      const result = mapExamResult({ kind: 'mock', score, elective: null, gradeCut: { raw: cut.raw } });
      assert.equal(result.estimatedGrade, expected);
    }
    assert.equal(mapExamResult({ kind: 'mock', score: 87, estimatedGrade: 3, gradeCut: { raw: cut.raw } }).estimatedGrade, 3);
    assert.deepEqual(estimateStandardScore(88, { rawByGrade: cut.raw, standardByGrade: cut.standard,
      percentileByGrade: cut.percentile, topStandard: cut.top.standard, topPercentile: cut.top.percentile }),
      { standard: cut.standard[0], percentile: cut.percentile[0] });
    for (const q of data.questions) {
      assert.ok(fs.existsSync(new URL(`../../public${q.imageUrl}`, import.meta.url)));
      assert.equal(q.isChoice, q.number <= 21);
      assert.equal(q.section, 'common');
    }
  }
  assert.equal(mapExamResult({ kind: 'csat', score: 80, gradeCut: { rawByGrade: [84, 75], raw: [88, 73] } }).estimatedGrade, 2);
});
