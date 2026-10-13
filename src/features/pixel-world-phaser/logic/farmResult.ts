import { parseXpGain } from './levels';
import type { FarmResult } from '../../../utils/pixelFarm';
export function parseFarmResult(raw: unknown): FarmResult {
  const data = raw as Record<string, unknown> | null;
  if (!data || !Array.isArray(data.plots) || data.plots.length === 0 || typeof data.serverNow !== 'string' || !Number.isFinite(Date.parse(data.serverNow))) throw new Error('Invalid farm response');
  // 칸 번호가 정수가 아닌 응답은 믿지 않는다(텃밭 칸을 잘못 그리거나 엉뚱한 칸에 보내지 않게).
  if (!data.plots.every(p => !!p && typeof p === 'object' && Number.isInteger((p as { index?: unknown }).index))) throw new Error('Invalid farm response');
  const { xpGain: rawXpGain, ...snapshot } = data;
  const xpGain = parseXpGain(rawXpGain);
  return { ...snapshot, ...(xpGain ? { xpGain } : {}) } as FarmResult;
}
