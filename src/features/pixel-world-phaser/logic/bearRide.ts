import type { PetId } from '../../pixel-room/pet/petKinds';
import type { Facing } from './joystick';
import type { SceneId } from './scenes';

export const RIDE_SPEED = 1.4;
export function canRide(pet: PetId | null | undefined): boolean { return pet === 'pet_bear'; }
export function rideState(riding: boolean, action: 'toggle' | 'room' | 'fishing' | 'pet', pet: PetId | null | undefined): boolean {
  if (!canRide(pet) || action === 'room' || action === 'fishing') return false;
  return action === 'toggle' ? !riding : riding;
}
export function rideInScene(riding: boolean, scene: SceneId, pet: PetId | null | undefined): boolean {
  return rideState(riding, scene === 'room' ? 'room' : 'pet', pet);
}
export function rideSpeed(riding: boolean): number { return riding ? RIDE_SPEED : 1; }
export function riderOffset(facing: Facing): { x: number; y: number } {
  return { x: facing === 'Left' ? 4 : facing === 'Right' ? -4 : 0, y: facing === 'Back' ? -14 : -13 };
}
export function rideRow(facing: Facing): number { return facing === 'Front' ? 1 : facing === 'Back' ? 2 : 0; }
