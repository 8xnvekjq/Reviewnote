import type { PetId } from '../../pixel-room/pet/petKinds';
import type { Facing } from './joystick';
import { rideOffset } from './rideArt';
import type { SceneId } from './scenes';
import { canRide, canFishWhileRiding, rideSpeedFor } from './petRide';
export { canRide } from './petRide';

export const RIDE_SPEED = 1.15;
export function rideState(riding: boolean, action: 'toggle' | 'room' | 'fishing' | 'pet', pet: PetId | null | undefined): boolean {
  if (!canRide(pet) || action === 'room' || (action === 'fishing' && !canFishWhileRiding(pet))) return false;
  return action === 'toggle' ? !riding : riding;
}
export function rideInScene(riding: boolean, scene: SceneId, pet: PetId | null | undefined): boolean {
  return rideState(riding, scene === 'room' ? 'room' : 'pet', pet);
}
export function rideSpeed(riding: boolean, pet: PetId | null | undefined = 'pet_bear', onWater = false): number { return rideSpeedFor(pet, riding, onWater); }
export function riderOffset(facing: Facing): { x: number; y: number } {
  return rideOffset('pet_bear', facing);
}
export function rideRow(facing: Facing): number { return facing === 'Front' ? 1 : facing === 'Back' ? 2 : 0; }
