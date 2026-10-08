import { fishById } from './fishCatalog';
import { fishHint } from './fishHints';
import type { FishingState } from '../ui/fishingAdapter';

export function turtleLines(state: FishingState, newSpeciesId?: string | null): string[] {
  const newFish = newSpeciesId ? fishById(newSpeciesId) : undefined;
  const greeting = state.remaining <= 0 ? '오늘은 물고기들이 쉬고 있어요. 내일 또 와요!'
    : newFish ? `${newFish.name}, 새 친구를 만났네요! 도감에 소중히 담아 둘게요.`
    : state.weather === 'rain' ? '오늘은 비가 와서 메기가 나올지도 몰라요.'
    : state.phase === 'night' ? '조용한 밤이에요. 달빛 아래 새 친구가 기다릴 거예요.'
    : '천천히 둘러봐요. 강에는 아직 만나지 못한 친구들이 있어요.';
  const hintFish = state.pigeonHint ? fishById(state.pigeonHint) : undefined;
  const pigeon = state.pigeonHint ? `비둘기가 알려 줬어요: ${hintFish ? `${fishHint(hintFish)}에 ${hintFish.name}를 찾아봐요.` : state.pigeonHint}` : null;
  return pigeon ? [greeting, pigeon] : [greeting];
}
