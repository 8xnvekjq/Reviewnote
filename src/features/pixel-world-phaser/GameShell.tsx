// 새 Pixel World(베타) 전체 화면 셸. 게임 캔버스가 화면 전체를 채우고, 모든 UI(포인트, 나가기, 전체화면,
// 대화창, 조이스틱, A/B)는 그 프레임 "안"에 DOM으로 겹친다. 한글은 앱 웹폰트 그대로 선명하게 보이고
// (Phaser Text는 도트 모드에서 최근접 보간이라 작은 한글이 뭉개진다), 버튼은 접근성/테스트도 쉽다.
// 입력은 controls 객체에만 쓰고 Phaser가 매 프레임 읽는다 — 손가락 이동으로 React가 다시 그리지 않는다.
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { PublicAvatarAppearance } from '../pixel-room/shop/types';
import type { PetId } from '../pixel-room/pet/petKinds';
import { useBgm } from '../pixel-room/bgm/useBgm';
import { createControls } from './controls';
import { followOrigin, keyboardVector, knobOffset, stickVector, STICK_RADIUS, ZERO_STICK } from './logic/joystick';
import type { Point } from './logic/joystick';
import { gameLayout, insideRect, NO_INSETS } from './logic/layout';
import type { GameLayout, Insets } from './logic/layout';
import { dialogueFor } from './logic/dialogues';
import type { SceneId } from './logic/scenes';
import type { FurnitureType, Placement } from '../pixel-room/model';
import { composeAvatar } from './game/avatarTexture';
import { loadBed, loadFloors, loadFurnitureSheets, loadInterior, loadPetSheet, loadScarecrow, loadTown, loadPlazaStall } from './game/sceneAssets';
import type { BedLook } from './game/sceneAssets';
import type { Prompt, WorldGameHandle, WorldEvents } from './game/boot';
import './gameShell.css';
import { GamePanels } from './ui/GamePanels';
import { FurniturePanel } from './ui/FurniturePanel';
import { moveFurniture, ownedFurniture, snapRoomPoint } from './logic/roomEditing';
import { FURNITURE_NAMES } from './logic/roomLines';
import type { PanelAdapter } from './ui/GamePanels';
import type { PanelKind } from './logic/panels';
import { panelFrozen } from './logic/panels';
import { PlazaBridge } from './ui/PlazaBridge';
import type { PlazaPanel } from './ui/PlazaBridge';

import { useFishing } from './ui/useFishing';
import type { FishingHandle } from './ui/useFishing';
import type { FishingAdapter } from './ui/fishingAdapter';
import { CatchCard } from './ui/CatchCard';

import { FarmPanels } from './ui/FarmPanels';
import type { ActivityPanel, FarmAdapter } from './ui/FarmPanels';
type ShellPanel = PanelKind | PlazaPanel | ActivityPanel | 'furniture';

export interface GameShellProps {
  panels?: PanelAdapter;
  userId?: string;
  farmAdapter?: FarmAdapter;
  fishingAdapter?: FishingAdapter;
  appearance: PublicAvatarAppearance;
  pet: PetId | null;
  balance: number;
  beds: BedLook[];
  /** 내 방 가구 배치(서버 값). 완료된 편집 결과도 같은 경로로 반영한다. */
  furniture: readonly Placement[];
  onSaveFurniture?: (layout: Placement[]) => Promise<void>;
  /** 허수아비 대사 한 줄(기존 scarecrowLines.ts). 호출할 때마다 새로 뽑는다. */
  scarecrowLine: () => string;
  onExit: () => void;
}

type Dialogue = { speaker: string; lines: string[]; index: number };
type SceneInfo = { id: SceneId; title: string; visit: number };
/** 장면 이름 알림이 떠 있는 시간(ms) — CSS 애니메이션(pwp-toast)과 같은 길이. */
const TOAST_MS = 1800;
type PointerRole = { kind: 'stick' | 'tap' | 'pen'; start: Point; at: number; moved: boolean };
const TAP_SLOP = 10;
const TAP_MS = 280;

// B와 키보드는 가장 위 창의 뒤로 동작을 공유한다.
function cancelTopWindow(root: HTMLElement | null) {
  const windows = root?.querySelectorAll('.pwp-window');
  const top = windows?.[windows.length - 1];
  if (!top) return false;
  top.dispatchEvent(new Event('pwp-cancel'));
  return true;
}

