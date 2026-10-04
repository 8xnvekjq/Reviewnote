import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { aspectCache } from './inkImages.ts';
import type { LaserTrail } from './inkLaser.ts';
import type { Pt, SnapShape } from './shapeSnap.ts';
import { MULTI_TAP_SPREAD_MS, MultiFingerTap } from './multiTap.ts';
import type { MultiTapAction } from './multiTap.ts';
import {
  IDENTITY, frameCorners, frameOf, hitFrame, isIdentity, lassoSelect, moveTransform, rotateHandle, rotateTransform, scaleTransform,
  transformFrame, transformSelection,
} from './lasso.ts';
import type { FrameHit, LassoFrame, Similarity } from './lasso.ts';

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
/** 올가미 선택 테두리(CSS px): 획에서 띄우는 여백, 모서리 손잡이·회전 아이콘 크기와 누를 수 있는 반지름(지름 ≥ 32px). */
const SELECT_PAD_PX = 8;
const HANDLE_PX = 11;
const HANDLE_HIT_PX = 18;
const ROTATE_RADIUS_PX = 12;
const ROTATE_OFFSET_PX = 12;
const MOVE_INSET_PX = 6;
/** 줄였을 때 선택 테두리 반변의 최소 길이(CSS px). */
const SELECT_MIN_HALF_PX = 10;
const SELECT_COLOR = '#f2b230';
/** 올가미를 이보다 짧게 그으면(사실상 탭) 선택 없이 해제만. */
const LASSO_MIN_PX = 12;

/** 펜이 한 번이라도 감지되면 이후(문항을 옮겨 다시 마운트돼도) 손가락은 그리지 않는다. */
let penEverDetected = false;

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
/** 올가미를 그리는 중. */
interface LassoGesture {
  kind: 'lasso';
  pointerId: number;
  path: Pt[];
}
/** 선택 영역을 옮기기·확대·회전하는 중(떼면 확정). */
interface SelectGesture {
  kind: 'select';
  pointerId: number;
  hit: FrameHit;
  start: Pt;
  transform: Similarity;
}
type Gesture = (DrawGesture | EraseGesture | PanGesture | LaserGesture | LassoGesture | SelectGesture) & { touch?: boolean };
/** 올가미로 고른 획(원본 객체)과 감싸는 테두리. 확정 레이어에서는 숨기고 선택 레이어에 그린다. */
interface Selection { ids: string[]; strokes: InkStroke[]; frame: LassoFrame }


