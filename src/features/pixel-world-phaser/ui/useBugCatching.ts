import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { BugAdapter, BugFinish, BugStart, BugState } from './bugAdapter';
import type { Facing } from '../logic/joystick';
import { dragonfliesFor } from '../game/dragonflies';

export type NetSwingReporter = (direction: Facing) => void;
type Round = Extract<BugStart, { ok: true }>;
export function useBugCatching({ adapter, scene, handle, freeze, report }: {
  adapter?: BugAdapter; scene: string | null; handle: RefObject<{ cancelWalk(): void; dismount?(): void } | null>;
  freeze(active: boolean): void; report: NetSwingReporter;
}) {
  const [state, setState] = useState<BugState | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [result, setResult] = useState<BugFinish | null>(null);
  const [busy, setBusy] = useState(false);
  const [nearby, setNearby] = useState(false);
  const [message, setMessage] = useState('');
  const resultOpen = useRef(false);
  const latest = useRef({ adapter, scene, handle, freeze, report }); latest.current = { adapter, scene, handle, freeze, report };
  const mounted = useRef(false), epoch = useRef(0), locked = useRef(false);
  const pending = useRef<{ adapter: BugAdapter; round: Round; scene: string | null; started: number } | null>(null);
  const refresh = useCallback(async () => {
    const current = latest.current.adapter, generation = epoch.current;
    if (!current) { setState(null); return; }
    try {
      const next = await current.state();
      if (mounted.current && generation === epoch.current && current === latest.current.adapter) setState(next);
    } catch { if (mounted.current) setMessage('곤충 정보를 불러오지 못했어요.'); }
  }, []);
  const finish = useCallback(async (caught: boolean) => {
    const attempt = pending.current;
    if (!attempt) return;
    pending.current = null;
    setRound(null);
    const generation = epoch.current;
    let showResult = false;
    try {
      // 아주 쉬운 잠자리도 서버의 최소 성공 시간(0.6초)을 지킨다.
      if (caught) await new Promise<void>(resolve => window.setTimeout(resolve, Math.max(0, 600 - (performance.now() - attempt.started))));
      const value = await attempt.adapter.finish(attempt.round.catchId, caught && mounted.current && generation === epoch.current);
      if (!mounted.current || generation !== epoch.current) return;
      setResult(value);
      showResult = true; resultOpen.current = true;
      if (value.ok && value.caught) dragonfliesFor(attempt.scene)?.caught();
      if (!value.ok) setMessage('결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
      await refresh();
    } catch { if (mounted.current && generation === epoch.current) setMessage('결과를 확인하지 못했어요.'); }
    finally {
      if (generation === epoch.current) { locked.current = false; if (mounted.current) { setBusy(false); latest.current.freeze(showResult && resultOpen.current); } }
    }
  }, [refresh]);
  const cancel = useCallback(() => {
    if (resultOpen.current) { resultOpen.current = false; setResult(null); latest.current.freeze(false); return; }
    if (pending.current) { void finish(false); return; }
    if (locked.current) { epoch.current++; locked.current = false; setBusy(false); latest.current.freeze(false); }
  }, [finish]);
  const start = useCallback(async () => {
    const { adapter: current, scene: where } = latest.current;
    const flies = dragonfliesFor(where);
    if (locked.current || !flies?.nearby) return;
    if (!state?.netOwned) { setMessage('광장 상점에서 잠자리채를 사 보세요'); return; }
    if (!current) { setMessage('곤충 잡기를 준비하고 있어요.'); return; }
    locked.current = true; setBusy(true); setResult(null); setMessage('');
    latest.current.handle.current?.dismount?.(); latest.current.handle.current?.cancelWalk();
    latest.current.freeze(true);
    latest.current.report(flies.swing());
    const generation = epoch.current;
    try {
      const value = await current.start(where!);
      if (!mounted.current || generation !== epoch.current || where !== latest.current.scene) {
        if (value.ok) await current.finish(value.catchId, false);
        return;
      }
      if (value.ok) { pending.current = { adapter: current, round: value, scene: where, started: performance.now() }; setRound(value); }
      else {
        locked.current = false; setBusy(false); latest.current.freeze(false);
        setMessage(value.reason === 'no_net' ? '광장 상점에서 잠자리채를 사 보세요' : '잠시 후 다시 시도해 주세요.');
        void refresh();
      }
    } catch {
      if (mounted.current && generation === epoch.current) { locked.current = false; setBusy(false); latest.current.freeze(false); setMessage('곤충 잡기를 시작하지 못했어요.'); }
    }
  }, [state?.netOwned, refresh]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; epoch.current++; locked.current = false;
      const attempt = pending.current; pending.current = null;
      if (attempt) void attempt.adapter.finish(attempt.round.catchId, false).catch(() => {});
      latest.current.freeze(false);
    };
  }, []);
  useEffect(() => {
    epoch.current++; locked.current = false; resultOpen.current = false; setBusy(false); setRound(null); setResult(null); latest.current.freeze(false);
    const attempt = pending.current; pending.current = null;
    if (attempt) void attempt.adapter.finish(attempt.round.catchId, false).catch(() => {});
    void refresh();
    setNearby(false);
    const timer = window.setInterval(() => setNearby(!!dragonfliesFor(scene)?.nearby), 100);
    return () => clearInterval(timer);
  }, [adapter, scene, refresh]);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 3500); return () => clearTimeout(timer); }, [message]);
  const hideResult = useCallback(() => { resultOpen.current = false; setResult(null); latest.current.freeze(false); }, []);
  return { state, round, result, busy, nearby, start, finish, cancel, refresh, hideResult, message };
}
