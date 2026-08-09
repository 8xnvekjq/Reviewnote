import type { GachaItem, GachaRarity } from '../types';

export const GACHA_ITEMS: GachaItem[] = [
  // ── MR (0.1%) - Mythic Rare (신화급 강렬한 크림슨 불꽃) ───────────────
  {
    id: 'title_160h_time_lord',
    name: '⏱️ 칭호: 160시간 시간의 지배자',
    description: '🔒 [한정판 - 일반 뽑기 불가] 한 달 160시간이라는 경이로운 몰입으로 한계를 돌파한 전설의 명예 칭호입니다.',
    rarity: 'MR',
    category: 'TITLE',
    icon: '⏱️',
    effectValue: '160시간 시간의 지배자',
    color: 'from-red-600 via-rose-500 to-amber-500',
    isLimited: true,
  },
  // ── UR (1%) - Ultra Rare (무지개빛 레전드) ──────────────────────────
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
    color: 'from-amber-400 via-pink-500 to-purple-500'
  },
  {
    id: 'stamp_diamond',
    name: '💎 다이아 스탬프',
    description: '3차 복습 완료 시 찬란한 다이아몬드 도장이 찍힙니다.',
    rarity: 'UR',
    category: 'STAMP',
    icon: '💎',
    effectValue: '💎',
    color: 'from-amber-400 via-pink-500 to-purple-500'
  },
  {
    id: 'stamp_rocket',
    name: '🚀 우주선 돌파 스탬프',
    description: '복습 완료 시 역동적인 로켓 도장이 찍힙니다.',
    rarity: 'UR',
    category: 'STAMP',
    icon: '🚀',
    effectValue: '🚀',
    color: 'from-amber-400 via-pink-500 to-purple-500'
  },
  {
    id: 'charm_score_hundred',
    name: '🎴 부적: 시험 100점 선택권',
    description: '시험지 답안 채점 시 언제든 전과목 100점 대박을 끌어당기는 신비한 기운의 부적입니다.',
    rarity: 'UR',
    category: 'CHARM',
    icon: '🎴',
    effectValue: '시험 100점 선택',
    color: 'from-amber-400 via-pink-500 to-purple-500'
  },
  {
    id: 'item_homework_exempt',
    name: '📝 숙제 면제권',
    description: '숙제 1회를 면제받을 수 있는 티켓입니다. 사용 후 선생님께 보여주세요.',
    rarity: 'UR',
    category: 'SHIELD',
    icon: '📝',
    effectValue: 'homework_exempt',
    color: 'from-amber-400 via-pink-500 to-purple-500'
  },
  {
    id: 'theme_legendary_gold',
    name: '🎨 레전드 골드 갤럭시 테마',
    description: '전설적인 황금빛 태양과 은하수가 어우러진 최고급 레전드 테마입니다.',
    rarity: 'UR',
    category: 'THEME',
    icon: '☀️',
    effectValue: '#D4AF37',
    themeAccentValue: '#8B5CF6',
    gradient: 'linear-gradient(135deg, #D4AF37 0%, #8B5CF6 100%)',
    color: 'from-amber-400 via-pink-500 to-purple-500'
  },
  {
    id: 'theme_nebula_pink',
    name: '🎨 네뷸라 네온 핑크 테마',
    description: '우주 성운의 화려한 네온 핫핑크 감성이 폭발하는 레전드 테마입니다.',
    rarity: 'UR',
    category: 'THEME',
    icon: '🌸',
    effectValue: '#FF4FA7',
    themeAccentValue: '#22D3EE',
    gradient: 'linear-gradient(135deg, #FF4FA7 0%, #22D3EE 100%)',
    color: 'from-amber-400 via-pink-500 to-purple-500'
  },
  {
    id: 'theme_angelic_white',
    name: '🎨 하이퍼 블라인딩 화이트 테마',
    description: '눈부신 퓨어 순백의 광채와 다이아몬드 네온이 폭발하는 극강의 눈뽕 라이트 테마입니다.',
    rarity: 'UR',
    category: 'THEME',
    icon: '🤍',
    effectValue: '#FFFFFF',
    themeAccentValue: '#00F0FF',
    gradient: 'linear-gradient(135deg, #FFFFFF 0%, #E2E8F0 50%, #00F0FF 100%)',
    color: 'from-amber-400 via-pink-500 to-purple-500'
  },
  {
    id: 'ai_queendongju',
    name: '👑 AI 말투: 하이텐션 퀸동주',
    description: 'AI 밤티 쌤이 "퀸" 컨셉의 하이텐션과 "에리얼", "까리꾸스", "우위" 같은 시그니처 조어로 수학 오답을 신나게 해설해줍니다.\n💬 "에리얼! 이 공식 완전 까리꾸스하지 않아? 우위~ 인정이야!"',
    rarity: 'UR',
    category: 'AI_VOICE',
    icon: '👑',
    effectValue: 'queendongju',
    color: 'from-amber-400 via-pink-500 to-purple-500'
  },
  {
    id: 'item_ur_ticket',
    name: '🎫 UR 확정 뽑기권',
    description: '사용하는 즉시 UR 등급 아이템 중 하나를 100% 확정으로 획득할 수 있는 최고급 티켓입니다.',
    rarity: 'UR',
    category: 'SHIELD',
    icon: '🎫',
    effectValue: 'ur_ticket',
    color: 'from-amber-400 via-pink-500 to-purple-500'
  },

  // ── SSR (7%) - Super Special Rare (황금 빛) ────────────────────────
  {
    id: 'item_ssr_ticket',
    name: '🎫 SSR 확정 뽑기권',
    description: '사용하는 즉시 SSR 등급 아이템 중 하나를 100% 확정으로 획득할 수 있는 고급 티켓입니다.',
    rarity: 'SSR',
    category: 'SHIELD',
    icon: '🎫',
    effectValue: 'ssr_ticket',
    color: 'from-amber-400 via-yellow-400 to-amber-500'
  },
  {
    id: 'item_point_booster',
    name: '🎟️ 콤보 부스터 (5배 버프 3시간권)',
    description: '보물가방에서 사용 시 3시간 동안 복습 완료할 때 얻는 모든 콤보 포인트를 5배로 획득하는 강력한 주문서입니다.',
    rarity: 'SSR',
    category: 'SHIELD',
    icon: '🎟️',
    effectValue: 'point_booster',
    color: 'from-amber-400 via-yellow-400 to-amber-500'
  },
  {
    id: 'charm_grade_one',
    name: '🎴 부적: 1등급 선택권',
    description: '원하는 핵심 시험에서 당당히 1등급을 쟁취할 수 있는 행운의 전설 부적입니다.',
    rarity: 'SSR',
    category: 'CHARM',
    icon: '🎴',
    effectValue: '1등급 선택',
    color: 'from-amber-400 via-yellow-400 to-amber-500'
  },
  {
    id: 'stamp_cat_paw',
    name: '🐾 참잘했어요 냥발',
    description: '복습 도장이 귀여운 핑크 냥발 도장으로 바뀝니다.',
    rarity: 'SSR',
    category: 'STAMP',
    icon: '🐾',
    effectValue: '🐾',
    color: 'from-amber-400 via-yellow-400 to-amber-500'
  },
  {
    id: 'stamp_lightning',
    name: '⚡ 번개 폭풍 스탬프',
    description: '복습 도장이 강렬한 번개 스탬프 표식으로 바뀝니다.',
    rarity: 'SSR',
    category: 'STAMP',
    icon: '⚡',
    effectValue: '⚡',
    color: 'from-amber-400 via-yellow-400 to-amber-500'
  },
  {
    id: 'stamp_cherry_blossom',
    name: '🌸 벚꽃 흩날림 스탬프',
    description: '복습 완료 시 화사한 핑크 벚꽃 도장이 찍힙니다.',
    rarity: 'SSR',
    category: 'STAMP',
    icon: '🌸',
    effectValue: '🌸',
    color: 'from-amber-400 via-yellow-400 to-amber-500'
  },
  {
    id: 'theme_emerald',
    name: '🎨 사이버 네온 에메랄드 테마',
    description: '강렬한 사이버 에메랄드 & 네온 민트의 화려한 그라데이션 매트릭스 테마입니다.',
    rarity: 'SSR',
    category: 'THEME',
    icon: '🟢',
    effectValue: '#00E5A0',
    gradient: 'linear-gradient(135deg, #00E5A0 0%, #047857 50%, #6EE7B7 100%)',
    color: 'from-amber-400 via-yellow-400 to-amber-500'
  },
  {
    id: 'theme_ocean_blue',
    name: '🎨 딥 오션 아틀란티스 테마',
    description: '깊은 바다 속 찬란한 사파이어 블루 글로우를 선사하는 테마입니다.',
    rarity: 'SSR',
    category: 'THEME',
    icon: '🌊',
    effectValue: '#0F52BA',
    gradient: 'linear-gradient(135deg, #1E40AF 0%, #1E3A8A 50%, #0F52BA 100%)',
    color: 'from-amber-400 via-yellow-400 to-amber-500'
  },
  {
    id: 'theme_toxic_lime',
    name: '🎨 네온 토식 라이믹 테마',
    description: '톡 쏘는 사이버 라임 그린이 시선을 사로잡는 테마입니다.',
    rarity: 'SSR',
    category: 'THEME',
    icon: '🧪',
    effectValue: '#CCFF00',
    gradient: 'linear-gradient(135deg, #65A30D 0%, #365314 50%, #CCFF00 100%)',
    color: 'from-amber-400 via-yellow-400 to-amber-500'
  },
  {
    id: 'theme_crimson',
    name: '🎨 크림슨 레드 테마',
    description: '앱 전체 배경 및 프레임이 강렬한 크림슨 레드 톤으로 변환됩니다.',
    rarity: 'SSR',
    category: 'THEME',
    icon: '❤️',
    effectValue: '#DC143C',
    gradient: 'linear-gradient(135deg, #B91C1C 0%, #991B1B 50%, #DC143C 100%)',
    color: 'from-amber-400 via-yellow-400 to-amber-500'
  },
  {
    id: 'theme_charcoal',
    name: '🎨 차콜 그래파이트 테마',
    description: '앱 전체 배경 및 프레임이 색을 절제한 고급스러운 차콜 그레이 톤으로 변환됩니다.',
    rarity: 'SSR',
    category: 'THEME',
    icon: '⚫',
    effectValue: '#475569',
    gradient: 'linear-gradient(135deg, #334155 0%, #1E293B 100%)',
    color: 'from-amber-400 via-yellow-400 to-amber-500'
  },
  {
    id: 'ai_tsundere',
    name: '🤖 AI 말투: 츤데레 쌤',
    description: 'AI 밤티 쌤이 툴툴대면서도 따뜻하게 챙겨주는 츤데레 톤으로 풀이해줍니다.\n💬 "흥, 딱히 너한테 알려주는 건 아니거든? 이 공식이나 똑바로 외워!"',
    rarity: 'SSR',
    category: 'AI_VOICE',
    icon: '😼',
    effectValue: 'tsundere',
    color: 'from-amber-400 via-yellow-400 to-amber-500'
  },
  {
    id: 'ai_seonbi',
    name: '👑 AI 말투: 한림학사 훈장님',
    description: 'AI 밤티 쌤이 조선시대 훈장님처럼 엄숙하면서도 자상하게 풀이해줍니다.\n💬 "허허, 유생이여! 무릇 이 개념의 이치를 깨닫지 못하면 낭패를 면치 못할 것이니라."',
    rarity: 'SSR',
    category: 'AI_VOICE',
    icon: '📜',
    effectValue: 'seonbi',
    color: 'from-amber-400 via-yellow-400 to-amber-500'
  },
  {
    id: 'ai_sherlock',
    name: '🕵️ AI 말투: 명탐정 셜록 밤티',
    description: 'AI 밤티 쌤이 셜록 홈즈 본인의 기품과 관찰력으로 오답의 범인을 파헤칩니다.\n💬 "기초적인 걸세! 이 오답의 범인은 3단계 부호 실수라네. 자, 관찰과 논리로 해결해볼까!"',
    rarity: 'SSR',
    category: 'AI_VOICE',
    icon: '🕵️',
    effectValue: 'sherlock',
    color: 'from-amber-400 via-yellow-400 to-amber-500'
  },
  {
    id: 'ai_knight',
    name: '🏰 AI 말투: 중세 기사단장',
    description: 'AI 밤티 쌤이 꺾이지 않는 용기와 기사도 정신으로 풀이를 전수합니다.\n💬 "주군이시여! 아무리 험난한 킬러 문제라 한들, 제 수식의 칼날로 베어내어 승리를 바치겠나이다!"',
    rarity: 'SSR',
    category: 'AI_VOICE',
    icon: '🛡️',
    effectValue: 'knight',
    color: 'from-amber-400 via-yellow-400 to-amber-500'
  },
  {
    id: 'ai_mentor',
    name: '👨‍🏫 AI 말투: 민수쌤 스타일',
    description: 'AI 밤티 쌤이 실제 수업처럼 질문으로 유도하고 왜 그런지 증명해가며 설명해줍니다.\n💬 "자, 여기서 뭐가 나올까요? 그렇지, 나이스! 이제 왜 그런지 증명해볼까요?"',
    rarity: 'SSR',
    category: 'AI_VOICE',
    icon: '👨‍🏫',
    effectValue: 'mentor',
    color: 'from-amber-400 via-yellow-400 to-amber-500'
  },
  {
    id: 'ai_gyaru',
    name: '🤖 AI 말투: 하이텐션 갸루 쌤',
    description: 'AI 밤티 쌤이 콧소리 억양과 쵸베리구/쵸베리바 갸루 용어로 수학 오답을 신나게 해설해줍니다.\n💬 "공통인수 묶어서 풀면 마지데(マジで) 쵸베리구(超VeryGood)잖아?! 미분 야호~!"',
    rarity: 'SSR',
    category: 'AI_VOICE',
    icon: '✌️',
    imageUrl: '/assets/gyaru_teacher_avatar.jpg',
    effectValue: 'gyaru',
    color: 'from-amber-400 via-yellow-400 to-amber-500'
  },
  {
    id: 'ai_queengabee',
    name: '💅 AI 말투: LA 셀럽 퀸가비',
    description: 'AI 밤티 쌤이 나른한 톤과 당당한 내용의 대비, "헤이~", "RUDE! 무례하다고!" 같은 LA 셀럽 말투로 수학 오답을 해설해줍니다.\n💬 "헤이~ 이 정도는 나한테 껌이지, 무례하게 잘했다고 자랑해도 돼."',
    rarity: 'SSR',
    category: 'AI_VOICE',
    icon: '💅',
    effectValue: 'queengabee',
    color: 'from-amber-400 via-yellow-400 to-amber-500'
  },
  {
    id: 'title_22_killer',
    name: '⚔️ 칭호: 킬러문항 포식자',
    description: '어려운 준킬러/킬러 문제도 씹어먹는 열공 마스터의 증표입니다.',
    rarity: 'SSR',
    category: 'TITLE',
    icon: '⚔️',
    effectValue: '킬러문항 포식자',
    color: 'from-amber-400 via-yellow-400 to-amber-500'
  },

  // ── SR (22%) - Special Rare (보라빛) ────────────────────────
  {
    id: 'item_name_change',
    name: '🏷️ 닉네임 변경권',
    description: '언제든 닉네임(표시 이름)을 변경할 수 있는 커스텀 티켓입니다.',
    rarity: 'SR',
    category: 'SHIELD',
    icon: '🏷️',
    effectValue: 'name_change',
    color: 'from-purple-400 via-indigo-400 to-purple-600'
  },
  {
    id: 'item_ai_name_change',
    name: '🎭 AI 이름 변경권',
    description: 'AI 밤티 쌤의 이름을 원하는 페르소나 이름으로 바꿀 수 있는 변경권입니다.',
    rarity: 'SR',
    category: 'SHIELD',
    icon: '🎭',
    effectValue: 'ai_name_change',
    color: 'from-purple-400 via-indigo-400 to-purple-600'
  },
  {
    id: 'theme_cyber_purple',
    name: '🎨 사이버 딥 퍼플 테마',
    description: '오답노트 배경 세부 컬러가 고급스러운 딥 퍼플 글로우로 변경됩니다.',
    rarity: 'SR',
    category: 'THEME',
    icon: '🟣',
    effectValue: '#6D28D9',
    gradient: 'linear-gradient(135deg, #6D28D9 0%, #4C1D95 100%)',
    color: 'from-purple-400 via-indigo-400 to-purple-600'
  },
  {
    id: 'theme_aurora',
    name: '🎨 미드나잇 오로라 테마',
    description: '몽환적인 딥 바이올렛 & 시안 펄스 오로라 그라데이션이 앱 전체를 휘감습니다.',
    rarity: 'SR',
    category: 'THEME',
    icon: '🌌',
    effectValue: '#7C3AED',
    gradient: 'linear-gradient(135deg, #059669 0%, #06B6D4 50%, #7C3AED 100%)',
    color: 'from-purple-400 via-indigo-400 to-purple-600'
  },
  {
    id: 'theme_coral',
    name: '🎨 선셋 코랄 테마',
    description: '앱 전체 배경 및 프레임이 세련된 선셋 코랄 핑크 톤으로 변환됩니다.',
    rarity: 'SR',
    category: 'THEME',
    icon: '🌅',
    effectValue: '#FF7F50',
    gradient: 'linear-gradient(135deg, #FF7F50 0%, #9F1239 100%)',
    color: 'from-purple-400 via-indigo-400 to-purple-600'
  },
  {
    id: 'theme_forest',
    name: '🎨 포레스트 그린 테마',
    description: '눈이 편안하고 차분한 딥 파인 포레스트 그린 테마입니다.',
    rarity: 'SR',
    category: 'THEME',
    icon: '🌲',
    effectValue: '#166534',
    gradient: 'linear-gradient(135deg, #166534 0%, #14532D 100%)',
    color: 'from-purple-400 via-indigo-400 to-purple-600'
  },
  {
    id: 'theme_burgundy',
    name: '🎨 버건디 와인 테마',
    description: '앱 전체 배경 및 프레임이 고급스러운 버건디 와인 톤으로 변환됩니다.',
    rarity: 'SR',
    category: 'THEME',
    icon: '🍷',
    effectValue: '#800020',
    gradient: 'linear-gradient(135deg, #800020 0%, #4C0519 100%)',
    color: 'from-purple-400 via-indigo-400 to-purple-600'
  },
  {
    id: 'ai_healing',
    name: '🧘 AI 말투: 힐링 멘토',
    description: 'AI 밤티 쌤이 마음을 다독이며 따뜻하고 차분하게 풀이해줍니다.\n💬 "괜찮아요, 틀려도 괜찮아. 이 고비를 넘어설수록 너는 더 멋지게 성장하고 있으니까."',
    rarity: 'SR',
    category: 'AI_VOICE',
    icon: '🧘',
    effectValue: 'healing',
    color: 'from-purple-400 via-indigo-400 to-purple-600'
  },
  {
    id: 'ai_cyberpunk',
    name: '🌌 AI 말투: 사이버펑크 AI',
    description: 'AI 밤티 쌤이 미래 지향적 정밀 알고리즘 톤으로 풀이 프로세스를 제공합니다.\n💬 "[System Alert] 오답 프로세스 감지. 0.001초 만에 최적의 해법 알고리즘을 로딩합니다."',
    rarity: 'SR',
    category: 'AI_VOICE',
    icon: '🤖',
    effectValue: 'cyberpunk',
    color: 'from-purple-400 via-indigo-400 to-purple-600'
  },
  {
    id: 'item_streak_shield',
    name: '🛡️ 스트릭 방어권 (1회용)',
    description: '시험 기간이나 바쁜 날 하루 복습을 못 해도 연속 복습 콤보를 보호해줍니다.',
    rarity: 'SR',
    category: 'SHIELD',
    icon: '🛡️',
    effectValue: 'streak_shield',
    color: 'from-purple-400 via-indigo-400 to-purple-600'
  },
  {
    id: 'title_calculator',
    name: '🔮 칭호: 계산의 달인',
    description: '계산 실수를 줄이고 빠른 연산력을 보여주는 칭호입니다.',
    rarity: 'SR',
    category: 'TITLE',
    icon: '🔮',
    effectValue: '계산의 달인',
    color: 'from-purple-400 via-indigo-400 to-purple-600'
  },

  // ── R (70%) - Rare (파란/일반 빛) ───────────────────────────
  {
    id: 'charm_luck_exam',
    name: '🎴 부적: 찍기 신공 부적',
    description: '시험날 헷갈리는 객관식 문제를 찍을 때 정답률이 솟구치는 기운의 부적입니다.',
    rarity: 'R',
    category: 'CHARM',
    icon: '🎴',
    effectValue: '찍기 신공',
    color: 'from-sky-400 via-blue-400 to-indigo-500'
  },
  {
    id: 'charm_no_mistake',
    name: '🎴 부적: 연산 실수 퇴치 부적',
    description: '부호 실수, 덧셈 실수를 싹 막아주는 시험 대박 예방 부적입니다.',
    rarity: 'R',
    category: 'CHARM',
    icon: '🚫',
    effectValue: '실수 퇴치',
    color: 'from-sky-400 via-blue-400 to-indigo-500'
  },
  {
    id: 'theme_classic_mono',
    name: '🎨 클래식 모노 다크 테마',
    description: '색조가 거의 없는 순수 무채색 그레이 다크 테마입니다.',
    rarity: 'R',
    category: 'THEME',
    icon: '🖤',
    effectValue: '#737373',
    color: 'from-sky-400 via-blue-400 to-indigo-500'
  },
  {
    id: 'theme_warm_latte',
    name: '🎨 웜 카페 라떼 테마',
    description: '따스하고 차분한 브라운 라떼 감성의 스터디 테마입니다.',
    rarity: 'R',
    category: 'THEME',
    icon: '☕',
    effectValue: '#A67B5B',
    color: 'from-sky-400 via-blue-400 to-indigo-500'
  },
  {
    id: 'ai_sergeant',
    name: '🎭 AI 말투: 유쾌한 말년 병장',
    description: 'AI 밤티 쌤이 전역을 앞둔 말년 병장처럼 친근하고 유쾌하게 해설합니다.\n💬 "아~ 말년에 수풀이라니! 행석아, 편하게 들어라. 1단계 공식만 딱 넣으면 끝나는 거다~"',
    rarity: 'R',
    category: 'AI_VOICE',
    icon: '🎖️',
    effectValue: 'sergeant',
    color: 'from-sky-400 via-blue-400 to-indigo-500'
  },
  {
    id: 'ai_poet',
    name: '☕ AI 말투: 셰익스피어 낭만시인',
    description: 'AI 밤티 쌤이 감성적인 시처럼 아름답고 낭만적으로 수식을 읊어줍니다.\n💬 "오, 그대 눈동자 속 차이함수의 아름다움이여... 이 적분의 물결이 미지의 X를 완성하리라."',
    rarity: 'R',
    category: 'AI_VOICE',
    icon: '☕',
    effectValue: 'poet',
    color: 'from-sky-400 via-blue-400 to-indigo-500'
  },
  {
    id: 'ai_vampire',
    name: '🧛 AI 말투: 밤의 뱀파이어 백작',
    description: 'AI 밤티 쌤이 몽환적인 다크 판타지 백작 톤으로 풀이의 비밀을 파헤칩니다.\n💬 "크크크... 어둠 속에서 피어나는 달콤한 정답의 향기... 그대의 오답에 영원한 쉼을 주마."',
    rarity: 'R',
    category: 'AI_VOICE',
    icon: '🧛',
    effectValue: 'vampire',
    color: 'from-sky-400 via-blue-400 to-indigo-500'
  },
  {
    id: 'stamp_star',
    name: '⭐ 황금 별 스탬프',
    description: '복습 완료 시 반짝이는 황금 미니 스타 도장이 찍힙니다.',
    rarity: 'R',
    category: 'STAMP',
    icon: '⭐',
    effectValue: '⭐',
    color: 'from-sky-400 via-blue-400 to-indigo-500'
  },
  {
    id: 'title_pythagoras',
    name: '📐 칭호: 피타고라스의 후예',
    description: '도형과 수식 직관력이 뛰어난 열공 학생의 증표입니다.',
    rarity: 'R',
    category: 'TITLE',
    icon: '📐',
    effectValue: '피타고라스의 후예',
    color: 'from-sky-400 via-blue-400 to-indigo-500'
  },
  {
    id: 'stamp_fire',
    name: '🔥 불타는 열공 도장',
    description: '복습 완료 시 열정의 불꽃 스탬프가 찍힙니다.',
    rarity: 'R',
    category: 'STAMP',
    icon: '🔥',
    effectValue: '🔥',
    color: 'from-sky-400 via-blue-400 to-indigo-500'
  },
  {
    id: 'title_night_owl',
    name: '🦉 칭호: 새벽의 오답마스터',
    description: '남들이 잘 때 묵묵히 오답을 복습하는 열정파 학생의 증표입니다.',
    rarity: 'R',
    category: 'TITLE',
    icon: '🦉',
    effectValue: '새벽의 오답마스터',
    color: 'from-sky-400 via-blue-400 to-indigo-500'
  }
];

