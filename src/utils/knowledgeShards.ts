// 지식의 조각 — 오답 복습(O)으로만 모으는 Pixel World 특수 재화. 지급은 DB 트리거가 하고
// (supabase/migrations/20261011280000_knowledge_shards.sql), 여기서는 잔액 조회와 조각 구매만 한다.
import { supabase } from '../services/supabase';

export interface KnowledgeShards { balance: number; earnedTotal: number }
export type ShardPurchaseResult =
  | { ok: true; itemId: string; newShards: number }
  | { ok: false; reason: 'insufficient_balance' | 'already_owned' | 'not_found' | 'unknown'; message: string };
export type ShardBaitResult =
  | { ok: true; newShards: number; charges: number }
  | { ok: false; reason: 'insufficient_balance' | 'unknown'; message: string };

/** 결정 미끼: 조각 3.00 → 미끼 30회(서버 buy_pixel_bait_with_shards와 같은 값). */
export const CRYSTAL_BAIT = { itemId: 'bait_crystal', displayName: '결정 미끼 (30회)', shardPrice: 3, charges: 30 } as const;

/** 조각은 소수 둘째 자리까지 보여 준다(예: 12.30). */
export function formatShards(value: number) {
  return (Math.round(value * 100) / 100).toFixed(2);
}
/** 소수 계산 오차 없이 "얼마나 더 필요한지"(0 이상, 둘째 자리 반올림). */
export function shardsShort(price: number, balance: number) {
  return Math.max(0, Math.round(price * 100) - Math.round(balance * 100)) / 100;
}

const toNumber = (value: unknown) => typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;

export async function fetchKnowledgeShards(): Promise<KnowledgeShards | null> {
  try {
    const { data, error } = await supabase.rpc('get_knowledge_shards');
    const balance = toNumber(data?.balance), earnedTotal = toNumber(data?.earnedTotal);
    return !error && Number.isFinite(balance) && Number.isFinite(earnedTotal) ? { balance, earnedTotal } : null;
  } catch { return null; }
}

export async function purchaseWithShards(itemId: string): Promise<ShardPurchaseResult> {
  try {
    const { data, error } = await supabase.rpc('purchase_pixel_item_with_shards', { p_item_id: itemId });
    if (error) throw error;
    const newShards = toNumber(data?.newShards);
    if (data?.ok === true && Number.isFinite(newShards)) return { ok: true, itemId, newShards };
    const reason = ['insufficient_balance', 'already_owned', 'not_found'].includes(data?.reason) ? data.reason : 'unknown';
    return { ok: false, reason, message: data?.message ?? '구매 결과를 확인하지 못했어요.' };
  } catch { return { ok: false, reason: 'unknown', message: '구매 결과를 확인하지 못했어요. 다시 확인해 주세요.' }; }
}

export async function buyCrystalBait(): Promise<ShardBaitResult> {
  try {
    const { data, error } = await supabase.rpc('buy_pixel_bait_with_shards');
    if (error) throw error;
    const newShards = toNumber(data?.newShards);
    if (data?.ok === true && Number.isFinite(newShards) && Number.isInteger(data.charges)) return { ok: true, newShards, charges: data.charges };
    return { ok: false, reason: data?.reason === 'insufficient_balance' ? 'insufficient_balance' : 'unknown', message: data?.message ?? '구매 결과를 확인하지 못했어요.' };
  } catch { return { ok: false, reason: 'unknown', message: '구매 결과를 확인하지 못했어요. 다시 확인해 주세요.' }; }
}

// ── 관리자: 집 앞 자판기의 조각 현황 ─────────────────────────────────────────────
export interface AdminShardStudent { userId: string; name: string; balance: number; earnedTotal: number; earnedWeek: number; spent: number; lastEarnedAt: string | null }
export interface AdminShardSpend { name: string; item: string; amount: number; spentAt: string }
export interface AdminShardBoard { students: AdminShardStudent[]; recentSpends: AdminShardSpend[] }

export async function fetchAdminShardBoard(): Promise<AdminShardBoard> {
  const { data, error } = await supabase.rpc('admin_knowledge_shard_board');
  if (error) throw error;
  const students = Array.isArray(data?.students) ? data.students : [];
  const spends = Array.isArray(data?.recentSpends) ? data.recentSpends : [];
  return {
    students: students.map((s: Record<string, unknown>) => ({ userId: String(s.userId), name: String(s.name ?? ''), balance: toNumber(s.balance) || 0,
      earnedTotal: toNumber(s.earnedTotal) || 0, earnedWeek: toNumber(s.earnedWeek) || 0, spent: toNumber(s.spent) || 0,
      lastEarnedAt: typeof s.lastEarnedAt === 'string' ? s.lastEarnedAt : null })),
    recentSpends: spends.map((s: Record<string, unknown>) => ({ name: String(s.name ?? ''), item: String(s.item ?? ''), amount: toNumber(s.amount) || 0, spentAt: String(s.spentAt ?? '') })),
  };
}
