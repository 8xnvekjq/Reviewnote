import { parseXpGain } from './levels';
import type { FarmResult } from '../../../utils/pixelFarm';
export function parseFarmResult(raw: unknown): FarmResult {
  const data = raw as Record<string, unknown> | null;
  if (!data || !Array.isArray(data.plots) || data.plots.length !== 2 || typeof data.serverNow !== 'string' || !Number.isFinite(Date.parse(data.serverNow))) throw new Error('Invalid farm response');
  const { xpGain: rawXpGain, ...snapshot } = data;
  const xpGain = parseXpGain(rawXpGain);
  return { ...snapshot, ...(xpGain ? { xpGain } : {}) } as FarmResult;
}