// 가챠 확률 가중치 기반 무작위 1회 뽑기 함수
export function drawGachaItem(): GachaItem {
  const rand = Math.random() * 100; // 0 ~ 100

  let targetRarity: GachaRarity;
  if (rand < 0.1) {
    targetRarity = 'MR';       // 0.1% (신화급 극악의 확률)
  } else if (rand < 1.0) {
    targetRarity = 'UR';       // 0.9% (전설급)
  } else if (rand < 8.0) {
    targetRarity = 'SSR';      // 7.0% (슈퍼레어)
  } else if (rand < 30.0) {
    targetRarity = 'SR';       // 22.0% (레어)
  } else {
    targetRarity = 'R';        // 70.0% (일반)
  }

  // 🔒 한정판(isLimited: true) 아이템은 일반 가챠 뽑기 Pool에서 100% 제외
  const pool = GACHA_ITEMS.filter(item => item.rarity === targetRarity && !item.isLimited);
  if (pool.length === 0) {
    const fallbackPool = GACHA_ITEMS.filter(item => !item.isLimited);
    return fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
  }

  const selectedIndex = Math.floor(Math.random() * pool.length);
  return pool[selectedIndex];
}

// ── 칭호 희귀도별 화려한 이펙트 스타일 공통 반환 함수 ─────────────────
export const getTitleBadgeStyle = (title: string) => {
  if (title.includes('시간의 지배자') || title.includes('160시간')) {
    return {
      style: 'bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 text-white border-red-400 shadow-[0_0_18px_rgba(244,63,94,0.95)] ring-2 ring-rose-500/80 animate-pulse font-black',
      icon: '⏱️'
    };
  }
  if (title.includes('수학의 신')) {
    return {
      style: 'bg-gradient-to-r from-amber-400 via-pink-500 to-purple-500 text-white border-amber-300 shadow-[0_0_10px_rgba(245,158,11,0.6)] animate-pulse font-black',
      icon: '👑'
    };
  }
  if (title.includes('우주') || title.includes('수재')) {
    return {
      style: 'bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-500 text-white border-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.6)] animate-pulse font-black',
      icon: '🚀'
    };
  }
  if (title.includes('킬러문항') || title.includes('포식자')) {
    return {
      style: 'bg-gradient-to-r from-amber-500/30 via-yellow-500/40 to-amber-500/30 text-amber-300 border border-amber-400/70 shadow-[0_0_8px_rgba(251,191,36,0.4)] font-black',
      icon: '⚔️'
    };
  }
  if (title.includes('계산') || title.includes('달인')) {
    return {
      style: 'bg-gradient-to-r from-purple-500/30 to-indigo-500/30 text-purple-300 border border-purple-400/60 shadow-[0_0_6px_rgba(168,85,247,0.3)] font-black',
      icon: '🔮'
    };
  }
  if (title.includes('피타고라스')) {
    return {
      style: 'bg-gradient-to-r from-blue-500/30 to-teal-500/30 text-cyan-300 border border-cyan-400/60 shadow-[0_0_6px_rgba(6,182,212,0.3)] font-black',
      icon: '📐'
    };
  }
  // 위에서 전용 스타일이 지정되지 않은 칭호(예: 새벽의 오답마스터)는 카탈로그에 등록된
  // 실제 등급(rarity)에 맞는 색으로 자동 적용한다 — 고정된 회색 기본값 하나로 뭉뚱그리면
  // 새 칭호가 추가될 때마다 매번 이 함수를 안 고치는 한 등급과 무관하게 똑같이 보이는 문제가 있었다.
  const catalogItem = GACHA_ITEMS.find(g => g.category === 'TITLE' && g.effectValue === title);
  if (catalogItem) {
    const rarityTheme = getRarityTheme(catalogItem.rarity);
    return {
      style: `bg-gradient-to-r ${rarityTheme.bgGradient} text-white border-transparent font-black shadow-sm`,
      icon: catalogItem.icon
    };
  }
  return {
    style: 'bg-slate-800/90 text-sky-300 border border-slate-700 font-black shadow-sm',
    icon: '🦉'
  };
};

