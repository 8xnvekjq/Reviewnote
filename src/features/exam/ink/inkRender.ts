// 캔버스 그리기. 모든 경로는 "기준 공간"(정규화 좌표 × INK_REFERENCE_WIDTH)에서 만들고
// 캔버스 변환으로 화면 크기·devicePixelRatio에 맞춘다 → 리사이즈해도 Path2D 캐시를 그대로 쓴다.
import { getStroke } from 'perfect-freehand';
import type { StrokeOptions } from 'perfect-freehand';
import type { InkPoint, InkStroke } from '../contract.ts';
import { INK_REFERENCE_WIDTH, strokeWidth, usesSimulatedPressure } from './inkModel.ts';
import { curveSegments } from './shapeSnap.ts';

const REF = INK_REFERENCE_WIDTH;

type Shape = NonNullable<InkStroke['shape']>;
type Drawable = { path: Path2D; mode: 'fill' | 'stroke'; width: number };

const easeOutSine = (t: number) => Math.sin((t * Math.PI) / 2);

export function freehandOptions(tool: InkStroke['tool'], width: number, simulated: boolean, last: boolean): StrokeOptions {
  if (tool === 'highlighter') {
    return { size: width, thinning: 0, smoothing: 0.6, streamline: 0.45, simulatePressure: false, last, start: { cap: true }, end: { cap: true } };
  }
  // 실제 펜: 필압에 따른 굵기 변화(thinning)를 줄이고 떨림을 조금 더 걸러 낸다 — 애플펜슬은 필압·위치가
  // 많이 흔들려 0.6이면 획이 울퉁불퉁했다(2026-10-04 아이패드 필기감 피드백).
  return {
    size: width,
    thinning: simulated ? 0.5 : 0.38,
    smoothing: simulated ? 0.55 : 0.65,
    streamline: simulated ? 0.32 : 0.4, // 높을수록 떨림이 줄고, 낮을수록 펜 끝을 바짝 따라온다
    easing: simulated ? undefined : easeOutSine, // 약한 필압도 너무 가늘어지지 않게
    simulatePressure: simulated,
    start: { cap: true, taper: 0 },
    end: { cap: true, taper: 0 },
    last,
  };
}

/** perfect-freehand 외곽선 → 부드러운 Path2D(중점 2차 곡선). */
export function outlineToPath(outline: number[][]): Path2D {
  const path = new Path2D();
  const n = outline.length;
  if (!n) return path;
  if (n < 3) {
    const [x, y] = outline[0];
    path.arc(x, y, 0.5, 0, Math.PI * 2);
    return path;
  }
  path.moveTo((outline[0][0] + outline[1][0]) / 2, (outline[0][1] + outline[1][1]) / 2);
  for (let i = 1; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  path.closePath();
  return path;
}

export function shapePath(shape: Shape): Path2D {
  const path = new Path2D();
  if (shape.kind === 'line') {
    path.moveTo(shape.from[0] * REF, shape.from[1] * REF);
    path.lineTo(shape.to[0] * REF, shape.to[1] * REF);
  } else if (shape.kind === 'polygon') {
    shape.points.forEach(([x, y], i) => (i ? path.lineTo(x * REF, y * REF) : path.moveTo(x * REF, y * REF)));
    path.closePath();
  } else if (shape.kind === 'curve') {
    const parts = curveSegments(shape.points);
    if (parts.length) path.moveTo(parts[0][0].x * REF, parts[0][0].y * REF);
    for (const [, c1, c2, b] of parts) path.bezierCurveTo(c1.x * REF, c1.y * REF, c2.x * REF, c2.y * REF, b.x * REF, b.y * REF);
  } else {
    path.ellipse(shape.cx * REF, shape.cy * REF, Math.max(shape.rx * REF, 0.01), Math.max(shape.ry * REF, 0.01), shape.rotation, 0, Math.PI * 2);
  }
  return path;
}

export function freehandPath(tool: InkStroke['tool'], size: number, points: InkPoint[], last: boolean): Path2D {
  const width = strokeWidth({ tool, size }) * REF;
  const simulated = usesSimulatedPressure(points);
  const input = points.map(p => [p.x * REF, p.y * REF, p.pressure]);
  // 펜 필압은 점마다 들쭉날쭉해 굵기가 떨려 보인다 — 앞뒤 2점 평균으로 고르게.
  if (!simulated && input.length > 2) {
    const raw = input.map(p => p[2]);
    for (let i = 0; i < input.length; i++) {
      const lo = Math.max(0, i - 2), hi = Math.min(raw.length - 1, i + 2);
      let sum = 0;
      for (let k = lo; k <= hi; k++) sum += raw[k];
      input[i][2] = sum / (hi - lo + 1);
    }
  }
  return outlineToPath(getStroke(input, freehandOptions(tool, width, simulated, last)));
}

const cache = new WeakMap<InkStroke, Drawable>();
function drawableFor(stroke: InkStroke): Drawable {
  let d = cache.get(stroke);
  if (!d) {
    const width = strokeWidth(stroke) * REF;
    d = stroke.shape
      ? { path: shapePath(stroke.shape), mode: 'stroke', width }
      : { path: freehandPath(stroke.tool, stroke.size, stroke.points, true), mode: 'fill', width };
    cache.set(stroke, d);
  }
  return d;
}

export function paint(ctx: CanvasRenderingContext2D, d: Drawable, color: string) {
  if (d.mode === 'fill') {
    ctx.fillStyle = color;
    ctx.fill(d.path);
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = d.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke(d.path);
  }
}

export function drawStroke(ctx: CanvasRenderingContext2D, stroke: InkStroke) {
  paint(ctx, drawableFor(stroke), stroke.color);
}

export function drawShape(ctx: CanvasRenderingContext2D, shape: Shape, tool: InkStroke['tool'], size: number, color: string) {
  paint(ctx, { path: shapePath(shape), mode: 'stroke', width: strokeWidth({ tool, size }) * REF }, color);
}

/** 캔버스 백버퍼 크기를 맞추고 기준 공간 변환을 건다. 크기가 바뀌었으면 true. */
export function prepareCanvas(canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number, dpr: number): boolean {
  const w = Math.max(1, Math.round(cssWidth * dpr));
  const h = Math.max(1, Math.round(cssHeight * dpr));
  const resized = canvas.width !== w || canvas.height !== h;
  if (resized) { canvas.width = w; canvas.height = h; }
  return resized;
}

/** 캔버스를 비우고 기준 공간 → 백버퍼 픽셀 변환을 건다. unitDevicePx = 정규화 1(이미지 너비)이 차지하는 백버퍼 픽셀 수. */
export function resetTransform(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, unitDevicePx: number) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // 가로 기준으로 정규화했으므로 가로·세로 같은 배율.
  if (unitDevicePx > 0) ctx.setTransform(unitDevicePx / REF, 0, 0, unitDevicePx / REF, 0, 0);
}

/** iOS 캔버스 한 장 최대 픽셀(약 16.7M)을 넘지 않는 배율. */
export function safeDpr(cssWidth: number, cssHeight: number, wanted: number): number {
  const maxPixels = 12_000_000;
  let dpr = Math.min(Math.max(wanted, 1), 2);
  while (dpr > 1 && cssWidth * cssHeight * dpr * dpr > maxPixels) dpr -= 0.25;
  return Math.max(dpr, 1);
}
