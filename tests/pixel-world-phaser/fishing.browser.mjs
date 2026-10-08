import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { writeFile, unlink } from 'node:fs/promises';
const BASE = process.env.PWP_BASE ?? 'http://127.0.0.1:5174';
const browser = await chromium.launch({ headless: true });
// 파일이 아직 병합되지 않았을 때만 이 테스트 안의 최소 mock으로 제어기를 검증한다.
async function controllerChecks() {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error('BROWSER:', error.message); });
  const fixture = `<!doctype html><div id="root"></div><script type="module">
    import React from 'react';
    const { useRef, useState } = React;
    import ReactDOM from 'react-dom/client';
    const { createRoot } = ReactDOM;
    import { useFishing } from '/src/features/pixel-world-phaser/ui/useFishing.ts';
    import { CatchCard } from '/src/features/pixel-world-phaser/ui/CatchCard.tsx';
    import { fishingOverride } from '/src/features/pixel-world-phaser/PixelWorldPhaser.tsx';
    window.fishingOverride = fishingOverride;
    let remaining = 6, pending = null, finished = [], starts = 0, startDelay = 0, finishDelay = 0, frozen = false, shadows = [], time = null;
    const adapter = {
      state: async () => ({ kstDate: '2026-10-08', phase: 'night', weather: 'rain', remaining, sparkleShadow: 1, pigeonHint: null, album: [] }),
      start: async () => { starts++; await new Promise(r => setTimeout(r, startDelay)); pending = 'cast-' + starts; return { ok: true, castId: pending, shadow: 'L', biteDelayMs: 500, pattern: 'quick', hint: null }; },
      finish: async (id, landed) => { finished.push({ id, landed }); await new Promise(r => setTimeout(r, finishDelay)); if (id !== pending) return { ok: false }; pending = null; if (!landed) return { ok: true, landed: false }; remaining--; return { ok: true, landed: true, speciesId: 'pirami', lengthCm: 10.5, rarity: 'rare', isNew: true, isBig: true, isPersonalBest: true, remaining }; },
      board: async () => ({ rows: [], classSpecies: 0 })
    };
    function Probe() {
      const [scene, setScene] = useState('river');
      const handle = useRef({ cancelWalk() {}, setShadows(value) { shadows = value; }, setWorldTime(phase, weather) { time = { phase, weather }; } });
      const fishing = useFishing({ adapter, handle, scene, pet: null, freeze: value => { frozen = value; } });
      window.probe = { fishing, get frozen() { return frozen; }, get shadows() { return shadows; }, get time() { return time; }, get finished() { return finished; }, get starts() { return starts; }, setScene, setRemaining: value => { remaining = value; }, setStartDelay: value => { startDelay = value; }, setFinishDelay: value => { finishDelay = value; } };
      return React.createElement('div', null,
        React.createElement('p', { id: 'phase' }, fishing.phase),
        React.createElement('p', { id: 'message' }, fishing.message),
        fishing.caught && React.createElement(CatchCard, { caught: fishing.caught, onHide: fishing.hideCatch }));
    }
    createRoot(document.getElementById('root')).render(React.createElement(Probe));
  </script>`;
  await writeFile('.fishing-controller-fixture.html', fixture);
  await page.goto(`${BASE}/.fishing-controller-fixture.html`);
  await page.waitForFunction(() => window.probe?.shadows.length === 3);
  assert.equal(await page.evaluate(() => window.fishingOverride('?pwClock=21:30&pwWeather=rain', false)), undefined);
  assert.deepEqual(await page.evaluate(() => window.fishingOverride('?pwClock=21:30&pwWeather=rain', true)), { clock: '21:30', weather: 'rain' });
  assert.equal(await page.evaluate(() => window.fishingOverride('?pwClock=24:00&pwWeather=snow', true)), undefined);
  assert.equal(await page.evaluate(() => window.probe.shadows[1].sparkle), true);
  assert.deepEqual(await page.evaluate(() => window.probe.time), { phase: 'night', weather: 'rain' });
  await page.evaluate(() => { window.probe.fishing.onShadowTap(0); window.probe.fishing.onShadowTap(1); });
  await page.waitForFunction(() => window.probe.fishing.phase === 'casting');
  assert.equal(await page.evaluate(() => window.probe.frozen), true);
  await page.evaluate(() => window.probe.fishing.reel());
  await page.waitForFunction(() => !window.probe.fishing.busy);
  assert.equal(await page.locator('#message').textContent(), '너무 빨랐어요!');
  assert.equal(await page.evaluate(() => window.probe.shadows.length), 3);
  assert.equal(await page.evaluate(() => window.probe.starts), 1);
  assert.equal(await page.evaluate(() => window.probe.finished[0].landed), false);
  await page.evaluate(() => window.probe.fishing.onShadowTap(0));
  await page.waitForFunction(() => window.probe.fishing.phase === 'bite');
  await page.evaluate(() => window.probe.fishing.reel());
  await page.getByTestId('catch-card').waitFor();
  assert.match(await page.getByTestId('catch-card').textContent(), /10.5cm/);
  assert.equal(await page.getByTestId('catch-card').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  await page.waitForFunction(() => !window.probe.frozen && window.probe.fishing.state.remaining === 5);
  await page.getByTestId('catch-card').waitFor({ state: 'hidden', timeout: 5000 });
  await page.evaluate(() => { window.probe.setStartDelay(200); window.probe.fishing.onShadowTap(0); window.probe.fishing.cancel(); });
  await page.waitForFunction(() => !window.probe.fishing.busy && window.probe.finished.length === 3);
  assert.equal(await page.evaluate(() => window.probe.finished[2].landed), false);
  await page.evaluate(() => { window.probe.setStartDelay(0); window.probe.setFinishDelay(200); window.probe.fishing.onShadowTap(0); });
  await page.waitForFunction(() => window.probe.fishing.phase === 'casting');
  await page.evaluate(() => { window.probe.fishing.cancel(); window.probe.fishing.cancel(); window.probe.fishing.onShadowTap(0); });
  await page.waitForFunction(() => !window.probe.fishing.busy);
  assert.equal(await page.evaluate(() => window.probe.finished.length), 4);
  await page.evaluate(() => { window.probe.setRemaining(0); window.probe.fishing.refresh(); });
  await page.waitForFunction(() => window.probe.shadows.length === 0);
  const starts = await page.evaluate(() => window.probe.starts);
  await page.evaluate(() => window.probe.fishing.onShadowTap(0));
  assert.equal(await page.evaluate(() => window.probe.starts), starts);
  assert.deepEqual(errors, []);
  await page.close();
  console.log('PASS isolated controller: shadows, sparkle, tint, duplicate tap, early retry, landed refresh, catch toast, pending cancellation, finish lock, zero budget');
}
async function enterRiver(page, query = '', walkToDock = true) {
  await page.goto(`${BASE}/tests/pixel-world-phaser/harness.html?fishing=1&pet=none${query}`);
  await page.waitForFunction(() => document.querySelector('.pwp-root')?.dataset.status === 'ready');
  const exists = await page.evaluate(() => Object.keys(window.__pixelWorldPhaser.debug().exits).some(key => /river|east/i.test(key)));
  assert.ok(exists, 'Integration dependency: yard→river exit must be installed');
  await page.evaluate(() => {
    const h = window.__pixelWorldPhaser;
    const exits = h.debug().exits;
    const key = Object.keys(exits).find(key => /river|east/i.test(key));
    h.walkToScreen(exits[key].x, exits[key].y);
  });
  await page.waitForFunction(() => window.__pixelWorldPhaser.debug().scene === 'river' && !window.__pixelWorldPhaser.debug().transitioning);
  if (!walkToDock) return;
  // 들어온 자리(서쪽 둑)에서는 물이 화면 밖이다 — 선착장 끝까지 걸어가 그림자가 보이게 한다.
  await page.evaluate(() => { const h = window.__pixelWorldPhaser, d = h.debug(); h.walkToScreen((17 * 16 + 8 - d.camera.x) * d.cssZoom, (11 * 16 + 8 - d.camera.y) * d.cssZoom); });
  await page.waitForFunction(() => { const d = window.__pixelWorldPhaser.debug(); return !d.moving && d.pathLength === 0 && d.x > 17 * 16; }, null, { timeout: 20000 });
  await page.waitForTimeout(400);
}
async function tapShadow(page) {
  await page.waitForFunction(() => window.__pixelWorldPhaser.debug().targets['shadow:0']);
  const point = await page.evaluate(() => window.__pixelWorldPhaser.debug().targets['shadow:0']);
  await page.locator('.pwp-surface').tap({ position: point });
}
try {
  await controllerChecks();
  if (process.env.PWP_CONTROLLER_ONLY === '1') {
    console.log('PASS controller-only verification; river integration requires the scene worker');
  } else {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1180, height: 820 }]) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await enterRiver(page); await tapShadow(page);
    await page.waitForFunction(() => document.querySelector('.pwp-root')?.dataset.fishingPhase === 'bite');
    const before = await page.evaluate(() => window.__pixelWorldPhaser.debug());
    await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(120); await page.keyboard.up('ArrowLeft');
    const after = await page.evaluate(() => window.__pixelWorldPhaser.debug());
    assert.equal(after.x, before.x); assert.equal(after.y, before.y);
    await page.locator('.pwp-btn-a').tap();
    await page.getByTestId('catch-card').waitFor();
    assert.equal(await page.getByTestId('catch-card').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
    await page.getByTestId('catch-card').waitFor({ state: 'hidden', timeout: 5000 });
    await tapShadow(page); await page.locator('.pwp-btn-a').tap();
    await page.getByText('너무 빨랐어요!', { exact: true }).waitFor();
    await page.waitForFunction(() => !!window.__pixelWorldPhaser.debug().targets['shadow:0']);
    assert.deepEqual(errors, []);
    await enterRiver(page, '&fishingBudget=0', false);
    await page.getByText('오늘은 물고기들이 쉬고 있어요. 내일 또 와요!', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => Object.keys(window.__pixelWorldPhaser.debug().targets).filter(key => key.startsWith('shadow:')).length), 0);
    await context.close(); console.log(`PASS fishing ${viewport.width}: landed, early retry, freeze, toast, zero budget`);
  }
  }
} finally { await browser.close(); await unlink('.fishing-controller-fixture.html').catch(() => {}); }
