import type { Point } from './joystick';
import type { Facing } from './joystick';
import { cellOf, facingDelta } from './world';
import { inDock, riverSolid, riverWater } from './riverWorld';
import { castDistance, hotspotAt } from './hotspots';
import type { FishingState } from '../ui/fishingAdapter';

export function castLanding(from: Point, facing: Facing, power: number): Point {
  const d = facingDelta(facing), distance = castDistance(power);
  return { x: from.x + d.x * distance, y: from.y + d.y * distance };
}
export const waterLanding = (point: Point) => Number.isFinite(point.x) && Number.isFinite(point.y) && riverWater(cellOf(point));
export function canChargeCast(feet: Point, facing: Facing): boolean {
  const cell = cellOf(feet), d = facingDelta(facing);
  return !riverSolid(cell) && (inDock(cell)
    ? waterLanding(castLanding({ x: feet.x + d.x * 9, y: feet.y - 14 + d.y * 4 }, facing, 1))
    : riverWater({ x: cell.x + d.x, y: cell.y + d.y }));
}
export function activeHotspotAt(point: Point, spots: FishingState['spots']): number | null {
  const id = hotspotAt(point);
  return id !== null && spots?.some(spot => spot.id === id && spot.active) ? id : null;
}
