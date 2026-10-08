import type { ReelGame } from '../logic/reelGame';
import './fishing.css';
export function ReelBar({ game }: { game: ReelGame }) {
  return <div className="pwp-reel" data-testid="reel-bar" data-danger={game.progress < .15} role="group" aria-label="물고기 끌어올리기">
    <strong>물고기를 따라가요!</strong>
    <div className="pwp-reel-track" aria-hidden="true">
      <div className="pwp-reel-zone" style={{ bottom: `${(game.zone - game.zoneSize / 2) * 100}%`, height: `${game.zoneSize * 100}%` }} />
      <span className="pwp-reel-fish" style={{ bottom: `${game.fish * 100}%` }}>🐟</span>
    </div>
    <div className="pwp-reel-progress" role="progressbar" aria-label="잡기 진행" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(game.progress * 100)}><i style={{ width: `${game.progress * 100}%` }} /></div>
    <span>누르면 올라가요<br />떼면 내려가요 · B 취소</span>
    <small>A · 화면 누르기 · 스페이스</small>
  </div>;
}
