import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MATH_CURRICULUM } from '../../src/types/index.ts';
import { mapExamAttempt, mapExamPaper, mapExamPaperHistory, mapExamResult, mapExamResultSummary, sanitizeExamAnswer } from '../../src/features/exam/examMappers.ts';
import { buildHistoryRows, toggleChoice } from '../../src/features/exam/ui/examLogic.ts';

const root = path.resolve(import.meta.dirname, '../..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'src/features/exam/data/2026-dongbuk-g1-s2-mid-common2.json'), 'utf8'));

test('내신 원본 구조·배점·커리큘럼과 21개 PNG를 검증한다', () => {
  assert.equal(data.published, false); assert.equal(data.year, 2026);
  assert.equal(data.examDate, null); assert.equal(data.timeLimitMinutes, 50);
  assert.deepEqual(data.electives, []); assert.equal(data.questions.length, 21);
  assert.deepEqual(data.questions.map(q => q.number), Array.from({ length: 21 }, (_, i) => i + 1));
  assert.equal(data.questions.reduce((sum, q) => sum + q.points, 0), data.maxScore);
  assert.equal(data.questions.filter(q => q.answerType === 'choice5').length, 17);
  assert.equal(data.questions.filter(q => q.answerType === 'choice10').length, 1);
  assert.equal(data.questions.filter(q => q.answerType === 'digits').length, 3);
  for (const q of data.questions) {
    assert.equal(q.section, 'common'); assert.equal(q.curriculumGrade, '공통수학2');
    assert.ok(MATH_CURRICULUM[q.curriculumGrade].includes(q.curriculumChapter));
    const png = fs.readFileSync(path.join(root, 'public', q.imageUrl));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.ok(png.readUInt32BE(16) >= 740, '3배 렌더링 폭');
    assert.equal(sanitizeExamAnswer(q.answer, q.answerType), q.answer);
  }
});

test('10지선다마다 선지 10개·중복 없음·정답 정확히 1개와 오류 근거가 있다', () => {
  for (const q of data.questions.filter(q => q.answerType === 'choice10')) {
    assert.equal(q.choices.length, 10); assert.equal(new Set(q.choices).size, 10);
    assert.equal(q.choices.filter(c => c === q.originalAnswer).length, 1);
    assert.equal(q.choices[Number(q.answer) - 1], q.originalAnswer);
    assert.equal(q.distractorReasons.length, 10);
    assert.ok(q.distractorReasons.every(reason => reason.length > 0));
    assert.notEqual(q.answer, '1');
  }
  // 18번: 중심 (-5,0), (0,-4), 반지름 4 → 현 길이 2√(16-41/4)=√23.
  const q = data.questions[17];
  assert.equal(q.originalAnswer, '\\sqrt{23}');
  const numericalChoices = [Math.sqrt(23)/2, Math.sqrt(41), Math.sqrt(105), 23, Math.sqrt(39), 4*Math.sqrt(3), Math.sqrt(23), 2*Math.sqrt(23), Math.sqrt(23)/4, 8];
  const chord = 2 * Math.sqrt(4**2 - ((-5)**2 + 4**2)/4);
  assert.equal(numericalChoices.filter(value => Math.abs(value - chord) < 1e-10).length, 1, '수학적으로 동치인 중복 정답도 없음');
  assert.ok(Math.abs(numericalChoices[Number(q.answer)-1] - chord) < 1e-10);
});

test('10번째 선택·해제와 답 유형별 유효 범위를 지킨다', () => {
  assert.equal(toggleChoice(null, 10), '10'); assert.equal(toggleChoice('10', 10), null);
  assert.equal(toggleChoice('10', 7), '7');
  assert.equal(sanitizeExamAnswer('010', 'choice10'), '10');
  for (const answer of ['0', '11', '-1', '1.5', 'sqrt(23)']) assert.equal(sanitizeExamAnswer(answer, 'choice10'), null);
  assert.equal(sanitizeExamAnswer('10', 'choice5'), null);
  assert.equal(sanitizeExamAnswer('010', 'digits'), '10');
});

test('내신 매퍼는 소수 점수·선지·연도·선택과목 없음·등급 null을 보존하고 정답을 숨긴다', () => {
  const meta = { kind: 'school', year: 2026, schoolName: '동북고', grade: 1, semester: 2, examTerm: 'mid', questionCount: 21, maxScore: 100, published: false };
  const questions = data.questions.map(q => ({ ...q, id: `q${q.number}`, isChoice: q.answerType !== 'digits' }));
  const paper = mapExamPaper({ ...meta, id: data.id, title: data.title, electives: [], timeLimitMinutes: 50 });
  assert.equal(paper.year, 2026); assert.equal(paper.published, false);
  const attempt = mapExamAttempt({ ...meta, elective: null, questions, visitOrder: [18, 21, 22] });
  assert.equal(attempt.elective, null); assert.deepEqual(attempt.visitOrder, [18, 21]);
  assert.equal(attempt.questions[17].answerType, 'choice10');
  assert.deepEqual(attempt.questions[17].choices, data.questions[17].choices);
  assert.ok(!JSON.stringify(attempt.questions).includes('originalAnswer'));
  assert.ok(attempt.questions.every(q => !('answer' in q)));
  const result = mapExamResult({ ...meta, score: '9.4', elective: null, estimatedGrade: null, gradeCut: null, items: [] });
  assert.equal(result.score, 9.4); assert.equal(result.estimatedGrade, null); assert.equal(result.elective, null);
  assert.equal(mapExamResultSummary({ ...meta, estimatedGrade: null }).estimatedGrade, null);
  const history = mapExamPaperHistory([{ ...meta, round: 1, status: 'submitted', score: 9.4, elective: null, items: questions.map(q => ({ ...q, isCorrect: false })) }]);
  assert.equal(history[0].year, 2026); assert.equal(history[0].items[17].answerType, 'choice10');
  assert.equal(buildHistoryRows(history, '미적분', paper.questionCount).length, 21);
  assert.ok(buildHistoryRows(history, '미적분', paper.questionCount).every(row => row.cells[0].item !== null));
});
