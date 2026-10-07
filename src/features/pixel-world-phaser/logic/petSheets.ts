// 펫 스프라이트 시트 → Phaser 애니메이션 정의. 기존 Dog/Bear/Pigeon/Duck.tsx의 행·프레임·속도를 옮겨
// 적었다(따라가기 전용이라 걷기/쉬기 두 가지만). 순수 데이터.
import type { PetId } from '../../pixel-room/pet/petKinds';

export interface PetAnim { row: number; frames: readonly number[]; frameMs: number }
export interface PetSheet {
  /** 칸 크기(px). 오리는 큰 원본을 32px 칸으로 줄여 다시 만든 시트 기준. */
  cell: number; columns: number; rows: number;
  walk: PetAnim; idle: PetAnim;
  /** 원본 그림이 왼쪽을 보고 있어 오른쪽으로 갈 때 좌우 반전. */
  facesLeft: boolean;
  /** 발끝 기준점(칸 위쪽에서 px). */
  footY: number;
  /** 따라오는 속도 배율(플레이어 걷기 속도 대비). */
  pace: number;
}

export const PET_SHEETS: Record<PetId, PetSheet> = {
  // dog.png 192×192, 32칸: 2행 = 마당용 달리기(90ms), 5행 = 서서 쉬기(숨쉬기/꼬리/깜빡임).
  pet_dog: { cell: 32, columns: 6, rows: 6, walk: { row: 2, frames: [0, 1, 2, 3, 4, 5], frameMs: 90 }, idle: { row: 5, frames: [0, 0, 0, 1, 1, 1, 2, 2, 3], frameMs: 400 }, facesLeft: true, footY: 31, pace: 1.15 },
  // bear.png 192×192, 48칸: 1행 걷기(150ms), 0행 숨쉬기.
  pet_bear: { cell: 48, columns: 4, rows: 4, walk: { row: 1, frames: [0, 1, 2, 3], frameMs: 150 }, idle: { row: 0, frames: [0, 0, 0, 1, 1, 1, 3, 3, 2], frameMs: 450 }, facesLeft: true, footY: 46, pace: 1 },
  // pigeon.png 128×192, 32칸: 1행 종종걸음(75ms), 0행 고개 까딱.
  pet_pigeon: { cell: 32, columns: 4, rows: 6, walk: { row: 1, frames: [0, 1, 2, 3], frameMs: 75 }, idle: { row: 0, frames: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3], frameMs: 320 }, facesLeft: true, footY: 31, pace: 1.1 },
  // duck.png는 1254px 원본 — game/petTextures.ts가 Duck.tsx와 같은 알파 경계로 32px 칸 4×4 시트를 만든다.
  pet_duck: { cell: 32, columns: 4, rows: 4, walk: { row: 1, frames: [0, 1, 2, 3], frameMs: 110 }, idle: { row: 0, frames: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3], frameMs: 330 }, facesLeft: true, footY: 30, pace: 1.05 },
};

/** Duck.tsx에서 측정해 둔 1254px 시트 각 프레임의 알파 경계 [left, top, right, bottom]. */
export const DUCK_BOUNDS: readonly (readonly [number, number, number, number])[] = [
  [56, 95, 273, 293], [369, 91, 588, 293], [684, 95, 900, 293], [985, 101, 1205, 297],
  [49, 379, 271, 583], [363, 381, 585, 583], [674, 378, 897, 583], [985, 383, 1205, 583],
  [49, 688, 271, 887], [368, 716, 582, 887], [676, 723, 896, 888], [990, 689, 1208, 887],
  [49, 1021, 266, 1207], [354, 979, 589, 1185], [666, 967, 900, 1169], [991, 1005, 1205, 1202],
];

/** 펫이 플레이어 뒤를 따라 설 자리: 바라보는 반대쪽으로 한 칸 남짓, 옆으로 조금 비켜서. */
export function petFollowSpot(feet: { x: number; y: number }, facing: 'Front' | 'Back' | 'Left' | 'Right'): { x: number; y: number } {
  switch (facing) {
    case 'Front': return { x: feet.x + 12, y: feet.y - 12 };
    case 'Back': return { x: feet.x - 12, y: feet.y + 12 };
    case 'Left': return { x: feet.x + 18, y: feet.y + 3 };
    default: return { x: feet.x - 18, y: feet.y + 3 };
  }
}
