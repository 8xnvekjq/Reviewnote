import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildEraSets, renderSeed } from '../../scripts/exam/build_hanneung_era_sets.mjs';
import { HANNEUNG_ERAS } from '../../src/features/exam/ui/hanneungEra.ts';
import { mapExamAttempt, mapExamResult } from '../../src/features/exam/examMappers.ts';
import { resultGradeLabel } from '../../src/features/exam/ui/hanneungLogic.ts';
const data = path.resolve(import.meta.dirname, '../../src/features/exam/data');
const sets = buildEraSets();
test('era bundles match all tags, order and source images, including more than 50 questions', () => {
  const files = fs.readdirSync(data).filter(f => f.endsWith('-advanced.topics.json')).map(f => JSON.parse(fs.readFileSync(path.join(data, f), 'utf8')));
  assert.equal(sets.length, 10);
  assert.equal(sets.reduce((n, set) => n + set.members.length, 0), 300);
  for (const era of HANNEUNG_ERAS) {
    const set = sets.find(set => set.era === era.id)!;
    assert.equal(set.members.length, files.flatMap(f => f.questions).filter(q => q.era === era.id).length);
    const order = set.members.map(m => m.sourceRound * 100 + m.sourceNumber);
    assert.deepEqual(order, [...order].sort((a, b) => a - b));
    assert.equal(new Set(set.members.map(m => `${m.sourcePaperId}/${m.sourceNumber}`)).size, set.members.length);
    for (const member of set.members) {
      const source = JSON.parse(fs.readFileSync(path.join(data, `${member.sourcePaperId}.json`), 'utf8'));
      assert.equal(member.imageUrl, source.questions.find(q => q.number === member.sourceNumber).imageUrl);
      assert.ok(!('answer' in member));
    }
  }
  assert.ok(sets.some(set => set.members.length > 50));
  assert.deepEqual(sets, JSON.parse(fs.readFileSync(path.join(data, 'hanneungEraSets.json'), 'utf8')));
  const sql = renderSeed(sets);
  assert.match(sql, /select q.id,k.answer/);
  assert.match(sql, /k.question_id=original.id/);
  assert.match(sql, /EXAM_ERA_SOURCE_MISSING/);
});
test('era metadata and question sources survive RPC mapping and suppress grades', () => {
  const payload = { kind: 'hanneung', practiceEra: 'goryeo', questions: [{ id: 'q', number: 1, answerType: 'choice5', sourcePaperId: '2025-hanneung-74-advanced', sourceNumber: 12, sourceRound: 74 }] };
  const attempt = mapExamAttempt(payload);
  assert.equal(attempt.practiceEra, 'goryeo');
  assert.equal(attempt.questions[0].sourceNumber, 12);
  assert.equal(attempt.questions[0].sourceRound, 74);
  const result = mapExamResult({ ...payload, items: payload.questions, estimatedGrade: null });
  assert.equal(result.items[0].sourcePaperId, payload.questions[0].sourcePaperId);
  assert.equal(resultGradeLabel(result, null), '');
});
test('regeneration discovers new rounds and preserves revisions until membership or keys change', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exam-eras-'));
  try {
    for (const file of fs.readdirSync(data).filter(f => /-advanced(\.topics)?\.json$/.test(f))) fs.copyFileSync(path.join(data, file),path.join(directory,file));
    assert.deepEqual(buildEraSets(directory), sets);
    const id = '2027-hanneung-80-advanced';
    const source = JSON.parse(fs.readFileSync(path.join(data,'2026-hanneung-79-advanced.json'),'utf8'));
    source.id = id;
    const tags = JSON.parse(fs.readFileSync(path.join(data,'2026-hanneung-79-advanced.topics.json'),'utf8'));
    tags.paperId = id;
    fs.writeFileSync(path.join(directory,`${id}.json`),JSON.stringify(source));
    fs.writeFileSync(path.join(directory,`${id}.topics.json`),JSON.stringify(tags));
    const added = buildEraSets(directory);
    assert.equal(added.reduce((n,set) => n+set.members.length,0),350);
    assert.ok(added.find(s => s.era==='goryeo')!.members.some(m => m.sourceRound===80));
    const era = tags.questions[0].era;
    source.questions[0].answer = source.questions[0].answer==='1' ? '2' : '1';
    fs.writeFileSync(path.join(directory,`${id}.json`),JSON.stringify(source));
    const corrected = buildEraSets(directory);
    assert.notEqual(corrected.find(s => s.era===era)!.id,added.find(s => s.era===era)!.id);
    assert.deepEqual(corrected.map(s => s.members),added.map(s => s.members));
    tags.questions[0].era = era==='cross' ? 'goryeo' : 'cross';
    fs.writeFileSync(path.join(directory,`${id}.topics.json`),JSON.stringify(tags));
    assert.notEqual(buildEraSets(directory).find(s => s.era===era)!.id,corrected.find(s => s.era===era)!.id);
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});
