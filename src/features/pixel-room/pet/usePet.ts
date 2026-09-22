import { useEffect, useRef, useState } from 'react';
import { fetchActivePet, saveActivePet } from '../../../utils/pixelPet';
import type { PetId } from './petKinds';
export function usePet(userId: string) {
  const [active, setActive] = useState<PetId | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  const request = useRef(0);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    mounted.current = true; let cancelled = false;
    const current = ++request.current;
    fetchActivePet(userId).then(value => { if (!cancelled && current === request.current) { setActive(value); setError(false); } }).catch(() => { if (!cancelled && current === request.current) setError(true); }).finally(() => { if (!cancelled && current === request.current) setReady(true); });
    return () => { cancelled = true; mounted.current = false; };
  }, [userId, revision]);
  async function activate(value: PetId | null) {
    if (lock.current || !ready) return false;
    lock.current = true; setBusy(true);
    ++request.current;
    try {
      const saved = await saveActivePet(userId, value);
      if (!mounted.current) return false;
      setActive(saved); setError(false);
      return saved === value;
    } catch { if (mounted.current) setError(true); return false; }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  return { active, ready, error, busy, activate, reload: () => { if (!lock.current) setRevision(value => value + 1); } };
}
