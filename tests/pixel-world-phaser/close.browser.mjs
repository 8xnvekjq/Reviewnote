// 실제 셸에서 터치·펜·키보드의 닫기와 입력 누출을 확인한다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.PWP_BASE ?? 'http://127.0.0.1:5174';
const SHOTS = '.pixel-world-test.local';
await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch({ headless: true });
const debug = page => page.evaluate(() => window.__pixelWorldPhaser.debug());
const scene = (page, id) => page.waitForFunction(id => {
  const d = window.__pixelWorldPhaser?.debug(); return d?.scene === id && !d.transitioning;
}, id);
const walk = (page, group, id) => page.evaluate(({ group, id }) => {
  const h = window.__pixelWorldPhaser, points = h.debug()[group];
  const p = points[id] ?? points[Object.keys(points).find(key => key.startsWith(id + ':'))];
  h.walkToScreen(p.x, p.y);
}, { group, id });
const center = async locator => { const b = await locator.boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const noRunning = async page => {
  // 멈춰 있을 때만 확인하면 run 입력 누출을 놓치므로 이동하면서 검사한다.
  await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(100);
  assert.equal((await debug(page)).running, false);
  await page.keyboard.up('ArrowLeft');
};
const closeB = async (page, cdp, pointerType) => {
  const button = page.locator('.pwp-btn-b'), point = await center(button);
  assert.equal(await button.locator('small').textContent(), '닫기');
  assert.equal(await page.evaluate(p => document.elementFromPoint(p.x, p.y)?.closest('.pwp-btn-b') !== null, point), true);
  if (pointerType === 'touch') {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] });
  } else {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen' });
  }
  await page.waitForFunction(() => !document.querySelector('.pwp-window, .pwp-dialogue'));
  await noRunning(page);
  if (pointerType === 'touch') await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  else await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
  await noRunning(page);
};

