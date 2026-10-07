// 실행 전 하네스 서버를 띄운다. 브라우저 테스트는 작업 지시대로 작성만 한다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.PWP_BASE ?? 'http://127.0.0.1:5174';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1180, height: 820 }]) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/tests/pixel-world-phaser/harness.html`);
    await page.waitForFunction(() => window.__pixelWorldPhaser && document.querySelector('.pwp-root')?.dataset.status === 'ready');
    await page.evaluate(() => { window.__panelsOriginal = window.__pixelWorldPhaser; });
    const debug = () => page.evaluate(() => window.__pixelWorldPhaser.debug());
    await page.getByRole('button', { name: '상점', exact: true }).click();
    const shop = page.getByRole('dialog', { name: '상점', exact: true });
    await shop.waitFor();
    const frozen = await debug();
    await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(200); await page.keyboard.up('ArrowLeft');
    assert.deepEqual([(await debug()).x, (await debug()).y], [frozen.x, frozen.y]);
    const bounds = await shop.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height);
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
    const before = await debug();
    await wardrobe.getByRole('button', { name: '상의', exact: true }).click();
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