function readInsets(probe: HTMLElement | null): Insets {
  if (!probe) return NO_INSETS;
  const style = getComputedStyle(probe);
  const px = (value: string) => Number.parseFloat(value) || 0;
  return { top: px(style.paddingTop), right: px(style.paddingRight), bottom: px(style.paddingBottom), left: px(style.paddingLeft) };
}
type FullscreenDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void; webkitFullscreenEnabled?: boolean };
type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
const fullscreenElement = () => document.fullscreenElement ?? (document as FullscreenDoc).webkitFullscreenElement ?? null;
const fullscreenSupported = () => !!(document.fullscreenEnabled || (document as FullscreenDoc).webkitFullscreenEnabled);
async function enterFullscreen(element: HTMLElement, phone: boolean) {
  try {
    const el = element as FullscreenEl;
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else await el.webkitRequestFullscreen?.();
    // 폰은 세로 고정을 시도(안드로이드 크롬은 전체화면에서만 허용). 안 되면 조용히 넘어간다.
    if (phone) await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('portrait').catch(() => {});
  } catch { /* 지원 안 하거나 거절 — 화면 채우기(100dvh)로 충분 */ }
}
async function leaveFullscreen() {
  try {
    if (!fullscreenElement()) return;
    if (document.exitFullscreen) await document.exitFullscreen();
    else await (document as FullscreenDoc).webkitExitFullscreen?.();
  } catch { /* 이미 나왔음 */ }
}

