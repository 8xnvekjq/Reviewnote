import type { ExamClient, InkReplayData, PeerSolution } from '../contract.ts';

export type PeerSolutionApi = Pick<ExamClient, 'getPeerSolution' | 'getPeerSolutionReplay'>;

import { getTitleBadgeStyle } from '../../../utils/gachaCatalog.ts';

/** 구버전 서버 응답(character만 있음)용 대체 — 새 서버는 작성자 기준 얼굴(label.face)을 직접 준다.
 *  선생님·머리색 같은 결합(ZWJ) 이모지는 글꼴·터미널에 따라 두 글자로 갈라지거나 옆 글씨와 겹쳐 보여 한 글자짜리만 쓴다. */
const FACES: Record<string, string> = {
  치이카와: '🧑', 하치와레: '👩', 우사기: '👨', 모몽가: '🧒', 쿠리만쥬: '👧', 랏코: '👦', 시사: '👱', 후루혼: '🧔',
};
const FALLBACK_FACES = ['🧑', '👩', '👨', '🧒', '👧', '👦', '👱', '🧔'];

export interface PeerLabelParts {
  face: string;
  /** 장착 칭호 — 다른 화면(헤더·랭킹·활동 피드)과 같은 getTitleBadgeStyle 이펙트. 칭호가 없으면 null. */
  title: { text: string; style: string; icon: string } | null;
  /** "(고2)" 또는 "" */
  grade: string;
  isTeacher: boolean;
}

export function peerSolutionLabelParts(label: PeerSolution['label']): PeerLabelParts {
  if (label.isTeacher) return { face: '🎓', title: null, grade: '', isTeacher: true };
  const character = label.character ?? '';
  const face = label.face || FACES[character] || FALLBACK_FACES[[...character].reduce((sum, ch) => sum + ch.codePointAt(0)!, 0) % FALLBACK_FACES.length];
  const text = label.title?.trim();
  return { face, title: text ? { text, ...getTitleBadgeStyle(text) } : null, grade: label.grade ? `(${label.grade})` : '', isTeacher: false };
}

/** "😀 칭호(학년)" — 칭호가 없으면 "익명 학생(학년)", 선생님 풀이는 "🎓 선생님 풀이". 화면 읽기·제목용 문자열. */
export function peerSolutionLabel(label: PeerSolution['label']): string {
  const parts = peerSolutionLabelParts(label);
  if (parts.isTeacher) return '🎓 선생님 풀이';
  return `${parts.face} ${parts.title?.text || '익명 학생'}${parts.grade}`;
}

/** One result screen owns this cache. Nothing is stored in browser storage or module state.
 * Cache promises to deduplicate rapid clicks, including null; failures remain retryable. */
export class PeerSolutionSession {
  private solutions = new Map<string, Promise<PeerSolution | null>>();
  private replays = new Map<string, Promise<InkReplayData>>();
  private api: PeerSolutionApi;
  private attemptId: string;
  constructor(api: PeerSolutionApi, attemptId: string) { this.api = api; this.attemptId = attemptId; }

  get(questionId: string): Promise<PeerSolution | null> {
    const cached = this.solutions.get(questionId);
    if (cached) return cached;
    const pending = this.api.getPeerSolution(this.attemptId, questionId).catch(error => {
      this.solutions.delete(questionId);
      throw error;
    });
    this.solutions.set(questionId, pending);
    return pending;
  }

  replay(questionId: string, solutionKey: string): Promise<InkReplayData> {
    const key = `${questionId}:${solutionKey}`;
    const cached = this.replays.get(key);
    if (cached) return cached;
    const pending = this.api.getPeerSolutionReplay(this.attemptId, questionId, solutionKey).catch(error => {
      this.replays.delete(key);
      throw error;
    });
    this.replays.set(key, pending);
    return pending;
  }
}
