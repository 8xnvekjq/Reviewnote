// Real PixelRoom component + real browser, intercepted REST — no real Supabase account needed
// (same pattern as tests/pixelShop/browser.mjs). This test exists specifically to catch the
// race condition that shipped in PR #84/#85: usePixelShop resolves pixel_item_catalog as a
// SEPARATE, independently-timed fetch from pixel_item_ownership/pixel_avatar_equipment — so
// shop.catalog can change identity shortly AFTER shop.ready first flips true. The furniture
// server-load effect in PixelRoom.tsx used to list shop.catalog (and shop.ownedIds) in its
// dependency array; when catalog arrived late, React tore the effect down mid-flight, the
// abandoned closure's `cancelled` flag flipped true, and its `finally` block's
// `setRoomReady(true)` was then skipped forever — the user was stuck seeing
// "보유 정보를 불러온 뒤 배치할 수 있어요" no matter how long they waited. This test deliberately
// delays the catalog response LONGER than shop.ready's own resolution but SHORTER than the
// furniture-placement fetch, so that in the buggy code the tear-down reliably lands while the
// furniture fetch is still in flight — a deterministic repro, not a flaky timing coincidence.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const out = process.env.UI_OUTPUT || 'node_modules/.cache/pixel-furniture-race';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const catalog = PIXEL_CATALOG.map(i => ({ item_id: i.itemId, category: i.category, slot: i.slot, price: i.price, asset_key: i.assetKey, display_name: i.displayName, tier: i.tier, stackable: false }));
const CATALOG_DELAY_MS = 180;   // arrives after shop.ready
const FURNITURE_FETCH_DELAY_MS = 450; // still in flight when the (buggy) tear-down would hit

