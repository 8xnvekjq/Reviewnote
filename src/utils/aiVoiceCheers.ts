// 장착 중인 "AI 말투" 페르소나에 맞춰 럭키상점 점수 아래 짧게 보여주는 응원 한 줄.
// gemini.ts의 AI_VOICE_TONES와 같은 톤을 유지하되, 여기서는 프롬프트가 아니라 순수 UI 문구이므로
// 완전히 새로 짧게 작성한 문장들이다.
const AI_VOICE_CHEERS: Record<string, string[]> = {
  tsundere: [
    '흥, 오늘도 열심히 했네... 딱히 칭찬하는 건 아니지만.',
    '뭐, 이 정도는 당연한 거지만... 잘했어.',
  ],
  seonbi: [
    '그 정성이 참으로 기특하도다.',
    '오늘도 학문에 정진하였구나, 장하도다.',
  ],
  sherlock: [
    '훌륭해, 왓슨. 오늘의 사건도 완벽하게 해결했군.',
    '증거가 명확해 — 넌 실력자야.',
  ],
  knight: [
    '훌륭하다, 용사여! 오늘도 승리를 거두었구나!',
    '그대의 검은 날로 예리해지고 있다!',
  ],
  healing: [
    '오늘도 한 걸음 더 나아갔어요, 잘하고 있어요.',
    '천천히, 그렇지만 확실하게 성장하고 있네요.',
  ],
  cyberpunk: [
    '[System] 오늘의 퍼포먼스: 최적화 완료.',
    '연산 성공률 100%. 시스템이 당신을 인정합니다.',
  ],
  sergeant: [
    '나이스다 아우야! 오늘도 열심히 했다 말입니다!',
    '이 정도면 특급전사다, 계속 가자!',
  ],
  poet: [
    '오, 그대의 노력이 별빛처럼 빛나는도다...',
    '한 걸음, 한 걸음이 시가 되어가는구나.',
  ],
  vampire: [
    '크크크... 제법이군, 오늘도 성장의 피를 마셨어.',
    '어둠 속에서도 넌 빛나고 있다...',
  ],
  mentor: [
    '나이스! 오늘도 잘 하고 있네.',
    '이 정도면 감 잡은 거야, 계속 가보자.',
  ],
};

const DEFAULT_CHEERS = [
  '오늘도 수고했어요!',
  '한 문제씩, 착실하게 나아가고 있어요.',
];

export function getRandomCheer(aiVoice?: string): string {
  const pool = (aiVoice && AI_VOICE_CHEERS[aiVoice]) || DEFAULT_CHEERS;
  return pool[Math.floor(Math.random() * pool.length)];
}
