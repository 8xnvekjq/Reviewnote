// Start the harness server before running this panel regression suite.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = process.env.PWP_BASE ?? 'http://127.0.0.1:5174';
await mkdir('scratch/rods', { recursive: true });
await mkdir('.test-artifacts/pw-bugs-a', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1180, height: 820 }]) {
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
      rod: node.querySelector('img.pwp-rod-icon')?.complete && node.querySelector('img.pwp-rod-icon')?.naturalWidth === 16,
      bait: node.querySelector('img.pwp-bait-icon')?.complete && node.querySelector('img.pwp-bait-icon')?.naturalWidth === 16,
      svg: !!node.querySelector('svg'),
    })));
    assert.ok(crops.length > 0);
    assert.ok(crops.every(crop => (crop.canvas === 'true' || crop.rod || crop.bait) && !crop.svg));
    const assertArtFits = async panel => {
      await page.waitForFunction(() => [...document.querySelectorAll('.pwp-item-art canvas')].every(c => c.dataset.ready === 'true'));
      const overflow = await panel.locator('.pwp-item-art').evaluateAll(nodes => nodes.flatMap(node => {
        const box = node.getBoundingClientRect(), card = node.closest('.pwp-item, [data-room-item]').getBoundingClientRect();
        const fits = (a, b) => a.left >= b.left - .5 && a.top >= b.top - .5 && a.right <= b.right + .5 && a.bottom <= b.bottom + .5;
        return [...node.children].filter(child => !fits(child.getBoundingClientRect(), box) || !fits(child.getBoundingClientRect(), card)).map(() => node.closest('[data-item]')?.dataset.item);
      }));
      assert.deepEqual(overflow, [], 'every catalog preview fits its art box and card');
    };
    await assertArtFits(shop);
    const oldStyle = await page.addStyleTag({ content: '.pwp-item-art { grid-template-columns:none; grid-template-rows:none; } .pwp-item-art .pwp-art-canvas { min-width:auto; min-height:auto; }' });
    await page.screenshot({ path: `.test-artifacts/pw-bugs-a/shop-before-${viewport.width}.png` });
    await oldStyle.evaluate(node => node.remove());
    await page.screenshot({ path: `.test-artifacts/pw-bugs-a/shop-after-${viewport.width}.png` });
    await page.screenshot({ path: `scratch/fix-shop-top-${viewport.width}.png` });
    // 낚싯대·미끼는 강가 거북이가 판다 — 광장 상점에는 탭도 물건도 없다.
    for (const name of ['낚싯대', '미끼']) assert.equal(await shop.getByRole('button', { name, exact: true }).count(), 0);
    assert.equal(await shop.locator('[data-item^="rod_"], [data-item="bait_worm"]').count(), 0);
    await shop.getByText('낚싯대·미끼는 강가 거북이에게!').waitFor();
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
    await assertArtFits(shop);
    const previousFit = await page.addStyleTag({ content: '.pwp-item-art { grid-template-columns:none; grid-template-rows:none; } .pwp-item-art .pwp-art-canvas { min-width:auto; min-height:auto; }' });
    await page.screenshot({ path: `.test-artifacts/pw-bugs-a/furniture-before-${viewport.width}.png` });
    await previousFit.evaluate(node => node.remove());
    await page.screenshot({ path: `.test-artifacts/pw-bugs-a/furniture-after-${viewport.width}.png` });
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
    await assertArtFits(wardrobe);
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
    await page.goto(`${base}/tests/pixel-world-phaser/harness.html?roomEdit=all&pet=none`);
    await page.waitForFunction(() => document.querySelector('.pwp-root')?.dataset.status === 'ready');
    await page.evaluate(() => { const h = window.__pixelWorldPhaser, p = h.debug().exits.door; h.walkToScreen(p.x, p.y); });
    await page.waitForFunction(() => window.__pixelWorldPhaser.debug().scene === 'room' && !window.__pixelWorldPhaser.debug().transitioning);
    await page.getByRole('button', { name: '\uAFB8\uBBF8\uAE30', exact: true }).click();
    const placement = page.getByRole('dialog', { name: '\uAC00\uAD6C', exact: true });
    await placement.waitFor(); await assertArtFits(placement);
    assert.equal(await placement.locator('[data-room-item]').count(), await page.evaluate(async () => {
      const { PIXEL_CATALOG } = await import('/src/features/pixel-room/shop/catalog.ts');
      return PIXEL_CATALOG.filter(item => item.category === 'furniture').length;
    }));
    await page.screenshot({ path: `.test-artifacts/pw-bugs-a/placement-after-${viewport.width}.png` });
    assert.deepEqual(errors, []);
    console.log(`PASS plaza panels ${viewport.width}px: rod tab, shop purchase, balance, wardrobe, previews, movement lock`);
    await context.close();
  }
} finally { await browser.close(); }
