import type { ExamClient, InkReplayData, PeerSolution } from '../contract.ts';

export type PeerSolutionApi = Pick<ExamClient, 'getPeerSolution' | 'getPeerSolutionReplay'>;

export function peerSolutionLabel(label: PeerSolution['label']): string {
  return [label.isTeacher ? '선생님 풀이' : label.character, label.title && `[${label.title}]`, label.grade].filter(Boolean).join(' · ');
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
