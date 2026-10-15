import type { HelpFeedback } from '../api.ts';

export function helpFeedbackText(feedback: HelpFeedback | null): string {
  return feedback === 'like' ? '👍 도움 됐어요' : feedback === 'unclear' ? '🤔 이해 못 했어요' : '기다리는 중';
}

export function helpRewardText(feedback: HelpFeedback | null, reward: number, shards = 0): string {
  if (!feedback) return '피드백을 기다려요';
  if (shards > 0) return `지식의 조각 +${shards}개${reward > 0 ? ` · +${reward}P` : ''}`;
  return reward > 0 ? `+${reward}P` : '보상 한도라 보상 없음';
}
