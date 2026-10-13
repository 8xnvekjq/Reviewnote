import type { XpGain } from '../../pixel-world-phaser/logic/levels';
import { useCallback, useEffect, useRef, useState } from 'react';
import { actPixelFarm, fetchPixelFarm } from '../../../utils/pixelFarm';
import type { FarmResult } from '../../../utils/pixelFarm';
import { gardenResultMessage } from './gardenModel';
import type { GardenAction } from './gardenModel';
import type { FarmSnapshot } from './farmModel';

export function useFarm() {
  const [snapshot, setSnapshot] = useState<FarmSnapshot | null>(null);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState('');
  const [xpGain, setXpGain] = useState<XpGain | undefined>();
  const clock = useRef({ server: 0, received: 0 });
  const inFlight = useRef(false);
  const alive = useRef(false);
  const accept = useCallback((next: FarmSnapshot) => {
    clock.current = { server: Date.parse(next.serverNow), received: performance.now() };
    setSnapshot(next); setNow(clock.current.server); setError(false);
  }, []);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try { const next = await fetchPixelFarm(); if (alive.current) { accept(next); setMessage(''); } }
    catch { if (alive.current) setError(true); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }, [accept]);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const sync = () => { if (document.visibilityState === 'visible') void refresh(); };
    const poll = window.setInterval(sync, 60000);
    // Display uses elapsed monotonic time from the server, never the device wall clock.
    const tick = window.setInterval(() => { if (clock.current.server) setNow(clock.current.server + performance.now() - clock.current.received); }, 1000);
    window.addEventListener('focus', sync); document.addEventListener('visibilitychange', sync);
    return () => { alive.current = false; clearInterval(poll); clearInterval(tick); window.removeEventListener('focus', sync); document.removeEventListener('visibilitychange', sync); };
  }, [refresh]);
  /** 텃밭 칸 하나에 도구를 쓴다. 서버 결과(수확·경험치 포함)를 돌려준다 — 실패하면 undefined. */
  async function act(index: number, action: GardenAction): Promise<FarmResult | undefined> {
    const plot = snapshot?.plots.find(p => p.index === index);
    if (!plot || inFlight.current) return undefined;
    inFlight.current = true; setBusy(true); setMessage(''); setXpGain(undefined);
    try {
      const next = await actPixelFarm(index, action, plot.revision);
      if (!alive.current) return next;
      accept(next);
      setXpGain(next.xpGain);
      setMessage(gardenResultMessage(action, next.result, next.harvest));
      return next;
    } catch { if (alive.current) { setError(true); setMessage('저장 결과를 확인하지 못했어요. 다시 확인해 주세요.'); } return undefined; }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  return { snapshot, now, busy, error, message, xpGain, refresh, act, clearMessage: () => setMessage('') };
}
