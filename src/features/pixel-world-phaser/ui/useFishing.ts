import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { CastFinish, FishingAdapter, FishingState, FishPhase, FishWeather } from './fishingAdapter';
import { cancelFishingGame, fishingActive, idleFishingGame, reelFishingGame, startFishingGame, tickFishingGame } from '../logic/fishingGame';
import type { FishingGame } from '../logic/fishingGame';
import { fishReportForGamePhase } from '../logic/riverPresence';
import type { RiverFishReporter } from '../logic/riverPresence';
export type LandedCatch = Extract<CastFinish, { landed: true }>;
export interface FishingShadow { index: 0 | 1 | 2; size: 'S' | 'M' | 'L'; sparkle: boolean }
// 추가 연결점: RiverScene은 이 호출을 자신의 createFishingFx().update로 전달한다.
export interface FishingHandle {
  cancelWalk(): void;
  setShadows?(shadows: FishingShadow[]): void;
  setWorldTime?(phase: FishPhase, weather: FishWeather): void;
  fishingFx?(game: FishingGame, index: number, now: number): void;
}
export function useFishing({ adapter, handle, scene, pet, freeze, report }: {
  adapter?: FishingAdapter; handle: RefObject<FishingHandle | null>; scene: string | null; pet: string | null; freeze(active: boolean): void;
  /** 강가 친구들에게 내 낚시 단계를 알린다(logic/riverPresence.ts). 없으면 아무것도 안 한다. */
  report?: RiverFishReporter;
}) {
  const [state, setState] = useState<FishingState | null>(null);
  const [phase, setPhase] = useState<FishingGame['phase']>('idle');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [caught, setCaught] = useState<LandedCatch | null>(null);
  const latest = useRef({ adapter, handle, scene, pet, freeze, report }); latest.current = { adapter, handle, scene, pet, freeze, report };
  const stateRef = useRef(state); stateRef.current = state;
  const game = useRef(idleFishingGame());
  const lock = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const attempted = useRef(false);
  const shadow = useRef(0);
  const castAdapter = useRef<FishingAdapter | undefined>(undefined);
  const finishRef = useRef<(next: FishingGame) => void>(() => {});
  const shadows = useCallback((value: FishingState) => {
    if (latest.current.scene !== 'river') return;
    latest.current.handle.current?.setShadows?.(value.remaining <= 0 ? [] : ([0, 1, 2] as const).map(index => ({ index, size: 'M', sparkle: index === value.sparkleShadow })));
  }, []);
  const refresh = useCallback(async () => {
    const current = latest.current.adapter;
    if (!current) return;
    const epoch = generation.current;
    try {
      const value = await current.state();
      if (!mounted.current || epoch !== generation.current || current !== latest.current.adapter) return;
      stateRef.current = value; setState(value); shadows(value);
      latest.current.handle.current?.setWorldTime?.(value.phase, value.weather);
      if (!value.remaining) setMessage('오늘은 물고기들이 쉬고 있어요. 내일 또 와요!');
    } catch { if (mounted.current) setMessage('낚시 정보를 불러오지 못했어요. 다시 시도해 주세요.'); }
  }, [shadows]);
  const finish = useCallback(async (next: FishingGame) => {
    if (!next.cast || !lock.current || !fishingActive(game.current)) return;
    const current = castAdapter.current;
    const epoch = generation.current;
    game.current = next; setPhase(next.phase);
    latest.current.handle.current?.fishingFx?.(next, shadow.current, performance.now());
    const told = fishReportForGamePhase(next.phase);
    if (told) latest.current.report?.(told);
    setMessage(next.phase === 'tooEarly' ? '너무 빨랐어요!' : next.phase === 'missed' ? '놓쳤어요!' : next.phase === 'cancelled' ? '낚시를 취소했어요.' : '물고기를 올리는 중…');
    try {
      const result = await current?.finish(next.cast.castId, next.phase === 'landed');
      if (mounted.current && epoch === generation.current) {
        if (next.phase === 'landed') latest.current.report?.(result?.ok && result.landed ? { phase: 'landed', speciesId: result.speciesId, lengthCm: result.lengthCm } : result?.ok ? { phase: 'escaped' } : { phase: 'idle' });
        if (result?.ok && result.landed) { setCaught(result); setMessage(''); await refresh(); }
        else if (!result?.ok) setMessage('낚시 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
        else if (stateRef.current) shadows(stateRef.current);
      }
    } catch { if (mounted.current && epoch === generation.current) setMessage('낚시 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'); }
    finally {
      lock.current = false;
      if (mounted.current) { setBusy(false); latest.current.freeze(false); }
    }
  }, [refresh, shadows]);
  finishRef.current = next => { void finish(next); };
  const cancel = useCallback(() => {
    if (fishingActive(game.current)) finishRef.current(cancelFishingGame(game.current));
    else if (lock.current && !game.current.cast) { generation.current++; setMessage('낚시를 취소했어요.'); }
  }, []);
  const reel = useCallback(() => {
    if (fishingActive(game.current)) finishRef.current(reelFishingGame(game.current, performance.now()));
    return lock.current;
  }, []);
  const onShadowTap = useCallback(async (index: number) => {
    const { adapter: current, scene: where, pet: companion } = latest.current;
    if (!current || where !== 'river' || lock.current || !stateRef.current || stateRef.current.remaining <= 0 || index < 0 || index > 2) return;
    lock.current = true; setBusy(true); setCaught(null); setMessage(''); game.current = idleFishingGame();
    latest.current.freeze(true); latest.current.handle.current?.cancelWalk();
    const epoch = generation.current;
    try {
      const cast = await current.start(companion);
      if (!mounted.current || epoch !== generation.current || latest.current.scene !== 'river') {
        if (cast.ok) await current.finish(cast.castId, false);
        lock.current = false; if (mounted.current) { setBusy(false); latest.current.freeze(false); } return;
      }
      if (!cast.ok) { setMessage(cast.reason === 'budget' ? '오늘 낚시를 모두 마쳤어요.' : '잠시 후 다시 시도해 주세요.'); lock.current = false; setBusy(false); latest.current.freeze(false); await refresh(); return; }
      castAdapter.current = current;
      shadow.current = index;
      latest.current.handle.current?.setShadows?.(([0, 1, 2] as const).map(slot => ({ index: slot, size: slot === index ? cast.shadow : 'M', sparkle: slot === index ? cast.hint === 'sparkle' : slot === stateRef.current?.sparkleShadow })));
      const firstEver = !attempted.current && stateRef.current.album.length === 0;
      attempted.current = true;
      game.current = startFishingGame(cast, companion, performance.now(), firstEver); setPhase('casting');
      latest.current.report?.({ phase: 'casting', shadow: index });
    } catch { lock.current = false; if (mounted.current) { setBusy(false); latest.current.freeze(false); setMessage('낚시를 시작하지 못했어요.'); } }
  }, [refresh]);
  useEffect(() => {
    mounted.current = true;
    let frame = 0;
    const tick = (now: number) => {
      if (fishingActive(game.current)) {
        const previous = game.current;
        const next = tickFishingGame(previous, now);
        if (next.phase === 'missed') finishRef.current(next);
        else {
          game.current = next;
          latest.current.handle.current?.fishingFx?.(next, shadow.current, now);
          if (previous.phase !== next.phase) {
            setPhase(next.phase); if (next.phase === 'bite') navigator.vibrate?.(35);
            const told = fishReportForGamePhase(next.phase);
            if (told) latest.current.report?.(told);
          }
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      mounted.current = false; generation.current++; cancelAnimationFrame(frame);
      if (fishingActive(game.current) && game.current.cast) void castAdapter.current?.finish(game.current.cast.castId, false).catch(() => {});
      game.current = idleFishingGame(); latest.current.freeze(false);
    };
  }, []);
  useEffect(() => {
    if (scene === 'river') void refresh();
    else { cancel(); generation.current++; }
  }, [scene, adapter, refresh, cancel]);
  useEffect(() => { if (!message || busy) return; const timer = setTimeout(() => setMessage(''), 3500); return () => clearTimeout(timer); }, [message, busy]);
  const hideCatch = useCallback(() => setCaught(null), []);
  return { state, phase, busy, message, caught, onShadowTap, reel, cancel, refresh, hideCatch };
}
