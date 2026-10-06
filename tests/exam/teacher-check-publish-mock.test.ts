import test from 'node:test';
import assert from 'node:assert/strict';
import { canReadSharedTeacherAudio, pickSharedTeacher, type SharedTeacherAttempt } from '../../src/features/exam/ui/mockTeacherShare.ts';
import type { InkStroke } from '../../src/features/exam/contract.ts';

const solved: InkStroke[] = Array.from({ length: 3 }, (_, n) => ({ id: `s${n}`, tool: 'pen', color: '#000', size: 4,
  points: Array.from({ length: 20 }, (_, i) => ({ x: i / 100, y: n / 10, pressure: .5, t: i })) }));
const row = (patch: Partial<SharedTeacherAttempt>): SharedTeacherAttempt => ({ attemptId: 'a', paperId: 'p', mode: 'free', status: 'in_progress',
  submittedAt: null, checkedAt: {}, ink: { q1: { strokes: solved, revision: 2, batches: [] }, q2: { strokes: solved, revision: 2, batches: [] } },
  audio: {}, ...patch });

test('mock teacher sharing mirrors the server rule: checked question only, minimum ink, newest activity, submitted unchanged', () => {
  const inProgress = row({ attemptId: 'new', checkedAt: { q1: '2026-10-06T10:00:00Z' } });
  assert.equal(pickSharedTeacher({ new: inProgress }, 'p', 'q1')?.attemptId, 'new');
  assert.equal(pickSharedTeacher({ new: inProgress }, 'p', 'q2'), null, 'unchecked question stays private');
  assert.equal(pickSharedTeacher({ new: { ...inProgress, mode: 'real' } }, 'p', 'q1'), null, 'real mode never opens early');
  assert.equal(pickSharedTeacher({ new: inProgress }, 'other', 'q1'), null);
  const empty = { ...inProgress, ink: { q1: { strokes: solved.slice(0, 2), revision: 3, batches: [] } } };
  assert.equal(pickSharedTeacher({ new: empty }, 'p', 'q1'), null, 'minimum ink (3 strokes, 60 points)');
  const old = row({ attemptId: 'old', status: 'submitted', submittedAt: '2026-10-05T10:00:00Z' });
  assert.equal(pickSharedTeacher({ old, new: inProgress }, 'p', 'q1')?.attemptId, 'new', 'newer check beats older submission');
  assert.equal(pickSharedTeacher({ old, new: inProgress }, 'p', 'q2')?.attemptId, 'old', 'submitted attempt opens every question');
  assert.equal(pickSharedTeacher({ old, new: { ...inProgress, checkedAt: { q1: '2026-10-04T10:00:00Z' } } }, 'p', 'q1')?.attemptId, 'old');
  assert.equal(pickSharedTeacher({ old, new: empty }, 'p', 'q1')?.attemptId, 'old', 'reset checked question falls back');
  assert.equal(canReadSharedTeacherAudio(inProgress, 'q1'), true);
  assert.equal(canReadSharedTeacherAudio(inProgress, 'q2'), false);
  assert.equal(canReadSharedTeacherAudio(old, 'q2'), true);
});