const delay = ms => new Promise(r => setTimeout(r, ms));

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const userId = 'race-user';
  const state = { owned: new Set(), equipment: { top: null, bottom: null, shoes: null, hair: null, eyes: null }, balance: 10000, placements: new Map() };
  const savedLayoutCalls = [];

  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    let data = [];
    if (url.pathname.endsWith('/pixel_item_catalog')) {
      await delay(CATALOG_DELAY_MS);
      data = catalog;
    } else if (url.pathname.endsWith('/pixel_item_ownership')) {
      data = [...state.owned].map(item_id => ({ item_id }));
    } else if (url.pathname.endsWith('/pixel_avatar_equipment')) {
      data = state.equipment;
    } else if (url.pathname.endsWith('/pixel_furniture_placement')) {
      await delay(FURNITURE_FETCH_DELAY_MS);
      data = [...state.placements.entries()].map(([item_id, pos]) => ({ item_id, x: pos.x, y: pos.y }));
    } else if (url.pathname.endsWith('/purchase_pixel_item')) {
      const { p_item_id } = route.request().postDataJSON();
      const item = catalog.find(i => i.item_id === p_item_id);
      if (state.owned.has(p_item_id)) data = { ok: false, reason: 'already_owned' };
      else if (!item || state.balance < item.price) data = { ok: false, reason: 'insufficient_balance' };
      else { state.owned.add(p_item_id); state.balance -= item.price; data = { ok: true, itemId: p_item_id, newBalance: state.balance }; }
    } else if (url.pathname.endsWith('/equip_pixel_item')) {
      const { p_slot, p_item_id } = route.request().postDataJSON();
      const item = catalog.find(i => i.item_id === p_item_id);
      if (p_item_id && (!state.owned.has(p_item_id) || item.slot !== p_slot)) data = { ok: false, reason: 'not_owned' };
      else { state.equipment[p_slot] = p_item_id; data = { ok: true, slot: p_slot, itemId: p_item_id }; }
    } else if (url.pathname.endsWith('/save_pixel_room_layout')) {
      const { p_placements } = route.request().postDataJSON();
      savedLayoutCalls.push(p_placements);
      const seen = new Set();
      for (const p of p_placements) {
        const item = catalog.find(i => i.item_id === p.itemId);
        if (!item || item.category !== 'furniture' || !state.owned.has(p.itemId) || seen.has(p.itemId)) {
          data = { ok: false, reason: 'invalid_payload', message: 'rejected by mock' };
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
        }
        seen.add(p.itemId);
      }
      state.placements = new Map(p_placements.map(p => [p.itemId, { x: p.x, y: p.y }]));
      data = { ok: true, count: p_placements.length };
    } else return route.abort();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(e.message));
  await page.goto(`http://127.0.0.1:5174/tests/pixel-room/?tab=pixelRoom&user=${userId}&testBalance=10000`);
  await page.locator('.pr-actor').waitFor();

  // Buy a furniture item — purchase itself only needs shop.ready (not roomReady), so this
  // should always succeed regardless of the bug.
  const openShop = async () => {
    const trigger = page.locator('.pr-sheet-trigger button').filter({ hasText: '상점' });
    if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
    await page.locator('[data-item="furniture_chair"]').waitFor();
  };
  await openShop();
  const card = page.locator('[data-item="furniture_chair"]');
  await card.getByRole('button', { name: '구매하기', exact: true }).click();
  await card.getByRole('button', { name: '구매', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.pr-shop-confirm button:disabled'));

  // Purchasing furniture auto-enters decorating mode with it selected (handlePurchase). Clicking
  // a cell THIS early can legitimately land inside the genuine loading window (the furniture
  // layout fetch is still in flight) — that single "보유 정보를 불러온 뒤 배치할 수 있어요" is
  // expected UX, not the bug. The bug was that this stayed stuck FOREVER even after loading
  // genuinely finished. So: click once (may be blocked), wait past the mocked load delay, then
  // click again — the retry must succeed.
  await page.getByRole('button', { name: '1열 1행에 배치', exact: true }).click();
  await page.waitForTimeout(FURNITURE_FETCH_DELAY_MS + 200);
  await page.getByRole('button', { name: '1열 1행에 배치', exact: true }).click();
  await page.locator('[data-furniture="chair"]').waitFor({ timeout: 3000 });

  const stuckMessage = await page.locator('#pr-instructions').innerText();
  assert.notEqual(stuckMessage, '보유 정보를 불러온 뒤 배치할 수 있어요.', `placement should not still be stuck after loading genuinely finished — message was: "${stuckMessage}"`);
  assert.ok(savedLayoutCalls.length >= 1, 'save_pixel_room_layout should have been called after placement');
  assert.deepEqual(savedLayoutCalls.at(-1), [{ itemId: 'furniture_chair', x: 0, y: 0 }]);

  // Move it, confirm the move also saves (not just the initial placement). A successful
  // placement calls exitDecorating() which turns decorating mode back off, so re-enter it first.
  // Furniture divs are visual only (pointer-events pass through) — selecting an already-placed
  // item means clicking the grid cell it occupies, same as placing does.
  await page.getByRole('button', { name: '꾸미기', exact: true }).click();
  await page.getByRole('button', { name: '1열 1행에 배치', exact: true }).click();
  await page.getByRole('button', { name: '3열 2행에 배치', exact: true }).click();
  await page.waitForFunction(() => {
    const el = document.querySelector('[data-furniture="chair"]');
    return el && el.style.left === '20%' && el.style.top === '12.5%';
  }, { timeout: 3000 });
  assert.deepEqual(savedLayoutCalls.at(-1), [{ itemId: 'furniture_chair', x: 2, y: 1 }]);

  // Reload — this time the mock's /pixel_furniture_placement GET returns what save_pixel_room_layout
  // last stored (state.placements), simulating "another device/new session" restoring from the
  // server, not from localStorage (which this fixture never touches for furniture any more).
  await page.reload();
  await page.locator('[data-furniture="chair"]').waitFor({ timeout: 3000 });
  const restoredStyle = await page.locator('[data-furniture="chair"]').evaluate(el => ({ left: el.style.left, top: el.style.top }));
  assert.deepEqual(restoredStyle, { left: '20%', top: '12.5%' }, 'reload should restore the moved position from the server, not reset it');

  assert.deepEqual(pageErrors, []);
  console.log('PASS: furniture placement is not stuck behind the shop.catalog race, save on place/move confirmed, reload restores from server state');
} finally {
  await browser.close();
}
