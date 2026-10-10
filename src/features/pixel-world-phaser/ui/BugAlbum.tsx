import { BUG_CATALOG } from '../logic/bugCatalog';
import type { BugState } from './bugAdapter';
import { Window } from './GamePanels';
import { BugIcon } from './BugGame';
export function BugAlbum({ state, onClose }: { state: BugState | null; onClose(): void }) {
  return <Window title="곤충 도감" onClose={onClose} compact small><div className="pwp-panel-content">
    {!state ? <p role="status">도감을 불러오는 중…</p> : <ul className="pwp-bug-album">{BUG_CATALOG.map(species => {
      const entry = state.album.find(b => b.bugId === species.id);
      return <li key={species.id}><BugIcon id={species.id} silhouette={!entry} /><span>{entry ? species.name : '???'} · {'★'.repeat(species.stars)}
        <small>{entry ? `${entry.count}마리 · 첫 만남 ${new Date(entry.firstAt).toLocaleDateString('ko-KR')}` : '아직 만나지 못했어요'}</small></span></li>;
    })}</ul>}
  </div></Window>;
}
