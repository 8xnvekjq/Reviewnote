// 펫 타기 공통 규칙(2026-10-18 계약) — 곰·비둘기·오리 타기, 강아지 태우기(안고 달리기).
// 그림·조작·낚시 워커가 함께 쓰는 값이다. 바꿀 때는 세 쪽을 같이 확인한다.
import type { PetId } from '../../pixel-room/pet/petKinds';

export type RideKind = 'bear' | 'pigeon' | 'duck' | 'dog';
export const RIDE_KIND: Readonly<Record<PetId, RideKind>> = { pet_bear: 'bear', pet_pigeon: 'pigeon', pet_duck: 'duck', pet_dog: 'dog' };

/** 걷기 = 1 기준 배수. 곰은 묵직하게 느리고, 비둘기가 가장 빠르다. 오리는 땅에서 뒤뚱뒤뚱, 물에서 제 속도. */
export const RIDE_SPEED = { bear: 1.15, pigeon: 1.7, dog: 1.45, duckLand: 0.6, duckWater: 1.1 } as const;

export function rideKind(pet: PetId | null | undefined): RideKind | null { return pet ? RIDE_KIND[pet] ?? null : null; }
export function canRide(pet: PetId | null | undefined): boolean { return rideKind(pet) !== null; }
export function rideSpeedFor(pet: PetId | null | undefined, riding: boolean, onWater = false): number {
  const kind = riding ? rideKind(pet) : null;
  if (!kind) return 1;
  if (kind === 'duck') return onWater ? RIDE_SPEED.duckWater : RIDE_SPEED.duckLand;
  return RIDE_SPEED[kind];
}
/** 물 위로 갈 수 있나: 비둘기(날아서)·오리(헤엄쳐서)를 타고 있을 때만. */
export function canCrossWater(pet: PetId | null | undefined, riding: boolean): boolean {
  const kind = riding ? rideKind(pet) : null;
  return kind === 'pigeon' || kind === 'duck';
}
/** 비둘기는 나무·건물·맵 끝을 빼고 낮은 장식(갈대·덤불·울타리·바위 등)은 넘어간다. */
export const PIGEON_BLOCKED_DECOR: readonly string[] = ['tree'];
/** 타고 있는 채로 낚시할 수 있는 건 오리뿐. 다른 펫은 낚시를 시작하면 자동으로 내린다(비둘기는 먼저 착지). */
export function canFishWhileRiding(pet: PetId | null | undefined): boolean { return rideKind(pet) === 'duck'; }
/** 화면 위쪽 칩 문구(A 버튼과 분리). 강아지는 사람이 안고 달리므로 '태우기'. */
export function rideChipLabel(pet: PetId | null | undefined, riding: boolean): string {
  if (riding) return '내리기';
  return rideKind(pet) === 'dog' ? '🐶 태우기' : '🐾 타기';
}
/** 그림 파일(src/features/pixel-room/pet/assets/). 곰 타기 시트(bear_ride.png)와 같은 칸 크기·행 배치를 따른다. */
export const RIDE_SHEETS: Readonly<Record<RideKind, string>> = {
  bear: 'bear_ride.png', pigeon: 'pigeon_ride.png', duck: 'duck_ride.png', dog: 'dog_carry.png',
};
/** 강아지를 안고 달릴 때 사람 다리 대신 보이는 동글동글 회오리 다리(만화식 달리기). */
export const SWIRL_LEGS_SHEET = 'swirl_legs.png';
/** 오리를 타고만 갈 수 있는 물 위 히든 낚시 포인트 id(낚시 워커가 위치·조건·물고기를 정한다). */
export const SECRET_SPOT_IDS = ['secret_whirlpool', 'secret_bridge_shade', 'secret_reed_isle'] as const;
export type SecretSpotId = typeof SECRET_SPOT_IDS[number];