const CANVAS_STYLE: CSSProperties = { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', display: 'block' };
const TAP_NOTICE_STYLE: CSSProperties = {
  position: 'fixed', left: '50%', bottom: 96, transform: 'translateX(-50%)', zIndex: 50, pointerEvents: 'none',
  padding: '6px 14px', borderRadius: 999, background: 'rgba(17, 24, 39, .82)', color: '#fff', fontSize: 14, fontWeight: 600,
};

export const ExamInkCanvas = forwardRef<ExamInkCanvasHandle, ExamInkCanvasProps>(function ExamInkCanvas(props, ref) {
  const { imageUrl, strokes, readOnly = false, imageMaxWidth, fitToInk } = props;
  const wrapRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLCanvasElement>(null);
  const penRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const laserRef = useRef<HTMLCanvasElement>(null);
  const selHighlightRef = useRef<HTMLCanvasElement>(null);
  const selPenRef = useRef<HTMLCanvasElement>(null);
  const [cssWidth, setCssWidth] = useState(0);
  const [aspectState, setAspect] = useState(() => aspectCache.get(imageUrl) ?? 0);
  // naturalHeight / naturalWidth. A preloaded image's ratio is known before its <img> loads, even when imageUrl changes in place.
  const aspect = aspectCache.get(imageUrl) ?? aspectState;
  /** 지금 <img>가 그리고 있는 주소. 이미지가 뜨기 전에 필기만 떠 있지 않게, 다를 때는 확정 획 레이어를 숨긴다. */
  const [paintedUrl, setPaintedUrl] = useState<string | null>(null);
  const imgElRef = useRef<HTMLImageElement | null>(null);
  const [dprWanted, setDprWanted] = useState(() => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1));
  const [penSeen, setPenSeen] = useState(penEverDetected);
  const [liveHighlighter, setLiveHighlighter] = useState(false);
  /** 올가미로 고른 획 id(확정 레이어에서 숨긴다). */
  const [hidden, setHidden] = useState<ReadonlySet<string> | null>(null);
  /** 두·세 손가락 두 번 탭 알림(잠깐 보였다 사라진다). */
  const [tapNotice, setTapNotice] = useState<{ action: MultiTapAction; at: number } | null>(null);

  // 정규화 기준(1) = 실제로 보이는 이미지 너비. 필기 영역(캔버스)은 컨테이너 전체 너비.
  // fitToInk(읽기 전용)가 있으면 필기 오른쪽 끝까지 보이도록 이미지를 줄이고, 아래로 쓴 필기만큼 여백을 늘린다.
  const imgW = fitImageWidth(cssWidth, imageMaxWidth, fitToInk);
  const imageHeight = imgW * aspect;
  const extraHeight = imgW * fitExtraBelow(aspect, fitToInk);
  const cssHeight = imageHeight + extraHeight;
  const dpr = safeDpr(cssWidth, cssHeight, dprWanted);
  const geomRef = useRef({ cssWidth, cssHeight, imgW });
  geomRef.current = { cssWidth, cssHeight, imgW };
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
  const selectionRef = useRef<Selection | null>(null);
  const selRafRef = useRef(0);
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
    setPaintedUrl(img.getAttribute('src'));
  }, []);
  const onImageError = useCallback((event: SyntheticEvent<HTMLImageElement>) => setPaintedUrl(event.currentTarget.getAttribute('src')), []);
  const imgRef = useCallback((img: HTMLImageElement | null) => {
    imgElRef.current = img;
    if (img?.complete && img.naturalWidth) { setAspect(img.naturalHeight / img.naturalWidth); setPaintedUrl(img.getAttribute('src')); }
  }, []);
  // Same element, new src (read-only Live cells): a cached, decoded image is complete immediately.
  useLayoutEffect(() => {
    const img = imgElRef.current;
    if (img?.complete && img.naturalWidth && img.getAttribute('src') === imageUrl) setPaintedUrl(imageUrl);
  }, [imageUrl]);
  const imagePainted = paintedUrl === imageUrl;

  // ── 확정 획 렌더(형광펜 레이어 + 펜 레이어). 끝에 덧붙인 획만 있으면 그 획만 더 그린다. ──
  // 올가미로 고른 획은 여기서 빼고 선택 레이어(변환 미리보기 포함)에 그린다.
  const visibleStrokes = useMemo(() => (hidden ? props.strokes.filter(s => !hidden.has(s.id)) : props.strokes), [props.strokes, hidden]);
  useLayoutEffect(() => {
    const strokes = visibleStrokes;
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
  }, [visibleStrokes, cssWidth, cssHeight, dpr, imgW]);

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
    if (!g || g.kind === 'pan' || g.kind === 'laser' || g.kind === 'select') return;
    const REF = INK_REFERENCE_WIDTH;
    if (g.kind === 'lasso') {
      const px = REF / (geomRef.current.imgW || wrap.clientWidth || 1);
      ctx.beginPath();
      g.path.forEach((p, i) => (i ? ctx.lineTo(p.x * REF, p.y * REF) : ctx.moveTo(p.x * REF, p.y * REF)));
      ctx.fillStyle = 'rgba(242, 178, 48, .08)';
      ctx.fill();
      ctx.setLineDash([6 * px, 4 * px]);
      ctx.lineWidth = 1.5 * px;
      ctx.strokeStyle = '#d99a12';
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
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

  // ── 올가미 선택(두 레이어: 형광펜은 형광펜 레이어 모양 그대로) + 점선 테두리·모서리 손잡이·회전 아이콘 ──
  const renderSelection = useCallback(() => {
    selRafRef.current = 0;
    const hl = selHighlightRef.current, pen = selPenRef.current;
    if (!hl || !pen) return;
    const hctx = hl.getContext('2d'), pctx = pen.getContext('2d');
    if (!hctx || !pctx) return;
    resetTransform(hctx, hl, unitDevicePx(hl));
    resetTransform(pctx, pen, unitDevicePx(pen));
    const sel = selectionRef.current;
    if (!sel) return;
    const g = gestureRef.current;
    const m = g?.kind === 'select' ? g.transform : IDENTITY;
    const REF = INK_REFERENCE_WIDTH;
    // 미리보기는 캔버스 변환으로(획 모양 캐시를 그대로 써서 끌 때도 가볍다). 손을 떼면 좌표를 바꾼 새 획으로 확정한다.
    const cos = Math.cos(m.angle) * m.k, sin = Math.sin(m.angle) * m.k;
    for (const [ctx, layer] of [[hctx, 'highlighter'], [pctx, 'pen']] as const) {
      ctx.save();
      ctx.transform(cos, sin, -sin, cos, m.tx * REF, m.ty * REF);
      for (const s of sel.strokes) if (s.tool === layer) drawStroke(ctx, s);
      ctx.restore();
    }
    const px = REF / (geomRef.current.imgW || 1);
    const frame = transformFrame(sel.frame, m);
    const corners = frameCorners(frame);
    pctx.save();
    pctx.beginPath();
    corners.forEach((c, i) => (i ? pctx.lineTo(c.x * REF, c.y * REF) : pctx.moveTo(c.x * REF, c.y * REF)));
    pctx.closePath();
    pctx.lineWidth = 1.5 * px;
    pctx.strokeStyle = SELECT_COLOR;
    pctx.setLineDash([7 * px, 5 * px]);
    pctx.stroke();
    pctx.setLineDash([]);
    pctx.lineWidth = 1 * px;
    pctx.strokeStyle = '#7a5a12';
    for (const c of corners) {
      pctx.save();
      pctx.translate(c.x * REF, c.y * REF);
      pctx.rotate(frame.angle);
      pctx.fillStyle = SELECT_COLOR;
      pctx.fillRect(-HANDLE_PX / 2 * px, -HANDLE_PX / 2 * px, HANDLE_PX * px, HANDLE_PX * px);
      pctx.strokeRect(-HANDLE_PX / 2 * px, -HANDLE_PX / 2 * px, HANDLE_PX * px, HANDLE_PX * px);
      pctx.restore();
    }
    // 회전 아이콘: 오른쪽 변 가운데에 붙은 동그라미 + 도는 화살표 두 개
    const r = rotateHandle(frame, ROTATE_OFFSET_PX / (geomRef.current.imgW || 1));
    pctx.translate(r.x * REF, r.y * REF);
    pctx.rotate(frame.angle);
    pctx.beginPath();
    pctx.arc(0, 0, ROTATE_RADIUS_PX * px, 0, Math.PI * 2);
    pctx.fillStyle = SELECT_COLOR;
    pctx.fill();
    pctx.stroke();
    pctx.strokeStyle = '#3b2a05';
    pctx.fillStyle = '#3b2a05';
    pctx.lineWidth = 1.6 * px;
    const ar = 6 * px;
    for (const start of [-Math.PI * 0.95, Math.PI * 0.05]) {
      pctx.beginPath();
      pctx.arc(0, 0, ar, start, start + Math.PI * 0.7);
      pctx.stroke();
      const tip = start + Math.PI * 0.7;
      const tx = Math.cos(tip) * ar, ty = Math.sin(tip) * ar;
      const along = { x: -Math.sin(tip), y: Math.cos(tip) }; // 화살표 진행 방향
      const out = { x: Math.cos(tip), y: Math.sin(tip) };
      const h = 2.6 * px;
      pctx.beginPath();
      pctx.moveTo(tx + along.x * h, ty + along.y * h);
      pctx.lineTo(tx + out.x * h, ty + out.y * h);
      pctx.lineTo(tx - out.x * h, ty - out.y * h);
      pctx.closePath();
      pctx.fill();
    }
    pctx.restore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const scheduleSelection = useCallback(() => {
    if (!selRafRef.current) selRafRef.current = requestAnimationFrame(renderSelection);
  }, [renderSelection]);

  useLayoutEffect(() => {
    const live = liveRef.current, laser = laserRef.current, selHl = selHighlightRef.current, selPen = selPenRef.current;
    if (!live || !laser || !selHl || !selPen || !cssWidth || !cssHeight) return;
    prepareCanvas(live, cssWidth, cssHeight, dpr);
    prepareCanvas(laser, cssWidth, cssHeight, dpr);
    prepareCanvas(selHl, cssWidth, cssHeight, dpr);
    prepareCanvas(selPen, cssWidth, cssHeight, dpr);
    renderLive();
    renderLaser();
    renderSelection();
  }, [cssWidth, cssHeight, dpr, imgW, renderLive, renderLaser, renderSelection]);

  /** 선택을 바꾼다(null이면 해제). 확정 레이어에서 숨길 획도 함께. */
  const setSelection = useCallback((sel: Selection | null) => {
    selectionRef.current = sel;
    setHidden(sel ? new Set(sel.ids) : null);
    scheduleSelection();
  }, [scheduleSelection]);

  // 다른 도구로 바꾸거나 보기 전용이 되면 선택 해제.
  useEffect(() => {
    if ((props.tool !== 'lasso' || readOnly) && selectionRef.current) setSelection(null);
  }, [props.tool, readOnly, setSelection]);
  // 실행 취소·지우기 등으로 고른 획이 사라지면 선택 해제.
  useEffect(() => {
    const sel = selectionRef.current;
    if (!sel) return;
    const present = new Set(props.strokes.map(s => s.id));
    if (!sel.ids.every(id => present.has(id))) setSelection(null);
  }, [props.strokes, setSelection]);

  // ── 변경 + 실행 취소 기록 ──
  const commit = useCallback((next: InkStroke[], before: InkStroke[]) => {
    historyRef.current = recordChange(historyRef.current, before);
    propsRef.current.onChange(next, next.length === 0 ? 'clear' : 'draw');
  }, []);

  /** 실행 취소/다시 실행. 그리는 중이면 하지 않는다. 했으면 true. */
  const stepHistory = useCallback((action: MultiTapAction) => {
    if (gestureRef.current) return false;
    const result = (action === 'undo' ? undoHistory : redoHistory)(historyRef.current, propsRef.current.strokes);
    if (!result) return false;
    historyRef.current = result.history;
    propsRef.current.onChange(result.strokes, action);
    return true;
  }, []);

  useImperativeHandle(ref, () => ({
    undo() { stepHistory('undo'); },
    redo() { stepHistory('redo'); },
    clear() {
      if (gestureRef.current) return;
      const current = propsRef.current.strokes;
      if (!current.length) return;
      commit([], current);
    },
    canUndo: () => historyRef.current.past.length > 0,
    canRedo: () => historyRef.current.future.length > 0,
  }), [commit, stepHistory]);

  // ── 입력 ──
  useEffect(() => {
    const canvas = liveRef.current;
    if (!canvas || readOnly) return;
    let rect = canvas.getBoundingClientRect();
    /** 두·세 손가락 탭 판정(손가락만 넣는다). */
    const taps = new MultiFingerTap();
    /** 지금 제스처가 시작된 시각(e.timeStamp). */
    let gestureStartedAt = 0;

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

    /** 손가락 하나로 시작한 일을 없던 일로(두 번째 손가락이 닿아 다지 제스처가 됐을 때). */
    const abortGesture = (g: Gesture) => {
      gestureRef.current = null;
      try { canvas.releasePointerCapture(g.pointerId); } catch { /* 이미 해제됨 */ }
      if (g.kind === 'draw') clearHold(g);
      else if (g.kind === 'laser') { g.trail.endedAt = performance.now(); scheduleLaser(); }
      else if (g.kind === 'select') scheduleSelection();
      else if (g.kind === 'erase' && g.recorded) {
        // 그 사이 지운 획을 되살리고 기록도 되돌린다.
        const past = historyRef.current.past;
        historyRef.current = { past: past.slice(0, -1), future: historyRef.current.future };
        propsRef.current.onChange(g.before, 'undo');
      }
      setLiveHighlighter(false);
      scheduleLive();
    };

    /** 올가미 도구: 선택 테두리(손잡이 포함)를 눌렀으면 조작을 시작한다. */
    const startSelectGesture = (e: PointerEvent, touch: boolean): boolean => {
      const sel = selectionRef.current;
      if (!sel || propsRef.current.tool !== 'lasso') return false;
      rect = canvas.getBoundingClientRect();
      const w = unit();
      const pt = toPoint(e, 0);
      const hit = hitFrame(sel.frame, pt, HANDLE_HIT_PX / w, ROTATE_OFFSET_PX / w, MOVE_INSET_PX / w);
      if (!hit) return false;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
      gestureRef.current = { kind: 'select', pointerId: e.pointerId, hit, start: pt, transform: IDENTITY, touch };
      return true;
    };

    const onPointerDown = (e: PointerEvent) => {
      const touch = e.pointerType === 'touch';
      if (touch) {
        const fingers = taps.down(e.pointerId, e.clientX, e.clientY, e.timeStamp);
        const g = gestureRef.current;
        if (g && !g.touch) taps.invalidate(); // 펜·마우스로 쓰는 중에 닿은 손(손바닥)은 탭이 아니다
        if (fingers >= 2 || taps.multi) {
          // 두·세 손가락: 첫 손가락으로 시작한 획·스크롤·조작은 취소하고, 다 뗄 때까지 아무것도 하지 않는다.
          if (e.cancelable) e.preventDefault();
          // 막 시작한 것(탭일 수 있는 시간 안)은 없던 일로, 이미 한참 쓰던 획 등은 지금까지의 결과로 확정한다.
          if (g?.touch) {
            if (e.timeStamp - gestureStartedAt <= MULTI_TAP_SPREAD_MS) abortGesture(g);
            else settleGesture(g);
          }
          return;
        }
      } else if (e.pointerType === 'pen') {
        taps.invalidate();
      }
      if (gestureRef.current) return; // 두 번째 입력·손바닥은 무시
      gestureStartedAt = e.timeStamp;
      if (e.pointerType === 'pen' && !penEverDetected) { penEverDetected = true; setPenSeen(true); }
      const p = propsRef.current;
      if (touch && penEverDetected && p.penOnlyWhenPenDetected !== false) {
        // 올가미 선택 테두리 위의 손가락은 옮기기·확대·회전, 그 밖은 스크롤.
        if (startSelectGesture(e, true)) return;
        // 손가락은 그리지 않고 직접 스크롤한다. 캔버스 touch-action을 pan으로 두면 iPad Safari가
        // 애플펜슬 획까지 스크롤로 가로채 획이 0.5초 만에 끊겼다 — 그래서 touch-action은 항상 none.
        e.preventDefault();
        try { canvas.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
        gestureRef.current = { kind: 'pan', pointerId: e.pointerId, lastX: e.clientX, lastY: e.clientY, scroller: scrollParentOf(canvas), touch };
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (p.tool === 'lasso' && startSelectGesture(e, touch)) return;
      e.preventDefault();
      rect = canvas.getBoundingClientRect();
      try { canvas.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
      const start = e.timeStamp;
      if (p.tool === 'lasso') {
        // 선택 밖을 누르면 지금 선택은 풀고 새 올가미를 그린다(그냥 탭이면 해제만).
        if (selectionRef.current) setSelection(null);
        gestureRef.current = { kind: 'lasso', pointerId: e.pointerId, path: [toPoint(e, start)], touch };
        scheduleLive();
        return;
      }
      if (p.tool === 'eraser') {
        const pt = toPoint(e, start);
        const g: EraseGesture = { kind: 'erase', pointerId: e.pointerId, before: p.strokes, working: p.strokes, last: pt, recorded: false };
        gestureRef.current = Object.assign(g, { touch });
        eraseAlong(g, pt);
        scheduleLive();
        return;
      }
      const first = toPoint(e, start);
      if (p.tool === 'laser') {
        // 레이저는 저장·실행 취소·재생 기록 없이 빛만 그리고 사라진다(도형 판정도 하지 않는다).
        const trail: LaserTrail = { points: [{ x: first.x, y: first.y }], endedAt: null };
        laserTrailsRef.current = [...laserTrailsRef.current, trail];
        gestureRef.current = { kind: 'laser', pointerId: e.pointerId, trail, touch };
        scheduleLaser();
        return;
      }
      const g: DrawGesture = {
        kind: 'draw', pointerId: e.pointerId, tool: p.tool, color: p.color, size: p.size,
        points: [first], predicted: [], startTime: start,
        arrivals: [performance.now()], holdTimer: null, holdTried: -1, snap: null,
      };
      gestureRef.current = Object.assign(g, { touch });
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
      if (e.pointerType === 'touch') {
        taps.move(e.pointerId, e.clientX, e.clientY);
        if (taps.multi) { if (e.cancelable) e.preventDefault(); return; }
      }
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
      if (g.kind === 'lasso') {
        for (const ev of eventsOf(e)) {
          const pt = toPoint(ev, 0);
          const prev = g.path[g.path.length - 1];
          if (Math.hypot(pt.x - prev.x, pt.y - prev.y) * w < 2) continue;
          g.path.push({ x: pt.x, y: pt.y });
        }
        scheduleLive();
        return;
      }
      if (g.kind === 'select') {
        const sel = selectionRef.current;
        if (!sel) return;
        const pt = toPoint(e, 0);
        const geom = geomRef.current;
        if (g.hit.kind === 'move') g.transform = moveTransform(sel.frame, pt.x - g.start.x, pt.y - g.start.y, geom.cssWidth / w, geom.cssHeight / w);
        else if (g.hit.kind === 'corner') g.transform = scaleTransform(sel.frame, g.hit.index, pt, SELECT_MIN_HALF_PX / w);
        else g.transform = rotateTransform(sel.frame, g.start, pt);
        scheduleSelection();
        return;
      }
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

    /** 올가미를 다 그렸다: 절반 이상 들어간 획을 고른다. 거의 움직이지 않았으면(탭) 선택 없음. */
    const finishLasso = (g: LassoGesture) => {
      let len = 0;
      for (let i = 1; i < g.path.length; i++) len += Math.hypot(g.path[i].x - g.path[i - 1].x, g.path[i].y - g.path[i - 1].y);
      const w = unit();
      if (len * w < LASSO_MIN_PX) return;
      const current = propsRef.current.strokes;
      const ids = new Set(lassoSelect(current, g.path));
      if (!ids.size) return;
      const strokes = current.filter(s => ids.has(s.id));
      const frame = frameOf(strokes, SELECT_PAD_PX / w);
      if (frame) setSelection({ ids: strokes.map(s => s.id), strokes, frame });
    };

    /** 옮기기·확대·회전을 놓았다: 고른 획을 새 id의 변환된 획으로 바꿔 확정(실행 취소 1단계). 선택은 이어진다. */
    const finishSelect = (g: SelectGesture) => {
      const sel = selectionRef.current;
      if (!sel || isIdentity(g.transform)) { scheduleSelection(); return; }
      const current = propsRef.current.strokes;
      const result = transformSelection(current, sel.ids, g.transform, newStrokeId);
      const ids = new Set(result.ids);
      setSelection({ ids: result.ids, strokes: result.strokes.filter(s => ids.has(s.id)), frame: transformFrame(sel.frame, g.transform) });
      commit(result.strokes, current);
    };

    const runTapAction = (action: MultiTapAction) => {
      if (!stepHistory(action)) return;
      navigator.vibrate?.(10);
      setTapNotice({ action, at: performance.now() });
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && e.type === 'pointerup') {
        const action = taps.up(e.pointerId, e.timeStamp);
        if (action) { runTapAction(action); return; }
      }
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
      } else if (g.kind === 'lasso') {
        finishLasso(g);
      } else if (g.kind === 'select') {
        finishSelect(g);
      }
      setLiveHighlighter(false);
      scheduleLive();
    };

    /** 제스처를 지금까지의 결과로 끝낸다(pointercancel 등). */
    const settleGesture = (g: Gesture) => {
      gestureRef.current = null;
      try { canvas.releasePointerCapture(g.pointerId); } catch { /* 이미 해제됨 */ }
      // 지우개는 이미 반영된 상태로 둔다(실행 취소 가능). 그리던 획은 버리지 않고 확정한다 — iPad Safari는 펜을
      // 오래 누르고 있으면(꾹 눌러 도형) 시스템 제스처로 pointercancel을 보내기도 해, 버리면 획·도형이 통째로 사라진다.
      // 올가미·선택 조작도 같은 이유로 그때까지의 결과를 확정한다.
      if (g.kind === 'draw') {
        g.predicted = [];
        if (g.snap || g.points.length > 1) finishDraw(g);
        else clearHold(g);
      } else if (g.kind === 'laser') {
        g.trail.endedAt = performance.now();
        scheduleLaser();
      } else if (g.kind === 'lasso') {
        finishLasso(g);
      } else if (g.kind === 'select') {
        finishSelect(g);
      }
      setLiveHighlighter(false);
      scheduleLive();
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (e.pointerType === 'touch') taps.cancel(e.pointerId);
      const g = gestureRef.current;
      if (g && e.pointerId === g.pointerId) settleGesture(g);
    };

    // iOS: 애플펜슬 터치는 스크롤이 되지 않게 막고, 손가락은 그대로 스크롤. 두 손가락 이상은 브라우저 확대·스크롤을 막는다
    // (두·세 손가락 탭 = 실행 취소·다시 실행).
    const onTouch = (e: TouchEvent) => {
      const stylus = Array.from(e.changedTouches).some(t => (t as Touch & { touchType?: string }).touchType === 'stylus');
      const p = propsRef.current;
      const fingerDraws = !(penEverDetected && p.penOnlyWhenPenDetected !== false);
      if (stylus || ((fingerDraws || e.touches.length >= 2) && e.cancelable)) e.preventDefault();
    };
    /** iPad Safari 핀치 확대(비표준 gesture 이벤트). */
    const onGesture = (e: Event) => e.preventDefault();
    const onContextMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('lostpointercapture', onPointerUp);
    canvas.addEventListener('touchstart', onTouch, { passive: false });
    canvas.addEventListener('touchmove', onTouch, { passive: false });
    canvas.addEventListener('gesturestart', onGesture);
    canvas.addEventListener('contextmenu', onContextMenu);
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('lostpointercapture', onPointerUp);
      canvas.removeEventListener('touchstart', onTouch);
      canvas.removeEventListener('touchmove', onTouch);
      canvas.removeEventListener('gesturestart', onGesture);
      canvas.removeEventListener('contextmenu', onContextMenu);
      const g = gestureRef.current;
      if (g?.kind === 'draw') clearHold(g);
      gestureRef.current = null;
    };
  }, [readOnly, commit, scheduleLive, scheduleLaser, scheduleSelection, setSelection, stepHistory]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (laserRafRef.current) cancelAnimationFrame(laserRafRef.current);
    if (selRafRef.current) cancelAnimationFrame(selRafRef.current);
  }, []);

  // 두·세 손가락 탭 알림은 잠깐만.
  useEffect(() => {
    if (!tapNotice) return;
    const timer = window.setTimeout(() => setTapNotice(null), 700);
    return () => window.clearTimeout(timer);
  }, [tapNotice]);

  // 손가락 스크롤은 pan 제스처가 직접 처리한다(touch-action pan은 iPad에서 펜 획을 끊었다).
  const touchAction = readOnly ? 'auto' : 'none';
  const strokeVisibility = imagePainted ? 'visible' : 'hidden';
  const highlighterLayer: CSSProperties = { ...CANVAS_STYLE, opacity: HIGHLIGHTER_OPACITY, mixBlendMode: 'multiply', pointerEvents: 'none', visibility: strokeVisibility };

  return (
    <div
      ref={wrapRef}
      className="exam-ink"
      data-ready={cssWidth > 0 && aspect > 0 ? 'true' : 'false'}
      data-pen-detected={penSeen ? 'true' : 'false'}
      data-stroke-count={strokes.length}
      data-image-painted={imagePainted ? 'true' : 'false'}
      data-selected={hidden?.size ?? 0}
      style={{ position: 'relative', width: '100%', background: '#fff', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as CSSProperties}
    >
      <img
        ref={imgRef}
        src={imageUrl}
        alt="문항"
        draggable={false}
        onLoad={onImageLoad}
        onError={onImageError}
        style={{ display: 'block', width: imgW || '100%', maxWidth: '100%', height: imgW && aspect ? imgW * aspect : 'auto', pointerEvents: 'none', background: '#fff' }}
      />
      {/* 문항 아래 빈 공간에도 쓸 수 있게 여백(이미지 높이의 60%, 최소 너비의 절반) */}
      <div aria-hidden style={{ height: extraHeight }} />
      <canvas ref={highlightRef} aria-hidden style={highlighterLayer} />
      <canvas ref={penRef} aria-hidden style={{ ...CANVAS_STYLE, pointerEvents: 'none', visibility: strokeVisibility }} />
      {/* 올가미로 고른 획(옮기는 중 미리보기 포함)과 선택 테두리 */}
      <canvas ref={selHighlightRef} aria-hidden style={highlighterLayer} />
      <canvas ref={selPenRef} className="exam-ink-selection" aria-hidden style={{ ...CANVAS_STYLE, pointerEvents: 'none', visibility: strokeVisibility }} />
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
      {tapNotice && (
        <div key={tapNotice.at} className="exam-ink-tap-notice" role="status" style={TAP_NOTICE_STYLE}>
          {tapNotice.action === 'undo' ? '↶ 실행 취소' : '↷ 다시 실행'}
        </div>
      )}
    </div>
  );
});

