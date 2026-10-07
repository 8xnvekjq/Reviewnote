import type { PetId } from '../../pixel-room/pet/petKinds';
import { interactionBeat } from '../../pixel-room/pet/petInteraction';
import type { Facing, Point } from './joystick';
import { facingDelta } from './world';
import { PET_SHEETS } from './petSheets';

// 이동하는 펫은 격자 장식과 달리 실제 발 위치와 바라보는 방향으로 판정한다.
export function facesPet(feet: Point, facing: Facing, pet: Point): boolean {
  const d = facingDelta(facing), dx = pet.x - feet.x, dy = pet.y - feet.y;
  return Math.hypot(dx, dy) <= 30 && dx * d.x + dy * d.y > 3 && Math.abs(dx * d.y - dy * d.x) < 22;
}
export function reactionFrame(id: PetId, elapsed: number, kind: 'feed' | 'pet'): number {
  const beat = interactionBeat(id, elapsed);
  const action = kind === 'pet' ? (id === 'pet_bear' ? 'wave' : id === 'pet_dog' ? 'sit' : id === 'pet_duck' ? 'hop' : 'bob') : beat.action;
  const t = kind === 'pet' ? elapsed : beat.elapsed;
  let row = PET_SHEETS[id].idle.row, frame = 0;
  if (id === 'pet_dog') {
    if (action === 'bark') { row = 0; frame = Math.floor(t / 150) % 4; }
    else if (action === 'sit') { row = t < 450 ? 3 : 4; frame = t < 450 ? Math.min(2, Math.floor(t / 150)) : Math.floor((t - 450) / 1200) % 3; }
  } else if (id === 'pet_bear') {
    if (action === 'wave') { row = 3; frame = Math.min(3, Math.floor(t / 250)); }
    else if (action === 'sit') { row = 2; frame = t < 300 ? 0 : 1; }
  } else if (id === 'pet_duck') {
    row = action === 'peck' ? 2 : action === 'hop' ? 3 : 0;
    frame = Math.floor(t / (action === 'peck' ? 220 : 200)) % 4;
  } else {
    row = action === 'peck' ? 2 : 0;
    frame = action === 'peck' ? [0, 1, 2, 1, 2, 3][Math.min(5, Math.floor(t / 220))] : Math.floor(t / 250) % 2;
  }
  return row * PET_SHEETS[id].columns + frame;
}
