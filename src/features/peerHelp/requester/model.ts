import type { MyHelpRequest } from '../api.ts';

export function requestMap(rows: MyHelpRequest[]): Record<string, MyHelpRequest> {
  const result: Record<string, MyHelpRequest> = {};
  for (const row of rows) {
    const previous = result[row.mistake_id];
    if (!previous || row.created_at > previous.created_at) result[row.mistake_id] = row;
  }
  return result;
}

export function requestChip(request?: MyHelpRequest): string | null {
  if (!request) return null;
  if (request.unseen_count > 0) return `🙋 풀이 ${request.unseen_count}개 도착`;
  return request.status === 'open' ? `🙋 도움 요청 중 · 풀이 ${request.solution_count}개` : null;
}

export function feedbackMessage(reward: number): string {
  return `피드백 고마워요!${reward > 0 ? ` +${reward}P` : ''}`;
}
