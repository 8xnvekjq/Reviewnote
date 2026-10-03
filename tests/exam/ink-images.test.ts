import test from 'node:test';
import assert from 'node:assert/strict';

type Behavior = 'stall' | 'load' | 'error' | 'decode-stall';
const behaviors = new Map<string, Behavior>();
const created: string[] = [];
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decoding = 'auto';
  naturalWidth = 0;
  naturalHeight = 0;
  set src(url: string) {
    created.push(url);
    const behavior = behaviors.get(url) ?? 'stall';
    if (behavior === 'stall') return;
    queueMicrotask(() => {
      if (behavior === 'error') { this.onerror?.(); return; }
      this.naturalWidth = 100; this.naturalHeight = 150;
      this.onload?.();
    });
  }
  decode() { return behaviors.get(created.at(-1)!) === 'decode-stall' ? new Promise<void>(() => {}) : Promise.resolve(); }
}
(globalThis as unknown as { Image: unknown }).Image = FakeImage;
const { aspectCache, inkImageFailed, inkImageReady, inkImageSettled, loadInkImage, INK_IMAGE_RETRY_MS } =
  await import('../../src/features/exam/ink/inkImages.ts');

test('a stalled download or decode is cut by the deadline, then retried after the cooldown', async () => {
  behaviors.set('/stall.png', 'stall');
  await loadInkImage('/stall.png', 20);
  assert.equal(inkImageReady('/stall.png'), false);
  assert.equal(inkImageSettled('/stall.png'), true, 'the Live cell stops waiting');
  assert.equal(inkImageFailed('/stall.png'), true);
  const count = created.length;
  await loadInkImage('/stall.png', 20);
  assert.equal(created.length, count, 'no request storm during the cooldown');
  const now = Date.now;
  Date.now = () => now() + INK_IMAGE_RETRY_MS;
  try {
    behaviors.set('/stall.png', 'load');
    await loadInkImage('/stall.png', 20);
  } finally { Date.now = now; }
  assert.equal(created.length, count + 1, 'retried with a new request');
  assert.equal(inkImageReady('/stall.png'), true);
  assert.equal(inkImageFailed('/stall.png'), false);
  assert.equal(aspectCache.get('/stall.png'), 1.5);

  behaviors.set('/decode.png', 'decode-stall');
  await loadInkImage('/decode.png', 20);
  assert.equal(inkImageFailed('/decode.png'), true, 'a decode that never settles is cut too');
});

test('a broken image settles as failed; a loaded one is ready; concurrent calls share one request', async () => {
  behaviors.set('/broken.png', 'error');
  await loadInkImage('/broken.png', 1000);
  assert.equal(inkImageFailed('/broken.png'), true);
  behaviors.set('/ok.png', 'load');
  const count = created.length;
  await Promise.all([loadInkImage('/ok.png'), loadInkImage('/ok.png')]);
  assert.equal(created.length, count + 1);
  assert.equal(inkImageReady('/ok.png'), true);
  await loadInkImage('/ok.png');
  assert.equal(created.length, count + 1, 'ready images are not requested again');
});