try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1180, height: 820 }]) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    await context.route('**/src/services/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: "export { supabase } from '/tests/pixel-world-phaser/fakeRealtime.mjs';" }));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // 자동 전체화면이 테스트 뷰포트를 바꾸지 않도록 한다.
    await page.addInitScript(() => Object.defineProperty(document, 'fullscreenEnabled', { value: false }));
    const cdp = await context.newCDPSession(page);
    await page.goto(`${BASE}/tests/pixel-world-phaser/harness.html?farm=1&roomEdit=1&pet=none`);
    await page.waitForFunction(() => document.querySelector('.pwp-root')?.dataset.status === 'ready');

    for (const pointerType of ['touch', 'pen']) {
      await page.getByRole('button', { name: '옷장', exact: true }).click();
      const wardrobe = page.getByRole('dialog', { name: '옷장', exact: true }); await wardrobe.waitFor();
      await wardrobe.locator('h2').tap(); assert.equal(await wardrobe.count(), 1);
      await page.screenshot({ path: `${SHOTS}/close-wardrobe-${viewport.width}-${pointerType}.png` });
      await closeB(page, cdp, pointerType);
      await walk(page, 'targets', 'farm:0'); await page.getByRole('dialog', { name: '1번 토마토 밭', exact: true }).waitFor();
      await closeB(page, cdp, pointerType);
      await walk(page, 'targets', 'scarecrow'); await page.getByRole('button', { name: '수확물 보기', exact: true }).click();
      await page.getByRole('dialog', { name: '수확물 보기', exact: true }).waitFor(); await closeB(page, cdp, pointerType);
      await walk(page, 'targets', 'scarecrow'); await page.getByRole('button', { name: '이야기하기', exact: true }).click();
      await page.locator('.pwp-dialogue').waitFor();
      // A는 기존처럼 대사를 완성한다.
      await page.locator('.pwp-btn-a').tap(); assert.equal(await page.locator('.pwp-dialogue').count(), 1);
      await closeB(page, cdp, pointerType);
    }
    for (const key of ['x', 'Escape']) {
      await page.getByRole('button', { name: '옷장', exact: true }).click();
      await page.keyboard.press(key); await page.locator('.pwp-window').waitFor({ state: 'detached' });
      await walk(page, 'targets', 'scarecrow'); await page.getByRole('button', { name: '이야기하기', exact: true }).click();
      await page.keyboard.press(key); await page.locator('.pwp-dialogue').waitFor({ state: 'detached' });
    }
    await page.getByRole('button', { name: '옷장', exact: true }).click();
    await page.touchscreen.tap(2, 2); await page.locator('.pwp-window').waitFor({ state: 'detached' });
    await walk(page, 'targets', 'scarecrow'); await page.getByRole('button', { name: '이야기하기', exact: true }).click();
    await page.touchscreen.tap(2, 2); await page.locator('.pwp-dialogue').waitFor({ state: 'detached' });

    await walk(page, 'exits', 'door'); await scene(page, 'room');
    for (const pointerType of ['touch', 'pen']) {
      await page.getByRole('button', { name: '꾸미기', exact: true }).click();
      await page.getByRole('dialog', { name: '가구', exact: true }).waitFor(); await closeB(page, cdp, pointerType);
    }
    await walk(page, 'exits', 'door'); await scene(page, 'yard');
    await walk(page, 'exits', 'gate'); await scene(page, 'plaza');
    for (const pointerType of ['touch', 'pen']) {
      for (const [id, name] of [['well', '우물의 오늘 한마디'], ['bench', '광장 벤치'], ['podium', '이번 주 토마토 대회']]) {
        await walk(page, 'targets', id); await page.getByRole('dialog', { name, exact: true }).waitFor();
        await closeB(page, cdp, pointerType);
      }
      await walk(page, 'targets', 'shop');
      await page.waitForFunction(() => window.__pixelWorldPhaser.debug().prompt === 'shop' && !window.__pixelWorldPhaser.debug().moving);
      await page.locator('.pwp-btn-a').tap(); await page.getByRole('dialog', { name: '상점', exact: true }).waitFor();
      await page.screenshot({ path: `${SHOTS}/close-shop-${viewport.width}-${pointerType}.png` });
      await closeB(page, cdp, pointerType);
    }
    await walk(page, 'targets', 'shop');
    await page.waitForFunction(() => window.__pixelWorldPhaser.debug().prompt === 'shop' && !window.__pixelWorldPhaser.debug().moving);
    await page.locator('.pwp-btn-a').tap();
    const shop = page.getByRole('dialog', { name: '상점', exact: true }); await shop.waitFor();
    await shop.getByRole('button', { name: '가구', exact: true }).click();
    const item = shop.locator('[data-item="furniture_aquarium"]');
    for (const back of ['B', 'Escape', 'x']) {
      await item.getByRole('button', { name: '구매하기', exact: true }).click();
      if (back === 'B') await page.locator('.pwp-btn-b').tap(); else await page.keyboard.press(back);
      await item.getByRole('button', { name: '구매 확정', exact: true }).waitFor({ state: 'detached' });
      assert.equal(await item.getByRole('button', { name: '구매 확정', exact: true }).count(), 0);
      assert.equal(await shop.count(), 1);
      assert.match(await page.locator('.pwp-points').textContent(), /1,234/);
    }
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '한마디 하기', exact: true }).click();
    await page.getByRole('textbox', { name: '한마디', exact: true }).fill('한마디');
    await page.locator('.pwp-btn-b').tap(); await page.locator('.pwp-chat-form').waitFor({ state: 'detached' });
    await noRunning(page);
    assert.deepEqual(errors, []);
    console.log(`PASS close ${viewport.width}×${viewport.height}: 터치·펜 B, 입력 누출, 내부/그늘 탭, x/Escape, 구매 취소, A 대사, 한마디`);
    await context.close();
  }
} finally { await browser.close(); }
