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
import { rideRow } from '../logic/bearRide';
import { canRide, rideKind } from '../logic/petRide';
import { RIDE_ART, RIDE_EFFECT, RIDE_GRID, rideOffset } from '../logic/rideArt';
import type { PetId } from '../../pixel-room/pet/petKinds';
import type { Facing } from '../logic/joystick';

export interface PeerCompanion {
  sprite?: Phaser.GameObjects.Sprite;
  pet?: Phaser.GameObjects.Sprite;
  follow?: PetFollowState;
  flight?: PetFlightState;
  state: PlazaPlayerState;
  look: string;
}

/** 탑승 때도 하나의 곰만 그리며 로컬 탑승자와 같은 자세와 깊이를 쓴다. */
export function updatePeerCompanion(f: PeerCompanion, feet: Point, time: number, deltaMs: number, solid: SolidFn, onWater = false) {
  const p = f.state, riding = p.riding === true && canRide(p.pet);
  const avatar = f.sprite, pet = f.pet;
  if (avatar) {
    avatar.setCrop().setAngle(0).setPosition(feet.x, feet.y).setDepth(feet.y);
    const anim = f.look + ':' + (p.moving && (!riding || p.pet === 'pet_dog') ? 'Walk_' : 'Idle_') + p.direction;
    if (avatar.anims.currentAnim?.key !== anim) avatar.play(anim);
  }
  if (!pet || !p.pet) return;
  if (riding) {
    renderRide(pet, avatar, p.pet, feet, p.direction, p.moving, time, onWater);
    f.follow = undefined; f.flight = undefined;
    return;
  }
  const sheet = PET_SHEETS[p.pet];
  if (pet.getData('rideActive')) {
    clearRide(pet);
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
  return { riding: f.state.riding === true && canRide(f.state.pet),
    mountAnimation: f.pet?.getData('rideActive') ? f.pet.anims.currentAnim?.key ?? null : null,
    mountKind: f.state.riding ? rideKind(f.state.pet) : null,
    mountTexture: f.pet?.getData('rideActive') ? f.pet.texture.key : null,
    avatarAnimation: f.sprite?.anims.currentAnim?.key ?? null,
    petPosition: f.pet ? { x: f.pet.x, y: f.pet.y } : null,
    avatarPosition: f.sprite ? { x: f.sprite.x, y: f.sprite.y, depth: f.sprite.depth, cropped: f.sprite.isCropped } : null,
    follower: !!f.pet && !f.pet.getData('rideActive') };
}

/** 비행 중인 비둘기와 탑승 곰은 발 간격 계산에서 뺀다. */
export function spacingPet(f: PeerCompanion) {
  return f.state.riding === true && canRide(f.state.pet) || f.flight && f.flight.phase !== 'ground' ? undefined : f.pet;
}

/** Shared by the local rider and both presence renderers. Effects belong to the pet's lifecycle. */
export function clearRide(pet: Phaser.GameObjects.Sprite) {
  pet.setData('rideActive', false).setScale(1).setAngle(0);
  const fx = pet.getData('rideFx') as Phaser.GameObjects.Graphics | undefined;
  const image = pet.getData('rideFxImage') as Phaser.GameObjects.Sprite | undefined;
  fx?.clear(); image?.setVisible(false);
  (pet.getData('rideFront') as Phaser.GameObjects.Sprite | undefined)?.setVisible(false);
  (pet.getData('ridePose') as Phaser.GameObjects.Graphics | undefined)?.clear();
}
export function renderRide(pet: Phaser.GameObjects.Sprite, avatar: Phaser.GameObjects.Sprite | undefined,
  id: PetId, feet: Point, facing: Facing, moving: boolean, time: number, onWater = false) {
  const kind = rideKind(id)!;
  const art = RIDE_ART[kind], sheet = PET_SHEETS[id], scene = pet.scene;
  const key = kind === 'dog' ? 'dog-carry' : `${kind}-ride`;
  const ready = scene.textures.exists(key);
  pet.setData('rideActive', true);
  if (ready) {
    if (pet.texture.key !== key) { pet.anims.stop(); pet.setTexture(key); }
    const row = rideRow(facing);
    pet.setOrigin(.5, RIDE_GRID.footY / RIDE_GRID.cell).setScale(1);
    // All sheets use the bear grid, including held-dog idle/pant frames.
    pet.setFrame(moving || kind === 'pigeon' || kind === 'dog' ? row * 4 + Math.floor(time / (kind === 'pigeon' ? 110 : 125)) % 4 : 12 + row);
  } else {
    pet.anims.stop();
    const a = kind === 'pigeon' ? sheet.fly! : moving ? sheet.walk : sheet.idle;
    pet.setFrame(a.row * sheet.columns + a.frames[Math.floor(time / a.frameMs) % a.frames.length]);
    pet.setOrigin(.5, sheet.footY / sheet.cell).setScale(kind === 'dog' ? RIDE_EFFECT.fallbackDogScale : 1);
  }
  if (kind === 'dog' && !moving && !ready) {
    const scale = ready ? 1 : RIDE_EFFECT.fallbackDogScale;
    pet.setScale(scale, scale * (1 + Math.sin(time / RIDE_EFFECT.pantMs) * RIDE_EFFECT.pantScale));
  }
  // Bear keeps its original animation (including its silly idle face).
  if (ready && kind === 'bear') pet.play(`bear-ride:${rideRow(facing)}:${moving ? 'walk' : 'idle'}`, true);
  const bob = kind === 'pigeon' ? Math.sin(time / RIDE_EFFECT.bobMs) * 1.5 : kind === 'bear' && moving ? Math.sin(time / 90) : 0;
  const offset = rideOffset(id, facing);
  pet.setFlipX(ready ? facing === 'Right' : sheet.facesLeft ? facing === 'Right' : facing === 'Left')
    .setPosition(Math.round(feet.x), Math.round(feet.y + art.petY + (kind === 'pigeon' || kind === 'dog' ? bob : 0)))
    .setDepth(feet.y + (kind === 'dog' && facing !== 'Back' ? .2 : 0));
  avatar?.setCrop(0, 0, 32, art.crop).setAngle(0)
    .setPosition(Math.round(feet.x + offset.x), Math.round(feet.y + offset.y + bob + (avatar?.displayOriginY ?? 32) - 32)).setDepth(feet.y + .1);
  let fx = pet.getData('rideFx') as Phaser.GameObjects.Graphics | undefined;
  if (!fx) {
    fx = scene.add.graphics(); pet.setData('rideFx', fx);
    const owned = fx;
    pet.once('destroy', () => owned.destroy());
  }
  fx.clear().setPosition(feet.x, feet.y).setDepth(feet.y + (kind === 'duck' || kind === 'pigeon' ? -.2 : .3));
  if (kind === 'pigeon') fx.fillStyle(0x453d29, .22).fillEllipse(0, 0, art.shadow, 5);
  let front = pet.getData('rideFront') as Phaser.GameObjects.Sprite | undefined;
  front?.setVisible(false);
  if (kind === 'duck' && ready && scene.textures.exists('duck-ride-front')) {
    if (!front) {
      front = scene.add.sprite(0, 0, 'duck-ride-front'); pet.setData('rideFront', front);
      const owned = front; pet.once('destroy', () => owned.destroy());
    }
    front.setFrame(pet.frame.name).setOrigin(pet.originX, pet.originY).setPosition(pet.x, pet.y)
      .setFlipX(pet.flipX).setDepth(feet.y + .2).setVisible(true);
  }
  let pose = pet.getData('ridePose') as Phaser.GameObjects.Graphics | undefined;
  if (!pose) {
    pose = scene.add.graphics(); pet.setData('ridePose', pose);
    const owned = pose; pet.once('destroy', () => owned.destroy());
  }
  pose.clear().setDepth(feet.y + .3);
  if (avatar && (kind === 'pigeon' || kind === 'dog' && facing !== 'Back')) {
    const pixel = scene.textures.getPixel(16, 18, avatar.texture.key, avatar.frame.name);
    const skin = pixel?.alpha ? pixel.color : 0xf6d6a3;
    const top = avatar.y - avatar.displayOriginY;
    if (kind === 'pigeon') {
      // Avatar palms (13,3)/(19,3) meet the fixed pigeon grips (21,40)/(27,40).
      for (const side of [-1, 1]) {
        const x = avatar.x + side * 3;
        pose.lineStyle(3, 0x49413f).lineBetween(x, top + 18, x, top + 3);
        pose.lineStyle(1, skin).lineBetween(x, top + 18, x, top + 3);
      }
    } else {
      for (const x of [-6, 4]) pose.fillStyle(0x49413f).fillRect(avatar.x + x, top + 23, 3, 3)
        .fillStyle(skin).fillRect(avatar.x + x + 1, top + 24, 2, 2);
    }
  }
  const effect = kind === 'dog' ? 'swirl-legs' : moving && kind === 'duck' && onWater ? 'duck-wake' : null;
  let image = pet.getData('rideFxImage') as Phaser.GameObjects.Sprite | undefined;
  image?.setVisible(false);
  if (effect && scene.textures.exists(effect)) {
    if (!image) {
      image = scene.add.sprite(0, 0, effect); pet.setData('rideFxImage', image);
      const owned = image; pet.once('destroy', () => owned.destroy());
    }
    const row = rideRow(facing), right = facing === 'Right';
    const dx = kind === 'duck' && row === 0 ? (right ? -18 : 18) : 0;
    const dy = kind === 'duck' ? [-13, -23, -4][row] : 0;
    image.setTexture(effect, row * 4 + Math.floor(time / (kind === 'duck' ? 167 : 83)) % 4)
      .setOrigin(.5, RIDE_GRID.footY / RIDE_GRID.cell).setFlipX(right)
      .setPosition(pet.x + dx, kind === 'duck' ? pet.y + dy : feet.y + offset.y)
      .setDepth(kind === 'duck' ? feet.y - .2 : feet.y + .15).setVisible(true);
  } else if (effect === 'duck-wake') {
    fx.lineStyle(1, 0xc3f0ff, .7).strokeEllipse(0, 1, 24 + Math.sin(time / 120) * 4, 7).strokeEllipse(0, 2, 32, 10);
  } else if (effect === 'swirl-legs') {
    fx.lineStyle(1.5, 0xfbf1d2, .9);
    fx.strokeEllipse(-4, -4, 7 + Math.sin(time / 55) * 2, 8).strokeEllipse(4, -4, 7 - Math.sin(time / 55) * 2, 8);
  }
}
