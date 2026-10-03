// 레이저 펜: 저장하지 않는 빛 획. 빨간 글로우 + 흰/연분홍 코어, 꼬리 쪽이 가늘고 펜을 떼면 오래된 쪽부터 사라진다.
// 좌표는 필기와 같은 정규화 좌표, 렌더는 기준 공간(× INK_REFERENCE_WIDTH)에서 한다.
import { getStroke } from 'perfect-freehand';
import { INK_REFERENCE_WIDTH } from './inkModel.ts';
import { outlineToPath } from './inkRender.ts';

const REF = INK_REFERENCE_WIDTH;

export interface LaserPoint { x: number; y: number }
export interface LaserTrail {
  points: LaserPoint[];
  /** 펜을 뗀 시각(performance.now()). 그리는 중이면 null. */
  endedAt: number | null;
}

/** 펜을 뗀 뒤 다 사라지기까지(ms). */
export const LASER_FADE_MS = 1000;
/** 움직임 줄이기 설정이면 꼬리를 먹어 들어가지 않고 이 시간 동안 흐려지기만 한다. */
export const LASER_REDUCED_FADE_MS = 600;
/** 한 획에 남기는 최대 점 수(오래 그려도 프레임당 비용이 늘지 않게). */
export const LASER_MAX_POINTS = 600;
/** 기준 공간 px(이미지가 700px로 보일 때). */
const GLOW_WIDTH = 6;
const CORE_WIDTH = 2.2;
/** 꼬리(오래된 쪽)가 가늘어지는 길이 — 획 길이의 비율. */
const TAIL_TAPER = 0.45;

/** 펜을 뗀 뒤 지난 시간 → 오래된 쪽부터 사라진 길이 비율(cut)과 불투명도. 다 사라졌으면 null. */
export function laserFade(trail: LaserTrail, now: number, reducedMotion: boolean): { cut: number; alpha: number } | null {
  if (trail.endedAt === null) return { cut: 0, alpha: 1 };
  const elapsed = Math.max(0, now - trail.endedAt);
  if (reducedMotion) return elapsed >= LASER_REDUCED_FADE_MS ? null : { cut: 0, alpha: 1 - elapsed / LASER_REDUCED_FADE_MS };
  if (elapsed >= LASER_FADE_MS) return null;
  const t = elapsed / LASER_FADE_MS;
  // 꼬리부터 부드럽게 빨려 들어가고(smoothstep), 마지막 30%에서 남은 끝도 흐려진다.
  return { cut: t * t * (3 - 2 * t), alpha: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3 };
}

/** 앞(오래된 쪽)에서 길이 비율 cut만큼 잘라 낸 점 목록. */
export function trimTrail(points: LaserPoint[], cut: number): LaserPoint[] {
  if (cut <= 0 || points.length < 2) return points;
  const lengths = [0];
  for (let i = 1; i < points.length; i++) lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  const total = lengths[lengths.length - 1];
  if (cut >= 1 || total <= 0) return cut >= 1 ? [] : points.slice(-1);
  const at = total * cut;
  let i = 1;
  while (i < points.length - 1 && lengths[i] < at) i++;
  const a = points[i - 1], b = points[i];
  const span = lengths[i] - lengths[i - 1];
  const t = span > 0 ? (at - lengths[i - 1]) / span : 0;
  return [{ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, ...points.slice(i)];
}

function trailPath(points: LaserPoint[], size: number, last: boolean): Path2D {
  const input = points.map(p => [p.x * REF, p.y * REF, 0.5]);
  let length = 0;
  for (let i = 1; i < input.length; i++) length += Math.hypot(input[i][0] - input[i - 1][0], input[i][1] - input[i - 1][1]);
  return outlineToPath(getStroke(input, {
    size, thinning: 0, smoothing: 0.7, streamline: 0.35, simulatePressure: false, last,
    start: { cap: true, taper: length * TAIL_TAPER }, end: { cap: true, taper: 0 },
  }));
}

/**
 * 레이저 획들을 그린다(캔버스는 미리 비우고 기준 공간 변환을 건 상태). 아직 보이는 획만 돌려준다.
 * glowPx: 글로우 번짐(백버퍼 px — shadowBlur는 캔버스 변환을 따르지 않는다).
 */
export function drawLaser(ctx: CanvasRenderingContext2D, trails: LaserTrail[], now: number, reducedMotion: boolean, glowPx: number): LaserTrail[] {
  const alive: LaserTrail[] = [];
  for (const trail of trails) {
    const fade = laserFade(trail, now, reducedMotion);
    if (!fade) continue;
    alive.push(trail);
    const points = trimTrail(trail.points, fade.cut);
    if (!points.length) continue;
    const last = trail.endedAt !== null;
    ctx.save();
    ctx.globalAlpha = fade.alpha;
    ctx.shadowColor = 'rgba(255, 30, 60, 0.95)';
    ctx.shadowBlur = glowPx;
    ctx.fillStyle = 'rgba(255, 45, 70, 0.92)';
    const glow = trailPath(points, GLOW_WIDTH, last);
    ctx.fill(glow);
    ctx.fill(glow); // 한 번 더 겹쳐 빛을 진하게
    ctx.shadowColor = 'rgba(255, 150, 170, 0.9)';
    ctx.shadowBlur = glowPx * 0.35;
    ctx.fillStyle = '#fff4f6';
    ctx.fill(trailPath(points, CORE_WIDTH, last));
    ctx.restore();
  }
  return alive;
}