// 상위가 1초마다(밭 시계) 다시 그려져도, 넘겨받는 값이 같으면 셸은 다시 그리지 않는다.
export const GameShell = memo(function GameShell({ appearance, pet, balance, beds, furniture, onSaveFurniture, scarecrowLine, onExit, panels, farmAdapter, fishingAdapter, userId = 'guest' }: GameShellProps) {
  useLayoutEffect(() => {
    let viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const created = !viewport;
    if (!viewport) {
      viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.head.appendChild(viewport);
    }
    const original = viewport.getAttribute('content');
    // 키보드는 시각 뷰포트만 줄이게 하고, 기존 확대/안전 영역 설정은 그대로 보존한다.
    const content = original ?? '';
    const directive = /(^|,)(\s*)interactive-widget\s*=\s*[^,]*/gi;
    viewport.setAttribute('content', /(^|,)\s*interactive-widget\s*=/i.test(content)
      ? content.replace(directive, '$1$2interactive-widget=resizes-visual')
      : `${content}${content ? ', ' : ''}interactive-widget=resizes-visual`);
    return () => {
      if (created) viewport.remove();
      else if (original === null) viewport.removeAttribute('content');
      else viewport.setAttribute('content', original);
    };
  }, []);
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const handle = useRef<WorldGameHandle | null>(null);
  const controls = useRef(createControls()).current;
  const pointers = useRef(new Map<number, PointerRole>());
  const stickOrigin = useRef<Point | null>(null);
  const keys = useRef({ up: false, down: false, left: false, right: false });
  const triedFullscreen = useRef(false);
  const [layout, setLayout] = useState<GameLayout>(() => gameLayout(window.innerWidth, window.innerHeight));
  const layoutRef = useRef(layout); layoutRef.current = layout;
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [petMessage, setPetMessage] = useState('');
  useEffect(() => { if (!petMessage) return; const timer = window.setTimeout(() => setPetMessage(''), 4500); return () => clearTimeout(timer); }, [petMessage]);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [scene, setScene] = useState<SceneInfo | null>(null);
  const [toast, setToast] = useState<SceneInfo | null>(null);
  const fishingFrozen = useRef(false);
  const freezeFishing = useCallback((active: boolean) => {
    fishingFrozen.current = active;
    controls.frozen = active || editingRef.current || panelFrozen(panelRef.current, !!dialogueRef.current);
    controls.stick = ZERO_STICK; controls.run = false;
    keys.current = { up: false, down: false, left: false, right: false };
    pointers.current.clear(); stickOrigin.current = null;
    if (ring.current) ring.current.style.opacity = '0';
  }, [controls]);
  const fishing = useFishing({ adapter: fishingAdapter, handle: handle as RefObject<(WorldGameHandle & FishingHandle) | null>, scene: scene?.id ?? null, pet, freeze: freezeFishing });
  const fishingRef = useRef(fishing); fishingRef.current = fishing;
  const promptRef = useRef(prompt); promptRef.current = prompt;
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const dialogueRef = useRef(dialogue); dialogueRef.current = dialogue;
  const [panel, setPanel] = useState<ShellPanel | null>(null);
  const [placing, setPlacing] = useState<FurnitureType | null>(null);
  const [roomMessage, setRoomMessage] = useState('');
  const [roomPending, setRoomPending] = useState(false);
  const roomSaving = useRef(false);
  const placingRef = useRef<FurnitureType | null>(null);
  const editingRef = useRef(false);
  const beginRoomEdit = (type: FurnitureType) => {
    if (!handle.current || handle.current.debug().transitioning || dialogue || roomSaving.current) return;
    panelRef.current = null; setPanel(null);
    placingRef.current = type; setPlacing(type);
    setRoomMessage(`${FURNITURE_NAMES[type]}: 원하는 빈 칸을 눌러 주세요.`);
    editingRef.current = true;
    handle.current.setRoomPlacing(true);
    controls.frozen = true; controls.stick = ZERO_STICK; controls.run = false;
    keys.current = { up: false, down: false, left: false, right: false };
    pointers.current.clear(); stickOrigin.current = null;
    if (ring.current) ring.current.style.opacity = '0';
    handle.current.cancelWalk();
  };
  const endRoomEdit = () => {
    editingRef.current = false; placingRef.current = null; setPlacing(null);
    handle.current?.setRoomPlacing(false);
    controls.stick = ZERO_STICK; controls.run = false;
    keys.current = { up: false, down: false, left: false, right: false };
    controls.frozen = fishingFrozen.current || panelFrozen(panelRef.current, !!dialogueRef.current);
  };
  const saveRoomLayout = async (next: Placement[]) => {
    if (roomSaving.current || !onSaveFurniture) return;
    roomSaving.current = true; setRoomPending(true);
    try {
      await onSaveFurniture(next);
      handle.current?.setFurniture(next);
      endRoomEdit();
      setRoomMessage('가구 배치를 저장했어요.');
    } catch {
      setRoomMessage('방 배치를 저장하지 못했어요. 다시 시도해 주세요.');
    } finally { roomSaving.current = false; setRoomPending(false); }
  };
  const placeAt = (point: Point) => {
    if (roomSaving.current || !placingRef.current || !panels) return;
    const at = handle.current?.roomEditPoint(point.x, point.y);
    if (!at) return;
    const owned = new Set(ownedFurniture(panels.shop.catalog, panels.shop.ownedIds).map(item => item.assetKey as FurnitureType));
    const next = moveFurniture(handle.current!.getFurniture(), placingRef.current, snapRoomPoint(at.point), owned, at.actor);
    if (!next) { setRoomMessage('빈 칸에 놓아 주세요. 캐릭터와 출입구는 비워 주세요.'); return; }
    void saveRoomLayout(next);
  };
  const panelRef = useRef(panel); panelRef.current = panel;
  const closePanel = useCallback(() => {
    if (panelRef.current === 'furniture' && roomSaving.current) return;
    panelRef.current = null; setPanel(null);
    controls.frozen = fishingFrozen.current || editingRef.current || panelFrozen(null, !!dialogueRef.current);
    controls.stick = ZERO_STICK; controls.run = false;
    keys.current = { up: false, down: false, left: false, right: false };
  }, [controls]);
  const openPanel = (kind: ShellPanel) => {
    panelRef.current = kind; setPanel(kind);
    controls.frozen = fishingFrozen.current || panelFrozen(kind, !!dialogueRef.current); controls.stick = ZERO_STICK; controls.run = false;
    pointers.current.clear(); stickOrigin.current = null;
    if (ring.current) ring.current.style.opacity = '0';
    handle.current?.cancelWalk();
  };
  const [typed, setTyped] = useState(0);
  const [pressed, setPressed] = useState<{ a: boolean; b: boolean }>({ a: false, b: false });
  const [fullscreen, setFullscreen] = useState(false);
  const bgm = useBgm(root);
  const scarecrowLineRef = useRef(scarecrowLine); scarecrowLineRef.current = scarecrowLine;

  // ── 화면 채우기: 앱 내비/스크롤을 숨기고, 나가면 그대로 되돌린다 ──
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.classList.add('pwp-open');
    const app = document.getElementById('root');
    const wasInert = app?.inert ?? false;
    if (app) app.inert = true;
    return () => { html.classList.remove('pwp-open'); if (app) app.inert = wasInert; };
  }, []);

  // ── 크기/회전 → 레이아웃 ──
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setLayout(gameLayout(Math.round(rect.width), Math.round(rect.height), readInsets(probe.current)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('orientationchange', measure);
    return () => { observer.disconnect(); window.removeEventListener('orientationchange', measure); };
  }, []);

  // ── 게임 부팅(Phaser는 여기서 처음 동적 import) / 정리 ──
  // 장면이 부르는 대화 열기/창 열기(아래에서 채운다; 부팅을 다시 하지 않도록 ref).
  const talkRef = useRef<(id: string) => void>(() => {});
  // 게임 안 창(상점/옷장 등) 열기 자리. 장면 정의에서 action {kind:'panel', panel}인 대상을 A로 누르면
  // 여기로 온다. 창이 생기면 이 ref를 그 창을 여는 함수로 채우면 된다(지금은 그런 대상이 없다).
  const scenePanelRef = useRef<(panel: string) => void>(() => {});
  scenePanelRef.current = kind => {
    if (kind === 'shop' || kind === 'wardrobe' || kind === 'contest' || kind === 'well' || kind === 'bench') openPanel(kind);
    else if (kind === 'pet' || /^farm:\d+$/.test(kind)) { farmAdapter?.farm.clearMessage(); openPanel(kind as ActivityPanel); }
  };
  const bedsRef = useRef(beds); bedsRef.current = beds;
  const furnitureRef = useRef(furniture); furnitureRef.current = furniture;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const avatar = composeAvatar(appearance);
        const [town, interior, floors, furnitureSheets, avatarCanvas, petSource, scarecrow, bedImages, { startWorldGame }, plazaStall] = await Promise.all([
          loadTown(), loadInterior(), loadFloors(), loadFurnitureSheets(), avatar.canvas, pet ? loadPetSheet(pet) : Promise.resolve(null),
          Promise.resolve().then(loadScarecrow), Promise.resolve().then(() => Promise.all(bedsRef.current.map(loadBed))), import('./game/boot'), Promise.resolve().then(loadPlazaStall),
        ]);
        if (cancelled || !stage.current) return;
        const game = await startWorldGame(stage.current, {
          assets: { town, interior, floors, furniture: furnitureSheets, avatar: { key: avatar.key, canvas: avatarCanvas }, pet: pet && petSource ? { id: pet, source: petSource } : null, scarecrow, plazaStall },
          beds: bedImages, furniture: furnitureRef.current,
        }, controls, {
          onShadowTap: (index: number) => { void fishingRef.current.onShadowTap(index); },
          onPrompt: next => setPrompt(next),
          onPetMessage: setPetMessage,
          onTalk: id => talkRef.current(id),
          onPanel: panel => scenePanelRef.current(panel),
          onScene: (id, title) => {
            const info = { id, title, visit: performance.now() };
            setScene(info); setToast(info);
          },
        } as WorldEvents & { onShadowTap(index: number): void });
        if (cancelled) { game.destroy(); return; }
        handle.current = game;
        if (import.meta.env.DEV) (window as unknown as { __pixelWorldPhaser?: WorldGameHandle }).__pixelWorldPhaser = game;
        setStatus('ready');
      } catch (error) {
        console.error(error);
        if (!cancelled) setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
      handle.current?.destroy();
      handle.current = null;
      if (import.meta.env.DEV) delete (window as unknown as { __pixelWorldPhaser?: WorldGameHandle }).__pixelWorldPhaser;
    };
    // 외형과 펫 변경은 아래 효과에서 처리하고 장면은 한 번만 만든다.
  }, [controls]);

  // 장착 변경은 장면을 재부팅하지 않고 최신 요청만 반영한다.
  useEffect(() => {
    if (status !== 'ready') return;
    let cancelled = false;
    const next = composeAvatar(appearance);
    void next.canvas.then(canvas => { if (!cancelled) handle.current?.setAppearance({ key: next.key, canvas }); }).catch(() => {});
    return () => { cancelled = true; };
  }, [appearance, status]);
  useEffect(() => {
    if (status !== 'ready') return;
    let cancelled = false;
    void (pet ? loadPetSheet(pet) : Promise.resolve(null)).then(source => {
      if (!cancelled) handle.current?.setPet(pet && source ? { id: pet, source } : null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [pet, status]);

  // 밭 모습이 바뀌면(서버 새로고침) 밭 그림만 갈아 끼운다.
  const bedKey = beds.map(bed => `${bed.stage}/${bed.moisture}`).join(',');
  useEffect(() => {
    if (status !== 'ready') return;
    let cancelled = false;
    void Promise.resolve().then(() => Promise.all(bedsRef.current.map(loadBed))).then(images => { if (!cancelled) handle.current?.setBeds(images); }).catch(() => {});
    return () => { cancelled = true; };
  }, [bedKey, status]);

  // 가구 배치가 (서버에서) 새로 오면 방에 반영한다. 방에 있지 않으면 다음에 들어갈 때 쓴다.
  useEffect(() => {
    if (status === 'ready') handle.current?.setFurniture(furniture);
  }, [furniture, status]);

  // 장면 이름 알림은 잠깐만.
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(current => (current === toast ? null : current)), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // ── 대화 ──
  const openDialogue = useCallback((id: string) => {
    if (dialogueRef.current || panelRef.current) return;
    const text = dialogueFor(id, { scarecrowLine: () => scarecrowLineRef.current() });
    if (!text) return;
    const { speaker, lines } = text;
    controls.frozen = true;
    controls.stick = ZERO_STICK;
    handle.current?.cancelWalk();
    const next = { speaker, lines, index: 0 };
    dialogueRef.current = next;
    setTyped(0);
    setDialogue(next);
  }, [controls]);
  talkRef.current = id => { if (id === 'scarecrow') openPanel('scarecrow'); else openDialogue(id); };
  const closeDialogue = useCallback(() => {
    controls.frozen = fishingFrozen.current || panelFrozen(panelRef.current, false); dialogueRef.current = null; setDialogue(null);
    controls.stick = ZERO_STICK; controls.run = false;
    keys.current = { up: false, down: false, left: false, right: false };
  }, [controls]);
  const currentLine = dialogue ? dialogue.lines[dialogue.index] : '';
  // 한 글자씩 찍히는 대사(약 40자/초). 끝나면 타이머 정지.
  useEffect(() => {
    if (!dialogue || typed >= currentLine.length) return;
    const timer = window.setTimeout(() => setTyped(count => count + 1), 25);
    return () => window.clearTimeout(timer);
  }, [dialogue, typed, currentLine]);
  const typedRef = useRef(typed); typedRef.current = typed;
  const advance = useCallback(() => {
    const current = dialogueRef.current;
    if (!current) return;
    const line = current.lines[current.index];
    if (typedRef.current < line.length) { typedRef.current = line.length; setTyped(line.length); return; } // 찍히는 중이면 먼저 다 보여 준다.
    if (current.index + 1 < current.lines.length) {
      const next = { ...current, index: current.index + 1 };
      dialogueRef.current = next; typedRef.current = 0;
      setDialogue(next); setTyped(0);
      return;
    }
    closeDialogue();
  }, [closeDialogue]);
  // 대화 중이면 다음 줄, 아니면 장면에 맡긴다(말 걸기 → onTalk, 문 → 장면 전환).
  const pressA = useCallback(() => {
    if (fishingRef.current.reel()) return;
    if (panelRef.current || editingRef.current) return;
    if (dialogueRef.current) advance();
    else if (promptRef.current) handle.current?.interact();
  }, [advance]);
  const pressB = useCallback((down: boolean) => {
    if (fishingFrozen.current) { if (down) fishingRef.current.cancel(); return; }
    if (editingRef.current) return;
    if (down && cancelTopWindow(root.current)) { controls.run = false; return; }
    if (panelRef.current) { controls.run = false; return; }
    if (down && dialogueRef.current) { closeDialogue(); return; }
    if (down && root.current?.querySelector('.pwp-chat-form')) {
      root.current.querySelector<HTMLButtonElement>('.pwp-chat-close')?.click();
      controls.run = false; return;
    }
    controls.run = down;
  }, [closeDialogue, controls]);

  // ── 조이스틱/탭 (게임 표면 전체에서 받는다; 버튼은 자기 이벤트를 먼저 먹는다) ──
  const framePoint = (event: { clientX: number; clientY: number }): Point => {
    const rect = root.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const showStick = (origin: Point | null, point?: Point) => {
    const ringEl = ring.current, knobEl = knob.current;
    if (!ringEl || !knobEl) return;
    if (!origin) { ringEl.style.opacity = '0'; return; }
    ringEl.style.opacity = '1';
    ringEl.style.transform = `translate(${origin.x - STICK_RADIUS}px, ${origin.y - STICK_RADIUS}px)`;
    const offset = point ? knobOffset(origin, point) : { x: 0, y: 0 };
    knobEl.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
  };
  // 첫 터치에서 한 번만 전체화면 시도. HTML 표준상 터치의 pointerdown은 사용자 활성화가 아니라서
  // (iPad/안드로이드에서 거절됨) 손을 뗄 때(pointerup) 요청한다. 마우스(데스크톱)는 자동으로 하지 않는다.
  const maybeFullscreen = (pointerType: string) => {
    if (triedFullscreen.current || pointerType === 'mouse') return;
    triedFullscreen.current = true;
    if (fullscreenSupported() && !fullscreenElement() && root.current) void enterFullscreen(root.current, layoutRef.current.device === 'phone');
  };
  const onSurfaceDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (fishingFrozen.current) {
      if (event.pointerType !== 'mouse' || event.button === 0) { event.preventDefault(); fishingRef.current.reel(); }
      return;
    }
    if (editingRef.current) {
      if (event.pointerType !== 'mouse' || event.button === 0) { event.preventDefault(); placeAt(framePoint(event)); }
      return;
    }
    if (panelRef.current) return;
    if (dialogueRef.current) { if (event.pointerType !== 'mouse' || event.button === 0) advance(); return; }
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const point = framePoint(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (event.pointerType === 'pen') {
      pointers.current.set(event.pointerId, { kind: 'pen', start: point, at: performance.now(), moved: false });
      handle.current?.walkToScreen(point.x, point.y);
      return;
    }
    const hasStick = [...pointers.current.values()].some(role => role.kind === 'stick');
    if (!hasStick && insideRect(point, layoutRef.current.stickZone)) {
      pointers.current.set(event.pointerId, { kind: 'stick', start: point, at: performance.now(), moved: false });
      stickOrigin.current = point;
      showStick(point, point);
      return;
    }
    pointers.current.set(event.pointerId, { kind: 'tap', start: point, at: performance.now(), moved: false });
  };
  const onSurfaceMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const role = pointers.current.get(event.pointerId);
    if (!role) return;
    const point = framePoint(event);
    if (Math.hypot(point.x - role.start.x, point.y - role.start.y) > TAP_SLOP) role.moved = true;
    if (role.kind === 'stick' && stickOrigin.current) {
      const origin = followOrigin(stickOrigin.current, point);
      stickOrigin.current = origin;
      controls.stick = stickVector(origin, point);
      showStick(origin, point);
    } else if (role.kind === 'pen' && role.moved && performance.now() - role.at > 120) {
      // 펜으로 끌면 펜 끝을 계속 따라간다.
      role.at = performance.now();
      handle.current?.walkToScreen(point.x, point.y);
    }
  };
  const releasePointer = (event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (!cancelled) maybeFullscreen(event.pointerType);
    const role = pointers.current.get(event.pointerId);
    if (!role) return;
    pointers.current.delete(event.pointerId);
    if (role.kind === 'stick') {
      stickOrigin.current = null;
      controls.stick = ZERO_STICK;
      showStick(null);
    }
    // 조이스틱 영역이라도 짧게 콕 찍으면 그 자리로 걸어간다(탭해서 걷기).
    if (!cancelled && role.kind !== 'pen' && !role.moved && performance.now() - role.at < TAP_MS) {
      const point = framePoint(event);
      handle.current?.walkToScreen(point.x, point.y);
    }
  };

  // ── 버튼(A/B): 각자 포인터 캡처 → 조이스틱과 동시에 눌러도 서로 안 섞인다 ──
  const buttonDown = (which: 'a' | 'b') => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setPressed(state => ({ ...state, [which]: true }));
    if (which === 'a') pressA(); else pressB(true);
  };
  const buttonUp = (which: 'a' | 'b') => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (event.type === 'pointerup') maybeFullscreen(event.pointerType);
    setPressed(state => ({ ...state, [which]: false }));
    if (which === 'b') pressB(false);
  };

  // ── 키보드(데스크톱 테스트용) ──
  useEffect(() => {
    const map: Record<string, keyof typeof keys.current> = { ArrowUp: 'up', w: 'up', ArrowDown: 'down', s: 'down', ArrowLeft: 'left', a: 'left', ArrowRight: 'right', d: 'right' };
    const sync = () => { if (!stickOrigin.current) controls.stick = keyboardVector(keys.current); };
    const down = (event: KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (editingRef.current) { if (map[event.key] || ['Shift', 'z', 'x'].includes(event.key)) event.preventDefault(); return; }
      if (key === 'Escape' || key === 'x') {
        event.preventDefault();
        if (!event.repeat && fishingFrozen.current) { fishingRef.current.cancel(); return; }
        if (!event.repeat) { if (!cancelTopWindow(root.current) && dialogueRef.current) closeDialogue(); }
        return;
      }
      if (panelRef.current) return;
      if (event.target instanceof HTMLElement && event.target.closest('button') && (event.key === 'Enter' || event.key === ' ')) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const dir = map[key];
      if (dir) { event.preventDefault(); keys.current[dir] = true; sync(); return; }
      if (key === 'Shift') { controls.run = true; return; }
      if (event.repeat) return;
      if (key === ' ' || key === 'Enter' || key === 'z') { event.preventDefault(); pressA(); }
    };
    const up = (event: KeyboardEvent) => {
      if (editingRef.current) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const dir = map[key];
      if (dir) { keys.current[dir] = false; sync(); }
      if (key === 'Shift') controls.run = false;
    };
    // 창이 가려지거나 포커스를 잃으면 모든 입력을 놓는다(계속 걷는 버그 방지) + 게임 루프 정지.
    const reset = () => {
      keys.current = { up: false, down: false, left: false, right: false };
      pointers.current.clear(); stickOrigin.current = null;
      controls.stick = ZERO_STICK; controls.run = false; showStick(null);
      setPressed({ a: false, b: false });
    };
    const visibility = () => { reset(); handle.current?.setActive(document.visibilityState === 'visible'); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', reset);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [controls, pressA, closeDialogue, closePanel]);

  // ── 전체화면 상태 추적 + iOS 핀치/더블탭 확대 막기 ──
  useEffect(() => {
    const sync = () => setFullscreen(!!fullscreenElement());
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    const element = root.current;
    const block = (event: Event) => {
      if (event.type === 'touchmove' && event.target instanceof Element && event.target.closest('.pwp-panel-content')) return;
      event.preventDefault();
    };
    element?.addEventListener('gesturestart', block);
    element?.addEventListener('gesturechange', block);
    element?.addEventListener('dblclick', block);
    // touchmove 기본 동작(스크롤/당겨서 새로고침) 차단 — passive:false라야 막힌다.
    element?.addEventListener('touchmove', block, { passive: false });
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
      element?.removeEventListener('gesturestart', block);
      element?.removeEventListener('gesturechange', block);
      element?.removeEventListener('dblclick', block);
      element?.removeEventListener('touchmove', block);
    };
  }, []);

  const exit = () => { void leaveFullscreen(); onExit(); };
  const toggleFullscreen = () => { if (fullscreenElement()) void leaveFullscreen(); else if (root.current) void enterFullscreen(root.current, layout.device === 'phone'); };
  const promptLabel = prompt?.verb ?? '';
  const { a, b, hud, dialogue: box } = layout;

  return createPortal(<div ref={root} className="pwp-root" data-device={layout.device} data-orientation={layout.orientation} data-status={status} data-fishing-phase={fishing.phase} data-fishing-busy={fishing.busy}
    data-scene={scene?.id} role="application" aria-label={`새 Pixel World 베타 · ${scene?.title ?? '앞마당'}`}>
    <div ref={probe} className="pwp-safe-probe" aria-hidden="true" />
    <div ref={stage} className="pwp-stage" />
    <div className="pwp-surface" data-testid="pwp-surface"
      onPointerDown={onSurfaceDown} onPointerMove={onSurfaceMove}
      onPointerUp={event => releasePointer(event, false)} onPointerCancel={event => releasePointer(event, true)}
      onLostPointerCapture={event => releasePointer(event, true)} onContextMenu={event => event.preventDefault()}>
      <div ref={ring} className="pwp-stick" aria-hidden="true" style={{ width: STICK_RADIUS * 2, height: STICK_RADIUS * 2 }}><div ref={knob} className="pwp-knob" /></div>
    </div>
    <div className="pwp-hud" style={{ left: hud.x, top: hud.y, width: hud.width, height: hud.height }}>
      <button type="button" className="pwp-chip pwp-exit" onClick={exit} aria-label="Pixel World 나가기">← 나가기</button>
      <span className="pwp-chip pwp-points" aria-label={`포인트 ${balance}`}><span className="pwp-coin" aria-hidden="true">P</span>{balance.toLocaleString()}</span>
      <span className="pwp-hud-spacer" />
      <button type="button" className="pwp-chip pwp-icon" aria-pressed={bgm.enabled} aria-label="배경음악" title={bgm.enabled ? '배경음악 끄기' : '배경음악 켜기'} onClick={bgm.toggle}><span aria-hidden="true">♪</span></button>
      {fullscreenSupported() && <button type="button" className="pwp-chip pwp-icon" aria-pressed={fullscreen} aria-label={fullscreen ? '전체화면 끄기' : '전체화면'} onClick={toggleFullscreen}>⛶</button>}
    </div>
    {panels && <div className="pwp-panel-access" style={{ left: hud.x + 10, top: hud.y + hud.height + 8 }}>
      <button type="button" className="pwp-chip" disabled={status !== 'ready' || !!placing || roomPending} onClick={() => openPanel('wardrobe')}>옷장</button>
      {scene?.id === 'room' && <button type="button" className="pwp-chip" disabled={status !== 'ready' || !onSaveFurniture || !panels.shop.ready || panels.shop.loadError || !!panel || !!dialogue || !!placing || roomPending} onClick={() => { setRoomMessage(''); openPanel('furniture'); }}>꾸미기</button>}
    </div>}
    <button type="button" disabled={!!placing} className="pwp-btn pwp-btn-a" data-pressed={pressed.a} data-prompt={!!prompt || !!dialogue}
      style={{ left: a.x - a.size / 2, top: a.y - a.size / 2, width: a.size, height: a.size }}
      aria-label={dialogue ? 'A · 다음' : prompt ? `A · ${promptLabel}` : 'A'}
      onPointerDown={buttonDown('a')} onPointerUp={buttonUp('a')} onPointerCancel={buttonUp('a')} onLostPointerCapture={buttonUp('a')}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); }}
      onClick={event => { if (event.detail === 0) pressA(); }}>
      <b>A</b>{(prompt || dialogue) && <small>{dialogue ? '다음' : promptLabel}</small>}
    </button>
    <button type="button" disabled={!!placing} className="pwp-btn pwp-btn-b" data-pressed={pressed.b} data-closing={!!panel || !!dialogue}
      style={{ left: b.x - b.size / 2, top: b.y - b.size / 2, width: b.size, height: b.size }}
      aria-label={panel || dialogue ? 'B · 닫기' : 'B · 누르는 동안 달리기'}
      onPointerDown={buttonDown('b')} onPointerUp={buttonUp('b')} onPointerCancel={buttonUp('b')} onLostPointerCapture={buttonUp('b')}
      onClick={event => { if (event.detail === 0 && (fishingFrozen.current || panelRef.current || dialogueRef.current || root.current?.querySelector('.pwp-chat-form'))) pressB(true); }}>
      <b>B</b><small>{panel || dialogue ? '닫기' : '달리기'}</small>
    </button>
    {dialogue && <div className="pwp-panel-shade pwp-dialogue-shade" onPointerDown={event => {
      event.stopPropagation();
      if (event.target === event.currentTarget && event.button === 0) { event.preventDefault(); closeDialogue(); }
    }}><div className="pwp-dialogue" role="dialog" aria-live="polite" aria-label={`${dialogue.speaker}의 말`}
      style={{ left: box.x, top: box.y, width: box.width, minHeight: box.height }}
      onPointerDown={event => { event.stopPropagation(); advance(); }}>
      <strong>{dialogue.speaker}</strong>
      <p data-full={currentLine}>{currentLine.slice(0, typed)}</p>
      {typed >= currentLine.length && <span className="pwp-dialogue-next" aria-hidden="true">{dialogue.index + 1 < dialogue.lines.length ? '▼' : '■'}</span>}
    </div></div>}
    {(panel === 'shop' || panel === 'wardrobe') && panels && <GamePanels kind={panel} adapter={panels} onClose={closePanel} />}
    {scene?.id === 'plaza' && status === 'ready' && <PlazaBridge key={'plaza:' + scene.visit} handle={handle} appearance={appearance} pet={pet} userId={userId} panel={panel} onClose={closePanel} />}
    {panel && panel !== 'furniture' && panel !== 'shop' && panel !== 'wardrobe' && panel !== 'contest' && panel !== 'well' && panel !== 'bench' && <FarmPanels key={panel} kind={panel} adapter={farmAdapter} onClose={closePanel}
      onCollection={() => openPanel('collection')} onTalk={() => { closePanel(); openDialogue('scarecrow'); }}
      onPet={kind => { closePanel(); handle.current?.reactPet(kind); }} onFx={(index, action) => handle.current?.farmFx(index, action)} />}
    {panel === 'furniture' && panels && <FurniturePanel furniture={handle.current?.getFurniture() ?? furniture} shop={panels.shop}
      pending={roomPending} message={roomMessage} onClose={() => { if (!roomSaving.current) closePanel(); }} onPick={beginRoomEdit}
      onStore={type => void saveRoomLayout(handle.current!.getFurniture().filter(item => item.type !== type))} />}
    {placing && <div className="pwp-room-placing" style={{ top: hud.y + hud.height + 62 }}>
      <p role="status" aria-live="polite">{roomPending ? '저장 중…' : roomMessage}</p>
      <button type="button" className="pwp-chip" autoFocus disabled={roomPending} onClick={() => { endRoomEdit(); setRoomMessage(''); }}>그만두기</button>
    </div>}
    {!placing && panel !== 'furniture' && roomMessage && <div className="pwp-room-result" role="status">{roomMessage}</div>}
    {!placing && petMessage && <div className="pwp-pet-message" role="status" aria-live="polite">{petMessage}</div>}
    {!placing && panel !== 'furniture' && toast && <div key={toast.visit} className="pwp-toast" role="status" style={{ top: hud.y + hud.height + 6 }}>{toast.title}</div>}
    {fishing.caught && <CatchCard caught={fishing.caught} onHide={fishing.hideCatch} />}
    {fishing.message && <div className="pwp-fishing-message" role="status">{fishing.message}</div>}
    {status !== 'ready' && <div className="pwp-loading" role="status">
      {status === 'loading' ? '앞마당으로 가는 중…' : <>게임을 시작하지 못했어요.<button type="button" className="pwp-chip" onClick={exit}>돌아가기</button></>}
    </div>}
  </div>, document.body);
});
