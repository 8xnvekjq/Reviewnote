// 목 하네스용 "선생님 풀이 공개" 저장소. 관리자 탭과 학생 탭(같은 브라우저)이 localStorage로 선생님 풀이를 주고받는다.
// 공개 규칙은 서버 private.exam_peer_candidates / exam_audio_can_read_question 과 같다:
//  - 제출한 선생님 응시의 모든 문항, 또는 진행 중인 자유 모드 응시에서 "채점해 보기"한 문항만
//  - 필기가 최소 기준(획 3개·점 60개) 이상
//  - 여러 응시 중 가장 최근(제출 시각, 없으면 그 문항 채점 시각) 하나
import type { InkReplayBatch, InkStroke } from '../contract.ts';

export interface SharedTeacherClip { id: string; startedAt: number; durationMs: number; sizeBytes: number }
export interface SharedTeacherAttempt {
  attemptId: string;
  paperId: string;
  mode: 'free' | 'real';
  status: 'in_progress' | 'submitted';
  submittedAt: string | null;
  /** questionId → 채점해 본 시각(ISO). */
  checkedAt: Record<string, string>;
  ink: Record<string, { strokes: InkStroke[]; revision: number; batches: InkReplayBatch[] }>;
  audio: Record<string, SharedTeacherClip[]>;
}
export type SharedTeacherState = Record<string, SharedTeacherAttempt>;

const meetsMinimum = (strokes: InkStroke[]) =>
  strokes.length >= 3 && strokes.reduce((sum, stroke) => sum + stroke.points.length, 0) >= 60;

/** 이 문항을 학생에게 보여 줄 선생님 응시(없으면 null). */
export function pickSharedTeacher(state: SharedTeacherState, paperId: string, questionId: string): SharedTeacherAttempt | null {
  let best: { row: SharedTeacherAttempt; activity: string } | null = null;
  for (const row of Object.values(state)) {
    if (row.paperId !== paperId || !meetsMinimum(row.ink[questionId]?.strokes ?? [])) continue;
    const open = row.status === 'submitted' || (row.status === 'in_progress' && row.mode === 'free' && !!row.checkedAt[questionId]);
    if (!open) continue;
    const activity = row.submittedAt ?? row.checkedAt[questionId] ?? '';
    if (!best || activity > best.activity || (activity === best.activity && row.attemptId > best.row.attemptId)) best = { row, activity };
  }
  return best?.row ?? null;
}

/** 학생이 이 선생님 응시의 이 문항 녹음을 읽을 수 있는지(exam_audio_can_read_question). */
export function canReadSharedTeacherAudio(row: SharedTeacherAttempt, questionId: string) {
  return row.status === 'submitted' || (row.status === 'in_progress' && row.mode === 'free' && !!row.checkedAt[questionId]);
}

export function readSharedTeacher(key: string): SharedTeacherState {
  try { return JSON.parse(localStorage.getItem(key) ?? '{}') as SharedTeacherState; } catch { return {}; }
}
export function writeSharedTeacher(key: string, row: SharedTeacherAttempt) {
  try { localStorage.setItem(key, JSON.stringify({ ...readSharedTeacher(key), [row.attemptId]: row })); } catch { /* 저장 실패는 무시 */ }
}
