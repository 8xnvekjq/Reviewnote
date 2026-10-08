import type { ReelGame } from '../logic/reelGame';
import './fishing.css';
import { RodIcon } from './RodIcon';
import { rodDisplay } from '../../pixel-room/shop/rods';
export function ReelBar({ game }: { game: ReelGame }) {
  return <div className="pwp-reel" data-testid="reel-bar" data-danger={game.progress < .15}
    data-zone={game.zone} data-fish={game.fish} data-velocity={game.velocity} data-elapsed={game.elapsed}
    role="group" aria-label="물고기 끌어올리기">
    <strong>물고기를 따라가요</strong>
    <div className="pwp-reel-rod"><RodIcon rod={game.rod} /><span>{rodDisplay(game.rod).displayName}</span></div>
    {game.trophy && <b className="pwp-reel-big">대물이에요!</b>}
    <small className="pwp-reel-difficulty" aria-label={`난이도 ${game.difficulty.toFixed(1)} / 5`}>
      난이도 <span aria-hidden="true">{'●'.repeat(Math.ceil(game.difficulty))}{'○'.repeat(5 - Math.ceil(game.difficulty))}</span>
    </small>
    {game.big && <b className="pwp-reel-big">힘이 센 녀석이에요!</b>}
    <div className="pwp-reel-track" aria-hidden="true">
      <div key={game.tapCount} className="pwp-reel-zone" data-pulse={game.elapsed - game.lastTap < .16} style={{ bottom: `${(game.zone - game.zoneSize / 2) * 100}%`, height: `${game.zoneSize * 100}%` }} />
      <span className="pwp-reel-fish" draggable={false} style={{ bottom: `${game.fish * 100}%` }}>🐟</span>
    </div>
    <div className="pwp-reel-progress" role="progressbar" aria-label="잡기 진행" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(game.progress * 100)}><i style={{ width: `${game.progress * 100}%` }} /></div>
    <span>톡톡 눌러 초록 칸을<br />올려요 · B 취소</span>
    <small>A · 화면 탭 · 스페이스</small>
  </div>;
}
