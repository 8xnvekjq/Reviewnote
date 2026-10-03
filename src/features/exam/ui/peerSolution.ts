import type { ExamClient, InkReplayData, PeerSolution } from '../contract.ts';

export type PeerSolutionApi = Pick<ExamClient, 'getPeerSolution' | 'getPeerSolutionReplay'>;

/** 서버가 정한 캐릭터(요청자+문항 기준이라 작성자와 연결되지 않음)를 사람 얼굴 이모지로 바꿔 쓴다.
 *  🧑‍🏫·🧑‍🦱 같은 결합(ZWJ) 이모지는 글꼴·터미널에 따라 두 글자로 갈라지거나 옆 글씨와 겹쳐 보여 한 글자짜리만 쓴다. */
const FACES: Record<string, string> = {
  치이카와: '🧑', 하치와레: '👩', 우사기: '👨', 모몽가: '🧒', 쿠리만쥬: '👧', 랏코: '👦', 시사: '👱', 후루혼: '🧔',
};
const FALLBACK_FACES = ['🧑', '👩', '👨', '🧒', '👧', '👦', '👱', '🧔'];

/** "😀 칭호(학년)" — 칭호가 없으면 "익명 학생(학년)", 선생님 풀이는 "🎓 선생님 풀이". */
export function peerSolutionLabel(label: PeerSolution['label']): string {
  if (label.isTeacher) return '🎓 선생님 풀이';
  const face = FACES[label.character] ?? FALLBACK_FACES[[...label.character].reduce((sum, ch) => sum + ch.codePointAt(0)!, 0) % FALLBACK_FACES.length];
  const grade = label.grade ? `(${label.grade})` : '';
  return `${face} ${label.title || '익명 학생'}${grade}`;
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
