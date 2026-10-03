import type { InkStroke, LiveInkResponse } from '../contract.ts';
import { applyInkEvent } from './inkReplay.ts';

export interface LiveInkState { revision: number; strokes: InkStroke[] }
/** Never partially apply a broken chain; the caller requests a full snapshot instead. */
export function applyLiveInk(current: LiveInkState | null, response: LiveInkResponse): LiveInkState | null {
  if (current && response.revision < current.revision) return null;
  if (response.mode === 'full') return { revision: response.revision, strokes: response.strokes };
  if (!current) return null;
  let revision = current.revision;
  let strokes = current.strokes;
  for (const batch of response.batches) {
    if (batch.revision !== revision + 1) return null;
    for (const event of batch.events) strokes = applyInkEvent(strokes, event);
    revision = batch.revision;
  }
  return revision === response.revision ? { revision, strokes } : null;
}
