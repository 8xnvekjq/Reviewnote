import { useEffect, useRef, useState } from 'react';
import { fetchActivePet, saveActivePet } from '../../../utils/pixelPet';
import { DOG_ITEM_ID } from './dogModel';
export function usePet(userId: string) {
  const [active, setActive] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    mounted.current = true; let cancelled = false;
    fetchActivePet(userId).then(value => { if (!cancelled) { setActive(value); setError(false); } }).catch(() => { if (!cancelled) setError(true); }).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; mounted.current = false; };
  }, [userId, revision]);
  async function activate(value: boolean) {
    if (lock.current || !ready) return false;
    lock.current = true; setBusy(true);
    try {
      const saved = await saveActivePet(userId, value);
      if (!mounted.current) return false;
      setActive(saved); setError(false);
      return saved === (value ? DOG_ITEM_ID : null);
    } catch { if (mounted.current) setError(true); return false; }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  return { active, ready, error, busy, activate, reload: () => setRevision(value => value + 1) };
}
