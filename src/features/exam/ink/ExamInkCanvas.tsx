import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, SyntheticEvent } from 'react';
import type { ExamInkCanvasHandle, ExamInkCanvasProps, InkPoint, InkStroke } from '../contract.ts';
import {
  HIGHLIGHTER_OPACITY, INK_REFERENCE_WIDTH, SIMULATED_PRESSURE, emptyHistory, newStrokeId, recordChange, redoHistory, strokesHitAlong, undoHistory,
} from './inkModel.ts';
import type { InkHistory } from './inkModel.ts';
import { fitExtraBelow, fitImageWidth } from './inkFit.ts';
import { drawShape, drawStroke, freehandPath, paint, prepareCanvas, resetTransform, safeDpr } from './inkRender.ts';
import { holdStillStart, recognizeShape, resizeShape, shapeCenter, shapeToPoints } from './shapeSnap.ts';
import { drawLaser } from './inkLaser.ts';
import type { LaserTrail } from './inkLaser.ts';
import type { Pt, SnapShape } from './shapeSnap.ts';

const round = (value: number, scale: number) => Math.round(value * scale) / scale;

/** 꾹 누름 판정 시간·허용 떨림(CSS px). */
// 글씨를 쓰다 잠깐 멈춘 것을 도형으로 오인하지 않게 시간은 넉넉히(0.5초는 필기 중에도 자주 걸렸다).
// 떨림은 "최근 HOLD_MS 동안 들어온 점들이 그 중심에서 HOLD_SLOP_PX 안"으로 본다. 예전처럼 마지막 기준점에서 3px을
// 넘을 때마다 타이머를 다시 시작하면, 애플펜슬(240Hz·coalesced)은 가만히 누르고 있어도 ±2~4px 떨림이 계속 들어와
// 타이머가 끝없이 리셋될 수 있었다(아이패드에서만 도형 변환이 전혀 안 되던 가장 유력한 원인).
const HOLD_MS = 650;
const HOLD_SLOP_PX = 6;
/** 펜이 완전히 멈추면 iPad Safari는 pointermove를 보내지 않으므로 타이머로도 확인한다. */
const HOLD_POLL_MS = 50;
/** 이보다 짧은 획은 도형으로 바꾸지 않는다(CSS px, 획 길이). */
const SHAPE_MIN_PX = 40;
/** 지우개 반지름(CSS px). */
const ERASER_RADIUS_PX = 11;
const SNAP_ANIM_MS = 180;

/** 펜이 한 번이라도 감지되면 이후(문항을 옮겨 다시 마운트돼도) 손가락은 그리지 않는다. */
let penEverDetected = false;

/** 문항 이미지 비율 캐시 — 문항을 오갈 때 이미지가 다시 로드되기 전에도 같은 높이로 바로 그려 깜박임을 없앤다. */
const aspectCache = new Map<string, number>();
/** 시험 시작 때 문항 이미지를 미리 받아 두고 비율도 캐시한다. */
export function preloadInkImages(urls: string[]) {
  for (const url of urls) {
    if (aspectCache.has(url)) continue;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { if (img.naturalWidth) aspectCache.set(url, img.naturalHeight / img.naturalWidth); };
    img.src = url;
  }
}

