// Real PixelRoom component + real browser, intercepted REST (same pattern as
// tests/pixelShop/browser.mjs). Verifies the new entrance doormat: always visible (no purchase/
// ownership needed), never blocks clicks (walking onto/through it still works exactly like any
// other floor cell, including reaching the plaza), and furniture still can't be placed on the
// reserved door cells with the doormat present.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const out = process.env.UI_OUTPUT || 'node_modules/.cache/pixel-doormat';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const catalog = PIXEL_CATALOG.map(i => ({ item_id: i.itemId, category: i.category, slot: i.slot, price: i.price, asset_key: i.assetKey, display_name: i.displayName, tier: i.tier, stackable: false }));

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const state = { owned: new Set(['furniture_chair']), equipment: { top: null, bottom: null, shoes: null, hair: null, eyes: null }, balance: 10000, placements: new Map() };
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    let data = [];
    if (url.pathname.endsWith('/pixel_item_catalog')) data = catalog;
    else if (url.pathname.endsWith('/pixel_item_ownership')) data = [...state.owned].map(item_id => ({ item_id }));
    else if (url.pathname.endsWith('/pixel_avatar_equipment')) data = state.equipment;
    else if (url.pathname.endsWith('/pixel_furniture_placement')) data = [...state.placements.entries()].map(([item_id, pos]) => ({ item_id, x: pos.x, y: pos.y }));
    else if (url.pathname.endsWith('/save_pixel_room_layout')) {
      const { p_placements } = route.request().postDataJSON();
      state.placements = new Map(p_placements.map(p => [p.itemId, { x: p.x, y: p.y }]));
      data = { ok: true, count: p_placements.length };
    } else return route.abort();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5174/tests/pixel-room/?tab=pixelRoom&user=doormat-user&testBalance=10000');
  await page.locator('.pr-actor').waitFor();

  // Always visible, no purchase/ownership needed — this account owns nothing but a chair and
  // never touched a shop, yet the doormat renders from the very first frame.
  await page.locator('.pr-doormat').waitFor({ timeout: 2000 });
  await page.screenshot({ path: `${out}/room.png` });

  // Confirm furniture still can't be placed on the reserved door cells even with the doormat
  // sitting there visually — checked BEFORE walking to the door, since reaching it triggers the
  // room->plaza transition (below) and unmounts the room.
  await page.locator('.pr-sheet-trigger button').filter({ hasText: '가구' }).click();
  await page.locator('.pr-catalog button').filter({ hasText: '작은 의자' }).click();
  // Close the sheet drawer — it covers the bottom row (where the door/doormat live) while open.
  await page.locator('.pr-sheet-trigger button').filter({ hasText: '가구' }).click();
  await page.getByRole('button', { name: '5열 8행에 배치', exact: true }).click();
  assert.equal(await page.locator('[data-furniture="chair"]').count(), 0, '문 칸에는 카펫이 있어도 가구가 놓이면 안 된다');
  const message = await page.locator('#pr-instructions').innerText();
  assert.equal(message, '문 앞 칸에는 가구를 놓을 수 없어요.');

  // Walking onto the door cell (through/over the doormat) still works exactly like any other
  // floor cell — the doormat is decoration only (pointer-events:none), never a click target of
  // its own. The fade transition into the plaza itself is already covered by the existing Phase
  // 2A tests (tests/plaza/*.browser.mjs); this just confirms the click wasn't swallowed by the rug.
  // Leave decorating mode first — the rejected placement above left it on, and clicking a cell
  // while decorating tries to place/select furniture rather than walk.
  await page.getByRole('button', { name: '꾸미기 완료', exact: true }).click();
  await page.getByRole('button', { name: '5열 8행에 배치', exact: true }).click();
  await page.waitForFunction(() => {
    const actor = document.querySelector('.pr-actor');
    return actor?.getAttribute('data-x') === '4' && actor?.getAttribute('data-y') === '7';
  }, { timeout: 5000 });

  assert.deepEqual(errors, []);
  console.log('PASS: doormat always visible without ownership, never blocks walking to the door/plaza, and the reserved-cell no-furniture rule still holds');
} finally {
  await browser.close();
}
