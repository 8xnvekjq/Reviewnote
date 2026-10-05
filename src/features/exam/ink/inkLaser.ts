// 레이저 펜: 저장하지 않는 빛 획. 빨간 글로우 + 흰/연분홍 코어, 필압 없이 굵기가 일정하다.
// 한 획을 긋는 동안은 처음부터 끝까지 그대로 남고, 펜을 떼고 1초 뒤부터 획 전체가 서서히 사라진다.
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

/** 펜을 뗀 뒤 그대로 보이는 시간(ms). */
export const LASER_HOLD_MS = 1000;
/** 그 뒤 서서히 사라지는 시간(ms). */
export const LASER_FADE_MS = 700;
/** 기준 공간 px(이미지가 700px로 보일 때). */
const GLOW_WIDTH = 6;
const CORE_WIDTH = 2.2;

/** 펜을 뗀 뒤 지난 시간 → 불투명도. 다 사라졌으면 null. */
export function laserAlpha(trail: LaserTrail, now: number): number | null {
  if (trail.endedAt === null) return 1;
  const elapsed = Math.max(0, now - trail.endedAt);
  if (elapsed < LASER_HOLD_MS) return 1;
  const t = (elapsed - LASER_HOLD_MS) / LASER_FADE_MS;
  if (t >= 1) return null;
  return 1 - t * t * (3 - 2 * t); // smoothstep으로 부드럽게
}

function trailPath(points: LaserPoint[], size: number, last: boolean): Path2D {
  const input = points.map(p => [p.x * REF, p.y * REF, 0.5]);
  return outlineToPath(getStroke(input, {
    size, thinning: 0, smoothing: 0.7, streamline: 0.35, simulatePressure: false, last,
    start: { cap: true, taper: 0 }, end: { cap: true, taper: 0 },
  }));
}

/**
 * 레이저 획들을 그린다(캔버스는 미리 비우고 기준 공간 변환을 건 상태). 아직 보이는 획만 돌려준다.
 * glowPx: 글로우 번짐(백버퍼 px — shadowBlur는 캔버스 변환을 따르지 않는다).
 */
export function drawLaser(ctx: CanvasRenderingContext2D, trails: LaserTrail[], now: number, glowPx: number, style?: { glowWidth: number; coreWidth: number; alpha: number }): LaserTrail[] {
  const alive: LaserTrail[] = [];
  for (const trail of trails) {
    const alpha = style ? style.alpha : laserAlpha(trail, now);
    if (alpha === null) continue;
    alive.push(trail);
    const points = trail.points;
    if (!points.length) continue;
    const last = trail.endedAt !== null;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(255, 30, 60, 0.95)';
    ctx.shadowBlur = glowPx;
    ctx.fillStyle = 'rgba(255, 45, 70, 0.92)';
    const glow = trailPath(points, style?.glowWidth ?? GLOW_WIDTH, last);
    ctx.fill(glow);
    ctx.fill(glow); // 한 번 더 겹쳐 빛을 진하게
    ctx.shadowColor = 'rgba(255, 150, 170, 0.9)';
    ctx.shadowBlur = glowPx * 0.35;
    ctx.fillStyle = '#fff4f6';
    ctx.fill(trailPath(points, style?.coreWidth ?? CORE_WIDTH, last));
    ctx.restore();
  }
  return alive;
}
