import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkIndex, forgetExamInk, isMissingFunction, loadExamInk, type InkIndexRow } from '../../src/features/exam/inkLoader.ts';
import type { ExamInkDocument, InkStroke } from '../../src/features/exam/contract.ts';

const stroke = (id: string): InkStroke => ({ id, tool: 'pen', color: '#1f2937', size: 4, points: [{ x: .1, y: .2, pressure: .5, t: 0 }] });

/** get_exam_ink_index / get_exam_ink_questions / get_exam_ink 흉내. size는 저장(압축) 크기. */
function server(rows: ExamInkDocument[], sizes: Record<string, number> = {}) {
  const calls: Array<{ name: string; ids?: string[] }> = [];
  const state = { missing: false };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    calls.push({ name, ids: args.p_question_ids as string[] | undefined });
    if (name === 'get_exam_ink') return structuredClone(rows);
    if (state.missing) throw Object.assign(new Error('서버와 연결하지 못했어요.'), { cause: { code: 'PGRST202', message: 'Could not find the function public.get_exam_ink_index(p_attempt_id) in the schema cache' } });
    if (name === 'get_exam_ink_index') return rows.map(({ strokes: _strokes, ...row }): InkIndexRow => ({ ...row, size: sizes[row.questionId] ?? 100 }));
    if (name === 'get_exam_ink_questions') return structuredClone(rows.filter(row => (args.p_question_ids as string[]).includes(row.questionId)));
    throw new Error(name);
  };
  return { rpc, calls, rows, state };
}

test('loads in size-bounded chunks and only refetches questions whose revision changed', async () => {
  forgetExamInk();
  const rows: ExamInkDocument[] = ['q1', 'q2', 'q3'].map((id, i) => ({ questionId: id, strokes: [stroke(id)], revision: i + 1, updatedAt: `t${i}`, lastBatchId: `b${i}` }));
  const s = server(rows, { q1: 700 * 1024, q2: 700 * 1024, q3: 10 });
  const first = await loadExamInk(s.rpc, 'attempt');
  assert.deepEqual(first.map(doc => [doc.questionId, doc.strokes[0].id, doc.revision, doc.lastBatchId]),
    [['q1', 'q1', 1, 'b0'], ['q2', 'q2', 2, 'b1'], ['q3', 'q3', 3, 'b2']]);
  assert.deepEqual(s.calls.map(c => c.ids ?? c.name), ['get_exam_ink_index', ['q1'], ['q2', 'q3']]);
  s.calls.length = 0;
  rows[1] = { ...rows[1], strokes: [stroke('q2-new')], revision: 3, updatedAt: 't9', lastBatchId: 'b9' };
  const second = await loadExamInk(s.rpc, 'attempt');
  assert.deepEqual(s.calls.map(c => c.ids ?? c.name), ['get_exam_ink_index', ['q2']], 'unchanged questions come from memory');
  assert.equal(second[1].strokes[0].id, 'q2-new');
  assert.equal(second[1].lastBatchId, 'b9');
  assert.equal(second[0].strokes, first[0].strokes, 'same array for an unchanged revision');
  s.calls.length = 0;
  rows.splice(2, 1);
  assert.deepEqual((await loadExamInk(s.rpc, 'attempt')).map(doc => doc.questionId), ['q1', 'q2']);
  assert.deepEqual(s.calls.map(c => c.ids ?? c.name), ['get_exam_ink_index']);
});

test('a row that changed between the index and the body uses the newer body (revision and lastBatchId included)', async () => {
  forgetExamInk();
  const rows: ExamInkDocument[] = [{ questionId: 'q1', strokes: [stroke('old')], revision: 1, updatedAt: 't1', lastBatchId: 'b1' }];
  const s = server(rows);
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const out = await s.rpc(name, args);
    if (name === 'get_exam_ink_index') rows[0] = { questionId: 'q1', strokes: [stroke('new')], revision: 2, updatedAt: 't2', lastBatchId: 'b2' };
    return out;
  };
  const [doc] = await loadExamInk(rpc, 'attempt');
  assert.deepEqual([doc.strokes[0].id, doc.revision, doc.lastBatchId], ['new', 2, 'b2']);
});

test('falls back to get_exam_ink when the new functions are not deployed yet; other errors propagate', async () => {
  forgetExamInk();
  const rows: ExamInkDocument[] = [{ questionId: 'q1', strokes: [stroke('a')], revision: 1 }];
  const s = server(rows);
  s.state.missing = true;
  assert.equal((await loadExamInk(s.rpc, 'attempt'))[0].strokes[0].id, 'a');
  assert.deepEqual(s.calls.map(c => c.name), ['get_exam_ink_index', 'get_exam_ink']);
  await assert.rejects(loadExamInk(async () => { throw new Error('EXAM_ATTEMPT_NOT_FOUND'); }, 'attempt'), /EXAM_ATTEMPT_NOT_FOUND/);
  assert.equal(isMissingFunction(new Error('canceling statement due to statement timeout')), false);
});

test('chunking: at least one question per request, at most 50 ids', () => {
  assert.deepEqual(chunkIndex([{ questionId: 'a', revision: 1, size: 5_000_000 }, { questionId: 'b', revision: 1, size: 1 }]), [['a'], ['b']]);
  const many = Array.from({ length: 120 }, (_, i) => ({ questionId: `q${i}`, revision: 1, size: 1 }));
  assert.deepEqual(chunkIndex(many).map(chunk => chunk.length), [50, 50, 20]);
  assert.deepEqual(chunkIndex([]), []);
});