/** 가장 가까운 세로 스크롤 조상(손가락 스크롤을 직접 처리할 때 쓴다). */
function scrollParentOf(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const oy = getComputedStyle(node).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

interface DrawGesture {
  kind: 'draw';
  pointerId: number;
  tool: InkStroke['tool'];
  color: string;
  size: number;
  points: InkPoint[];
  predicted: InkPoint[];
  startTime: number;
  /** 점마다 받은 시각(performance.now()) — 꾹 누름 시간 창 계산용. */
  arrivals: number[];
  holdTimer: number | null;
  /** 이미 판정해 본 정지 시작 위치(같은 멈춤을 거듭 판정하지 않게). */
  holdTried: number;
  snap: { base: SnapShape; anchor: Pt; current: SnapShape; startedAt: number } | null;
}
interface LaserGesture {
  kind: 'laser';
  pointerId: number;
  trail: LaserTrail;
}
interface PanGesture {
  kind: 'pan';
  pointerId: number;
  lastX: number;
  lastY: number;
  scroller: HTMLElement | null;
}
interface EraseGesture {
  kind: 'erase';
  pointerId: number;
  before: InkStroke[];
  working: InkStroke[];
  last: Pt;
  recorded: boolean;
}
type Gesture = DrawGesture | EraseGesture | PanGesture | LaserGesture;


const CANVAS_STYLE: CSSProperties = { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', display: 'block' };

export const ExamInkCanvas = forwardRef<ExamInkCanvasHandle, ExamInkCanvasProps>(function ExamInkCanvas(props, ref) {
  const { imageUrl, strokes, readOnly = false, imageMaxWidth, fitToInk } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLCanvasElement>(null);
  const penRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const laserRef = useRef<HTMLCanvasElement>(null);
  const [cssWidth, setCssWidth] = useState(0);
  const [aspect, setAspect] = useState(() => aspectCache.get(imageUrl) ?? 0); // naturalHeight / naturalWidth
  const [dprWanted, setDprWanted] = useState(() => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1));
  const [penSeen, setPenSeen] = useState(penEverDetected);
  const [liveHighlighter, setLiveHighlighter] = useState(false);

  // 정규화 기준(1) = 실제로 보이는 이미지 너비. 필기 영역(캔버스)은 컨테이너 전체 너비.
  // fitToInk(읽기 전용)가 있으면 필기 오른쪽 끝까지 보이도록 이미지를 줄이고, 아래로 쓴 필기만큼 여백을 늘린다.
  const imgW = fitImageWidth(cssWidth, imageMaxWidth, fitToInk);
  const imageHeight = imgW * aspect;
  const extraHeight = imgW * fitExtraBelow(aspect, fitToInk);
  const cssHeight = imageHeight + extraHeight;
  const dpr = safeDpr(cssWidth, cssHeight, dprWanted);
  const geomRef = useRef({ cssWidth, imgW });
  geomRef.current = { cssWidth, imgW };
  /** 정규화 1이 차지하는 백버퍼 픽셀 수(캔버스 변환용). */
  const unitDevicePx = (canvas: HTMLCanvasElement) => {
    const g = geomRef.current;
    return g.cssWidth > 0 ? (canvas.width / g.cssWidth) * g.imgW : 0;
  };

  // 최신 props를 네이티브 이벤트 핸들러에서 읽기 위한 ref.
  const propsRef = useRef(props);
  const historyRef = useRef<InkHistory>(emptyHistory());
  const gestureRef = useRef<Gesture | null>(null);
  const rafRef = useRef(0);
  const laserRafRef = useRef(0);
  /** 아직 보이는 레이저 획(저장하지 않는다). */
  const laserTrailsRef = useRef<LaserTrail[]>([]);
  const drawnRef = useRef<{ strokes: InkStroke[]; width: number; height: number } | null>(null);
  useLayoutEffect(() => { propsRef.current = props; });

  // ── 크기 측정 ──
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => {
      setCssWidth(wrap.clientWidth);
      setDprWanted(window.devicePixelRatio || 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  const onImageLoad = useCallback((event: SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    if (img.naturalWidth) {
      aspectCache.set(img.getAttribute('src') ?? img.src, img.naturalHeight / img.naturalWidth);
      setAspect(img.naturalHeight / img.naturalWidth);
    }
  }, []);
  const imgRef = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth) setAspect(img.naturalHeight / img.naturalWidth);
  }, []);

  // ── 확정 획 렌더(형광펜 레이어 + 펜 레이어). 끝에 덧붙인 획만 있으면 그 획만 더 그린다. ──
  useLayoutEffect(() => {
    const hl = highlightRef.current, pen = penRef.current;
    if (!hl || !pen || !cssWidth || !cssHeight) return;
    const resizedA = prepareCanvas(hl, cssWidth, cssHeight, dpr);
    const resizedB = prepareCanvas(pen, cssWidth, cssHeight, dpr);
    const hctx = hl.getContext('2d'), pctx = pen.getContext('2d');
    if (!hctx || !pctx) return;
    const drawn = drawnRef.current;
    const appendOnly = !resizedA && !resizedB && drawn && drawn.width === hl.width && drawn.height === hl.height
      && drawn.strokes.length <= strokes.length && drawn.strokes.every((s, i) => strokes[i] === s);
    const from = appendOnly ? drawn.strokes.length : 0;
    if (!appendOnly) {
      resetTransform(hctx, hl, unitDevicePx(hl));
      resetTransform(pctx, pen, unitDevicePx(pen));
    }
    for (let i = from; i < strokes.length; i++) drawStroke(strokes[i].tool === 'highlighter' ? hctx : pctx, strokes[i]);
    drawnRef.current = { strokes, width: hl.width, height: hl.height };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, cssWidth, cssHeight, dpr, imgW]);

  // ── 진행 중 획 렌더(별도 레이어, rAF) ──
  const renderLive = useCallback(() => {
    rafRef.current = 0;
    const canvas = liveRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d', { desynchronized: true } as CanvasRenderingContext2DSettings);
    if (!ctx) return;
    resetTransform(ctx, canvas, unitDevicePx(canvas));
    const g = gestureRef.current;
    if (!g || g.kind === 'pan' || g.kind === 'laser') return;
    const REF = INK_REFERENCE_WIDTH;
    if (g.kind === 'erase') {
      const w = geomRef.current.imgW || wrap.clientWidth || 1;
      const r = (ERASER_RADIUS_PX / w) * REF;
      ctx.beginPath();
      ctx.arc(g.last.x * REF, g.last.y * REF, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(148, 163, 184, .18)';
      ctx.strokeStyle = 'rgba(100, 116, 139, .7)';
      ctx.lineWidth = REF / w;
      ctx.fill();
      ctx.stroke();
      return;
    }
    if (g.snap) {
      const t = Math.min(1, (performance.now() - g.snap.startedAt) / SNAP_ANIM_MS);
      const eased = 1 - (1 - t) * (1 - t);
      if (t < 1) {
        ctx.globalAlpha = 1 - eased;
        paint(ctx, { path: freehandPath(g.tool, g.size, g.points, true), mode: 'fill', width: 0 }, g.color);
        ctx.globalAlpha = eased;
        // 살짝 커지며 자리 잡는 느낌
        const s = g.snap.current;
        const center = shapeCenter(s);
        const cx = center.x * REF, cy = center.y * REF;
        const k = 0.94 + 0.06 * eased;
        ctx.translate(cx, cy); ctx.scale(k, k); ctx.translate(-cx, -cy);
        drawShape(ctx, s, g.tool, g.size, g.color);
        rafRef.current = requestAnimationFrame(renderLive);
      } else {
        drawShape(ctx, g.snap.current, g.tool, g.size, g.color);
      }
      return;
    }
    const pts = g.predicted.length ? [...g.points, ...g.predicted] : g.points;
    paint(ctx, { path: freehandPath(g.tool, g.size, pts, false), mode: 'fill', width: 0 }, g.color);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const scheduleLive = useCallback(() => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(renderLive);
  }, [renderLive]);

  // ── 레이저(별도 레이어, rAF). 모든 빛이 사라지면 rAF를 멈춘다. ──
  const renderLaser = useCallback(() => {
    laserRafRef.current = 0;
    const canvas = laserRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    resetTransform(ctx, canvas, unitDevicePx(canvas));
    const glowPx = 9 * (canvas.width / Math.max(1, geomRef.current.cssWidth));
    laserTrailsRef.current = drawLaser(ctx, laserTrailsRef.current, performance.now(), glowPx);
    if (laserTrailsRef.current.length) laserRafRef.current = requestAnimationFrame(renderLaser);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const scheduleLaser = useCallback(() => {
    if (!laserRafRef.current) laserRafRef.current = requestAnimationFrame(renderLaser);
  }, [renderLaser]);

  useLayoutEffect(() => {
    const live = liveRef.current, laser = laserRef.current;
    if (!live || !laser || !cssWidth || !cssHeight) return;
    prepareCanvas(live, cssWidth, cssHeight, dpr);
    prepareCanvas(laser, cssWidth, cssHeight, dpr);
    renderLive();
    renderLaser();
  }, [cssWidth, cssHeight, dpr, imgW, renderLive, renderLaser]);

  // ── 변경 + 실행 취소 기록 ──
  const commit = useCallback((next: InkStroke[], before: InkStroke[]) => {
    historyRef.current = recordChange(historyRef.current, before);
    propsRef.current.onChange(next, next.length === 0 ? 'clear' : 'draw');
  }, []);

  useImperativeHandle(ref, () => ({
    undo() {
      if (gestureRef.current) return;
      const result = undoHistory(historyRef.current, propsRef.current.strokes);
      if (!result) return;
      historyRef.current = result.history;
      propsRef.current.onChange(result.strokes, 'undo');
    },
    redo() {
      if (gestureRef.current) return;
      const result = redoHistory(historyRef.current, propsRef.current.strokes);
      if (!result) return;
      historyRef.current = result.history;
      propsRef.current.onChange(result.strokes, 'redo');
    },
    clear() {
      if (gestureRef.current) return;
      const current = propsRef.current.strokes;
      if (!current.length) return;
      commit([], current);
    },
    canUndo: () => historyRef.current.past.length > 0,
    canRedo: () => historyRef.current.future.length > 0,
  }), [commit]);

  // ── 입력 ──
  useEffect(() => {
    const canvas = liveRef.current;
    if (!canvas || readOnly) return;
    let rect = canvas.getBoundingClientRect();

    const unit = () => geomRef.current.imgW || rect.width || 1;
    const toPoint = (e: PointerEvent, start: number): InkPoint => {
      const w = unit();
      const pressure = e.pointerType === 'pen' ? round(e.pressure > 0 ? e.pressure : 0.5, 1e3) : SIMULATED_PRESSURE;
      // 펜 압력이 정확히 0.5로 들어와 '흉내 모드'로 오인되는 일을 막는다.
      const p = e.pointerType === 'pen' && pressure === SIMULATED_PRESSURE ? 0.501 : pressure;
      // 좌표는 이미지 너비의 1/10000 단위로 반올림(눈에 보이지 않는 차이) — 서버로 가는 필기 크기를 줄인다.
      return { x: round((e.clientX - rect.left) / w, 1e4), y: round((e.clientY - rect.top) / w, 1e4), pressure: p, t: Math.max(0, Math.round(e.timeStamp - start)) };
    };
    const eventsOf = (e: PointerEvent) => {
      const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
      return list.length ? list : [e];
    };

    const clearHold = (g: DrawGesture) => {
      if (g.holdTimer !== null) { window.clearInterval(g.holdTimer); g.holdTimer = null; }
    };
    /** 최근 HOLD_MS 동안 펜이 (떨림을 빼면) 멈춰 있었으면 멈추기 전까지의 획으로 도형 판정. */
    const checkHold = (g: DrawGesture) => {
      if (gestureRef.current !== g || g.snap) { clearHold(g); return; }
      const w = unit();
      const still = holdStillStart(g.points, g.arrivals, performance.now(), HOLD_MS, HOLD_SLOP_PX / w);
      if (still < 0 || still === g.holdTried) return;
      g.holdTried = still;
      // 꾹 누르는 동안 쌓인 떨림 점은 빼고 판정. 짧은 획(글자 한 획 등)은 꾹 눌러도 도형 판정을 하지 않는다.
      const pts = g.points.slice(0, still + 1);
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (len * w < SHAPE_MIN_PX) return;
      const shape = recognizeShape(pts, { minSize: SHAPE_MIN_PX / w });
      if (!shape) return;
      clearHold(g);
      g.snap = { base: shape, anchor: g.points[g.points.length - 1], current: shape, startedAt: performance.now() };
      g.predicted = [];
      navigator.vibrate?.(8);
      scheduleLive();
    };
    /** 펜이 완전히 멈추면 pointermove가 오지 않으므로(iPad Safari) 주기적으로도 확인한다. */
    const armHold = (g: DrawGesture) => {
      if (propsRef.current.shapeSnap === false) return;
      g.holdTimer = window.setInterval(() => checkHold(g), HOLD_POLL_MS);
    };

    const finishDraw = (g: DrawGesture) => {
      clearHold(g);
      const current = propsRef.current.strokes;
      let stroke: InkStroke;
      if (g.snap) {
        const avg = g.points.reduce((sum, p) => sum + p.pressure, 0) / g.points.length;
        const end = g.points[g.points.length - 1]?.t ?? 0;
        stroke = {
          id: newStrokeId(), tool: g.tool, color: g.color, size: g.size, shape: g.snap.current,
          points: shapeToPoints(g.snap.current).map(p => ({ x: p.x, y: p.y, pressure: avg, t: end })),
        };
      } else {
        stroke = { id: newStrokeId(), tool: g.tool, color: g.color, size: g.size, points: g.points };
      }
      // 부모가 다시 그리기 전까지 깜빡이지 않게 확정 레이어에 먼저 그려 둔다.
      const layer = (g.tool === 'highlighter' ? highlightRef : penRef).current?.getContext('2d');
      const next = [...current, stroke];
      if (layer && drawnRef.current && drawnRef.current.strokes === current) {
        drawStroke(layer, stroke);
        drawnRef.current = { ...drawnRef.current, strokes: next };
      }
      commit(next, current);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (gestureRef.current) return; // 두 번째 손가락·손바닥은 무시
      if (e.pointerType === 'pen' && !penEverDetected) { penEverDetected = true; setPenSeen(true); }
      const p = propsRef.current;
      if (e.pointerType === 'touch' && penEverDetected && p.penOnlyWhenPenDetected !== false) {
        // 손가락은 그리지 않고 직접 스크롤한다. 캔버스 touch-action을 pan으로 두면 iPad Safari가
        // 애플펜슬 획까지 스크롤로 가로채 획이 0.5초 만에 끊겼다 — 그래서 touch-action은 항상 none.
        e.preventDefault();
        try { canvas.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
        gestureRef.current = { kind: 'pan', pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY, scroller: scrollParentOf(canvas) };
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      rect = canvas.getBoundingClientRect();
      try { canvas.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
      const start = e.timeStamp;
      if (p.tool === 'eraser') {
        const pt = toPoint(e, start);
        const g: EraseGesture = { kind: 'erase', pointerId: e.pointerId, before: p.strokes, working: p.strokes, last: pt, recorded: false };
        gestureRef.current = g;
        eraseAlong(g, pt);
        scheduleLive();
        return;
      }
      const first = toPoint(e, start);
      if (p.tool === 'laser') {
        // 레이저는 저장·실행 취소·재생 기록 없이 빛만 그리고 사라진다(도형 판정도 하지 않는다).
        const trail: LaserTrail = { points: [{ x: first.x, y: first.y }], endedAt: null };
        laserTrailsRef.current = [...laserTrailsRef.current, trail];
        gestureRef.current = { kind: 'laser', pointerId: e.pointerId, trail };
        scheduleLaser();
        return;
      }
      const g: DrawGesture = {
        kind: 'draw', pointerId: e.pointerId, tool: p.tool, color: p.color, size: p.size,
        points: [first], predicted: [], startTime: start,
        arrivals: [performance.now()], holdTimer: null, holdTried: -1, snap: null,
      };
      gestureRef.current = g;
      setLiveHighlighter(p.tool === 'highlighter');
      armHold(g);
      scheduleLive();
    };

    const eraseAlong = (g: EraseGesture, to: Pt) => {
      const w = unit();
      const hits = strokesHitAlong(g.working, g.last, to, ERASER_RADIUS_PX / w);
      g.last = to;
      if (!hits.length) return;
      const remove = new Set(hits);
      g.working = g.working.filter(s => !remove.has(s.id));
      if (!g.recorded) { historyRef.current = recordChange(historyRef.current, g.before); g.recorded = true; }
      propsRef.current.onChange(g.working, 'erase');
    };

    const onPointerMove = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      e.preventDefault();
      if (g.kind === 'pan') {
        g.scroller?.scrollBy(g.lastX - e.clientX, g.lastY - e.clientY);
        g.lastX = e.clientX; g.lastY = e.clientY;
        return;
      }
      if (g.kind === 'erase') {
        for (const ev of eventsOf(e)) eraseAlong(g, toPoint(ev, 0));
        scheduleLive();
        return;
      }
      const w = unit();
      if (g.kind === 'laser') {
        const pts = g.trail.points;
        for (const ev of eventsOf(e)) {
          const pt = toPoint(ev, 0);
          const prev = pts[pts.length - 1];
          if (Math.hypot(pt.x - prev.x, pt.y - prev.y) * w < 0.35) continue;
          pts.push({ x: pt.x, y: pt.y });
        }
        scheduleLaser();
        return;
      }
      if (g.snap) {
        const last = toPoint(e, g.startTime);
        g.points.push(last);
        g.snap.current = resizeShape(g.snap.base, g.snap.anchor, last);
        scheduleLive();
        return;
      }
      const arrived = performance.now();
      for (const ev of eventsOf(e)) {
        const pt = toPoint(ev, g.startTime);
        const prev = g.points[g.points.length - 1];
        if (Math.hypot(pt.x - prev.x, pt.y - prev.y) * w < 0.35) continue; // 같은 자리 중복점
        g.points.push(pt);
        g.arrivals.push(arrived);
      }
      // 떨림 점이 계속 들어오는 동안에도 판정(타이머가 늦게 돌 때 대비)
      if (g.holdTimer !== null) checkHold(g);
      if (g.snap) { scheduleLive(); return; }
      const predicted = typeof e.getPredictedEvents === 'function' ? e.getPredictedEvents() : [];
      g.predicted = predicted.slice(0, 2).map(ev => toPoint(ev, g.startTime));
      scheduleLive();
    };

    const onPointerUp = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      gestureRef.current = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* 이미 해제됨 */ }
      if (g.kind === 'draw') {
        g.predicted = [];
        finishDraw(g);
      } else if (g.kind === 'laser') {
        g.trail.endedAt = performance.now();
        scheduleLaser();
      }
      setLiveHighlighter(false);
      scheduleLive();
    };

    const onPointerCancel = (e: PointerEvent) => {
      const g = gestureRef.current;
      if (!g || e.pointerId !== g.pointerId) return;
      gestureRef.current = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* 이미 해제됨 */ }
      // 지우개는 이미 반영된 상태로 둔다(실행 취소 가능). 그리던 획은 버리지 않고 확정한다 — iPad Safari는 펜을
      // 오래 누르고 있으면(꾹 눌러 도형) 시스템 제스처로 pointercancel을 보내기도 해, 버리면 획·도형이 통째로 사라진다.
      if (g.kind === 'draw') {
        g.predicted = [];
        if (g.snap || g.points.length > 1) finishDraw(g);
        else clearHold(g);
      } else if (g.kind === 'laser') {
        g.trail.endedAt = performance.now();
        scheduleLaser();
      }
      setLiveHighlighter(false);
      scheduleLive();
    };

    // iOS: 애플펜슬 터치는 스크롤이 되지 않게 막고, 손가락은 그대로 스크롤.
    const onTouch = (e: TouchEvent) => {
      const stylus = Array.from(e.changedTouches).some(t => (t as Touch & { touchType?: string }).touchType === 'stylus');
      const p = propsRef.current;
      const fingerDraws = !(penEverDetected && p.penOnlyWhenPenDetected !== false);
      if (stylus || (fingerDraws && e.cancelable)) e.preventDefault();
    };
    const onContextMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('lostpointercapture', onPointerUp);
    canvas.addEventListener('touchstart', onTouch, { passive: false });
    canvas.addEventListener('touchmove', onTouch, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('lostpointercapture', onPointerUp);
      canvas.removeEventListener('touchstart', onTouch);
      canvas.removeEventListener('touchmove', onTouch);
      canvas.removeEventListener('contextmenu', onContextMenu);
      const g = gestureRef.current;
      if (g?.kind === 'draw') clearHold(g);
      gestureRef.current = null;
    };
  }, [readOnly, commit, scheduleLive, scheduleLaser]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (laserRafRef.current) cancelAnimationFrame(laserRafRef.current);
  }, []);

  // 손가락 스크롤은 pan 제스처가 직접 처리한다(touch-action pan은 iPad에서 펜 획을 끊었다).
  const touchAction = readOnly ? 'auto' : 'none';
  const highlighterLayer: CSSProperties = { ...CANVAS_STYLE, opacity: HIGHLIGHTER_OPACITY, mixBlendMode: 'multiply', pointerEvents: 'none' };

  return (
    <div
      ref={wrapRef}
      className="exam-ink"
      data-ready={cssWidth > 0 && aspect > 0 ? 'true' : 'false'}
      data-pen-detected={penSeen ? 'true' : 'false'}
      data-stroke-count={strokes.length}
      style={{ position: 'relative', width: '100%', background: '#fff', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as CSSProperties}
    >
      <img
        ref={imgRef}
        src={imageUrl}
        alt="문항"
        draggable={false}
        onLoad={onImageLoad}
        style={{ display: 'block', width: imgW || '100%', maxWidth: '100%', height: imgW && aspect ? imgW * aspect : 'auto', pointerEvents: 'none', background: '#fff' }}
      />
      {/* 문항 아래 빈 공간에도 쓸 수 있게 여백(이미지 높이의 60%, 최소 너비의 절반) */}
      <div aria-hidden style={{ height: extraHeight }} />
      <canvas ref={highlightRef} aria-hidden style={highlighterLayer} />
      <canvas ref={penRef} aria-hidden style={{ ...CANVAS_STYLE, pointerEvents: 'none' }} />
      <canvas ref={laserRef} className="exam-ink-laser" aria-hidden style={{ ...CANVAS_STYLE, pointerEvents: 'none' }} />
      <canvas
        ref={liveRef}
        className="exam-ink-input"
        aria-label={readOnly ? '필기 보기' : '필기 영역'}
        style={{
          ...CANVAS_STYLE,
          touchAction,
          pointerEvents: readOnly ? 'none' : 'auto',
          cursor: readOnly ? 'default' : 'crosshair',
          ...(liveHighlighter ? { opacity: HIGHLIGHTER_OPACITY, mixBlendMode: 'multiply' as const } : null),
        }}
      />
    </div>
  );
});

