export const CHARM_DECORATIONS: Record<string, { label: string; symbol: string; color: string; messages: string[] }> = {
  charm_score_hundred: {
    label: '100점 응원 부적', symbol: '100', color: '#f5c96d',
    messages: ['오늘 푼 한 문제도 소중한 한 걸음이에요!', '정답까지 천천히, 함께 가봐요.', '오늘의 노력이 차곡차곡 쌓이고 있어요.'],
  },
  charm_grade_one: {
    label: '1등급 응원 부적', symbol: '✿', color: '#a9d9b0',
    messages: ['어제보다 하나 더 이해했다면 충분해요.', '작은 복습이 단단한 실력이 돼요.', '나만의 속도로 한 계단씩 올라가요!'],
  },
  charm_luck_exam: {
    label: '시험 응원 부적', symbol: '✦', color: '#c7b5f5',
    messages: ['긴장될 땐 숨을 고르고 조건부터 읽어요.', '준비한 만큼 차분하게 풀어봐요.', '모르는 문제도 한 줄부터 시작해요!'],
  },
  charm_no_mistake: {
    label: '꼼꼼 응원 부적', symbol: '✓', color: '#9edce6',
    messages: ['부호 하나, 조건 하나, 천천히 확인해요.', '다시 살펴보는 습관을 응원해요!', '틀린 곳을 찾았다면 벌써 한 걸음 성장했어요.'],
  },
};

export function pickCharmMessage(id: string, random = Math.random): string {
  const messages = CHARM_DECORATIONS[id]?.messages ?? [];
  return messages[Math.floor(random() * messages.length)] ?? '';
}
