// 게임 포인트 공통 약속(2026-10-11). 실제 지급은 서버 pixel_private.award_game_points가 한다 — 이 파일은 표시·모의용.
import type { FishRarity, JunkId } from '../ui/fishingAdapter';

export const GAME_POINT_DAILY_CAP = 50;
/** 물고기 1마리 기본 포인트(별 1~5). 별 4·5는 상한과 상관없이 전부(kind 'full'). */
export const FISH_POINTS: Readonly<Record<FishRarity, number>> = { common: 1, uncommon: 2, rare: 4, legendary: 15, mythic: 40 };
/** 잡동사니: 녹슨 동전만 1P(kind 'junk' — 상한 넘으면 0). */
export const JUNK_POINTS: Readonly<Record<JunkId, number>> = { junk_shoe: 0, junk_can: 0, junk_coin: 1 };
/** 서버가 결과에 실어 주는 포인트 정보. */
export interface GamePointsResult { awarded: number; todayEarned: number; cap: number; capped: boolean }

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
