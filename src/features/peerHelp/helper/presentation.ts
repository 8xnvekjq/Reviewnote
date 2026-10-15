import type { HelpFeedback } from '../api.ts';

export function helpFeedbackText(feedback: HelpFeedback | null): string {
  return feedback === 'like' ? '👍 좋아요' : feedback === 'unclear' ? '🤔 이해 안 돼요' : '기다리는 중';
}

export function helpRewardText(feedback: HelpFeedback | null, reward: number): string {
  return !feedback ? '피드백을 기다려요' : reward > 0 ? `+${reward}P` : '보상 한도라 포인트 없음';
}
