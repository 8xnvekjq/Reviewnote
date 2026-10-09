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
    assert.equal(entry.shadows.length, 3);
    assert.ok((entry.camera.x + width / entry.cssZoom) - entry.waterBounds.left >= 16);
    await page.screenshot({ path: `${SHOTS}/entry-${width}.png` });
    await walk(2 * 16 + 8, 8 * 16 + 8);

    // 먼 그림자는 도착하기 전에는 낚시 훅을 호출하지 않는다.
    await page.evaluate(() => {
      const h = window.riverTest.handle, d = h.debug(), p = d.targets['shadow:1'];
      h.walkToScreen(p.x, p.y);
    });
    assert.deepEqual(await page.evaluate(() => window.riverTest.taps), []);
    assert.ok(await page.evaluate(() => window.riverTest.handle.debug().pendingCast));
    await page.waitForFunction(() => window.riverTest.taps.length === 1, null, { timeout: 12000 });
    await idle();
    assert.deepEqual(await page.evaluate(() => window.riverTest.taps), [1]);
    const cast = await page.evaluate(() => window.riverTest.handle.debug());
    assert.equal(cast.pendingCast, null); assert.equal(cast.facing, 'Right');
    assert.ok(Math.hypot(cast.x - 184, cast.y - 184) < .5, JSON.stringify({ x: cast.x, y: cast.y }));
    await page.waitForTimeout(350);
    assert.deepEqual(await page.evaluate(() => window.riverTest.taps), [1]);
    const p = await page.evaluate(() => window.riverTest.handle.debug().targets['shadow:1']);
    await page.mouse.click(p.x, p.y);
    assert.deepEqual(await page.evaluate(() => window.riverTest.taps), [1,1]);
    await page.keyboard.press('Space');
    assert.deepEqual(await page.evaluate(() => window.riverTest.taps), [1,1,1]);

    for (const spot of entry.bankSpots) {
      await walk(spot.x, spot.y);
      const d = await page.evaluate(() => window.riverTest.handle.debug());
      assert.ok(Math.hypot(d.x - spot.x, d.y - spot.y) < 2);
    }
    for (const id of ['turtle', 'fishboard']) {
      await page.evaluate(id => { const h = window.riverTest.handle, d = h.debug(); h.walkToScreen(d.targets[id].x, d.targets[id].y); }, id);
      await page.waitForFunction(id => window.riverTest.panels.includes(id), id, { timeout: 12000 });
      await idle();
    }
    // 새 이동 명령과 사라진 그림자는 예약 캐스트를 취소한다.
    for (const [index, y] of [[0,9], [2,14]]) {
      await walk(7 * 16 + 8, y * 16 + 8);
      await page.evaluate(index => { const h = window.riverTest.handle, p = h.debug().targets[`shadow:${index}`]; h.walkToScreen(p.x,p.y); }, index);
      assert.equal(await page.evaluate(() => window.riverTest.handle.debug().pendingCast), null);
    }
    assert.deepEqual(await page.evaluate(() => window.riverTest.taps), [1,1,1,0,2]);
    await walk(2 * 16 + 8, 8 * 16 + 8);
    await page.evaluate(() => { const h = window.riverTest.handle, p = h.debug().targets['shadow:1']; h.walkToScreen(p.x,p.y); });
    await walk(3 * 16 + 8, 8 * 16 + 8);
    assert.deepEqual(await page.evaluate(() => window.riverTest.taps), [1,1,1,0,2]);
    await page.evaluate(() => { const h = window.riverTest.handle, p = h.debug().targets['shadow:1']; h.walkToScreen(p.x,p.y); h.setShadows([]); });
    await idle();
    assert.equal(await page.evaluate(() => window.riverTest.handle.debug().pendingCast), null);
    assert.deepEqual(await page.evaluate(() => window.riverTest.taps), [1,1,1,0,2]);
    await page.evaluate(() => window.riverTest.handle.setShadows([{index:0,size:'S',sparkle:true},{index:1,size:'M',sparkle:false},{index:2,size:'L',sparkle:false}]));
    await walk(7 * 16 + 8, 11 * 16 + 8);
    for (const [label, phase, weather] of [['day','day','clear'], ['night','night','clear'], ['rain','day','rain']]) {
      await page.evaluate(([phase,weather]) => window.riverTest.handle.setWorldTime(phase,weather), [phase,weather]);
      await page.waitForTimeout(300);
      const d = await page.evaluate(() => window.riverTest.handle.debug());
      assert.equal(d.worldTint.phase, phase);
      assert.equal(d.worldTint.parameters.rainDrops, weather === 'rain' ? 56 : 0);
      await page.screenshot({ path: `${SHOTS}/${label}-${width}.png` });
    }
    const before = await page.evaluate(() => window.riverTest.handle.shadowPoint(1));
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => window.riverTest.handle.shadowPoint(1));
    assert.ok(Math.hypot(after.x-before.x, after.y-before.y) > 0.1);
    await exit('yard');
    await page.waitForFunction(() => { const d = window.riverTest.handle.debug(); return d.scene === 'yard' && !d.transitioning; }, null, { timeout: 20000 });
    assert.equal(await page.evaluate(() => window.riverTest.handle.castFrom), null);
    assert.deepEqual(errors, []);
    await page.evaluate(() => window.riverTest.handle.destroy());
    await page.close();
    console.log(`PASS river ${width}: entry water; five reachable spots; auto-walk then one cast; immediate pointer/A; cancellation; panels; transitions; day/night/rain; no browser errors`);
  }
} finally { await browser.close(); }
