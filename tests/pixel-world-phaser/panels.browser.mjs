// Start the harness server before running this panel regression suite.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.PWP_BASE ?? 'http://127.0.0.1:5174';
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1180, height: 820 }]) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    await context.route('**/src/services/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: "export { supabase } from '/tests/pixel-world-phaser/fakeRealtime.mjs';" }));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/tests/pixel-world-phaser/harness.html`);
    await page.waitForFunction(() => window.__pixelWorldPhaser && document.querySelector('.pwp-root')?.dataset.status === 'ready');
    await page.evaluate(() => { window.__panelsOriginal = window.__pixelWorldPhaser; });
    const debug = () => page.evaluate(() => window.__pixelWorldPhaser.debug());
    assert.equal(await page.locator('.pwp-panel-access').getByRole('button', { name: '상점', exact: true }).count(), 0);
    assert.equal(await page.locator('.pwp-panel-access').getByRole('button', { name: '옷장', exact: true }).count(), 1);
    await page.evaluate(() => { const h = window.__pixelWorldPhaser, p = h.debug().exits.gate; h.walkToScreen(p.x, p.y); });
    await page.waitForFunction(() => window.__pixelWorldPhaser.debug().scene === 'plaza' && !window.__pixelWorldPhaser.debug().transitioning);
    await page.evaluate(() => { const h = window.__pixelWorldPhaser, p = h.debug().targets.shop; h.walkToScreen(p.x, p.y); });
    await page.waitForFunction(() => window.__pixelWorldPhaser.debug().prompt === 'shop' && !window.__pixelWorldPhaser.debug().moving);
    assert.equal(await page.getByRole('dialog', { name: '상점', exact: true }).count(), 0, 'arrival faces the stall and waits for A');
    await page.locator('.pwp-btn-a').click();
    const shop = page.getByRole('dialog', { name: '상점', exact: true });
    await shop.waitFor();
    const frozen = await debug();
    await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(200); await page.keyboard.up('ArrowLeft');
    assert.deepEqual([(await debug()).x, (await debug()).y], [frozen.x, frozen.y]);
    const bounds = await shop.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height);
    await page.waitForFunction(() => [...document.querySelectorAll('.pwp-item-art canvas')].every(canvas => canvas.dataset.ready === 'true'));
    // Every catalog preview is an isolated crop, including fashion, furniture and pets.
    const crops = await shop.locator('.pwp-item-art').evaluateAll(nodes => nodes.map(node => ({
      item: node.closest('[data-item]').dataset.item,
      canvas: node.querySelector('canvas')?.dataset.ready,
      svg: !!node.querySelector('svg'),
    })));
    assert.ok(crops.length > 0);
    assert.ok(crops.every(crop => crop.canvas === 'true' && !crop.svg));
    await page.screenshot({ path: `scratch/fix-shop-top-${viewport.width}.png` });
    const content = shop.locator('.pwp-panel-content');
    const tabs = await shop.locator('.pwp-tabs').boundingBox();
    const header = await shop.locator('header').boundingBox();
    const gridBounds = await content.boundingBox();
    const cdp = await context.newCDPSession(page);
    const x = gridBounds.x + gridBounds.width / 2;
    const y = gridBounds.y + gridBounds.height - 40;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    for (let step = 1; step <= 8; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - step * 25, id: 1 }] });
      await page.waitForTimeout(20);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForFunction(() => document.querySelector('.pwp-panel-content').scrollTop > 0);
    assert.deepEqual(await shop.locator('.pwp-tabs').boundingBox(), tabs);
    assert.deepEqual(await shop.locator('header').boundingBox(), header);
    assert.deepEqual(await shop.boundingBox(), bounds);
    assert.equal(await page.evaluate(() => window.scrollY), 0);
    await page.screenshot({ path: `scratch/fix-shop-${viewport.width}.png` });
    await shop.getByRole('button', { name: '가구', exact: true }).click();
    const plant = shop.locator('[data-item="furniture_plant"]');
    await plant.getByRole('button', { name: '구매하기' }).click();
    await plant.getByRole('button', { name: '취소', exact: true }).click();
    assert.match(await page.locator('.pwp-points').textContent(), /1,234/);
    await plant.getByRole('button', { name: '구매하기' }).click();
    await plant.getByRole('button', { name: '구매 확정' }).click();
    await page.waitForFunction(() => document.querySelector('[data-item="furniture_plant"]')?.dataset.state === 'owned');
    assert.match(await page.locator('.pwp-points').textContent(), /1,209/);
    assert.match(await shop.getByRole('status').textContent(), /구매 완료/);
    // 여러 가구를 구입한 뒤 남은 상품의 포인트 부족 상태를 확인한다.
    for (const id of ['furniture_aquarium', 'furniture_bed', 'furniture_television', 'furniture_roundtable']) {
      const item = shop.locator(`[data-item="${id}"]`);
      await item.getByRole('button', { name: '구매하기' }).click();
      await item.getByRole('button', { name: '구매 확정' }).click();
      await page.waitForFunction(id => document.querySelector(`[data-item="${id}"]`)?.dataset.state === 'owned', id);
    }
    assert.ok(await shop.locator('.pwp-short').count() > 0);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '옷장', exact: true }).click();
    const wardrobe = page.getByRole('dialog', { name: '옷장', exact: true });
    const wardrobeBounds = await wardrobe.boundingBox();
    assert.ok(wardrobeBounds.x >= 0 && wardrobeBounds.y >= 0 && wardrobeBounds.x + wardrobeBounds.width <= viewport.width && wardrobeBounds.y + wardrobeBounds.height <= viewport.height);
    const before = await debug();
    await wardrobe.getByRole('button', { name: '상의', exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.pwp-window canvas')].every(canvas => canvas.dataset.ready === 'true'));
    const wardrobeHeader = await wardrobe.locator('header').boundingBox();
    const wardrobeTabs = await wardrobe.locator('.pwp-tabs').boundingBox();
    const wardrobeContent = wardrobe.locator('.pwp-panel-content');
    if (await wardrobeContent.evaluate(node => node.scrollHeight > node.clientHeight)) {
      const rect = await wardrobeContent.boundingBox();
      const wx = rect.x + rect.width / 2, wy = rect.y + rect.height - 40;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: wx, y: wy, id: 1 }] });
      for (let step = 1; step <= 8; step++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: wx, y: wy - step * 25, id: 1 }] });
        await page.waitForTimeout(20);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForFunction(() => document.querySelector('.pwp-panel-content').scrollTop > 0);
      assert.deepEqual(await wardrobe.locator('header').boundingBox(), wardrobeHeader);
      assert.deepEqual(await wardrobe.locator('.pwp-tabs').boundingBox(), wardrobeTabs);
      assert.deepEqual(await wardrobe.boundingBox(), wardrobeBounds);
    }
    await page.screenshot({ path: `scratch/fix-wardrobe-${viewport.width}.png` });
    const fashion = wardrobe.locator('[data-item="top_blouse_rose"]');
    await fashion.getByRole('button', { name: '장착하기' }).click();
    await page.waitForFunction(key => window.__pixelWorldPhaser.debug().avatarKey !== key, before.avatarKey);
    await wardrobe.getByRole('button', { name: '기본 상의', exact: true }).click();
    await wardrobe.getByRole('button', { name: '기본 외형', exact: true }).click();
    const previousKey = (await debug()).avatarKey;
    await wardrobe.getByRole('button', { name: '아이보리', exact: true }).click();
    await page.waitForFunction(key => window.__pixelWorldPhaser.debug().avatarKey !== key, previousKey);
    await wardrobe.getByRole('button', { name: '펫', exact: true }).click();
    await wardrobe.getByRole('button', { name: '친구 쉬게 하기' }).click();
    await page.waitForFunction(() => window.__pixelWorldPhaser.debug().pet === null);
    await wardrobe.locator('[data-item="pet_duck"]').getByRole('button', { name: '함께 살기' }).click();
    await page.waitForFunction(() => window.__pixelWorldPhaser.debug().petId === 'pet_duck');
    assert.equal(await page.evaluate(() => window.__panelsOriginal === window.__pixelWorldPhaser), true);
    assert.deepEqual([(await debug()).x, (await debug()).y], [before.x, before.y]);
    await wardrobe.getByRole('button', { name: '옷장 닫기' }).click();
    await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(200); await page.keyboard.up('ArrowLeft');
    assert.notEqual((await debug()).x, before.x);
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally { await browser.close(); }
