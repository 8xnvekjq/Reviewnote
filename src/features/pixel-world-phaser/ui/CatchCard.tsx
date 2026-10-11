import { gainFrom } from './useLevel';
import { fishXpDisplay } from '../logic/levels';
import { useEffect } from 'react';
import { FISH_CATALOG, RARITY_STARS } from '../logic/fishCatalog';
import type { LandedCatch } from './useFishing';
import './fishing.css';
import { JUNK_CATALOG } from '../logic/fishCatalog';
import { JunkIcon } from './FishAlbum';
import './fishAlbum.css';
import { FISH_POINTS, GAME_POINT_TOTAL_CAP, JUNK_POINTS } from '../logic/gamePoints';
export function catchPointNote(caught: LandedCatch): string | null {
  const expected = 'junk' in caught ? JUNK_POINTS[caught.junk] : FISH_POINTS[caught.rarity];
  if (!caught.points?.capped || caught.points.awarded >= expected) return null;
  if ('junk' in caught) return '오늘 상한을 넘어 잡동사니는 포인트가 없어요';
  return caught.points.todayEarned >= GAME_POINT_TOTAL_CAP ? '오늘 100P를 넘어서 1/10만 받았어요' : '오늘 상한을 넘어서 1/5만 받았어요';
}
function CatchPoints({ caught }: { caught: LandedCatch }) {
  if (!caught.points) return null;
  const note = catchPointNote(caught);
  return <small className="pwp-catch-points">오늘 {caught.points.todayEarned}/50P{note && <span>{note}</span>}</small>;
}
const icons = import.meta.glob('../assets/fishing/fish-icons.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export function CatchCard({ caught, onHide }: { caught: LandedCatch; onHide(): void }) {
  useEffect(() => { const timer = setTimeout(onHide, 3500); return () => clearTimeout(timer); }, [caught, onHide]);
  if ('junk' in caught) return <div className="pwp-catch-card" role="status" data-testid="catch-card" data-junk={caught.junk}>
    <JunkIcon junk={caught.junk} /><strong>{JUNK_CATALOG.find(item => item.id === caught.junk)?.name}을 낚았어요!</strong>
    <span>다음엔 물고기를 만나요!</span><span className="pwp-xp-gain">+{gainFrom(caught)?.gained ?? 1} XP{caught.points && <> · +{caught.points.awarded} P</>}</span>
    <CatchPoints caught={caught} />
  </div>;
  const index = FISH_CATALOG.findIndex(fish => fish.id === caught.speciesId);
  const name = FISH_CATALOG[index]?.name ?? '물고기';
  const sheet = icons['../assets/fishing/fish-icons.png'];
  return <div className="pwp-catch-card" role="status" data-testid="catch-card" data-rarity={caught.rarity}>
    <span className="pwp-fish-icon" aria-hidden="true" style={sheet && index >= 0 ? { backgroundImage: `url(${sheet})`, backgroundSize: `${FISH_CATALOG.length * 32}px 32px`, backgroundPosition: `${index * -32}px 0` } : undefined}>{!sheet && '🐟'}</span>
    <strong>{name} 낚았어요!</strong><span>{caught.lengthCm.toFixed(1)}cm</span>
    <span className="pwp-fish-stars" data-rarity={caught.rarity} aria-label={`희귀도 ${RARITY_STARS[caught.rarity]}별`}>{'★'.repeat(RARITY_STARS[caught.rarity])}</span>
    {caught.percentile !== undefined && <span>상위 {caught.percentile}%</span>}
    <div className="pwp-catch-badges">{caught.isNew && <b>새 친구!</b>}{caught.isBig && <b>대물</b>}{caught.isPersonalBest && <b>새 기록!</b>}</div>
    <span className="pwp-xp-gain">+{gainFrom(caught)?.gained ?? fishXpDisplay(caught.rarity, caught.isBig)} XP{caught.points && <> · +{caught.points.awarded} P</>}</span>
    <CatchPoints caught={caught} />
    <small aria-hidden="true">✦ ✧ ✦</small>
  </div>;
}
