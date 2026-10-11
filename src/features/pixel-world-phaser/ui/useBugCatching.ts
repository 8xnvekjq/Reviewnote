import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { BugAdapter, BugFinish, BugStart, BugState } from './bugAdapter';
import type { Facing } from '../logic/joystick';
import { dragonfliesFor } from '../game/dragonflies';
import type { Hand } from '../logic/bag';
import { BUG_AUTO_CATCH_STARS } from '../logic/bugCatalog';

export type NetSwingReporter = (direction: Facing) => void;
type Round = Extract<BugStart, { ok: true }>;
/** hand: 손 칸. 잠자리채('net')를 들었을 때만 잡는다. 별 BUG_AUTO_CATCH_STARS 이하는 미니게임 없이 바로 잡힌다. */
export function useBugCatching({ adapter, scene, handle, freeze, report, hand = 'net' }: {
  adapter?: BugAdapter; scene: string | null; handle: RefObject<{ cancelWalk(): void; dismount?(): void } | null>;
  freeze(active: boolean): void; report: NetSwingReporter; hand?: Hand;
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
    if (hand !== 'net') { setMessage('가방에서 잠자리채를 손에 들어 보세요'); return; }
    if (!current) { setMessage('곤충 잡기를 준비하고 있어요.'); return; }
    locked.current = true; setBusy(true); setResult(null); setMessage('');
    latest.current.handle.current?.dismount?.(); latest.current.handle.current?.cancelWalk();
    latest.current.freeze(true);
    latest.current.report(flies.swing());
    const generation = epoch.current;
    try {
      const value = await current.start(where!, flies.swungSpawn);
      if (!mounted.current || generation !== epoch.current || where !== latest.current.scene) {
        if (value.ok) await current.finish(value.catchId, false);
        return;
      }
      if (value.ok) {
        pending.current = { adapter: current, round: value, scene: where, started: performance.now() };
        // 쉬운 잠자리(별1~2)는 휘두르면 바로 잡힌다(서버 최소 시간 0.6초는 finish가 지킨다).
        if (value.difficulty <= BUG_AUTO_CATCH_STARS) void finish(true); else setRound(value);
      }
      else {
        locked.current = false; setBusy(false); latest.current.freeze(false);
        if (value.reason === 'gone') flies.caught(); // 서버에서 이미 사라진 잠자리(시간이 지남)
        setMessage(value.reason === 'no_net' ? '광장 상점에서 잠자리채를 사 보세요' : value.reason === 'net_not_equipped' ? '가방에서 잠자리채를 손에 들어 보세요'
          : value.reason === 'gone' ? '잠자리가 멀리 날아가 버렸어요' : '잠시 후 다시 시도해 주세요.');
        void refresh();
      }
    } catch {
      if (mounted.current && generation === epoch.current) { locked.current = false; setBusy(false); latest.current.freeze(false); setMessage('곤충 잡기를 시작하지 못했어요.'); }
    }
  }, [state?.netOwned, hand, refresh, finish]);
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
    // 잠자리 종류는 서버가 정한다(어댑터에 spawn이 있으면). 장면의 잠자리 컨트롤러가 생기면 연결한다.
    let linked: ReturnType<typeof dragonfliesFor>;
    const timer = window.setInterval(() => {
      const flies = dragonfliesFor(scene);
      if (flies && flies !== linked && scene) {
        linked = flies;
        const spawn = adapter?.spawn?.bind(adapter);
        flies.setSpawner(spawn ? release => spawn(scene, release) : undefined);
      }
      setNearby(!!flies?.nearby);
    }, 100);
    return () => clearInterval(timer);
  }, [adapter, scene, refresh]);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 3500); return () => clearTimeout(timer); }, [message]);
  const hideResult = useCallback(() => { resultOpen.current = false; setResult(null); latest.current.freeze(false); }, []);
  const notify = useCallback((text: string) => setMessage(text), []);
  // 잠자리채로 허공 휘두르기(잠자리 근처가 아닐 때). 서버는 부르지 않는다. 범위 안 친구는 어지러워진다.
  const lastAirSwing = useRef(0);
  const swingAir = useCallback(() => {
    const flies = dragonfliesFor(latest.current.scene), now = performance.now();
    if (locked.current || !flies || now - lastAirSwing.current < 400) return;
    lastAirSwing.current = now;
    latest.current.report(flies.swing());
  }, []);
  return { state, round, result, busy, nearby, start, finish, cancel, refresh, hideResult, message, notify, swingAir };
}
