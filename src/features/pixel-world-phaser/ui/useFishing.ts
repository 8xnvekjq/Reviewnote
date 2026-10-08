import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { CastFinish, FishingAdapter, FishingState, FishPhase, FishWeather } from './fishingAdapter';
import { cancelFishingGame, fishingActive, idleFishingGame, reelFishingGame, startFishingGame, tickFishingGame } from '../logic/fishingGame';
import { createReelGame, stepReelGame } from '../logic/reelGame';
import type { ReelAxisInput, ReelGame } from '../logic/reelGame';
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
  const [reelState, setReelState] = useState<ReelGame | null>(null);
  const reelGame = useRef<ReelGame | null>(null);
  const taps = useRef<number[]>([]);
  const axes = useRef<ReelAxisInput[]>([]);
  const setReelX = useCallback((x: number) => {
    if (reelGame.current) axes.current.push({ time: performance.now() - reelStarted.current, x });
  }, []);
  const reelStarted = useRef(0);
  const lastFrame = useRef(0);
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
    game.current = next; setPhase(next.phase); reelGame.current = null; setReelState(null); taps.current = []; axes.current = [];
    latest.current.handle.current?.fishingFx?.(next, shadow.current, performance.now());
    const told = fishReportForGamePhase(next.phase);
    if (told) latest.current.report?.(told);
    setMessage(next.phase === 'tooEarly' ? '너무 빨랐어요!' : next.phase === 'missed' ? '놓쳤어요!' : next.phase === 'cancelled' ? '낚시를 취소했어요.' : '물고기를 올리는 중…');
    try {
      const result = await current?.finish(next.cast.castId, next.phase === 'landed');
      if (mounted.current && epoch === generation.current) {
        // 릴을 다 감은 경우만 서버 결과를 알린다(놓침·너무 빠름·취소는 위에서 escaped/idle로 이미 보냈다).
        if (next.phase === 'landed') latest.current.report?.(result?.ok && result.landed ? { phase: 'landed', speciesId: result.speciesId, lengthCm: result.lengthCm } : result?.ok ? { phase: 'escaped' } : { phase: 'idle' });
        if (result?.ok && result.landed) { setCaught(result); setMessage(''); await refresh(); }
        else if (!result?.ok) setMessage('낚시 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
        else if (stateRef.current) shadows(stateRef.current);
      }
    } catch {
      if (mounted.current && epoch === generation.current) {
        if (next.phase === 'landed') latest.current.report?.({ phase: 'idle' });
        setMessage('낚시 결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
      }
    }
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
        // 캐스팅마다 다른 경로를 만들되 같은 캐스팅은 재현할 수 있게 한다.
        const seed = Array.from(next.cast?.castId ?? '').reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 0);
        reelGame.current = createReelGame(next.cast?.difficulty ?? 1, latest.current.pet === 'pet_duck', next.cast?.big ?? false, seed, next.cast?.speed ?? 1, next.cast?.rod, next.cast?.trophy ?? false);
        setReelState(reelGame.current); reelStarted.current = performance.now(); lastFrame.current = reelStarted.current; taps.current = []; axes.current = [];
        latest.current.report?.({ phase: 'reeling' });
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
      latest.current.report?.({ phase: 'casting', shadow: index });
    } catch { lock.current = false; if (mounted.current) { setBusy(false); latest.current.freeze(false); setMessage('낚시를 시작하지 못했어요.'); } }
  }, [refresh]);
  useEffect(() => {
    mounted.current = true;
    let frame = 0;
    const tick = (now: number) => {
      if (fishingActive(game.current)) {
        if (game.current.phase === 'reeling' && reelGame.current) {
          // rAF 시각은 릴 시작(performance.now())보다 앞설 수 있다. 시계를 되돌리지 않아 릴 시간이 실제보다 길게 쌓이지 않는다(서버 최소 시간 보장).
          const delta = now - lastFrame.current; if (delta > 0) lastFrame.current = now;
          const result = stepReelGame(reelGame.current, delta, delta > 0 ? taps.current.splice(0) : [], delta > 0 ? axes.current.splice(0) : []);
          reelGame.current = result; setReelState(result);
          if (result.status !== 'playing') finishRef.current({ ...game.current, phase: result.status === 'landed' ? 'landed' : 'missed' });
        }
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
  useEffect(() => {
    const pointers = new Set<number>();
    let lastDirectTap = -Infinity;
    const editable = (target: EventTarget | null) => target instanceof Element && !!target.closest('input, textarea, select, [contenteditable="true"]');
    const boost = () => { if (game.current.phase === 'reeling') taps.current.push(performance.now() - reelStarted.current); };
    const down = (event: PointerEvent) => {
      const target = event.target;
      if (editable(target) || !(target instanceof Element) || !target.closest('.pwp-root') || target.closest('.pwp-btn-b, .pwp-reel-stick')) return;
      if (!['bite', 'reeling'].includes(game.current.phase) || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      if (pointers.has(event.pointerId)) return;
      pointers.add(event.pointerId);
      const now = performance.now();
      // 터치/펜 직후의 호환 마우스 입력은 같은 탭으로 간주한다.
      if (event.pointerType === 'mouse' && now - lastDirectTap < 500) return;
      if (event.pointerType !== 'mouse') lastDirectTap = now;
      reel(); boost();
    };
    const up = (event: PointerEvent) => { pointers.delete(event.pointerId); };
    const horizontal = new Set<string>();
    const keyUp = (event: KeyboardEvent) => {
      if (horizontal.delete(event.code)) setReelX((horizontal.has('KeyD') || horizontal.has('ArrowRight') ? 1 : 0) - (horizontal.has('KeyA') || horizontal.has('ArrowLeft') ? 1 : 0));
    };
    const keyDown = (event: KeyboardEvent) => {
      if (editable(event.target)) return;
      if (game.current.phase === 'reeling' && ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        event.preventDefault(); event.stopImmediatePropagation(); horizontal.add(event.code);
        setReelX((horizontal.has('KeyD') || horizontal.has('ArrowRight') ? 1 : 0) - (horizontal.has('KeyA') || horizontal.has('ArrowLeft') ? 1 : 0)); return;
      }
      if (fishingActive(game.current) && event.code === 'KeyB') { event.preventDefault(); cancel(); return; }
      if (!fishingActive(game.current) || !['Space', 'KeyZ', 'KeyW', 'ArrowUp'].includes(event.code)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (!event.repeat) { reel(); boost(); }
    };
    const reset = () => { pointers.clear(); horizontal.clear(); setReelX(0); };
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
  }, [reel, cancel, setReelX]);
  const hideCatch = useCallback(() => setCaught(null), []);
  return { state, phase, reelState, busy, message, caught, onShadowTap, reel, cancel, refresh, hideCatch, setReelX };
}