// ── 등급별(UR/SSR/SR/R) 100% 통일된 테마 스타일 반환 함수 ─────────────
// 등급 배지(item.color 그라데이션) 위에 올릴 텍스트 색상. UR/SSR는 밝은 amber-400에서
// 그라데이션이 시작해서 흰 글씨가 거의 안 보이므로 어두운 텍스트를, 나머지는 배경이 어두워
// 흰 텍스트를 쓴다. GachaStore.tsx의 인벤토리/도감/뽑기결과 배지 3곳이 공유해서 쓴다.
export const getRarityBadgeTextColor = (rarity: GachaRarity): string => {
  return rarity === 'UR' || rarity === 'SSR' ? 'text-slate-950' : 'text-white';
};

export const getRarityTheme = (rarity: GachaRarity) => {
  switch (rarity) {
    case 'MR':
      return {
        badge: 'bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 text-white font-black animate-pulse shadow-lg shadow-red-500/60 ring-2 ring-rose-500/80',
        border: 'border-red-500 shadow-[0_0_20px_rgba(244,63,94,0.85)] ring-2 ring-rose-500/90 animate-pulse',
        bgGradient: 'from-red-600 via-rose-500 to-amber-500',
        textColor: 'text-rose-400',
      };
    case 'UR':
      return {
        // 그라데이션이 밝은 amber-400에서 시작해서 SSR과 마찬가지로 흰색 텍스트는 대비가 안 나온다
        badge: 'bg-gradient-to-r from-amber-400 via-pink-500 to-purple-500 text-slate-950 font-black animate-pulse shadow-md shadow-pink-500/30',
        border: 'border-pink-500 shadow-[0_0_14px_rgba(236,72,153,0.5)] ring-2 ring-purple-400/60 animate-pulse',
        bgGradient: 'from-amber-400 via-pink-500 to-purple-500',
        textColor: 'text-pink-300',
      };
    case 'SSR':
      return {
        badge: 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-slate-950 font-black shadow-sm',
        border: 'border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.4)] ring-1 ring-amber-300/40',
        bgGradient: 'from-amber-400 via-yellow-400 to-amber-500',
        textColor: 'text-amber-400',
      };
    case 'SR':
      return {
        badge: 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-black shadow-sm',
        border: 'border-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.35)] ring-1 ring-purple-400/30',
        bgGradient: 'from-purple-400 via-indigo-400 to-purple-600',
        textColor: 'text-purple-300',
      };
    case 'R':
    default:
      return {
        badge: 'bg-gradient-to-r from-sky-400 to-blue-500 text-white font-black shadow-sm',
        border: 'border-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.25)]',
        bgGradient: 'from-sky-400 via-blue-400 to-indigo-500',
        textColor: 'text-sky-300',
      };
  }
};
