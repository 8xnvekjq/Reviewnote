import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const BASE = process.env.PWP_BASE ?? 'http://127.0.0.1:5174';
const SHOTS = '.pixel-world-test.local/river';
await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${BASE}/tests/pixel-world-phaser/river-harness.html`);
  await page.waitForFunction(() => window.riverTest?.handle, null, { timeout: 20000 });
  const walk = async (x, y) => {
    await page.evaluate(([x,y]) => { const h = window.riverTest.handle, d = h.debug(); h.walkToScreen((x - d.camera.x) * d.cssZoom, (y - d.camera.y) * d.cssZoom); }, [x,y]);
    await page.waitForFunction(() => { const d = window.riverTest.handle.debug(); return !d.transitioning && !d.moving && d.pathLength === 0; }, null, { timeout: 20000 });
    await page.waitForTimeout(150);
  };
  await page.evaluate(() => { const h = window.riverTest.handle, d = h.debug(); h.walkToScreen(d.exits['yard→river'].x, d.exits['yard→river'].y); });
  await page.waitForFunction(() => { const d = window.riverTest.handle.debug(); return d.scene === 'river' && !d.transitioning; }, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.riverTest.handle.debug().shadows.length), 3);
  // 도감과 게시판 패널 훅을 확인한다.
  for (const id of ['turtle','fishboard']) {
    await page.evaluate(id => { const h = window.riverTest.handle, d = h.debug(); h.walkToScreen(d.targets[id].x, d.targets[id].y); }, id);
    await page.waitForFunction(id => window.riverTest.panels.includes(id), id, { timeout: 12000 });
  }
  await walk(17 * 16 + 8, 11 * 16 + 8);
  const point = await page.evaluate(() => window.riverTest.handle.debug().shadows[1].point);
  await page.mouse.click(point.x, point.y);
  assert.deepEqual(await page.evaluate(() => window.riverTest.taps), [1]);
  await page.keyboard.press('Space');
  assert.deepEqual(await page.evaluate(() => window.riverTest.taps), [1,1]);
  const before = await page.evaluate(() => window.riverTest.handle.shadowPoint(1));
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => window.riverTest.handle.shadowPoint(1));
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 0.1);
  assert.ok(await page.evaluate(() => window.riverTest.handle.castFrom !== null));
  await page.evaluate(() => window.riverTest.handle.setWorldTime('night','clear'));
  assert.equal(await page.evaluate(() => window.riverTest.handle.debug().worldTint.phase), 'night');
  await page.waitForTimeout(100); await page.screenshot({ path: `${SHOTS}/night.png` });
  await page.evaluate(() => window.riverTest.handle.setWorldTime('day','rain'));
  assert.equal(await page.evaluate(() => window.riverTest.handle.debug().worldTint.parameters.rainDrops), 36);
  await page.waitForTimeout(200); await page.screenshot({ path: `${SHOTS}/rain.png` });
  await page.evaluate(() => window.riverTest.handle.setShadows([]));
  assert.equal(await page.evaluate(() => window.riverTest.handle.debug().shadows.length), 0);
  await page.evaluate(() => { const h = window.riverTest.handle, d = h.debug(); h.walkToScreen(d.exits['river→yard'].x,d.exits['river→yard'].y); });
  await page.waitForFunction(() => { const d = window.riverTest.handle.debug(); return d.scene === 'yard' && !d.transitioning; }, null, { timeout: 20000 });
  await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/yard-rain.png` });
  assert.equal(await page.evaluate(() => window.riverTest.handle.castFrom), null);
  assert.deepEqual(errors, []);
  await page.evaluate(() => window.riverTest.handle.destroy());
  console.log('PASS river: yard → river → yard; turtle/board; shadow pointer/A hooks; glide; anchors; hide; night/rain screenshots; no browser errors');
} finally { await browser.close(); }
