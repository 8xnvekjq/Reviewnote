// Pixel World 안의 서버 RPC가 이미 profiles.point_adjustment를 바꾼 뒤, App이 들고 있는
// pointAdjustment(화면 표시 + 이후 클라이언트 포인트 쓰기의 기준값)를 서버 값에 맞추는 계산.
// 추가 서버 쓰기는 하지 않는다 — 계산만 한다. 이 파일은 App 첫 번들에 들어가므로 Phaser나
// 게임 코드를 절대 import하지 않는다.

/** purchase_pixel_item이 돌려준 새 잔액(bonus_points + point_adjustment) → 새 point_adjustment.
 * 잔액이 숫자가 아니면 null(동기화하지 않음). */
export function adjustmentForServerBalance(newBalance: number, bonusPoints: number): number | null {
  if (!Number.isFinite(newBalance)) return null;
  return newBalance - (bonusPoints || 0);
}

/** submit_farm_crop은 잔액 대신 보상 점수만 돌려주고, 서버에서 point_adjustment에 그만큼 더했다.
 * 같은 양을 로컬 값에도 더한다. 보상이 숫자가 아니면 null(동기화하지 않음). */
export function adjustmentAfterServerReward(previousAdjustment: number, rewardPoints: number): number | null {
  if (!Number.isFinite(rewardPoints)) return null;
  return previousAdjustment + rewardPoints;
}
