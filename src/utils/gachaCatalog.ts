import type { GachaItem, GachaRarity } from '../types';

export const GACHA_ITEMS: GachaItem[] = [
  // UR (0.5~1%) - Ultra Rare (무지개빛 레전드)
  {
    id: 'title_math_god',
    name: '👑 칭호: 수학의 신',
    description: '프로필 및 주간 MVP 카드에 영롱한 황금 칭호가 표시됩니다.',
    rarity: 'UR',
    category: 'TITLE',
    icon: '👑',
    effectValue: '수학의 신',
    color: 'from-amber-400 via-pink-500 to-purple-500'
  },
  {
    id: 'title_cosmic_god',
    name: '🚀 칭호: 우주 최강 수재',
    description: '은하수가 흩날리는 영롱한 우주 최고 수재 칭호가 표시됩니다.',
    rarity: 'UR',
    category: 'TITLE',
    icon: '🚀',
    effectValue: '우주 최강 수재',
    color: 'from-cyan-400 via-purple-400 to-pink-500'
  },
  {
    id: 'stamp_diamond',
    name: '💎 다이아 스탬프',
    description: '3차 복습 완료 시 찬란한 다이아몬드 도장이 찍힙니다.',
    rarity: 'UR',
    category: 'STAMP',
    icon: '💎',
    effectValue: '💎',
    color: 'from-cyan-400 via-sky-300 to-blue-500'
  },
  {
    id: 'stamp_rocket',
    name: '🚀 우주선 돌파 스탬프',
    description: '복습 완료 시 역동적인 로켓 도장이 찍힙니다.',
    rarity: 'UR',
    category: 'STAMP',
    icon: '🚀',
    effectValue: '🚀',
    color: 'from-orange-400 via-red-500 to-purple-600'
  },

  // SSR (5~7%) - Super Special Rare (황금 빛)
  {
    id: 'stamp_cat_paw',
    name: '🐾 참잘했어요 냥발',
    description: '복습 도장이 귀여운 핑크 냥발 도장으로 바뀝니다.',
    rarity: 'SSR',
    category: 'STAMP',
    icon: '🐾',
    effectValue: '🐾',
    color: 'from-amber-300 to-amber-500'
  },
  {
    id: 'stamp_lightning',
    name: '⚡ 번개 폭풍 스탬프',
    description: '복습 도장이 강렬한 번개 스탬프 표식으로 바뀝니다.',
    rarity: 'SSR',
    category: 'STAMP',
    icon: '⚡',
    effectValue: '⚡',
    color: 'from-yellow-400 to-amber-500'
  },
  {
    id: 'stamp_cherry_blossom',
    name: '🌸 벚꽃 흩날림 스탬프',
    description: '복습 완료 시 화사한 핑크 벚꽃 도장이 찍힙니다.',
    rarity: 'SSR',
    category: 'STAMP',
    icon: '🌸',
    effectValue: '🌸',
    color: 'from-pink-300 to-rose-500'
  },
  {
    id: 'ai_tsundere',
    name: '🤖 AI 말투: 츤데레 쌤',
    description: 'AI 밤티 쌤이 툴툴대면서도 따뜻하게 챙겨주는 츤데레 톤으로 풀이해줍니다.',
    rarity: 'SSR',
    category: 'AI_VOICE',
    icon: '😼',
    effectValue: 'tsundere',
    color: 'from-pink-400 to-purple-600'
  },
  {
    id: 'ai_seonbi',
    name: '👑 AI 말투: 한림학사 훈장님',
    description: 'AI 밤티 쌤이 조선시대 훈장님처럼 엄숙하면서도 자상하게 풀이해줍니다.',
    rarity: 'SSR',
    category: 'AI_VOICE',
    icon: '📜',
    effectValue: 'seonbi',
    color: 'from-amber-400 to-yellow-600'
  },
  {
    id: 'ai_sherlock',
    name: '🕵️ AI 말투: 명탐정 셜록 밤티',
    description: 'AI 밤티 쌤이 오답의 범인(실수 원인)을 파헤치는 명탐정 톤으로 해설합니다.',
    rarity: 'SSR',
    category: 'AI_VOICE',
    icon: '🕵️',
    effectValue: 'sherlock',
    color: 'from-indigo-400 to-slate-700'
  },
  {
    id: 'ai_knight',
    name: '🏰 AI 말투: 중세 기사단장',
    description: 'AI 밤티 쌤이 꺾이지 않는 용기와 기사도 정신으로 풀이를 전수합니다.',
    rarity: 'SSR',
    category: 'AI_VOICE',
    icon: '🛡️',
    effectValue: 'knight',
    color: 'from-red-400 to-amber-600'
  },
  {
    id: 'title_22_killer',
    name: '⚔️ 칭호: 킬러문항 포식자',
    description: '어려운 준킬러/킬러 문제도 씹어먹는 열공 마스터의 증표입니다.',
    rarity: 'SSR',
    category: 'TITLE',
    icon: '⚔️',
    effectValue: '킬러문항 포식자',
    color: 'from-red-400 to-amber-500'
  },

  // SR (20%) - Special Rare (보라빛)
  {
    id: 'theme_emerald',
    name: '🎨 네온 에메랄드 테마',
    description: '오답노트 포인트 컬러가 생기 넘치는 사이버 에메랄드로 변경됩니다.',
    rarity: 'SR',
    category: 'THEME',
    icon: '🟢',
    effectValue: '#10B981',
    color: 'from-emerald-400 to-teal-600'
  },
  {
    id: 'theme_cyber_purple',
    name: '🎨 사이버 딥 퍼플 테마',
    description: '오답노트 배경 세부 컬러가 고급스러운 딥 퍼플 글로우로 변경됩니다.',
    rarity: 'SR',
    category: 'THEME',
    icon: '🟣',
    effectValue: '#8B5CF6',
    color: 'from-purple-400 to-indigo-600'
  },
  {
    id: 'theme_aurora',
    name: '🎨 미드나잇 오로라 테마',
    description: '앱 전체 배경 및 프레임이 몽환적인 오로라 시안/민트 톤으로 변환됩니다.',
    rarity: 'SR',
    category: 'THEME',
    icon: '🌌',
    effectValue: '#06B6D4',
    color: 'from-cyan-400 to-blue-600'
  },
  {
    id: 'theme_coral',
    name: '🎨 선셋 코랄 테마',
    description: '앱 전체 배경 및 프레임이 세련된 선셋 코랄 핑크 톤으로 변환됩니다.',
    rarity: 'SR',
    category: 'THEME',
    icon: '🌅',
    effectValue: '#F43F5E',
    color: 'from-rose-400 to-pink-600'
  },
  {
    id: 'ai_healing',
    name: '🧘 AI 말투: 힐링 멘토',
    description: 'AI 밤티 쌤이 마음을 다독이며 따뜻하고 차분하게 풀이해줍니다.',
    rarity: 'SR',
    category: 'AI_VOICE',
    icon: '🧘',
    effectValue: 'healing',
    color: 'from-teal-300 to-emerald-500'
  },
  {
    id: 'ai_cyberpunk',
    name: '🌌 AI 말투: 사이버펑크 AI',
    description: 'AI 밤티 쌤이 미래 지향적 정밀 알고리즘 톤으로 풀이 프로세스를 제공합니다.',
    rarity: 'SR',
    category: 'AI_VOICE',
    icon: '🤖',
    effectValue: 'cyberpunk',
    color: 'from-cyan-400 to-purple-600'
  },
  {
    id: 'item_streak_shield',
    name: '🛡️ 스트릭 방어권 (1회용)',
    description: '시험 기간이나 바쁜 날 하루 복습을 못 해도 연속 복습 콤보를 보호해줍니다.',
    rarity: 'SR',
    category: 'SHIELD',
    icon: '🛡️',
    effectValue: 'streak_shield',
    color: 'from-blue-400 to-indigo-600'
  },
  {
    id: 'item_point_booster',
    name: '🎟️ 콤보 부스터 (포인트 2배권)',
    description: '오답 복습 완주 시 획득하는 콤보 포인트를 2배로 늘려줍니다.',
    rarity: 'SR',
    category: 'SHIELD',
    icon: '🎟️',
    effectValue: 'point_booster',
    color: 'from-amber-400 to-yellow-600'
  },
  {
    id: 'title_calculator',
    name: '🔮 칭호: 계산의 달인',
    description: '계산 실수를 줄이고 빠른 연산력을 보여주는 칭호입니다.',
    rarity: 'SR',
    category: 'TITLE',
    icon: '🔮',
    effectValue: '계산의 달인',
    color: 'from-indigo-400 to-purple-500'
  },

  // R (70%) - Rare (파란/일반 빛)
  {
    id: 'ai_sergeant',
    name: '🎭 AI 말투: 유쾌한 말년 병장',
    description: 'AI 밤티 쌤이 전역을 앞둔 말년 병장처럼 친근하고 유쾌하게 해설합니다.',
    rarity: 'R',
    category: 'AI_VOICE',
    icon: '🎖️',
    effectValue: 'sergeant',
    color: 'from-green-500 to-emerald-700'
  },
  {
    id: 'ai_poet',
    name: '☕ AI 말투: 셰익스피어 낭만시인',
    description: 'AI 밤티 쌤이 감성적인 시처럼 아름답고 낭만적으로 수식을 읊어줍니다.',
    rarity: 'R',
    category: 'AI_VOICE',
    icon: '☕',
    effectValue: 'poet',
    color: 'from-amber-600 to-orange-800'
  },
  {
    id: 'ai_vampire',
    name: '🧛 AI 말투: 밤의 뱀파이어 백작',
    description: 'AI 밤티 쌤이 몽환적인 다크 판타지 백작 톤으로 풀이의 비밀을 파헤칩니다.',
    rarity: 'R',
    category: 'AI_VOICE',
    icon: '🧛',
    effectValue: 'vampire',
    color: 'from-purple-800 to-rose-950'
  },
  {
    id: 'stamp_star',
    name: '⭐ 황금 별 스탬프',
    description: '복습 완료 시 반짝이는 황금 미니 스타 도장이 찍힙니다.',
    rarity: 'R',
    category: 'STAMP',
    icon: '⭐',
    effectValue: '⭐',
    color: 'from-amber-300 to-yellow-500'
  },
  {
    id: 'title_pythagoras',
    name: '📐 칭호: 피타고라스의 후예',
    description: '도형과 수식 직관력이 뛰어난 열공 학생의 증표입니다.',
    rarity: 'R',
    category: 'TITLE',
    icon: '📐',
    effectValue: '피타고라스의 후예',
    color: 'from-blue-400 to-teal-500'
  },
  {
    id: 'charm_luck_exam',
    name: '🎴 부적: 찍기 신공 부적',
    description: '시험날 헷갈리는 객관식 문제를 찍을 때 정답률이 솟구치는 기운의 부적입니다.',
    rarity: 'R',
    category: 'CHARM',
    icon: '🎴',
    effectValue: '찍기 신공',
    color: 'from-sky-400 to-blue-600'
  },
  {
    id: 'charm_no_mistake',
    name: '🎴 부적: 연산 실수 퇴치 부적',
    description: '부호 실수, 덧셈 실수를 싹 막아주는 시험 대박 예방 부적입니다.',
    rarity: 'R',
    category: 'CHARM',
    icon: '🧧',
    effectValue: '실수 퇴치',
    color: 'from-blue-400 to-indigo-500'
  },
  {
    id: 'item_name_change',
    name: '🏷️ 닉네임 변경권',
    description: '언제든 닉네임(표시 이름)을 변경할 수 있는 커스텀 티켓입니다.',
    rarity: 'R',
    category: 'SHIELD',
    icon: '🏷️',
    effectValue: 'name_change',
    color: 'from-slate-400 to-slate-600'
  },
  {
    id: 'stamp_fire',
    name: '🔥 불타는 열공 도장',
    description: '복습 완료 시 열정의 불꽃 스탬프가 찍힙니다.',
    rarity: 'R',
    category: 'STAMP',
    icon: '🔥',
    effectValue: '🔥',
    color: 'from-orange-400 to-red-500'
  },
  {
    id: 'title_night_owl',
    name: '🦉 칭호: 새벽의 오답마스터',
    description: '남들이 잘 때 묵묵히 오답을 복습하는 열정파 학생의 증표입니다.',
    rarity: 'R',
    category: 'TITLE',
    icon: '🦉',
    effectValue: '새벽의 오답마스터',
    color: 'from-slate-500 to-slate-700'
  }
];

// 가챠 확률 가중치 기반 무작위 1회 뽑기 함수
export function drawGachaItem(): GachaItem {
  const rand = Math.random() * 100; // 0 ~ 100

  let targetRarity: GachaRarity;
  if (rand < 1.0) {
    targetRarity = 'UR';       // 1%
  } else if (rand < 8.0) {
    targetRarity = 'SSR';      // 7%
  } else if (rand < 30.0) {
    targetRarity = 'SR';       // 22%
  } else {
    targetRarity = 'R';        // 70%
  }

  const pool = GACHA_ITEMS.filter(item => item.rarity === targetRarity);
  if (pool.length === 0) {
    return GACHA_ITEMS[GACHA_ITEMS.length - 1]; // fallback
  }

  const selectedIndex = Math.floor(Math.random() * pool.length);
  return pool[selectedIndex];
}
