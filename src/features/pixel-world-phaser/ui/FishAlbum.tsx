import { useEffect, useState } from 'react';
import { FISH_CATALOG, RARITY_STARS } from '../logic/fishCatalog';
import { fishHint } from '../logic/fishHints';
import { turtleLines } from '../logic/turtleLines';
import type { ClassFishBoard, FishingAdapter, FishingState } from './fishingAdapter';
import { Window } from './GamePanels';
import './fishAlbum.css';

// 도트 시트가 아직 없으면 16×16 격자로 만든 임시 그림을 쓴다.
const sheets = import.meta.glob('../assets/fishing/fish-icons.png', { eager: true, query: '?url', import: 'default' });
const sheet = Object.values(sheets)[0] as string | undefined;
export function FishIcon({ speciesId, silhouette = false }: { speciesId: string; silhouette?: boolean }) {
  const index = FISH_CATALOG.findIndex(fish => fish.id === speciesId);
  const [failed, setFailed] = useState(false);
  return <span className={`pwp-fish-icon${silhouette ? ' is-silhouette' : ''}`} aria-hidden="true">
    {sheet && !failed && index >= 0 ? <img src={sheet} onError={() => setFailed(true)} style={{ left: -index * 48 }} alt="" />
      : <svg viewBox="0 0 16 16" shapeRendering="crispEdges"><path fill={['#6c9fb0', '#da9a57', '#8a9973'][Math.max(0, index) % 3]} d="M1 5h2v1h2V5h2V4h5v1h2v2h1v3h-1v2h-2v1H7v-1H5v-1H3v1H1z"/><path fill="#fff4d9" d="M11 6h2v2h-2z"/><path fill="#354443" d="M12 6h1v1h-1z"/></svg>}
  </span>;
}

export function FishAlbum({ adapter, onClose, newSpeciesId }: { adapter?: FishingAdapter; onClose: () => void; newSpeciesId?: string | null }) {
  const [state, setState] = useState<FishingState | null>(null);
  const [board, setBoard] = useState<ClassFishBoard | null>(null);
  const [error, setError] = useState(false);
  const [boardError, setBoardError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setState(null); setBoard(null); setError(false); setBoardError(false);
    if (adapter) {
      void adapter.state().then(value => { if (!cancelled) setState(value); }).catch(() => { if (!cancelled) setError(true); });
      void adapter.board().then(value => { if (!cancelled) setBoard(value); }).catch(() => { if (!cancelled) setBoardError(true); });
    }
    return () => { cancelled = true; };
  }, [adapter, retry]);
  return <Window title="거북이의 물고기 도감" onClose={onClose}>
    <div className="pwp-panel-content pwp-fishing-content">
      {!adapter ? <p role="status">낚시 정보를 준비하고 있어요.</p> : error ? <div role="alert">도감을 불러오지 못했어요. <button onClick={() => setRetry(value => value + 1)}>다시 시도</button></div> : !state ? <p role="status">도감을 펼치는 중…</p> : <>
        <div className="pwp-turtle-lines">{turtleLines(state, newSpeciesId).map(line => <p key={line}>{line}</p>)}</div>
        <p className="pwp-fish-progress">{board ? `우리 반이 찾은 물고기 ${board.classSpecies}/12` : boardError ? '우리 반 도감을 불러오지 못했어요.' : '우리 반 도감을 확인하는 중…'} {boardError && <button onClick={() => setRetry(value => value + 1)}>다시 시도</button>}</p>
        <ul className="pwp-fish-grid">{FISH_CATALOG.map(fish => {
          const entry = state.album.find(value => value.speciesId === fish.id && value.count > 0);
          return <li className="pwp-fish-slot" key={fish.id} data-species={fish.id} data-caught={!!entry}>
            <FishIcon speciesId={fish.id} silhouette={!entry} />
            {entry ? <><strong>{fish.name}</strong><span className="pwp-fish-stars" data-rarity={fish.rarity} aria-label={`희귀도 ${RARITY_STARS[fish.rarity]}별`}>{'★'.repeat(RARITY_STARS[fish.rarity])}</span><span>{entry.count}마리 · 최고 {entry.bestCm.toFixed(1)}cm</span></>
              : <><strong>아직 못 만난 친구</strong><span>{fishHint(fish)}</span></>}
          </li>;
        })}</ul>
      </>}
    </div>
  </Window>;
}
