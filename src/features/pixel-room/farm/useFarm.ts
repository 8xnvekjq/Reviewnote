import { useCallback, useEffect, useRef, useState } from 'react';
import { actPixelFarm, fetchPixelFarm } from '../../../utils/pixelFarm';
import type { FarmAction, FarmSnapshot } from './farmModel';

export function useFarm() {
  const [snapshot, setSnapshot] = useState<FarmSnapshot | null>(null);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState('');
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
  async function act(index: number, action: FarmAction) {
    const plot = snapshot?.plots.find(p => p.index === index);
    if (!plot || inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      const next = await actPixelFarm(index, action, plot.revision);
      if (!alive.current) return;
      accept(next);
      setMessage(next.result === 'ok' ? ({ plant: '심었어요. 첫 물을 주세요!', water: '물을 줬어요. 오늘의 돌봄 +1', harvest: '수확 기록에 보관했어요!' })[action]
        : next.result === 'changed' ? '다른 곳에서 바뀐 밭을 불러왔어요.' : next.result === 'already_watered' ? '오늘은 이미 물을 줬어요.' : next.result === 'ready' ? '다 익었어요. 수확해 주세요!' : '아직 자라고 있어요. 조금만 기다려 주세요.');
    } catch { if (alive.current) { setError(true); setMessage('저장 결과를 확인하지 못했어요. 다시 확인해 주세요.'); } }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  return { snapshot, now, busy, error, message, refresh, act, clearMessage: () => setMessage('') };
}
