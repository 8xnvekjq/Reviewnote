import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.PWP_BASE ?? 'http://127.0.0.1:5174';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  await context.route('**/src/services/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: "export { supabase } from '/tests/pixel-world-phaser/fakeRealtime.mjs';" }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // 문서 파싱 뒤, React가 셸을 올리기 전에 원래 메타 내용을 보관한다.
  await page.route('**/tests/pixel-world-phaser/harness.html*', async route => {
    const response = await route.fetch();
    const html = (await response.text()).replace('<body', '<script>window.originalViewport = document.querySelector(\'meta[name="viewport"]\').getAttribute(\'content\');</script><body');
    await route.fulfill({ response, body: html });
  });
  await page.goto(BASE + '/tests/pixel-world-phaser/harness.html');
  await page.waitForFunction(() => document.querySelector('.pwp-root')?.dataset.status === 'ready');
  await page.evaluate(() => { const h = window.__pixelWorldPhaser, p = h.debug().exits.gate; h.walkToScreen(p.x, p.y); });
  await page.waitForFunction(() => { const d = window.__pixelWorldPhaser.debug(); return d.scene === 'plaza' && !d.transitioning; }, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const canvas = document.querySelector('.pwp-root canvas');
    const copy = document.createElement('canvas');
    copy.width = copy.height = 32;
    const ctx = copy.getContext('2d', { willReadFrequently: true });
    window.resizeSamples = [];
    // 게임 관찰자 다음에 등록해서, 같은 페인트 직전의 캔버스를 검사한다.
    window.resizeObserver = new ResizeObserver(() => {
      ctx.clearRect(0, 0, 32, 32);
      ctx.drawImage(canvas, canvas.width / 2 - 16, canvas.height / 2 - 16, 32, 32, 0, 0, 32, 32);
      const pixels = ctx.getImageData(0, 0, 32, 32).data;
      let visible = false;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] && (pixels[i] || pixels[i + 1] || pixels[i + 2])) { visible = true; break; }
      }
      window.resizeSamples.push({ visible, width: canvas.width, height: canvas.height });
    });
    window.resizeObserver.observe(canvas.parentElement);
  });
  for (const height of [720, 620, 520, 620, 720, 820]) {
    await page.setViewportSize({ width: 1180, height });
    await page.waitForTimeout(60);
  }
  // 데스크톱 resize 이벤트는 rAF보다 먼저 올 수 있어, 부모 레이아웃만 바뀌는 경로도 검증한다.
  for (const height of [720, 620, 520, 620, 720, 820]) {
    await page.evaluate(height => { document.querySelector('.pwp-root canvas').parentElement.style.height = `${height}px`; }, height);
    await page.waitForTimeout(60);
  }
  const samples = await page.evaluate(() => window.resizeSamples);
  assert.ok(samples.length >= 6, `expected resize samples: ${JSON.stringify(samples)}`);
  assert.ok(samples.every(sample => sample.visible), `blank resize samples: ${JSON.stringify(samples)}`);
  console.log(`PASS resize: ${samples.length} pre-paint samples, no transparent or black canvas`);
  await page.evaluate(() => { document.querySelector('.pwp-root canvas').parentElement.style.removeProperty('height'); });
  await page.waitForTimeout(60);
  const meta = await page.locator('meta[name="viewport"]').getAttribute('content');
  const original = await page.evaluate(() => window.originalViewport);
  assert.match(meta, /interactive-widget=resizes-visual/);
  assert.equal(meta.replace(/,\s*interactive-widget=resizes-visual/, ''), original);
  // 잠든 루프에서도 리사이즈만으로 화면을 그리고 장면 위치를 진행하지 않는다.
  await page.evaluate(() => { window.__pixelWorldPhaser.setActive(false); window.sleepPosition = window.__pixelWorldPhaser.debug(); window.resizeSamples = []; });
  await page.setViewportSize({ width: 1180, height: 700 });
  await page.waitForTimeout(120);
  const sleeping = await page.evaluate(() => ({ samples: window.resizeSamples, before: window.sleepPosition, after: window.__pixelWorldPhaser.debug() }));
  assert.ok(sleeping.samples.length > 0 && sleeping.samples.every(sample => sample.visible), 'sleeping resize paints the scene');
  assert.equal(sleeping.after.x, sleeping.before.x);
  assert.equal(sleeping.after.y, sleeping.before.y);
  await page.evaluate(() => { window.resizeObserver.disconnect(); window.__pixelWorldPhaser.setActive(true); });
  console.log('PASS resize sleeping: canvas redrawn without moving the character');
  const burst = await page.evaluate(async () => {
    const canvas = document.querySelector('.pwp-root canvas');
    const width = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'width');
    let resizes = 0;
    Object.defineProperty(canvas, 'width', { configurable: true, get() { return width.get.call(this); }, set(value) { resizes++; width.set.call(this, value); } });
    const parent = canvas.parentElement;
    // 서로 다른 크기를 연속 요청해도 마지막 크기만 한 번 적용한다.
    for (const height of [610, 620, 630, 640, 650, 660]) {
      parent.style.height = `${height}px`;
      window.dispatchEvent(new Event('resize'));
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    delete canvas.width;
    return { resizes, height: canvas.height };
  });
  assert.deepEqual(burst, { resizes: 1, height: 660 });
  console.log('PASS resize burst: six requests coalesced into one resize at the latest size');
  await page.locator('.pwp-exit').click();
  await page.getByTestId('exited').waitFor();
  assert.equal(await page.locator('meta[name="viewport"]').getAttribute('content'), original);
  assert.deepEqual(errors, []);
  console.log('PASS viewport: resizes-visual while mounted, original content restored on exit');
} finally { await browser.close(); }
