import { useEffect } from 'react';
import { FISH_CATALOG, RARITY_STARS } from '../logic/fishCatalog';
import type { LandedCatch } from './useFishing';
import './fishing.css';
const icons = import.meta.glob('../assets/fishing/fish-icons.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export function CatchCard({ caught, onHide }: { caught: LandedCatch; onHide(): void }) {
  useEffect(() => { const timer = setTimeout(onHide, 3500); return () => clearTimeout(timer); }, [caught, onHide]);
  const index = FISH_CATALOG.findIndex(fish => fish.id === caught.speciesId);
  const name = FISH_CATALOG[index]?.name ?? '물고기';
  const sheet = icons['../assets/fishing/fish-icons.png'];
  return <div className="pwp-catch-card" role="status" data-testid="catch-card" data-rarity={caught.rarity}>
    <span className="pwp-fish-icon" aria-hidden="true" style={sheet && index >= 0 ? { backgroundImage: `url(${sheet})`, backgroundPosition: `${index * -32}px 0` } : undefined}>{!sheet && '🐟'}</span>
    <strong>{name} 낚았어요!</strong><span>{caught.lengthCm.toFixed(1)}cm</span>
    <span className="pwp-fish-stars" aria-label={`희귀도 ${RARITY_STARS[caught.rarity]}별`}>{'★'.repeat(RARITY_STARS[caught.rarity])}</span>
    <div className="pwp-catch-badges">{caught.isNew && <b>새 친구!</b>}{caught.isBig && <b>대물</b>}{caught.isPersonalBest && <b>새 기록!</b>}</div>
    <small>오늘 남은 낚시 {caught.remaining}번</small>
  </div>;
}
