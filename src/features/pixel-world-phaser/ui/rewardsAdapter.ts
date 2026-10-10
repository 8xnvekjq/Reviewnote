import type { RewardsAdapter, WeeklyReward } from '../logic/gamePoints';
import type { FishingRpcClient } from './fishingAdapter';

const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export function parseWeeklyRewards(raw: unknown): WeeklyReward[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.flatMap(r => {
    if (!r || typeof r !== 'object' || !uuid(r.id) || seen.has(r.id)
      || typeof r.weekStart !== 'string' || !Number.isFinite(Date.parse(r.weekStart))
      || !['fish_tier', 'crop_rank', 'crop_entry'].includes(r.kind)
      || typeof r.label !== 'string' || !r.label.trim()
      || !Number.isSafeInteger(r.points) || r.points <= 0) return [];
    seen.add(r.id);
    return [{ id: r.id, weekStart: r.weekStart, kind: r.kind, label: r.label, points: r.points }];
  });
}

async function rpc(client: FishingRpcClient, fn: string, args?: Record<string, unknown>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(client.rpc(fn, args)),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('보상 응답 시간 초과')), 12000); }),
    ]);
  } finally { clearTimeout(timer); }
}

export function createRewardsAdapter(supabase: FishingRpcClient): RewardsAdapter {
  return {
    async pending() {
      try { const r = await rpc(supabase, 'get_pixel_rewards'); return r.error ? [] : parseWeeklyRewards(r.data); }
      catch { return []; }
    },
    async ack(ids) {
      if (!ids.every(uuid)) return false;
      if (!ids.length) return true;
      try { const r = await rpc(supabase, 'ack_pixel_rewards', { p_ids: [...new Set(ids)] }); return !r.error && r.data === true; }
      catch { return false; }
    },
  };
}

export function createMockRewardsAdapter(rewards: readonly WeeklyReward[] = []): RewardsAdapter {
  let pending = rewards.map(r => ({ ...r }));
  return {
    async pending() { return pending.map(r => ({ ...r })); },
    async ack(ids) { pending = pending.filter(r => !ids.includes(r.id)); return true; },
  };
}
