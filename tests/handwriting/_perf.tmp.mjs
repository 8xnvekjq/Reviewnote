import { chromium } from 'playwright';
const base = 'http://127.0.0.1:5174';
const browser = await chromium.launch({ headless: true });
async function measure(label, setup) {
  const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, deviceScaleFactor: 2 });
  await context.route('**/*', r => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
  const page = await context.newPage();
  const box = await setup(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => { window.__f = []; let last = performance.now(); const loop = t => { window.__f.push(t - last); last = t; window.__raf = requestAnimationFrame(loop); }; window.__raf = requestAnimationFrame(loop);
    window.__mv = []; addEventListener('pointermove', e => { const t0 = performance.now(); queueMicrotask(() => {}); requestAnimationFrame(() => window.__mv.push(performance.now() - e.timeStamp)); }, true); });
  const pts = Array.from({ length: 120 }, (_, i) => [box.x + 40 + (i % 60) * 4, box.y + 100 + Math.floor(i / 60) * 60 + Math.sin(i / 4) * 15]);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pts[0][0], y: pts[0][1], button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: .5 });
  const t0 = Date.now();
  for (const [x, y] of pts.slice(1)) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1, pointerType: 'pen', force: .5 });
  const elapsed = Date.now() - t0;
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pts.at(-1)[0], y: pts.at(-1)[1], button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
  const r = await page.evaluate(() => { cancelAnimationFrame(window.__raf); const f = window.__f.slice(2).sort((a, b) => a - b); const m = window.__mv.sort((a, b) => a - b);
    return { frames: f.length, p50: f[f.length >> 1]?.toFixed(1), p95: f[Math.floor(f.length * .95)]?.toFixed(1), lat50: m[m.length >> 1]?.toFixed(1), lat95: m[Math.floor(m.length * .95)]?.toFixed(1) }; });
  const canvases = await page.evaluate(() => [...document.querySelectorAll('.exam-ink canvas')].map(c => `${c.width}x${c.height}`).join(' '));
  console.log(label, JSON.stringify(r), 'dispatch ms', elapsed, canvases);
  await context.close();
}
await measure('exam', async page => {
  await page.goto(`${base}/tests/exam/practice.html`);
  await page.locator('.exam-paper-card[data-paper-id="2025-06-math"]').click();
  await page.getByRole('radio', { name: /자유 모드/ }).click(); await page.getByRole('radio', { name: /확통/ }).click();
  await page.getByTestId('exam-start-button').click();
  const ink = page.locator('[data-testid="exam-body"] .exam-ink'); await ink.waitFor(); await page.waitForTimeout(500);
  return ink.boundingBox();
});
await measure('note', async page => {
  await page.goto(`${base}/tests/ui/?detail`);
  await page.getByRole('button', { name: '풀이노트 열기' }).click();
  const win = page.locator('.rn-writing-window').last();
  await win.locator('.exam-ink[data-ready="true"]').waitFor(); await page.waitForTimeout(500);
  return win.locator('.bg-white.relative.overflow-hidden').boundingBox();
});
await browser.close();
