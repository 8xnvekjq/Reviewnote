import { assertReelLayout, trackReel } from './reel-player.browser-helper.mjs';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
const BASE = process.env.PWP_BASE ?? 'http://127.0.0.1:5198';
await mkdir('.pixel-world-test.local/fishing', { recursive: true });
const browser = await chromium.launch({ headless: true });
async function tapToLand(page, pointerType = 'touch') {
  await trackReel(page, pointerType);
  await page.getByTestId('catch-card').waitFor({ timeout: 5000 });
}
// 파일이 아직 병합되지 않았을 때만 이 테스트 안의 최소 mock으로 제어기를 검증한다.
async function controllerChecks() {
  const page = await browser.newPage({ hasTouch: true });
  const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error('BROWSER:', error.message); });
  const fixture = `<!doctype html><div id="root"></div><script type="module">
    import React from 'react';
    const { useRef, useState } = React;
    import ReactDOM from 'react-dom/client';
    const { createRoot } = ReactDOM;
    import { useFishing } from '/src/features/pixel-world-phaser/ui/useFishing.ts';
    import { ReelBar } from '/src/features/pixel-world-phaser/ui/ReelBar.tsx';
    import { ReelJoystick } from '/src/features/pixel-world-phaser/ui/ReelJoystick.tsx';
    import '/src/features/pixel-world-phaser/gameShell.css';
    import { PlazaChat } from '/src/features/pixel-world-phaser/ui/PlazaChat.tsx';
    import { CatchCard } from '/src/features/pixel-world-phaser/ui/CatchCard.tsx';
    import { fishingOverride } from '/src/features/pixel-world-phaser/PixelWorldPhaser.tsx';
    window.fishingOverride = fishingOverride;
    let difficulty = 1, remaining = -1, pending = null, finished = [], starts = 0, startDelay = 0, finishDelay = 0, frozen = false, shadows = [], time = null;
    const adapter = {
      state: async () => ({ kstDate: '2026-10-08', phase: 'night', weather: 'rain', remaining, sparkleShadow: 1, pigeonHint: null, album: [] }),
      start: async () => { starts++; await new Promise(r => setTimeout(r, startDelay)); pending = 'cast-' + starts; return { ok: true, castId: pending, shadow: 'L', biteDelayMs: 500, difficulty, big: true, pattern: 'quick', hint: null }; },
      finish: async (id, landed) => { finished.push({ id, landed }); await new Promise(r => setTimeout(r, finishDelay)); if (id !== pending) return { ok: false }; pending = null; if (!landed) return { ok: true, landed: false };  return { ok: true, landed: true, speciesId: 'pirami', lengthCm: 10.5, rarity: 'rare', isNew: true, isBig: true, isPersonalBest: true, remaining }; },
      board: async () => ({ rows: [], classSpecies: 0 })
    };
    function Probe() {
      const [scene, setScene] = useState('river');
      const handle = useRef({ cancelWalk() {}, setShadows(value) { shadows = value; }, setWorldTime(phase, weather) { time = { phase, weather }; } });
      const fishing = useFishing({ adapter, handle, scene, pet: null, freeze: value => { frozen = value; } });
      window.probe = { fishing, get frozen() { return frozen; }, get shadows() { return shadows; }, get time() { return time; }, get finished() { return finished; }, get starts() { return starts; }, setScene, setDifficulty: value => { difficulty = value; }, setRemaining: value => { remaining = value; }, setStartDelay: value => { startDelay = value; }, setFinishDelay: value => { finishDelay = value; } };
      return React.createElement('div', { className: 'pwp-root', onContextMenu: event => { if (!event.target.closest('input, textarea, select, [contenteditable="true"]')) event.preventDefault(); } },
        React.createElement(PlazaChat, { disabled: false, onSend: async () => 'ok', onStatus() {} }),
        React.createElement('p', { id: 'phase' }, fishing.phase),
        React.createElement('p', { id: 'message' }, fishing.message),
        fishing.reelState && React.createElement(ReelBar, { game: fishing.reelState }),
        fishing.reelState && React.createElement(ReelJoystick, { onAxis: fishing.setReelX }),
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
  await page.getByTestId('reel-bar').waitFor();
  assert.equal(await page.evaluate(() => window.probe.finished.length), 1);
  await tapToLand(page, 'keyboard');
  assert.match(await page.getByTestId('catch-card').textContent(), /10.5cm/);
  assert.equal(await page.getByTestId('catch-card').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  await page.waitForFunction(() => !window.probe.frozen && window.probe.fishing.state.remaining === -1);
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
  await page.waitForFunction(() => window.probe.shadows.length === 3);
  await page.evaluate(() => { window.probe.setFinishDelay(0); window.probe.fishing.onShadowTap(0); });
  await page.waitForFunction(() => window.probe.fishing.phase === 'bite');
  await page.evaluate(() => window.probe.fishing.reel());
  await page.getByTestId('reel-bar').waitFor();
  await page.evaluate(() => {
    document.querySelector('.pwp-root').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 77, pointerType: 'pen', bubbles: true, cancelable: true }));
    document.querySelector('.pwp-root').dispatchEvent(new PointerEvent('pointercancel', { pointerId: 77, pointerType: 'pen', bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => window.probe.fishing.phase === 'missed');
  assert.equal(await page.evaluate(() => window.probe.finished.at(-1).landed), false);
  assert.doesNotMatch(await page.locator('body').textContent(), /budget|6\/day/);
  assert.equal(await page.getByText('오늘 남은 낚시', { exact: false }).count(), 0);
  assert.equal(await page.getByText('오늘은 물고기들이 쉬고 있어요.', { exact: false }).count(), 0);
  await page.evaluate(() => window.probe.fishing.onShadowTap(0));
  await page.waitForFunction(() => window.probe.fishing.phase === 'bite');
  await page.evaluate(() => window.probe.fishing.reel());
  await page.getByTestId('reel-bar').waitFor();
  await page.waitForFunction(() => !window.probe.fishing.busy);
  assert.equal(await page.evaluate(() => window.probe.finished.at(-1).landed), false, 'no taps escapes');
  await page.evaluate(() => window.probe.fishing.onShadowTap(0));
  await page.waitForFunction(() => window.probe.fishing.phase === 'bite');
  await page.evaluate(() => window.probe.fishing.reel());
  await page.mouse.move(20, 300); await page.mouse.down();
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => window.probe.fishing.reelState?.tapCount), 1, 'holding gives one boost');
  assert.equal(await page.locator('.pwp-root').evaluate(el => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    el.dispatchEvent(event); return event.defaultPrevented;
  }), true);
  await page.mouse.up();
  await page.waitForFunction(() => !window.probe.fishing.busy);
  assert.equal(await page.evaluate(() => window.probe.finished.at(-1).landed), false);
  await page.evaluate(() => window.probe.fishing.onShadowTap(0));
  await page.waitForFunction(() => window.probe.fishing.phase === 'bite');
  await page.evaluate(() => window.probe.fishing.reel());
  await page.locator('.pwp-root').dispatchEvent('pointerdown', { pointerId: 101, pointerType: 'touch', button: 0 });
  await page.locator('.pwp-root').dispatchEvent('pointerdown', { pointerId: 101, pointerType: 'touch', button: 0 });
  await page.locator('.pwp-root').dispatchEvent('pointerup', { pointerId: 101, pointerType: 'touch' });
  await page.locator('.pwp-root').dispatchEvent('pointerdown', { pointerId: 102, pointerType: 'mouse', button: 0 });
  await page.locator('.pwp-root').dispatchEvent('pointercancel', { pointerId: 102, pointerType: 'mouse' });
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.probe.fishing.reelState.tapCount), 1, 'compatibility and duplicate events do not boost twice');
  await page.evaluate(() => window.probe.fishing.cancel());
  await page.waitForFunction(() => !window.probe.fishing.busy);
  await page.evaluate(() => window.probe.fishing.onShadowTap(0));
  await page.waitForFunction(() => window.probe.fishing.phase === 'bite');
  await page.evaluate(() => window.probe.fishing.reel());
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(120); await page.keyboard.up('ArrowRight');
  assert.ok(await page.evaluate(() => window.probe.fishing.reelState.zoneX > 0));
  await page.keyboard.down('a'); await page.waitForTimeout(200); await page.keyboard.up('a');
  assert.ok(await page.evaluate(() => window.probe.fishing.reelState.velocityX < 0));
  assert.equal(await page.evaluate(() => window.probe.fishing.reelState.tapCount), 0, 'A key steers without boosting');
  await page.keyboard.down('w'); await page.keyboard.down('w'); await page.waitForTimeout(100); await page.keyboard.up('w');
  assert.equal(await page.evaluate(() => window.probe.fishing.reelState.tapCount), 1, 'holding W gives one boost');
  await page.keyboard.press('ArrowUp'); await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => window.probe.fishing.reelState.tapCount), 2);
  await page.keyboard.press('b'); await page.waitForFunction(() => !window.probe.fishing.busy);
  await page.locator('.pwp-chat-button').click();
  const chat = page.locator('.pwp-chat-form input');
  await chat.pressSequentially('a space b');
  assert.equal(await chat.inputValue(), 'a space b');
  assert.equal(await chat.evaluate(el => getComputedStyle(el).userSelect), 'text');
  assert.equal(await chat.evaluate(el => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); el.dispatchEvent(event); return event.defaultPrevented;
  }), false);
  await page.locator('.pwp-chat-close').click();
  for (const width of [390, 1180]) for (const difficulty of [1, 5]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(d => window.probe.setDifficulty(d), difficulty);
    await page.evaluate(() => window.probe.fishing.onShadowTap(0));
    await page.waitForFunction(() => window.probe.fishing.phase === 'bite');
    await page.evaluate(() => window.probe.fishing.reel());
    await page.getByTestId('reel-bar').waitFor();
    await assertReelLayout(page);
    await page.screenshot({ path: `.pixel-world-test.local/fishing/reel-d${difficulty}-${width}.png` });
    if (difficulty === 5) {
      // 높은 난도는 화면을 확인하고 쉬운 mock에서 실제 입력으로 잡기를 검증한다.
      await page.evaluate(() => window.probe.fishing.cancel());
      await page.waitForFunction(() => !window.probe.fishing.busy);
      continue;
    }
    await tapToLand(page, width === 390 ? 'touch' : 'pen');
    await page.waitForFunction(() => !window.probe.fishing.busy);
  }
  await page.evaluate(() => window.probe.fishing.onShadowTap(0));
  await page.waitForFunction(() => window.probe.fishing.phase === 'bite');
  await page.evaluate(() => window.probe.fishing.reel());
  await page.keyboard.press('b');
  await page.waitForFunction(() => !window.probe.fishing.busy);
  assert.equal(await page.evaluate(() => window.probe.finished.at(-1).landed), false);
  assert.deepEqual(errors, []);
  await page.close();
  console.log('PASS isolated controller: shadows, sparkle, tint, duplicate tap, early retry, landed refresh, catch toast, pending cancellation, finish lock, unlimited, timestamped reel taps, pen cancellation');
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
  // 선착장 끝(물가 자리 11,11)까지 걸어가 그 자리에서 바로 던진다(강가 꾸미기 이후 배치).
  await page.evaluate(() => { const h = window.__pixelWorldPhaser, d = h.debug(); h.walkToScreen((11 * 16 + 8 - d.camera.x) * d.cssZoom, (11 * 16 + 8 - d.camera.y) * d.cssZoom); });
  await page.waitForFunction(() => { const d = window.__pixelWorldPhaser.debug(); return !d.moving && d.pathLength === 0 && d.x > 11 * 16; }, null, { timeout: 20000 });
  await page.waitForTimeout(400);
}
async function tapShadow(page) {
  await page.waitForFunction(() => window.__pixelWorldPhaser.debug().targets['shadow:0']);
  const point = await page.evaluate(() => window.__pixelWorldPhaser.debug().targets['shadow:0']);
  await page.locator('.pwp-surface').tap({ position: point });
}
try {
  if (process.env.PWP_INTEGRATION_ONLY !== '1') await controllerChecks();
  if (process.env.PWP_CONTROLLER_ONLY === '1') {
    console.log('PASS controller-only verification; river integration requires the scene worker');
  } else {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1180, height: 820 }]) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await enterRiver(page); await tapShadow(page);
    const before = await page.evaluate(() => window.__pixelWorldPhaser.debug());
    await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(120); await page.keyboard.up('ArrowLeft');
    const after = await page.evaluate(() => window.__pixelWorldPhaser.debug());
    assert.equal(after.x, before.x); assert.equal(after.y, before.y);
    await page.waitForFunction(() => document.querySelector('.pwp-root')?.dataset.fishingPhase === 'bite');
    await page.locator('.pwp-btn-a').tap();
    await page.getByTestId('reel-bar').waitFor();
    await assertReelLayout(page);
    await page.screenshot({ path: `.pixel-world-test.local/fishing/river-reel-${viewport.width}.png` });
    await tapToLand(page);
    assert.equal(await page.getByTestId('catch-card').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
    await page.getByTestId('catch-card').waitFor({ state: 'hidden', timeout: 5000 });
    await tapShadow(page);
    await page.waitForFunction(() => document.querySelector('.pwp-root')?.dataset.fishingPhase === 'bite');
    await page.locator('.pwp-btn-a').tap();
    await page.getByTestId('reel-bar').waitFor();
    await page.mouse.move(20, 300); await page.mouse.down();
    await page.waitForTimeout(1500);
    assert.equal(await page.getByTestId('reel-bar').count(), 1, 'long press does not dismiss reel');
    const contextmenuPrevented = await page.locator('.pwp-surface').evaluate(el => {
      let prevented = false;
      document.addEventListener('contextmenu', event => { prevented = event.defaultPrevented; }, { once: true });
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      return prevented;
    });
    assert.equal(contextmenuPrevented, true, 'page sees contextmenu already prevented');
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('.pwp-root')?.dataset.fishingBusy === 'false');
    assert.equal(await page.getByTestId('catch-card').count(), 0, 'long press cannot land fish');
    await tapShadow(page); await page.locator('.pwp-btn-a').tap();
    await page.getByText('너무 빨랐어요!', { exact: true }).waitFor();
    await page.waitForFunction(() => !!window.__pixelWorldPhaser.debug().targets['shadow:0']);
    assert.deepEqual(errors, []);
    assert.equal(await page.getByText('오늘 남은 낚시', { exact: false }).count(), 0);
    assert.equal(await page.getByText('오늘은 물고기들이 쉬고 있어요.', { exact: false }).count(), 0);
    await context.close(); console.log(`PASS fishing ${viewport.width}: landed, early retry, freeze, toast, unlimited, touch taps, long press, contextmenu prevention`);
  }
  const chatPage = await browser.newPage();
  await chatPage.route('**/src/services/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: "export { supabase } from '/tests/pixel-world-phaser/fakeRealtime.mjs';" }));
  await chatPage.goto(`${BASE}/tests/pixel-world-phaser/harness.html`);
  await chatPage.waitForFunction(() => document.querySelector('.pwp-root')?.dataset.status === 'ready');
  assert.equal(await chatPage.locator('.pwp-root').evaluate(el => {
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); el.dispatchEvent(event); return event.defaultPrevented;
  }), true);
  await chatPage.evaluate(() => { const h = window.__pixelWorldPhaser, p = h.debug().exits.gate; h.walkToScreen(p.x, p.y); });
  await chatPage.waitForFunction(() => window.__pixelWorldPhaser.debug().scene === 'plaza' && !window.__pixelWorldPhaser.debug().transitioning);
  await chatPage.locator('.pwp-chat-button').click();
  const chat = chatPage.locator('.pwp-chat-form input');
  await chat.pressSequentially('a space b'); assert.equal(await chat.inputValue(), 'a space b');
  assert.equal(await chat.evaluate(el => getComputedStyle(el).userSelect), 'text');
  await chatPage.close(); console.log('PASS actual game root contextmenu prevention and plaza chat keyboard');
  }
} finally { await browser.close(); await unlink('.fishing-controller-fixture.html').catch(() => {}); }
