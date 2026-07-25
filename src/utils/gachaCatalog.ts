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
    id: 'stamp_diamond',
    name: '💎 💎 다이아 스탬프',
    description: '3차 복습 완료 시 찬란한 다이아몬드 도장이 찍힙니다.',
    rarity: 'UR',
    category: 'STAMP',
    icon: '💎',
    effectValue: '💎',
    color: 'from-cyan-400 via-sky-300 to-blue-500'
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
