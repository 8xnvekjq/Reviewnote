import { farmMoisture, farmStage, reviewRatioFor } from './farmModel';
import type { FarmSnapshot } from './farmModel';

// Playful, teasing, never nagging — a mascot, not a tutorial. Kept short (fits the small speech
// bubble) and never mentions numbers/formulas; the actual mechanics stay invisible here.
const GENERIC_LINES = [
  '토마토는 4일 동안 자란다구~',
  '하루에 물은 한 번이면 충분해!',
  '복습도 하고 왔어? 작물이 좋아할지도?',
  '물을 좀 빼먹었다고 죽진 않아. 너무 걱정 마!',
  '난 여기서 하루 종일 서 있어. 심심하니까 놀러 와줘!',
  '가끔은 그냥 지켜보는 것도 나쁘지 않아.',
  '매일 안 와도 괜찮아. 대신 평균적으로 조금 아쉬울지도?',
  '허수아비도 나름 바쁘다구. 새 쫓느라 하루가 짧아.',
] as const;

type Category = 'ripe' | 'notWateredToday' | 'wateredToday' | 'dry' | 'moist' | 'growing' | 'reviewExpected' | 'empty';
const CONTEXTUAL_LINES: Record<Category, readonly string[]> = {
  ripe: ['이제 수확해도 되겠다! 나보다 커졌나 볼까?', '오~ 잘 익었는데? 얼른 따가야지!'],
  notWateredToday: ['어라~ 오늘 물 안 준 거 내가 다 봤는데?', '오늘 물 담당, 아직 출근 안 했네?'],
  wateredToday: ['오늘은 충분히 돌봤어. 나보다 부지런하네?', '오늘 할 일은 끝! 나도 좀 쉬어야겠다.'],
  dry: ['흙이 좀 말랐는데... 목마르대, 저 녀석.', '으흠, 흙이 까슬까슬해졌어.'],
  moist: ['흙이 촉촉하니 보기 좋다~', '오늘 흙 상태 완벽한데?'],
  growing: ['쑥쑥 자라는 중이야. 조금만 더 기다려줘.', '아직 자라는 중이니까 느긋하게 기다려보자.'],
  reviewExpected: ['복습하고 왔다고? 토마토가 은근 기대하는 눈치인데~', '어쩐지 오늘 토마토가 싱글벙글하네. 복습 효과인가?'],
  empty: ['심을 준비 됐어? 씨앗은 공짜야!', '빈 밭이 심심해 보이지 않아?'],
} as const;

function activeCategories(snapshot: FarmSnapshot | null, now: number): Category[] {
  if (!snapshot) return [];
  const live = snapshot.plots.map(p => p.crop).filter((c): c is NonNullable<typeof c> => !!c);
  if (live.length === 0) return ['empty'];
  const categories: Category[] = [];
  if (live.some(c => farmStage(c, now) === 'ripe')) categories.push('ripe');
  const growing = live.filter(c => farmStage(c, now) !== 'ripe');
  if (growing.length > 0) {
    const moistures = growing.map(c => farmMoisture(c, now));
    if (moistures.some(m => m === 'dry')) categories.push('dry');
    if (moistures.some(m => m !== 'moist')) categories.push('notWateredToday');
    if (moistures.every(m => m === 'moist')) { categories.push('wateredToday'); categories.push('moist'); }
    if (!categories.includes('dry') && !categories.includes('notWateredToday')) categories.push('growing');
    if (growing.some(c => reviewRatioFor(c.reviewGained) >= 0.5)) categories.push('reviewExpected');
  }
  return categories;
}

// contextualBias: probability of drawing from the currently-applicable contextual pool instead of
// the generic rotation, when at least one contextual line applies. Kept well under 1 so the mascot
// still feels chatty/varied rather than a one-note status readout.
const CONTEXTUAL_BIAS = 0.55;
export function pickScarecrowLine(snapshot: FarmSnapshot | null, now: number, random: () => number = Math.random): string {
  const categories = activeCategories(snapshot, now);
  const pool = categories.flatMap(category => CONTEXTUAL_LINES[category]);
  const useContextual = pool.length > 0 && random() < CONTEXTUAL_BIAS;
  const from = useContextual ? pool : GENERIC_LINES;
  return from[Math.floor(random() * from.length)];
}
