import test from 'node:test';
import assert from 'node:assert/strict';
import { mapExamAttempt, mapExamPaper, mapExamResult } from '../../src/features/exam/examMappers.ts';
import { resultGradeLabel } from '../../src/features/exam/ui/hanneungLogic.ts';
import { MATH_CURRICULUM } from '../../src/types/index.ts';
import fs from 'node:fs';

test('generated worksheets keep all answers/solutions private and use existing curriculum chapters', () => {
  const ignored = fs.readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8');
  assert.ok(ignored.split(/\r?\n/).includes('scripts/exam/worksheet-generated/'));
  for (const suffix of ['limits', 'derivatives']) {
    const folder = new URL(`../../scripts/exam/worksheet-generated/youngpa-worksheet-${suffix}/`, import.meta.url);
    const data = JSON.parse(fs.readFileSync(new URL('data.json', folder), 'utf8'));
    assert.equal(data.published, false); assert.equal(data.timeLimitMinutes, null);
    assert.equal(data.questionCount, data.questions.length);
    for (const q of data.questions) {
      assert.ok(MATH_CURRICULUM[q.curriculumGrade]?.includes(q.curriculumChapter), `${suffix} ${q.number}`);
      assert.ok(fs.existsSync(new URL(`private-solutions/${q.solutionKey}`, folder)));
      assert.ok(fs.existsSync(new URL(`../../public${q.imageUrl}`, import.meta.url)));
      assert.equal(fs.existsSync(new URL(`../../public/${q.solutionKey}`, import.meta.url)), false);
    }
    const validation = JSON.parse(fs.readFileSync(new URL('validation.json', folder), 'utf8'));
    assert.ok(validation.warnings.every((warning: string) => !warning.includes('edge')));
  }
});

test('worksheet metadata and provenance survive mapping without answers or grades', () => {
  const metadata = { kind: 'worksheet', grade: 2, schoolName: '영파여고', unitName: '미분계수와 도함수', questionCount: 14, maxScore: 48 };
  const question = { id: 'q1', number: 1, section: 'common', imageUrl: '/q.png', points: 3, answerType: 'choice5', sourceLabel: '2017년 9월 고2 가06', answer: '4' };
  const paper = mapExamPaper({ ...metadata, timeLimitMinutes: null });
  assert.equal(paper.kind, 'worksheet'); assert.equal(paper.timeLimitMinutes, null); assert.equal(paper.unitName, metadata.unitName);
  const attempt = mapExamAttempt({ ...metadata, mode: 'free', elective: null, questions: [question] });
  assert.equal(attempt.questions[0].sourceLabel, question.sourceLabel);
  assert.equal('answer' in attempt.questions[0], false);
  const result = mapExamResult({ ...metadata, estimatedGrade: 1, gradeCut: null, items: [{ ...question, questionId: 'q1', correctAnswer: '4' }] });
  assert.equal(result.estimatedGrade, null); assert.equal(resultGradeLabel(result, 1), '');
  assert.equal(result.items[0].sourceLabel, question.sourceLabel);
});
