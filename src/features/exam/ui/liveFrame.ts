import type { InkStroke } from '../contract';

export interface LiveFrame { questionId: string; number: number; imageUrl: string; strokes: InkStroke[] }
/** What a Live cell paints: image and ink switch together, only once the new image can be painted.
 *  Until then the previous frame stays (null = image placeholder), never ink without its question. */
export function nextLiveFrame(shown: LiveFrame | null, incoming: LiveFrame, ready: (url: string) => boolean): LiveFrame | null {
  if (incoming.imageUrl && (ready(incoming.imageUrl) || shown?.imageUrl === incoming.imageUrl)) return incoming;
  return shown;
}
