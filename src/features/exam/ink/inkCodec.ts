import type { InkPoint, InkReplayEvent, InkStroke } from '../contract.ts';

// v1: 1.<점 수>.<base64url>. 각 점의 x/y/pressure/t 차분을 zigzag-varint로 이어 붙인다.
// 좌표는 1/20000, 시간은 ms. 압력 256은 모의 압력 0.5 전용이다.
export const INK_COORD_SCALE = 20000;
export const INK_MAX_POINTS = 100000;
export const INK_MAX_PACKED_LENGTH = 2133344;
export type PackedInkStroke = Omit<InkStroke, 'points'> & { p: string };
const packedCache = new WeakMap<InkStroke, PackedInkStroke>();
const legacyOrigin = new WeakMap<InkStroke, boolean>();
const compactionCache = new WeakMap<InkStroke[], boolean>();

function quantize(point: InkPoint): number[] {
  if (![point.x, point.y, point.pressure, point.t].every(Number.isFinite)
    || Math.abs(point.x) > 100 || Math.abs(point.y) > 100 || point.pressure < 0 || point.pressure > 1
    || point.t < 0 || point.t > 86400000) throw new Error('EXAM_INK_INVALID');
  return [Math.round(point.x * INK_COORD_SCALE), Math.round(point.y * INK_COORD_SCALE),
    point.pressure === .5 ? 256 : Math.round(point.pressure * 255), Math.round(point.t)];
}

export function encodeInkPoints(points: InkPoint[]): string {
  if (points.length > INK_MAX_POINTS) throw new Error('EXAM_INK_TOO_LARGE');
  const bytes: number[] = [];
  let previous = [0, 0, 0, 0];
  for (const point of points) {
    const values = quantize(point);
    values.forEach((value, i) => {
      const delta = value - previous[i];
      let n = delta < 0 ? -delta * 2 - 1 : delta * 2;
      while (n >= 128) { bytes.push((n % 128) + 128); n = Math.floor(n / 128); }
      bytes.push(n);
    });
    previous = values;
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.slice(i, i + 8192));
  return `1.${points.length}.${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

/** 손상 데이터는 null. 일부 점만 반환해 필기가 조용히 사라지는 것을 막는다. */
export function decodeInkPoints(p: unknown): InkPoint[] | null {
  if (typeof p !== 'string' || p.length > INK_MAX_PACKED_LENGTH) return null;
  const match = /^1\.(0|[1-9][0-9]{0,5})\.([A-Za-z0-9_-]*)$/.exec(p);
  if (!match || Number(match[1]) > INK_MAX_POINTS) return null;
  const count = Number(match[1]), payload = match[2];
  if (payload.length % 4 === 1 || (count === 0) !== (payload.length === 0)) return null;
  try {
    const bytes = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    // 패딩 비트까지 정규형이어야 한다.
    if (btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') !== payload) return null;
    if (bytes.length < count * 4 || bytes.length > count * 16) return null;
    let offset = 0;
    const previous = [0, 0, 0, 0];
    const points: InkPoint[] = [];
    for (let i = 0; i < count; i++) {
      for (let field = 0; field < 4; field++) {
        let n = 0, factor = 1, ended = false;
        for (let k = 0; k < 4; k++) {
          if (offset >= bytes.length) return null;
          const byte = bytes.charCodeAt(offset++);
          n += (byte & 127) * factor;
          if (byte < 128) {
            if (k > 0 && byte === 0) return null;
            ended = true; break;
          }
          factor *= 128;
        }
        if (!ended) return null;
        previous[field] += n % 2 ? -(n + 1) / 2 : n / 2;
      }
      const [x, y, pressure, t] = previous;
      if (Math.abs(x) > 2000000 || Math.abs(y) > 2000000 || pressure < 0 || pressure > 256 || t < 0 || t > 86400000) return null;
      points.push({ x: x / INK_COORD_SCALE, y: y / INK_COORD_SCALE, pressure: pressure === 256 ? .5 : pressure / 255, t });
    }
    return offset === bytes.length ? points : null;
  } catch { return null; }
}

export function encodeInkStroke(stroke: InkStroke): PackedInkStroke {
  let packed = packedCache.get(stroke);
  if (!packed) {
    const { points, ...metadata } = stroke;
    packed = { ...metadata, p: encodeInkPoints(points) };
    packedCache.set(stroke, packed);
  }
  return packed;
}
export function decodeInkStroke(stroke: InkStroke | PackedInkStroke): InkStroke {
  if ('p' in stroke) {
    if ('points' in stroke) throw new Error('EXAM_INK_INVALID');
    const points = decodeInkPoints(stroke.p);
    if (!points) throw new Error('EXAM_INK_INVALID');
    const { p: _p, ...metadata } = stroke;
    const decoded = { ...metadata, points };
    legacyOrigin.set(decoded, false);
    return decoded;
  }
  return stroke;
}
export function encodeInkEvents(events: InkReplayEvent[]) {
  return events.map(event => ({ ...event, added: event.added.map(add => ({ ...add, stroke: encodeInkStroke(add.stroke) })) }));
}

/** 큰 구형 문항만 다음 실제 저장에 한 번 재인코딩한다. 메모리 모델에 플래그를 넣지 않는다. */
export function needsInkCompaction(strokes: InkStroke[]): boolean {
  let needed = compactionCache.get(strokes);
  if (needed == null) {
    needed = strokes.some(stroke => legacyOrigin.get(stroke) === true)
      && new TextEncoder().encode(JSON.stringify(strokes)).length >= 512 * 1024;
    compactionCache.set(strokes, needed);
  }
  return needed;
}

export function markInkCompacted(strokes: InkStroke[]) {
  strokes.forEach(stroke => legacyOrigin.set(stroke, false));
  compactionCache.set(strokes, false);
}

/** 문서·재생 baseline/events·peer·live full/delta를 API/캐시 경계에서 복원한다. */
export function decodeInkPayload<T>(value: unknown, source: 'server' | 'cache' = 'server'): T {
  function visit(node: unknown): unknown {
    if (Array.isArray(node)) return node.map(visit);
    if (!node || typeof node !== 'object') return node;
    const row = node as Record<string, unknown>;
    if ('p' in row && 'id' in row && 'tool' in row) return decodeInkStroke(row as unknown as PackedInkStroke);
    if ('points' in row && 'id' in row && 'tool' in row) {
      const stroke = row as unknown as InkStroke;
      // IndexedDB는 신형 서버 획도 points로 보관한다. 구형 서버 응답만 재인코딩 대상이다.
      if (source === 'server' && !legacyOrigin.has(stroke)) legacyOrigin.set(stroke, true);
      return row;
    }
    return Object.fromEntries(Object.entries(row).map(([key, child]) => [key, visit(child)]));
  }
  return visit(value) as T;
}
