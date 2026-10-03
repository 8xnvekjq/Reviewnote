/** 문항 이미지 비율 캐시 — 문항을 오갈 때 이미지가 다시 로드되기 전에도 같은 높이로 바로 그려 깜박임을 없앤다. */
export const aspectCache = new Map<string, number>();
/** Load + decode deadline. A stalled response or decode must not hold a Live cell on the previous question. */
export const INK_IMAGE_TIMEOUT_MS = 10000;
/** A failed or timed-out image is tried again on the next request after this long. */
export const INK_IMAGE_RETRY_MS = 5000;
const CACHE_MAX = 512;
/** Decoded images stay referenced so the browser keeps them ready to paint. Few: each can hold a full bitmap. */
const HELD_MAX = 16;
const loading = new Map<string, Promise<void>>();
const ready = new Set<string>();
const failed = new Map<string, number>();
const held = new Map<string, HTMLImageElement>();

function bounded<K>(cache: { size: number; keys(): IterableIterator<K>; delete(key: K): boolean }, max: number) {
  while (cache.size > max) cache.delete(cache.keys().next().value!);
}

/** Load and decode one question image. Resolves (never rejects) once it can be painted, has failed or timed out. */
export function loadInkImage(url: string, timeoutMs = INK_IMAGE_TIMEOUT_MS): Promise<void> {
  if (!url || ready.has(url)) return Promise.resolve();
  const existing = loading.get(url);
  if (existing) return existing;
  const failedAt = failed.get(url);
  if (failedAt !== undefined && Date.now() - failedAt < INK_IMAGE_RETRY_MS) return Promise.resolve();
  const img = new Image();
  img.decoding = 'async';
  const done = new Promise<void>(resolve => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      loading.delete(url);
      if (ok) {
        if (img.naturalWidth) { aspectCache.set(url, img.naturalHeight / img.naturalWidth); bounded(aspectCache, CACHE_MAX); }
        failed.delete(url);
        ready.add(url); bounded(ready, CACHE_MAX);
        held.delete(url); held.set(url, img); bounded(held, HELD_MAX);
      } else {
        img.onload = img.onerror = null;
        failed.set(url, Date.now()); bounded(failed, CACHE_MAX);
      }
      resolve();
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    // Loaded is paintable even if decode() rejects; a decode that never settles is cut by the timer.
    img.onload = () => { void (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(() => finish(true)); };
    img.onerror = () => finish(false);
  });
  loading.set(url, done);
  img.src = url;
  return done;
}
export const inkImageReady = (url: string) => !url || ready.has(url);
/** Loaded, or given up on for now: a Live cell switches then instead of waiting forever. */
export const inkImageSettled = (url: string) => !url || ready.has(url) || failed.has(url);
export const inkImageFailed = (url: string) => !!url && !ready.has(url) && failed.has(url);

/** 시험 시작(또는 Live 보기 열기) 때 문항 이미지를 미리 받아 디코드해 두고 비율도 캐시한다. */
export function preloadInkImages(urls: string[]) {
  for (const url of new Set(urls)) void loadInkImage(url);
}
