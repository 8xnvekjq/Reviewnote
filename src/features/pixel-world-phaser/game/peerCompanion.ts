import type Phaser from 'phaser';
import type { PlazaPlayerState } from '../../pixel-room/plaza/types';
import type { Point } from '../logic/joystick';
import type { SolidFn } from '../logic/world';
import type { PetFollowState } from '../logic/petFollow';
import { createPetFollowState } from '../logic/petFollow';
import { createPetFlightState, startPetFlight, stepPetFlight, petFlightFrame, PIGEON_FLIGHT_DISTANCE } from '../logic/petFlight';
import type { PetFlightState } from '../logic/petFlight';
import { feetBlocked } from '../logic/world';
import { stepPeerPetFollow } from '../logic/peerPetFollow';
import { PET_SHEETS, petFollowSpot } from '../logic/petSheets';
import { riderOffset, rideRow } from '../logic/bearRide';

export interface PeerCompanion {
  sprite?: Phaser.GameObjects.Sprite;
  pet?: Phaser.GameObjects.Sprite;
  follow?: PetFollowState;
  flight?: PetFlightState;
  state: PlazaPlayerState;
  look: string;
}

/** 탑승 때도 하나의 곰만 그리며 로컬 탑승자와 같은 자세와 깊이를 쓴다. */
export function updatePeerCompanion(f: PeerCompanion, feet: Point, time: number, deltaMs: number, solid: SolidFn) {
  const p = f.state, riding = p.riding === true && p.pet === 'pet_bear';
  const avatar = f.sprite, pet = f.pet;
  if (avatar) {
    avatar.setCrop().setPosition(feet.x, feet.y).setDepth(feet.y);
    const anim = f.look + ':' + (p.moving && !riding ? 'Walk_' : 'Idle_') + p.direction;
    if (avatar.anims.currentAnim?.key !== anim) avatar.play(anim);
  }
  if (!pet || !p.pet) return;
  if (riding) {
    if (pet.texture.key !== 'bear-ride') { pet.anims.stop(); pet.setTexture('bear-ride'); }
    pet.setFlipX(p.direction === 'Right').setOrigin(.5, 46 / 48);
    pet.play(`bear-ride:${rideRow(p.direction)}:${p.moving ? 'walk' : 'idle'}`, true);
    const bob = p.moving && Number(pet.frame.name) % 2 === 1 ? -1 : 0;
    const offset = riderOffset(p.direction);
    pet.setPosition(Math.round(feet.x), Math.round(feet.y)).setDepth(feet.y);
    avatar?.setCrop(0, 0, 32, 21).setPosition(Math.round(feet.x + offset.x), Math.round(feet.y + offset.y + bob)).setDepth(feet.y + .1);
    f.follow = undefined;
    return;
  }
  const sheet = PET_SHEETS[p.pet];
  if (pet.texture.key === 'bear-ride') {
    pet.anims.stop(); pet.setTexture('plaza-pet:' + p.pet);
    f.follow = createPetFollowState(pet);
  }
  pet.setOrigin(.5, sheet.footY / sheet.cell);
  if (p.pet === 'pet_pigeon') {
    const world = { blocked: (point: Point) => feetBlocked(point, solid),
      landing: (point: Point) => !feetBlocked(point, solid) ? point : !feetBlocked(feet, solid) ? feet : null };
    const target = petFollowSpot(feet, p.direction);
    if (!f.follow) f.flight = createPetFlightState(target);
    else f.flight ??= createPetFlightState(pet);
    const airborne = f.flight.phase !== 'ground';
    f.flight = stepPetFlight(f.flight, deltaMs, world, target);
    if (airborne) {
      pet.setPosition(f.flight.position.x, f.flight.position.y - f.flight.altitude)
        .setFlipX(f.flight.flipX).setDepth(f.flight.position.y + f.flight.altitude).setFrame(petFlightFrame(f.flight));
      if (f.flight.phase === 'ground') f.follow = createPetFollowState(f.flight.position, f.flight.flipX);
      return;
    }
    f.flight.position = f.follow ? { x: pet.x, y: pet.y } : { ...target };
    f.flight.flipX = pet.flipX;
    if (Math.hypot(target.x - f.flight.position.x, target.y - f.flight.position.y) > PIGEON_FLIGHT_DISTANCE || (f.follow?.stuckMs ?? 0) >= 300) {
      f.flight.cooldownMs = 0;
      f.flight = startPetFlight(f.flight, target, world);
      if (f.flight.phase !== 'ground') return;
    }
  } else f.flight = undefined;
  const result = stepPeerPetFollow(f.follow, pet, feet, p.direction, p.pet, deltaMs, solid);
  f.follow = result.state;
  const a = result.walking ? sheet.walk : sheet.idle;
  pet.setPosition(result.position.x, result.position.y).setFlipX(result.state.flipX).setDepth(result.position.y)
    .setFrame(a.row * sheet.columns + a.frames[Math.floor(time / a.frameMs) % a.frames.length]);
}

export function peerCompanionSnapshot(f: PeerCompanion) {
  return { riding: f.state.riding === true && f.state.pet === 'pet_bear',
    mountAnimation: f.pet?.texture.key === 'bear-ride' ? f.pet.anims.currentAnim?.key ?? null : null,
    petPosition: f.pet ? { x: f.pet.x, y: f.pet.y } : null,
    avatarPosition: f.sprite ? { x: f.sprite.x, y: f.sprite.y, depth: f.sprite.depth, cropped: f.sprite.isCropped } : null,
    follower: !!f.pet && f.pet.texture.key !== 'bear-ride' };
}
