import { supabase } from '../services/supabase';
import type { FarmAction, FarmSnapshot, HarvestedCrop, TopSubmittedCrop } from '../features/pixel-room/farm/farmModel';
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
    .select('id, crop_type, size_score, harvested_at, care_count, status, submitted_at, reward_points')
    .eq('user_id', userId)
    .not('harvested_at', 'is', null)
    .order('harvested_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((row: {
    id: string; crop_type: string; size_score: number; harvested_at: string; care_count: number;
    status: HarvestedCrop['status']; submitted_at: string | null; reward_points: number | null;
  }) => ({
    id: row.id, cropType: row.crop_type, sizeScore: row.size_score, harvestedAt: row.harvested_at, careCount: row.care_count,
    status: row.status, submittedAt: row.submitted_at, rewardPoints: row.reward_points,
  }));
}

export type SubmitFarmCropResult =
  | { ok: true; cropId: string; rewardPoints: number; submittedAt: string; status: 'submitted' }
  | { ok: false; reason: 'not_found' | 'not_stored' | 'already_submitted' | 'unknown'; message: string };

/** Submit one stored crop for its one-time reward. Server re-checks status itself (status='stored'
 * under a row lock) — safe to call again after a failed/uncertain network response: a retry on an
 * already-submitted crop returns ok:false/reason:'already_submitted', never a second reward. */
export async function submitFarmCrop(cropId: string): Promise<SubmitFarmCropResult> {
  const { data, error } = await supabase.rpc('submit_farm_crop', { p_crop_id: cropId });
  if (error) return { ok: false, reason: 'unknown', message: error.message || '출품 중 오류가 발생했어요.' };
  return data as SubmitFarmCropResult;
}

/** The plaza's exhibit — the single largest submitted crop across all students, or null if nobody
 * has submitted one yet. Resolved entirely server-side (get_top_submitted_crop) so this client never
 * sees or needs raw profile rows for the submitter label. */
export async function fetchTopSubmittedCrop(): Promise<TopSubmittedCrop | null> {
  const { data, error } = await supabase.rpc('get_top_submitted_crop');
  if (error) throw error;
  const row = (data || [])[0] as { crop_id: string; crop_type: string; size_score: number; submitted_at: string; submitter_label: string } | undefined;
  if (!row) return null;
  return { cropId: row.crop_id, cropType: row.crop_type, sizeScore: row.size_score, submittedAt: row.submitted_at, submitterLabel: row.submitter_label };
}
