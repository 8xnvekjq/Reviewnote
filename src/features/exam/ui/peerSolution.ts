import type { ExamClient, InkReplayData, PeerSolution, PeerSolutionCandidate } from '../contract.ts';

export type PeerSolutionApi = Pick<ExamClient, 'listPeerSolutions' | 'getPeerSolutionByKey'>;

import { getTitleBadgeStyle } from '../../../utils/gachaCatalog.ts';

/** 서버 v_faces(20261005000000)와 같은 귀여운 동물 목록 — 앱은 성별·나이를 모르니 사람 얼굴은 쓰지 않는다.
 *  결합(ZWJ)·변형 선택자(FE0F) 이모지는 글꼴·터미널에 따라 두 글자로 갈라지거나 옆 글씨와 겹쳐 보여 단일 코드포인트만 쓴다. */
export const PEER_ANIMAL_FACES = [
  '🐶', '🐱', '🐰', '🦊', '🐼', '🐨', '🐯', '🦁', '🐻', '🐹', '🐧', '🐥', '🐸', '🐵', '🐷', '🐮', '🐙', '🦄',
  '🐭', '🦔', '🦦', '🦥', '🐳', '🐬', '🦭', '🐢', '🦋', '🐝', '🐞', '🦉', '🦆', '🐤', '🐣',
] as const;

/** 구버전 서버 응답(character만 있음)용 대체 — 새 서버는 작성자 기준 얼굴(label.face)을 직접 준다. */
const FACES: Record<string, string> = {
  치이카와: '🐹', 하치와레: '🐱', 우사기: '🐰', 모몽가: '🐭', 쿠리만쥬: '🐻', 랏코: '🦦', 시사: '🦁', 후루혼: '🦉',
};

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
  const face = label.face || FACES[character] || PEER_ANIMAL_FACES[[...character].reduce((sum, ch) => sum + ch.codePointAt(0)!, 0) % PEER_ANIMAL_FACES.length];
  const text = label.title?.trim();
  return { face, title: text ? { text, ...getTitleBadgeStyle(text) } : null, grade: label.grade ? `(${label.grade})` : '', isTeacher: false };
}

/** "😀 칭호(학년)" — 칭호가 없으면 "익명 학생(학년)", 선생님 풀이는 "🎓 선생님 풀이". 화면 읽기·제목용 문자열. */
export function peerSolutionLabel(label: PeerSolution['label']): string {
  const parts = peerSolutionLabelParts(label);
  if (parts.isTeacher) return '🎓 선생님 풀이';
  return `${parts.face} ${parts.title?.text || '익명 학생'}${parts.grade}`;
}

export function formatPeerTime(ms: number): string {
  const seconds = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000);
  return seconds >= 60 ? `${Math.floor(seconds / 60)}분 ${seconds % 60}초` : `${seconds}초`;
}

export function isPeerChanged(error: unknown): boolean {
  return !!error && typeof error === 'object' && (
    ('code' in error && error.code === 'EXAM_PEER_CHANGED') ||
    ('message' in error && String(error.message).includes('EXAM_PEER_CHANGED')));
}

/** 화면별 메모리 캐시. 목록은 다시 열 때 갱신하고 실패한 요청은 재시도한다. */
export class PeerSolutionSession {
  private solutions = new Map<string, Promise<PeerSolutionCandidate[]>>();
  private replays = new Map<string, Promise<InkReplayData>>();
  private api: PeerSolutionApi;
  private attemptId: string;
  constructor(api: PeerSolutionApi, attemptId: string) { this.api = api; this.attemptId = attemptId; }

  list(questionId: string, refresh = false): Promise<PeerSolutionCandidate[]> {
    if (refresh) this.solutions.delete(questionId);
    const cached = this.solutions.get(questionId);
    if (cached) return cached;
    const pending = this.api.listPeerSolutions(this.attemptId, questionId).catch(error => {
      if (this.solutions.get(questionId) === pending) this.solutions.delete(questionId);
      throw error;
    });
    this.solutions.set(questionId, pending);
    return pending;
  }

  replay(questionId: string, solutionKey: string, refresh = false): Promise<InkReplayData> {
    const key = `${questionId}:${solutionKey}`;
    if (refresh) this.replays.delete(key);
    const cached = this.replays.get(key);
    if (cached) return cached;
    const pending = this.api.getPeerSolutionByKey(this.attemptId, questionId, solutionKey).catch(error => {
      if (this.replays.get(key) === pending) this.replays.delete(key);
      if (isPeerChanged(error)) this.solutions.delete(questionId);
      throw error;
    });
    this.replays.set(key, pending);
    return pending;
  }
}
