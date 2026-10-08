import type { CastStart } from './fishingAdapter';
import type { ReelGame } from '../logic/reelGame';
import './fishing.css';
import { RodIcon } from './RodIcon';
import { rodDisplay } from '../../pixel-room/shop/rods';
export function ReelBar({ game, bait }: { game: ReelGame; bait?: Extract<CastStart, { ok: true }>['bait'] }) {
  return <div className="pwp-reel" data-testid="reel-bar" data-danger={game.progress < .15}
    data-zone={game.zone} data-zone-x={game.zoneX} data-fish={game.fish} data-fish-x={game.fishX}
    data-velocity={game.velocity} data-velocity-x={game.velocityX} data-fish-vx={game.fishVX} data-fish-vy={game.fishVY}
    data-zone-radius={game.zoneSize} data-elapsed={game.elapsed}
    role="group" aria-label="물고기 끌어올리기">
    <strong>물고기를 따라가요!</strong>
    <div className="pwp-reel-rod"><RodIcon rod={game.rod} /><span>{rodDisplay(game.rod).displayName}</span></div>
    {bait?.used && <small className="pwp-reel-bait" data-testid="reel-bait">미끼 {bait.charges}회</small>}
    {game.trophy && <b className="pwp-reel-big">대물이에요!</b>}
    {game.big && <b className="pwp-reel-big">힘이 센 녀석이에요!</b>}
    <div className="pwp-reel-arena-wrap">
      <div className="pwp-reel-track" style={{ width: `${game.arenaScale * 100}%` }} aria-hidden="true">
        <div className="pwp-reel-zone" data-pulse={game.elapsed - game.lastTap < .16}
          style={{ left: `${(game.zoneX + 1) * 50}%`, top: `${(1 - game.zone) * 50}%`, width: `${game.zoneSize * 100}%`, height: `${game.zoneSize * 100}%` }} />
        <span className="pwp-reel-fish" style={{ left: `${(game.fishX + 1) * 50}%`, top: `${(1 - game.fish) * 50}%`, transform: `translate(-50%, -50%) rotate(${Math.atan2(-game.fishVY, game.fishVX) * 180 / Math.PI}deg)` }}><i /><b /></span>
      </div>
    </div>
    <div className="pwp-reel-progress" role="progressbar" aria-label="잡기 진행" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(game.progress * 100)}><i style={{ width: `${game.progress * 100}%` }} /></div>
    <span className="pwp-reel-hint">조이스틱: 좌우 · 탭: 위로 · B 취소</span>
    <small>← → / A D · 스페이스 / W / ↑</small>
  </div>;
}
