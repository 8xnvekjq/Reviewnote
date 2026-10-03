import type { InkStroke } from '../contract';

export interface LiveFrame { questionId: string; number: number; imageUrl: string; strokes: InkStroke[] }
/** What a Live cell paints: image and ink switch together, only once the new image can be painted.
 *  Until then the previous frame stays (null = image placeholder), never ink without its question. */
export function nextLiveFrame(shown: LiveFrame | null, incoming: LiveFrame, ready: (url: string) => boolean): LiveFrame | null {
  if (incoming.imageUrl && (ready(incoming.imageUrl) || shown?.imageUrl === incoming.imageUrl)) return incoming;
  return shown;
}

export interface LiveImageRecovery { url: string; failed: boolean; generation: number }
/** A Live cell's image that failed and later loaded on a loader retry: the generation goes up, so the cell
 *  replaces its broken <img> (a successful preload does not reload an element that already failed). */
export function nextImageRecovery(previous: LiveImageRecovery, url: string, failed: boolean): LiveImageRecovery {
  if (previous.url === url && previous.failed === failed) return previous;
  const recovered = previous.url === url && previous.failed && !failed;
  return { url, failed, generation: previous.generation + (recovered ? 1 : 0) };
}
