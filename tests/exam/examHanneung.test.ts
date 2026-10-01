import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { hanneungGrade, resultGradeLabel } from '../../src/features/exam/ui/hanneungLogic.ts';
import { mapExamAttempt, mapExamResult, sanitizeExamAnswer } from '../../src/features/exam/examMappers.ts';

test('한능검 급수 경계와 4지선다 검증', () => {
  for (const level of ['advanced', 'basic'] as const) {
    for (const [score, grade] of [[0, null], [59, null], [60, 3], [69, 3], [70, 2], [79, 2], [80, 1], [100, 1]]) {
      assert.equal(hanneungGrade(score!, level), grade == null ? null : grade + (level === 'basic' ? 3 : 0));
    }
  }
  assert.equal(sanitizeExamAnswer('④', 'choice4'), '4');
  for (const answer of ['0', '5', '⑤', '10', '-1']) assert.equal(sanitizeExamAnswer(answer, 'choice4'), null);
  assert.equal(resultGradeLabel({ kind: 'hanneung' }, null), '미합격');
  assert.equal(resultGradeLabel({ kind: 'hanneung' }, 4), '예상 4급');
  assert.equal(mapExamResult({ kind: 'hanneung', hanneungLevel: 'basic', score: 0, estimatedGrade: null }).estimatedGrade, null);
  const attempt = mapExamAttempt({ kind: 'hanneung', hanneungLevel: 'basic', questions: [{ id: 'q1', number: 1, answerType: 'choice4', isChoice: true }] });
  assert.equal(attempt.hanneungLevel, 'basic');
  assert.equal(attempt.questions[0].answerType, 'choice4');
});

test('79회 심화·기본은 공개 50문항·100점·원본 12페이지', () => {
  for (const level of ['advanced', 'basic']) {
    const data = JSON.parse(readFileSync(new URL(`../../src/features/exam/data/2026-hanneung-79-${level}.json`, import.meta.url), 'utf8'));
    assert.equal(data.published, true);
    assert.equal(data.timeLimitMinutes, level === 'basic' ? 70 : 80);
    assert.equal(data.questions.length, 50);
    assert.equal(data.questions.reduce((total: number, question: { points: number }) => total + question.points, 0), 100);
    const pages = new Set<string>();
    for (const [index, question] of data.questions.entries()) {
      assert.equal(question.number, index + 1);
      assert.equal(question.section, 'common');
      assert.equal(question.answerType, level === 'basic' ? 'choice4' : 'choice5');
      assert.match(question.answer, level === 'basic' ? /^[1-4]$/ : /^[1-5]$/);
      assert.equal(question.pageNumber, data.pageEnds.findIndex((end: number) => question.number <= end) + 1);
      assert.ok(existsSync(new URL(`../../public${question.imageUrl}`, import.meta.url)));
      pages.add(question.imageUrl);
    }
    assert.equal(pages.size, 12);
    assert.match(data.sourceSha256, /^[a-f0-9]{64}$/);
  }
});
