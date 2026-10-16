import { useEffect, useState, type CSSProperties } from 'react';
import { supabase } from '../../services/supabase';
import { CHARM_DECORATIONS, pickCharmMessage } from './definitions';
import { CHARM_VISIBILITY_EVENT, isCharmShown, saveCharmShown } from './visibility';
import './charms.css';

function useCharmVisibility() {
  const [shown, setShown] = useState<Record<string, boolean>>(() => Object.fromEntries(
    Object.keys(CHARM_DECORATIONS).map(id => [id, isCharmShown(id)]),
  ));
  useEffect(() => {
    const refresh = (event: Event) => {
      if (event instanceof CustomEvent && event.detail?.id) {
        setShown(previous => ({ ...previous, [event.detail.id]: event.detail.shown }));
      } else {
        setShown(Object.fromEntries(Object.keys(CHARM_DECORATIONS).map(id => [id, isCharmShown(id)])));
      }
    };
    window.addEventListener(CHARM_VISIBILITY_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(CHARM_VISIBILITY_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return shown;
}

export function CharmIcon({ id }: { id: string }) {
  const charm = CHARM_DECORATIONS[id];
  if (!charm) return null;
  return <svg className="rn-charm-icon" viewBox="0 0 40 58" aria-hidden="true" style={{ '--charm-color': charm.color } as CSSProperties}>
    <path d="M20 12C6 8 17 1 20 8C23 1 34 8 20 12M20 10V18" fill="none" stroke="currentColor" strokeWidth="2" />
    <path d="M12 17H28L35 25V49Q35 53 31 53H9Q5 53 5 49V25Z" fill="var(--charm-color)" stroke="currentColor" strokeWidth="1.5" />
    <path d="M12 24H28V46H12Z" fill="none" stroke="#273044" strokeOpacity=".4" strokeDasharray="2 2" />
    <text x="20" y="39" textAnchor="middle" fill="#273044" fontSize={charm.symbol === '100' ? '10' : '16'} fontWeight="800">{charm.symbol}</text>
    <path d="M17 53V57M23 53V57" stroke="currentColor" strokeWidth="2" />
  </svg>;
}

export function CharmVisibilityToggle({ id }: { id: string }) {
  const shown = useCharmVisibility()[id] ?? true;
  return <button type="button" className="rn-charm-toggle" aria-label={`${CHARM_DECORATIONS[id]?.label} 장식 ${shown ? '숨기기' : '보이기'}`} aria-pressed={shown} onClick={() => saveCharmShown(id, !shown)}>
    장식 {shown ? '숨기기' : '보이기'}
  </button>;
}

export function CharmPendants({ userId }: { userId?: string }) {
  const [ownership, setOwnership] = useState<{ userId: string; ids: string[] }>();
  const [cheer, setCheer] = useState<{ id: string; message: string }>();
  const shown = useCharmVisibility();
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    let request = 0;
    const load = async () => {
      const version = ++request;
      try {
        const { data, error } = await supabase.from('user_items').select('item_id, quantity').eq('user_id', userId);
        if (alive && version === request && !error) setOwnership({ userId, ids: (data ?? []).filter(row => row.quantity > 0 && CHARM_DECORATIONS[row.item_id]).map(row => row.item_id) });
      } catch { /* A failed inventory read must not interrupt the notes screen. */ }
    };
    void load();
    window.addEventListener('reviewnote_inventory_updated', load);
    return () => { alive = false; window.removeEventListener('reviewnote_inventory_updated', load); };
  }, [userId]);
  const ids = ownership && ownership.userId === userId ? ownership.ids.filter(id => shown[id]) : [];
  if (!ids.length) return null;
  return <aside className="rn-charms" aria-label="나의 응원 부적">
    <div className="rn-charms-row">
      <span className="rn-charms-caption">작은 응원</span>
      {ids.map(id => <button type="button" key={id} className="rn-charm-pendant" aria-label={`${CHARM_DECORATIONS[id].label}, 응원 듣기`} onClick={() => setCheer({ id, message: pickCharmMessage(id) })}><span className="rn-charm-sway"><CharmIcon id={id} /></span></button>)}
    </div>
    {cheer && ids.includes(cheer.id) ? <p className="rn-charm-message" role="status">{cheer.message}</p> : null}
  </aside>;
}
