import { supabase } from '../services/supabase';
import type { FarmAction, FarmSnapshot } from '../features/pixel-room/farm/farmModel';
export interface FarmResult extends FarmSnapshot { result?: 'ok' | 'changed' | 'already_watered' | 'ready' | 'growing'; harvest?: { sizeScore: number; bonusApplied?: boolean } }
async function request(name: string, args?: Record<string, unknown>): Promise<FarmResult> {
  const { data, error } = await supabase.rpc(name, args).abortSignal(AbortSignal.timeout(12000));
  if (error) throw error;
  if (!data || !Array.isArray(data.plots) || data.plots.length !== 2 || !Number.isFinite(Date.parse(data.serverNow))) throw new Error('Invalid farm response');
  return data as FarmResult;
}
export const fetchPixelFarm = () => request('get_pixel_farm');
export const actPixelFarm = (plot: number, action: FarmAction, revision: number) => request('act_pixel_farm', { p_plot: plot, p_action: action, p_revision: revision });
