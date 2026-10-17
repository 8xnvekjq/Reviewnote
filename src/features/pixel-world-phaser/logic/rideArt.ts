import type { Facing, Point } from './joystick';
import type { PetId } from '../../pixel-room/pet/petKinds';
import type { SceneSpec } from './scenes';
import { rideKind, canCrossWater, PIGEON_BLOCKED_DECOR } from './petRide';
import { riverWater, RIVER_DECORATIONS, decorationCells } from './riverWorld';
import { SCENERY, inRect } from '../../pixel-room/plaza/plazaLayout';
import { PLAZA_MARGIN } from './plazaWorld';
import { MARGIN, FENCE_ROWS } from './yardWorld';
import { cellCenter, feetBlocked } from './world';
import { isGardenFence } from '../../pixel-room/farm/gardenModel';

/** All ride anchors are world pixels; optional art uses the bear's 4x4, 48px grid. */
export const RIDE_GRID = { cell: 48, columns: 4, rows: 4, footY: 46 } as const;
export const RIDE_ART = {
  bear: { riderY: -13, backY: -14, sideX: 4, crop: 21, petY: 0, tagY: 4, radius: 12, shadow: 28 },
  pigeon: { riderY: -17, backY: -17, sideX: 0, crop: 32, petY: -40, tagY: 2, radius: 7, shadow: 14 },
  duck: { riderY: -12, backY: -12, sideX: 2, crop: 32, petY: 0, tagY: 4, radius: 10, shadow: 22 },
  dog: { riderY: 0, backY: 0, sideX: 0, crop: 25, petY: 0, tagY: 2, radius: 8, shadow: 16 },
} as const;
export const RIDE_EFFECT = { dogY: 0, duckY: 1, fallbackDogScale: .65, bobMs: 180, swayMs: 260, pantMs: 120, pantScale: .025 } as const;
export function rideOffset(pet: PetId | null | undefined, facing: Facing): Point {
  const kind = rideKind(pet) ?? 'bear', art = RIDE_ART[kind];
  // A mirrored 48px cell moves its x=24 reference to x=23.
  return { x: facing === 'Left' ? art.sideX : facing === 'Right' ? -art.sideX - (kind === 'bear' ? 0 : 1) : 0, y: facing === 'Back' ? art.backY : art.riderY };
}
export function rideRadius(pet: PetId | null | undefined, riding: boolean): number {
  const kind = riding ? rideKind(pet) : null;
  return kind ? RIDE_ART[kind].radius : 7;
}
export function rideOnWater(scene: Pick<SceneSpec, 'id'>, cell: Point): boolean { return scene.id === 'river' && riverWater(cell); }
/** Preserve map bounds and hard obstacles independently of the water mask. */
export function rideSolid(spec: SceneSpec, pet: PetId | null | undefined, riding: boolean): (cell: Point) => boolean {
  const kind = riding ? rideKind(pet) : null;
  return cell => {
    if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y) || cell.x < 0 || cell.y < 0 || cell.x >= spec.cols || cell.y >= spec.rows) return true;
    if (spec.id === 'river' && canCrossWater(pet, riding)) {
      if (cell.x < 2 || cell.y < 3 || cell.x >= spec.cols - 2 || cell.y >= spec.rows - 3) return true;
      const decor = RIVER_DECORATIONS.filter(d => d.blocking && decorationCells(d).some(c => c.x === cell.x && c.y === cell.y));
      if (decor.length) return kind !== 'pigeon' || decor.some(d => PIGEON_BLOCKED_DECOR.includes(d.kind));
      if (riverWater(cell)) return false;
    }
    if (kind === 'pigeon' && spec.id === 'plaza') {
      const local = { x: cell.x - PLAZA_MARGIN, y: cell.y - PLAZA_MARGIN };
      const decor = SCENERY.filter(d => inRect(local, d.footprint));
      if (decor.length && decor.every(d => ['bush', 'fence', 'bench'].includes(d.kind))) return false;
    }
    if (kind === 'pigeon' && spec.id === 'yard') {
      const local = { x: cell.x - MARGIN, y: cell.y - MARGIN };
      if (isGardenFence(local) || (FENCE_ROWS.includes(local.y) && local.x >= 10 && local.x <= 13)) return false;
    }
    return spec.solid(cell);
  };
}

/** Nearest safe ground, without accidentally stepping through an exit on dismount. */
export function rideLanding(spec: SceneSpec, feet: Point): Point | null {
  if (!feetBlocked(feet, spec.solid)) return { ...feet };
  let best: Point | null = null, distance = Infinity;
  for (let y = 1; y < spec.rows - 1; y++) for (let x = 1; x < spec.cols - 1; x++) {
    if (spec.exits.some(exit => exit.cells.some(c => c.x === x && c.y === y))) continue;
    const candidate = cellCenter({ x, y });
    const gap = Math.hypot(candidate.x - feet.x, candidate.y - feet.y);
    if (gap < distance && !feetBlocked(candidate, spec.solid)) { best = candidate; distance = gap; }
  }
  return best;
}
