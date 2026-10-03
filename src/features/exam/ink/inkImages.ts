/** 문항 이미지 비율 캐시 — 문항을 오갈 때 이미지가 다시 로드되기 전에도 같은 높이로 바로 그려 깜박임을 없앤다. */
export const aspectCache = new Map<string, number>();
const loading = new Map<string, Promise<void>>();
const ready = new Set<string>();
/** Decoded images stay referenced so the browser keeps them ready to paint. */
const held = new Map<string, HTMLImageElement>();
const HELD_MAX = 400;

/** Load and decode one question image. Resolves (never rejects) once it can be painted or has failed. */
export function loadInkImage(url: string): Promise<void> {
  if (!url) return Promise.resolve();
  const existing = loading.get(url);
  if (existing) return existing;
  const img = new Image();
  img.decoding = 'async';
  const done = new Promise<void>(resolve => {
    const finish = () => {
      if (img.naturalWidth) aspectCache.set(url, img.naturalHeight / img.naturalWidth);
      ready.add(url);
      resolve();
    };
    img.onload = () => { void (img.decode ? img.decode().catch(() => {}) : Promise.resolve()).then(finish); };
    // A broken image must not hold the view forever; the <img> shows its own fallback.
    img.onerror = finish;
  });
  img.src = url;
  loading.set(url, done);
  held.set(url, img);
  if (held.size > HELD_MAX) held.delete(held.keys().next().value!);
  return done;
}
export const inkImageReady = (url: string) => !url || ready.has(url);

/** 시험 시작(또는 Live 보기 열기) 때 문항 이미지를 미리 받아 디코드해 두고 비율도 캐시한다. */
export function preloadInkImages(urls: string[]) {
  for (const url of new Set(urls)) void loadInkImage(url);
}
