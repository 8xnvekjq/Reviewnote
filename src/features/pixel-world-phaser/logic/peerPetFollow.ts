import type { PetId } from '../../pixel-room/pet/petKinds';
import type { Facing, Point } from './joystick';
import { createPetFollowState, stepPetFollow } from './petFollow';
import type { PetFollowState } from './petFollow';
import { PET_SHEETS, petFollowSpot } from './petSheets';
import { feetBlocked, moveFeet } from './world';
import type { SolidFn } from './world';

/** 보간된 주인의 발 위치를 따라가며 모든 친구에게 같은 추종 규칙을 적용한다. */
export function stepPeerPetFollow(state: PetFollowState | undefined, here: Point, owner: Point,
  facing: Facing, pet: PetId, deltaMs: number, solid: SolidFn) {
  const start = state ? here : petFollowSpot(owner, facing);
  const position = !state && feetBlocked(start, solid) ? owner : start;
  return stepPetFollow(state ?? createPetFollowState(position), position, owner, facing,
    PET_SHEETS[pet], deltaMs, 96, {
      move: (from, dx, dy) => moveFeet(from, dx, dy, solid),
      blocked: point => feetBlocked(point, solid),
    });
}
