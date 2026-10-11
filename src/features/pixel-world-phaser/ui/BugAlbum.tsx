import { BUG_CATALOG } from '../logic/bugCatalog';
import { BUG_ACHIEVEMENTS, type BugState } from './bugAdapter';
import { Window } from './GamePanels';
import { BugIcon } from './BugGame';
export function BugAlbum({ state, onClose }: { state: BugState | null; onClose(): void }) {
  return <Window title="곤충 도감" onClose={onClose} compact small><div className="pwp-panel-content">
    {!state ? <p role="status">도감을 불러오는 중…</p> : <ul className="pwp-bug-album">{BUG_CATALOG.map(species => {
      const entry = state.album.find(b => b.bugId === species.id);
      return <li key={species.id}><BugIcon id={species.id} silhouette={!entry} /><span>{entry ? species.name : '???'} · {'★'.repeat(species.stars)}
        <small>{entry ? `${entry.count}마리 · 첫 만남 ${new Date(entry.firstAt).toLocaleDateString('ko-KR')}` : '아직 만나지 못했어요'}</small></span></li>;
    })}</ul>}
    {state?.achievements && <section className="pwp-bug-achievements" aria-label="잠자리 업적">
      <h3>🏆 업적</h3>
      <ul>{BUG_ACHIEVEMENTS.map(goal => {
        const a = state.achievements!, done = a.earned.includes(goal.id);
        const progress = goal.id === 'bug_doctor' ? `도감 ${Math.min(a.species, a.speciesTotal)}/${a.speciesTotal} · 별5 ${Math.min(a.star5, 1)}/1` : `별5 ${Math.min(a.star5, 10)}/10`;
        return <li key={goal.id} data-achievement={goal.id} data-done={done}>
          <strong>{done ? '✅' : '⬜'} {goal.name}</strong> <span>→ {goal.reward}</span>
          <small>{goal.goal} · {done ? '달성!' : progress}</small>
        </li>;
      })}</ul>
      <p className="pwp-bag-hint">별5는 2026년 10월 12일부터 잡은 것만 세요.</p>
    </section>}
  </div></Window>;
}
