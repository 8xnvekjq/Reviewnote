// 게임 포인트 공통 약속(2026-10-11). 실제 지급은 서버 pixel_private.award_game_points가 한다 — 이 파일은 표시·모의용.
import type { FishRarity, JunkId } from '../ui/fishingAdapter';

export const GAME_POINT_DAILY_CAP = 50;
/** 하루 전체 상한(2026-10-11): 100P를 넘으면 별 4·5까지 모든 게임 포인트가 1/10. */
export const GAME_POINT_TOTAL_CAP = 100;
export type GamePointKind = 'normal' | 'full' | 'junk';
/** 서버 pixel_private.award_game_points와 같은 규칙(모의·표시용). carry는 1/10P 조각(0~9)이다.
 * - normal(별 1~3): 50P까지 그대로, 50~100P는 1/5, 100P 넘으면 1/10
 * - full(별 4·5): 100P까지 그대로, 넘으면 1/10
 * - junk(녹슨 동전): 50P까지 그대로, 넘으면 0 */
export function awardGamePoints(points: number, kind: GamePointKind, earned: number, carry: number): { awarded: number; carry: number } {
  let tenths = earned * 10 + carry;
  for (let i = 0; i < points; i++) {
    tenths += kind === 'junk' ? (tenths < GAME_POINT_DAILY_CAP * 10 ? 10 : 0)
      : tenths >= GAME_POINT_TOTAL_CAP * 10 ? 1
      : kind === 'full' || tenths < GAME_POINT_DAILY_CAP * 10 ? 10 : 2;
  }
  return { awarded: Math.floor(tenths / 10) - earned, carry: tenths % 10 };
}
/** 물고기 1마리 기본 포인트(별 1~5). 별 4·5는 상한과 상관없이 전부(kind 'full'). */
export const FISH_POINTS: Readonly<Record<FishRarity, number>> = { common: 1, uncommon: 2, rare: 4, legendary: 15, mythic: 40 };
/** 잡동사니: 녹슨 동전만 1P(kind 'junk' — 상한 넘으면 0). */
export const JUNK_POINTS: Readonly<Record<JunkId, number>> = { junk_shoe: 0, junk_can: 0, junk_coin: 1 };
/** 서버가 결과에 실어 주는 포인트 정보. */
/** bagged: 포인트 대신 가방에 넣었다(광장 상점에서 팔면 그때 포인트). */
export interface GamePointsResult { awarded: number; todayEarned: number; cap: number; capped: boolean; bagged?: boolean }

/** 매주 월요일 0시(KST) 지난주 정산 — 등급별 물고기 챔피언(크기 점수 1등)과 수확 대회. 학생만(관리자 제외, 자리는 다음 학생에게). */
export const FISH_TIER_REWARDS: Readonly<Record<FishRarity, number>> = { mythic: 150, legendary: 100, rare: 60, uncommon: 40, common: 25 };
export const CROP_CONTEST_REWARDS: readonly number[] = [100, 70, 50];
export const CROP_CONTEST_ENTRY_REWARD = 10;
/** 크기 점수(%) = (길이 − 최소) ÷ (최대 − 최소) × 100, 소수 첫째 자리. 곰 효과로 100을 넘을 수 있다. */
export const sizeScore = (lengthCm: number, minCm: number, maxCm: number) => Math.round((lengthCm - minCm) / (maxCm - minCm || 1) * 1000) / 10;
/** 받지 않은 주간 보상 한 건(Pixel World에 들어오면 축하 창으로 보여 주고 확인 처리). */
export interface WeeklyReward { id: string; weekStart: string; kind: 'fish_tier' | 'crop_rank' | 'crop_entry'; label: string; points: number }
/** 이번 주 등급별 챔피언(게시판 맨 위). */
export interface FishTierChampion { rarity: FishRarity; speciesId: string; lengthCm: number; score: number; animal: string; teacher?: boolean; reward: number }
/** 주간 보상 서버 계약(get_pixel_rewards: 지난주 정산이 안 됐으면 먼저 정산하고, 아직 확인 안 한 내 보상을 돌려준다). */
export interface RewardsAdapter { pending(): Promise<WeeklyReward[]>; ack(ids: readonly string[]): Promise<boolean> }
