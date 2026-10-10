import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const BASE = process.env.PWP_BASE ?? 'http://127.0.0.1:5183';
const SHOTS = '.pixel-world-test.local/river';
await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1180]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 820 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${BASE}/tests/pixel-world-phaser/river-harness.html`);
    await page.waitForFunction(() => window.riverTest?.handle, null, { timeout: 20000 });
    const idle = async () => {
      await page.waitForFunction(() => { const d = window.riverTest.handle.debug(); return !d.transitioning && !d.moving && d.pathLength === 0; }, null, { timeout: 20000 });
      await page.waitForTimeout(150);
    };
    const walk = async (x, y) => {
      await page.evaluate(([x,y]) => { const h = window.riverTest.handle, d = h.debug(); h.walkToScreen((x - d.camera.x) * d.cssZoom, (y - d.camera.y) * d.cssZoom); }, [x,y]);
      await idle();
    };
    const exit = async destination => {
      await page.evaluate(destination => {
        const h = window.riverTest.handle, d = h.debug();
        const key = Object.keys(d.exits).find(id => id.includes(destination));
        assertExit(key);
        function assertExit(key) { if (!key) throw new Error('출구를 찾을 수 없어요.'); }
        h.walkToScreen(d.exits[key].x, d.exits[key].y);
      }, destination);
    };
    await exit('river');
    await page.waitForFunction(() => { const d = window.riverTest.handle.debug(); return d.scene === 'river' && !d.transitioning; }, null, { timeout: 20000 });
    await page.waitForTimeout(350);
    const entry = await page.evaluate(() => window.riverTest.handle.debug());
    assert.equal(entry.hotspots.length, 4);
    assert.ok((entry.camera.x + width / entry.cssZoom) - entry.waterBounds.left >= 16);
    await page.screenshot({ path: `${SHOTS}/entry-${width}.png` });
    await walk(2 * 16 + 8, 8 * 16 + 8);

    for (let x = 7; x <= 17; x++) for (let y = 10; y <= 12; y++) {
      await walk(x * 16 + 8, y * 16 + 8);
      const d = await page.evaluate(() => window.riverTest.handle.debug());
      assert.ok(Math.hypot(d.x - (x * 16 + 8), d.y - (y * 16 + 8)) < 2);
    }
    await walk(17 * 16 + 8, 11 * 16 + 8);
    // 마지막 이동으로 오른쪽을 향한다.
    await walk(16 * 16 + 8, 11 * 16 + 8); await walk(17 * 16 + 8, 11 * 16 + 8);
    await page.keyboard.down('Space'); await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.riverTest.handle.debug().charging), true);
    await page.keyboard.up('Space');
    const landing = await page.evaluate(() => window.riverTest.taps[0]);
    assert.ok(landing.x > 18 * 16 && landing.x < 26 * 16);
    assert.equal(await page.evaluate(() => window.riverTest.handle.debug().charging), false);
    await page.evaluate(() => window.riverTest.handle.setHotspots([]));
    assert.equal(await page.evaluate(() => window.riverTest.handle.debug().hotspots.length), 0);
    await page.evaluate(() => window.riverTest.handle.setHotspots(undefined));
    for (const id of ['turtle', 'fishboard']) {
      await page.evaluate(id => { const h = window.riverTest.handle, d = h.debug(); h.walkToScreen(d.targets[id].x, d.targets[id].y); }, id);
      await page.waitForFunction(id => window.riverTest.panels.includes(id), id, { timeout: 12000 });
      await idle();
    }
    await walk(7 * 16 + 8, 11 * 16 + 8);
    for (const [label, phase, weather] of [['day','day','clear'], ['night','night','clear'], ['rain','day','rain']]) {
      await page.evaluate(([phase,weather]) => window.riverTest.handle.setWorldTime(phase,weather), [phase,weather]);
      await page.waitForTimeout(300);
      const d = await page.evaluate(() => window.riverTest.handle.debug());
      assert.equal(d.worldTint.phase, phase);
      assert.equal(d.worldTint.parameters.rainDrops, weather === 'rain' ? 56 : 0);
      await page.screenshot({ path: `${SHOTS}/${label}-${width}.png` });
    }
    await exit('yard');
    await page.waitForFunction(() => { const d = window.riverTest.handle.debug(); return d.scene === 'yard' && !d.transitioning; }, null, { timeout: 20000 });
    assert.equal(await page.evaluate(() => window.riverTest.handle.castFrom), null);
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.riverTest.handle.destroy());
    await page.close();
    console.log(`PASS river ${width}: entry water; uniform dock; hold/release cast; hotspot visibility; panels; transitions; day/night/rain; no browser errors`);
  }
} finally { await browser.close(); }
