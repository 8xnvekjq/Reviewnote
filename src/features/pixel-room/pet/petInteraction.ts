import type { PetId } from './petKinds';
import type { DogWorld, PetCell } from './dogModel';
import type { PetLink } from './usePetInteraction';

// Tap-to-feed scripts. Each pet plays its existing sprite rows in a fixed order while it is held
// (see holdPet in dogModel.ts); the treat/heart overlays are keyed on `stage`.
export type InteractionStage = 'treat' | 'eat' | 'sit' | 'bark' | 'love' | 'wave' | 'peck' | 'hop' | 'bob';
interface Beat { stage: InteractionStage; at: number; action: string; heart?: boolean }
interface Script { ms: number; beats: Beat[]; label: string; approach: string; start: string; result: string; away: string; blocked: string }

export const PET_INTERACTIONS: Record<PetId, Script> = {
  pet_bear: {
    ms: 3000, label: '곰에게 꿀 주기', approach: '곰에게 다가가는 중이에요…', start: '곰에게 꿀단지를 건넸어요.', result: '곰이 꿀을 맛있게 먹었어요!',
    away: '곰이 다른 곳으로 가 버렸어요. 다시 눌러 주세요.', blocked: '곰 옆으로 갈 수 있는 빈 칸이 없어요.',
    beats: [{ stage: 'treat', at: 0, action: 'idle' }, { stage: 'eat', at: 600, action: 'sit' }, { stage: 'love', at: 1600, action: 'sit', heart: true }, { stage: 'wave', at: 2000, action: 'wave', heart: true }],
  },
  pet_dog: {
    ms: 2800, label: '강아지에게 간식 주기', approach: '강아지에게 다가가는 중이에요…', start: '강아지에게 뼈다귀 간식을 줬어요.', result: '강아지가 간식을 먹고 신이 났어요!',
    away: '강아지가 다른 곳으로 가 버렸어요. 다시 눌러 주세요.', blocked: '강아지 옆으로 갈 수 있는 빈 칸이 없어요.',
    beats: [{ stage: 'treat', at: 0, action: 'idle' }, { stage: 'sit', at: 600, action: 'sit' }, { stage: 'bark', at: 1500, action: 'bark' }, { stage: 'love', at: 2100, action: 'sit', heart: true }],
  },
  pet_duck: {
    ms: 2800, label: '오리에게 빵 부스러기 주기', approach: '오리에게 다가가는 중이에요…', start: '오리 앞에 빵 부스러기를 뿌렸어요.', result: '오리가 빵 부스러기를 콕콕 쪼아 먹었어요!',
    away: '오리가 다른 곳으로 가 버렸어요. 다시 눌러 주세요.', blocked: '오리 옆으로 갈 수 있는 빈 칸이 없어요.',
    beats: [{ stage: 'treat', at: 0, action: 'idle' }, { stage: 'peck', at: 500, action: 'peck' }, { stage: 'hop', at: 1900, action: 'hop' }],
  },
  pet_pigeon: {
    ms: 2800, label: '비둘기에게 모이 주기', approach: '비둘기에게 다가가는 중이에요…', start: '비둘기 앞에 모이를 뿌렸어요.', result: '비둘기가 모이를 맛있게 쪼아 먹었어요!',
    away: '비둘기가 다른 곳으로 날아가 버렸어요. 다시 눌러 주세요.', blocked: '비둘기 옆으로 갈 수 있는 빈 칸이 없어요.',
    beats: [{ stage: 'treat', at: 0, action: 'idle' }, { stage: 'peck', at: 500, action: 'peck' }, { stage: 'bob', at: 1850, action: 'bob' }],
  },
};

/** What a pet `elapsed` ms into its interaction shows: the stage, the sprite row to play and how far into that row. */
export function interactionBeat(pet: PetId, elapsed: number): { stage: InteractionStage; action: string; elapsed: number; heart: boolean } {
  const { beats } = PET_INTERACTIONS[pet];
  let index = 0;
  while (index + 1 < beats.length && elapsed >= beats[index + 1].at) index++;
  const beat = beats[index];
  // Consecutive beats with the same sprite row keep counting from where that row started (a sit
  // that continues into the heart beat must not replay its sit-down transition).
  let first = index;
  while (first > 0 && beats[first - 1].action === beat.action) first--;
  return { stage: beat.stage, action: beat.action, elapsed: Math.max(0, elapsed - beats[first].at), heart: !!beat.heart };
}

/** One tap in progress. `until` is when the pet is released; `player` is who it turns to face. */
export interface PetInteraction { id: number; pet: PetId; player: PetCell; start: number; until: number }
/** Props every roaming pet component takes; `onTap` is omitted where the pet is not tappable. */
export interface PetProps { world: DogWorld; paused?: boolean; interaction?: PetInteraction | null; onTap?: () => void; link?: PetLink }
