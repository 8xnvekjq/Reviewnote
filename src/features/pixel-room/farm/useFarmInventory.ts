import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchHarvestedCrops } from '../../../utils/pixelFarm';
import type { HarvestedCrop } from './farmModel';

// The "농작물" collection. Deliberately separate from useFarm() (which owns plant/water/harvest and
// the live clock) — this is a read-only view of already-harvested rows, refreshed by the caller
// whenever farm.snapshot.harvestCount changes rather than polling on its own.
export function useFarmInventory(userId: string) {
  const [crops, setCrops] = useState<HarvestedCrop[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(false);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try { const next = await fetchHarvestedCrops(userId); if (alive.current) { setCrops(next); setError(false); } }
    catch { if (alive.current) setError(true); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }, [userId]);
  useEffect(() => { alive.current = true; void refresh(); return () => { alive.current = false; }; }, [refresh]);
  return { crops, error, busy, refresh };
}
