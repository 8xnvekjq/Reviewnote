import type { FishSpecies } from './fishCatalog';

const phases = { morning: '아침', day: '낮', evening: '저녁', night: '밤' };
const weather = { clear: '맑음', cloudy: '흐림', rain: '비 오는 날' };
export function fishHint(fish: Pick<FishSpecies, 'phases' | 'weather'>): string {
  const time = fish.phases === 'any' ? '' : fish.phases.map(value => phases[value]).join('·');
  const sky = fish.weather === 'any' ? '' : fish.weather.map(value => weather[value]).join('·');
  return [time, sky].filter(Boolean).join(' · ') || '언제든 만날 수 있어요';
}
