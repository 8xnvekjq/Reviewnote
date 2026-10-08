import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { CastFinish, FishingAdapter, FishingState, FishPhase, FishWeather } from './fishingAdapter';
import { cancelFishingGame, fishingActive, idleFishingGame, reelFishingGame, startFishingGame, tickFishingGame } from '../logic/fishingGame';
import { createReelGame, stepReelGame } from '../logic/reelGame';
import type { ReelGame } from '../logic/reelGame';
import type { FishingGame } from '../logic/fishingGame';
export type LandedCatch = Extract<CastFinish, { landed: true }>;
export interface FishingShadow { index: 0 | 1 | 2; size: 'S' | 'M' | 'L'; sparkle: boolean }
// 추가 연결점: RiverScene은 이 호출을 자신의 createFishingFx().update로 전달한다.
export interface FishingHandle {
  cancelWalk(): void;
  setShadows?(shadows: FishingShadow[]): void;
  setWorldTime?(phase: FishPhase, weather: FishWeather): void;
  fishingFx?(game: FishingGame, index: number, now: number): void;
}
export function useFishing({ adapter, handle, scene, pet, freeze }: {
  adapter?: FishingAdapter; handle: RefObject<FishingHandle | null>; scene: string | null; pet: string | null; freeze(active: boolean): void;
}) {
  const [state, setState] = useState<FishingState | null>(null);
  const [phase, setPhase] = useState<FishingGame['phase']>('idle');
  const [reelState, setReelState] = useState<ReelGame | null>(null);
  const reelGame = useRef<ReelGame | null>(null);
  const held = useRef(false);
  const lastFrame = useRef(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [caught, setCaught] = useState<LandedCatch | null>(null);
  const latest = useRef({ adapter, handle, scene, pet, freeze }); latest.current = { adapter, handle, scene, pet, freeze };
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
    latest.current.handle.current?.setShadows?.(([0, 1, 2] as const).map(index => ({ index, size: 'M', sparkle: index === value.sparkleShadow })));
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
    } catch { if (mounted.current) setMessage('낚시 정보를 불러오지 못했어요. 다시 시도해 주세요.'); }
  }, [shadows]);
  const finish = useCallback(async (next: FishingGame) => {
    if (!next.cast || !lock.current || !fishingActive(game.current)) return;
    const current = castAdapter.current;
    const epoch = generation.current;
    game.current = next; setPhase(next.phase); reelGame.current = null; setReelState(null); held.current = false;
    latest.current.handle.current?.fishingFx?.(next, shadow.current, performance.now());
    setMessage(next.phase === 'tooEarly' ? '너무 빨랐어요!' : next.phase === 'missed' ? '놓쳤어요!' : next.phase === 'cancelled' ? '낚시를 취소했어요.' : '물고기를 올리는 중…');
    try {
      const result = await current?.finish(next.cast.castId, next.phase === 'landed');
      if (mounted.current && epoch === generation.current) {
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
    if (game.current.phase === 'reeling') return true;
    if (fishingActive(game.current)) {
      const next = reelFishingGame(game.current, performance.now());
      if (next.phase === 'reeling') {
        game.current = next; setPhase('reeling');
        reelGame.current = createReelGame(next.cast?.difficulty ?? 1, latest.current.pet === 'pet_duck');
        setReelState(reelGame.current); lastFrame.current = performance.now();
      } else finishRef.current(next);
    }
    return lock.current;
  }, []);
  const onShadowTap = useCallback(async (index: number) => {
    const { adapter: current, scene: where, pet: companion } = latest.current;
    if (!current || where !== 'river' || lock.current || !stateRef.current || index < 0 || index > 2) return;
    lock.current = true; setBusy(true); setCaught(null); setMessage(''); game.current = idleFishingGame();
    latest.current.freeze(true); latest.current.handle.current?.cancelWalk();
    const epoch = generation.current;
    try {
      const cast = await current.start(companion);
      if (!mounted.current || epoch !== generation.current || latest.current.scene !== 'river') {
        if (cast.ok) await current.finish(cast.castId, false);
        lock.current = false; if (mounted.current) { setBusy(false); latest.current.freeze(false); } return;
      }
      if (!cast.ok) { setMessage('잠시 후 다시 시도해 주세요.'); lock.current = false; setBusy(false); latest.current.freeze(false); await refresh(); return; }
      castAdapter.current = current;
      shadow.current = index;
      latest.current.handle.current?.setShadows?.(([0, 1, 2] as const).map(slot => ({ index: slot, size: slot === index ? cast.shadow : 'M', sparkle: slot === index ? cast.hint === 'sparkle' : slot === stateRef.current?.sparkleShadow })));
      const firstEver = !attempted.current && stateRef.current.album.length === 0;
      attempted.current = true;
      game.current = startFishingGame(cast, companion, performance.now(), firstEver); setPhase('casting');
    } catch { lock.current = false; if (mounted.current) { setBusy(false); latest.current.freeze(false); setMessage('낚시를 시작하지 못했어요.'); } }
  }, [refresh]);
  useEffect(() => {
    mounted.current = true;
    let frame = 0;
    const tick = (now: number) => {
      if (fishingActive(game.current)) {
        if (game.current.phase === 'reeling' && reelGame.current) {
          const delta = now - lastFrame.current; lastFrame.current = now;
          const result = stepReelGame(reelGame.current, delta, held.current);
          reelGame.current = result; setReelState(result);
          if (result.status !== 'playing') finishRef.current({ ...game.current, phase: result.status === 'landed' ? 'landed' : 'missed' });
        }
        const previous = game.current;
        const next = tickFishingGame(previous, now);
        if (next.phase === 'missed') finishRef.current(next);
        else {
          game.current = next;
          latest.current.handle.current?.fishingFx?.(next, shadow.current, now);
          if (previous.phase !== next.phase) { setPhase(next.phase); if (next.phase === 'bite') navigator.vibrate?.(35); }
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
  useEffect(() => {
    const pointers = new Set<number>();
    const keys = new Set<string>();
    const sync = () => { held.current = pointers.size > 0 || keys.size > 0; };
    const down = (event: PointerEvent) => {
      if (!['bite', 'reeling'].includes(game.current.phase) || (event.pointerType === 'mouse' && event.button !== 0)) return;
      if ((event.target as Element)?.closest?.('.pwp-btn-b')) return;
      event.preventDefault(); pointers.add(event.pointerId); sync();
    };
    const up = (event: PointerEvent) => { pointers.delete(event.pointerId); sync(); };
    const keyDown = (event: KeyboardEvent) => {
      if (fishingActive(game.current) && event.code === 'KeyB') { event.preventDefault(); cancel(); return; }
      if (!fishingActive(game.current) || !['Space', 'KeyZ', 'KeyA'].includes(event.code)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!event.repeat) reel();
      if (game.current.phase === 'reeling') { keys.add(event.code); sync(); }
    };
    const keyUp = (event: KeyboardEvent) => { keys.delete(event.code); sync(); };
    const reset = () => { pointers.clear(); keys.clear(); sync(); };
    window.addEventListener('pointerdown', down, { capture: true, passive: false });
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('keydown', keyDown, true);
    window.addEventListener('keyup', keyUp, true);
    window.addEventListener('blur', reset);
    return () => {
      reset(); window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('keydown', keyDown, true); window.removeEventListener('keyup', keyUp, true);
      window.removeEventListener('blur', reset);
    };
  }, [reel, cancel]);
  const hideCatch = useCallback(() => setCaught(null), []);
  return { state, phase, reelState, busy, message, caught, onShadowTap, reel, cancel, refresh, hideCatch };
}
