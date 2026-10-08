import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MATH_CURRICULUM } from '../../src/types/index.ts';
import { mapExamPaper, mapExamQuestion } from '../../src/features/exam/examMappers.ts';

const id = '2026-gaeplus-m3-s2-midfinal-1';
const read = (file: string) => fs.readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const data = JSON.parse(read(`src/features/exam/data/${id}.json`));
const seed = read('supabase/migrations/20261009120000_exam_gaeplus_m3_s2_midfinal_1_seed.sql');

test('combined middle-school paper preserves timing, original points and geometry provenance', () => {
  const paper = mapExamPaper(data);
  assert.deepEqual([paper.kind, paper.grade, paper.timeLimitMinutes, paper.questionCount, paper.maxScore, paper.published],
    ['school', 9, 60, 29, 122, false]);
  assert.deepEqual(data.questions.map((q: { number: number }) => q.number), Array.from({ length: 29 }, (_, i) => i + 1));
  assert.deepEqual(data.questions.slice(0, 20).map((q: { originalNumber: number }) => q.originalNumber),
    [...Array.from({ length: 18 }, (_, i) => i + 1), 20, 22]);
  assert.deepEqual(data.questions.slice(20).map((q: { originalNumber: number }) => q.originalNumber), [1, 2, 3, 4, 5, 6, 7, 19, 22]);
  assert.equal(data.questions.reduce((total: number, q: { points: number }) => total + q.points, 0), 122);
  for (const q of data.questions) {
    assert.ok(MATH_CURRICULUM['중3-2'].includes(q.curriculumChapter));
    const mapped = mapExamQuestion({ ...q, id: `gaeplus-${q.number}` });
    assert.equal(mapped.sourceLabel, q.sourceLabel);
    assert.ok(q.sourceLabel.includes(`PDF ${q.sourcePage}쪽 · ${q.originalNumber}번`));
  }
});

test('student assets contain only question images and metadata; keys remain in unpublished SQL', () => {
  const forbidden = ['answer', 'sourceAnswerText', 'solutionKey', 'solutionSegments', 'answerPage'];
  for (const q of data.questions) {
    assert.ok(forbidden.every(key => !(key in q)));
    assert.ok(fs.statSync(new URL(`../../public${q.imageUrl}`, import.meta.url)).size > 1000);
  }
  assert.equal(fs.readdirSync(new URL(`../../public/exams/${id}/`, import.meta.url)).length, 29);
  assert.equal(seed.match(/insert into public.exam_answer_keys/g)?.length, 29);
  assert.ok(seed.includes("false,'school'"));
  assert.ok(!/private-solutions|solutionKey|reference-src|appendix\.pdf/.test(seed));
  assert.ok(read('scripts/exam/publish_gaeplus_m3_s2_midfinal_1.sql').includes(`id='${id}' and kind='school'`));
});
