import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { MATH_CURRICULUM } from '../../src/types/index.ts';
import { mapExamAttempt, mapExamPaper, sanitizeExamAnswer } from '../../src/features/exam/examMappers.ts';

const root = path.resolve(import.meta.dirname, '../..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'src/features/exam/data/2024-yeongpa-g2-s2-mid-calc1.json'), 'utf8'));
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261003060000_exam_yeongpa_school_seed.sql'), 'utf8');

test('영파여고 원본 정답·25점 및 환산 100점·문항 이미지·단원을 보존한다', () => {
  assert.equal(data.published, false);
  assert.equal(data.year, 2024); assert.equal(data.grade, 2); assert.equal(data.schoolGrade, '고2');
  assert.equal(data.subject, '미적분1'); assert.match(data.subjectNote, /수학2/);
  assert.equal(data.examDate, null); assert.ok(data.examDateNote); assert.equal(data.timeLimitMinutes, 50);
  assert.deepEqual(data.electives, []);
  assert.deepEqual(data.questions.map(q => q.number), Array.from({ length: 21 }, (_, i) => i+1));
  assert.deepEqual(data.questions.slice(0, 18).map(q => q.answer), ['1','5','3','2','4','3','2','5','2','4','1','1','3','4','5','3','2','5']);
  assert.deepEqual(data.questions.map(q => q.originalPoints), [.7,.7,.7,.8,.8,.9,.9,1,1,1.1,1.1,1.1,1.2,1.2,1.3,1.4,1.5,1.6,1.9,1.1,3]);
  assert.equal(data.questions.reduce((s, q) => s + Math.round(q.originalPoints*10), 0), 250);
  assert.equal(data.questions.reduce((s, q) => s + Math.round(q.points*10), 0), 1000);
  assert.deepEqual(data.questions.slice(18).map(q => [q.originalNumber, q.answerType]), [['19(1)','choice10'], ['19(2)','digits'], ['20','choice10']]);
  assert.equal(data.questions[19].answer, '8');
  for (const q of data.questions) {
    assert.equal(Math.round(q.points*10), Math.round(q.originalPoints*40));
    assert.ok(MATH_CURRICULUM[q.curriculumGrade]?.includes(q.curriculumChapter));
    assert.ok(q.sourcePage >= 1 && q.sourcePage <= 6);
    const png = fs.readFileSync(path.join(root, 'public', q.imageUrl));
    assert.equal(png.subarray(1,4).toString(), 'PNG'); assert.equal(png.readUInt32BE(16), 756);
    assert.equal(sanitizeExamAnswer(q.answer, q.answerType), q.answer);
  }
});

test('서답형 10지선다는 서로 다른 정답 위치와 유일한 정답·오답 이유를 가진다', () => {
  const converted = data.questions.filter(q => q.answerType === 'choice10');
  assert.deepEqual(converted.map(q => q.answer), ['9','6']);
  for (const q of converted) {
    assert.equal(q.choices.length, 10); assert.equal(new Set(q.choices).size, 10);
    assert.equal(q.choices.filter(c => c === q.originalAnswer).length, 1);
    assert.equal(q.choices[Number(q.answer)-1], q.originalAnswer);
    assert.equal(q.distractorReasons.length, 10); assert.ok(q.distractorReasons.every(r => r.length > 0));
  }
  assert.equal(converted[1].originalAnswer, '2x+10');
  assert.match(converted[0].originalAnswer, /\\begin\{cases\}/);
  // Solve the original intersection equations, including domain boundaries and double roots.
  function intersections(t: number) {
    const d = (5-t)**2 - 4*(8-4*t);
    const roots = d < 0 ? [] : [...new Set([(-(5-t)+Math.sqrt(d))/2, (-(5-t)-Math.sqrt(d))/2])].filter(x => x >= -3);
    if (t !== 2) { const x = (4*t-4)/(2-t); if (x < -3) roots.push(x); }
    return roots.length;
  }
  for (const t of [-20,-7,-3,-2.001,-2,-1,0,.999,1,1.001,1.5,2,2.001,5,20]) {
    assert.equal(intersections(t), t>1 ? 2 : t===1 || t < -2 ? 1 : 0, `t=${t}`);
  }
  const h = (t: number) => (t+2)*(t-1);
  assert.equal(intersections(2)*h(2), 8);
  // (가) gives f(x)=x²+cx-10; the finite limit in (나) requires g(2)=f'(0).
  const c = 10, f = (x: number) => x*x+c*x-10;
  assert.equal(f(2)-4, c); assert.equal(4+c-2, 12);
  for (const [x,y] of [[0,0],[1,2],[-3,4]]) assert.equal(f(x+y)-f(x)-f(y)-2*x*y-10, 0);
});

test('새 시드는 검증 JSON과 같고 기존 스키마 변경·공개·정답 노출을 하지 않는다', () => {
  const rows = [...sql.matchAll(/^  \('2024-yeongpa-g2-s2-mid-calc1', (\d+), 'common', '([^']+)', (true|false), ([\d.]+), '([^']+)', '([^']+)', '([^']+)', (null|'[^']*'::jsonb)\)/gm)];
  assert.equal(rows.length, 21);
  for (const [i, row] of rows.entries()) {
    const q = data.questions[i];
    assert.deepEqual([Number(row[1]),row[2],row[3]==='true',Number(row[4]),row[5],row[6],row[7]], [q.number,q.imageUrl,q.answerType!=='digits',q.points,q.curriculumGrade,q.curriculumChapter,q.answerType]);
    assert.deepEqual(row[8]==='null' ? null : JSON.parse(row[8].slice(1,-8)), q.choices ?? null);
  }
  const keys = [...sql.matchAll(/^  \((\d+), '([^']+)'\)/gm)].map(m => [Number(m[1]),m[2]]);
  assert.deepEqual(keys, data.questions.map(q => [q.number,q.answer]));
  assert.match(sql, /'고2', 50, '\{\}'::text\[\], null, false, 'school', '영파여고', 2024, 2, 2, 'mid', 21, 100/);
  assert.doesNotMatch(sql, /\b(alter|drop|grant|create|update)\b/i);
  const attempt = mapExamAttempt({ ...data, questions: data.questions.map(q => ({...q,id:`q${q.number}`,isChoice:q.answerType!=='digits'})) });
  assert.ok(attempt.questions.every(q => !('answer' in q) && !('originalAnswer' in q)));
  const dongbuk = JSON.parse(fs.readFileSync(path.join(root,'src/features/exam/data/2026-dongbuk-g1-s2-mid-common2.json'),'utf8'));
  assert.deepEqual([dongbuk,data].map(mapExamPaper).map(p => [p.kind,p.grade,p.schoolName]), [['school',1,'동북고'],['school',2,'영파여고']]);
});
