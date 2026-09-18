import { supabase } from '../services/supabase';
import type { FarmAction, FarmSnapshot, HarvestedCrop } from '../features/pixel-room/farm/farmModel';
export interface FarmResult extends FarmSnapshot { result?: 'ok' | 'changed' | 'already_watered' | 'ready' | 'growing'; harvest?: { sizeScore: number; bonusApplied?: boolean } }
async function request(name: string, args?: Record<string, unknown>): Promise<FarmResult> {
  const { data, error } = await supabase.rpc(name, args).abortSignal(AbortSignal.timeout(12000));
  if (error) throw error;
  if (!data || !Array.isArray(data.plots) || data.plots.length !== 2 || !Number.isFinite(Date.parse(data.serverNow))) throw new Error('Invalid farm response');
  return data as FarmResult;
}
export const fetchPixelFarm = () => request('get_pixel_farm');
export const actPixelFarm = (plot: number, action: FarmAction, revision: number) => request('act_pixel_farm', { p_plot: plot, p_action: action, p_revision: revision });

/** The "농작물" collection — harvested pixel_farm_crops rows, newest first. Direct table read (the
 * existing pixel_farm_crops_read RLS policy already scopes this to the caller's own rows; the
 * explicit .eq is defense in depth, not the only thing enforcing it). No RPC needed — nothing here
 * is written, only read. */
export async function fetchHarvestedCrops(userId: string): Promise<HarvestedCrop[]> {
  const { data, error } = await supabase
    .from('pixel_farm_crops')
    .select('id, crop_type, size_score, harvested_at, care_count, status')
    .eq('user_id', userId)
    .not('harvested_at', 'is', null)
    .order('harvested_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row: { id: string; crop_type: string; size_score: number; harvested_at: string; care_count: number; status: string }) => ({
    id: row.id, cropType: row.crop_type, sizeScore: row.size_score, harvestedAt: row.harvested_at, careCount: row.care_count, status: row.status,
  }));
}
