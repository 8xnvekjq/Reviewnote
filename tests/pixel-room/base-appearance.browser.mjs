// Real PixelRoom component + real browser, intercepted REST (same pattern as
// tests/pixelShop/browser.mjs) — verifies the new free base-appearance feature (skin tone / eye
// color): pick a swatch -> renders immediately -> persists across reload -> a fresh session with
// no local state at all still sees it (server-side, not a client cache). Also confirms existing
// equip items (top/hair) are completely unaffected by base-appearance changes, and that an
// unknown/legacy value (simulating a pre-migration row) falls back to the default look instead of
// crashing.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const out = process.env.UI_OUTPUT || 'node_modules/.cache/pixel-base-appearance';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const catalog = PIXEL_CATALOG.map(i => ({ item_id: i.itemId, category: i.category, slot: i.slot, price: i.price, asset_key: i.assetKey, display_name: i.displayName, tier: i.tier, stackable: false }));

function makeState(overrides = {}) {
  return { owned: new Set(['hair_buns', 'top_vest']), equipment: { top: 'top_vest', bottom: null, shoes: null, hair: 'hair_buns', eyes: null }, balance: 10000, skin_tone: null, eye_color: null, ...overrides };
}

async function withMockedPage(context, state, run) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    let data = [];
    if (url.pathname.endsWith('/pixel_item_catalog')) data = catalog;
    else if (url.pathname.endsWith('/pixel_item_ownership')) data = [...state.owned].map(item_id => ({ item_id }));
    else if (url.pathname.endsWith('/pixel_avatar_equipment')) data = { ...state.equipment, skin_tone: state.skin_tone, eye_color: state.eye_color };
    else if (url.pathname.endsWith('/pixel_furniture_placement')) data = [];
    else if (url.pathname.endsWith('/set_pixel_base_appearance')) {
      const { p_skin_tone, p_eye_color } = route.request().postDataJSON();
      state.skin_tone = p_skin_tone; state.eye_color = p_eye_color;
      data = { ok: true, skinTone: p_skin_tone, eyeColor: p_eye_color };
    } else if (url.pathname.endsWith('/purchase_pixel_item')) data = { ok: false, reason: 'already_owned' };
    else if (url.pathname.endsWith('/equip_pixel_item')) {
      const { p_slot, p_item_id } = route.request().postDataJSON();
      state.equipment[p_slot] = p_item_id;
      data = { ok: true, slot: p_slot, itemId: p_item_id };
    } else if (url.pathname.endsWith('/save_pixel_room_layout')) data = { ok: true, count: 0 };
    else return route.abort();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await run(page);
  assert.deepEqual(errors, []);
  return page;
}

const rowOf = async (page, slot) => page.locator(`.pr-actor [data-slot="${slot}"]`).first().getAttribute('data-row');

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const state = makeState();

  await withMockedPage(context, state, async page => {
    await page.goto('http://127.0.0.1:5174/tests/pixel-room/?tab=pixelRoom&user=appearance-user&testBalance=10000');
    await page.locator('.pr-actor').waitFor();
    // Sanity: existing equip items render before touching base appearance at all.
    assert.equal(await rowOf(page, 'hair'), '5'); // hair_buns
    assert.equal(await rowOf(page, 'top'), '17'); // top_vest
    assert.equal(await rowOf(page, 'skin'), '0'); // default skin, unchanged so far

    await page.locator('.pr-sheet-trigger button').filter({ hasText: '옷' }).click();
    await page.getByRole('button', { name: '기본 외형', exact: true }).click();
    await page.getByRole('button', { name: '초콜릿빛', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.pr-actor [data-slot="skin"]')?.getAttribute('data-row') === '3');
    await page.getByRole('button', { name: '하늘색', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.pr-actor [data-slot="eyes"]')?.getAttribute('data-row') === '1');

    // Equip items must be completely unaffected by a base-appearance change.
    assert.equal(await rowOf(page, 'hair'), '5');
    assert.equal(await rowOf(page, 'top'), '17');
    await page.screenshot({ path: `${out}/changed.png` });
  });
  assert.equal(state.skin_tone, 'umber');
  assert.equal(state.eye_color, 'sky');

  // Reload within the same session — must restore from the (mocked) server state, not a client cache.
  await withMockedPage(context, state, async page => {
    await page.goto('http://127.0.0.1:5174/tests/pixel-room/?tab=pixelRoom&user=appearance-user&testBalance=10000');
    await page.locator('.pr-actor').waitFor();
    assert.equal(await rowOf(page, 'skin'), '3');
    assert.equal(await rowOf(page, 'eyes'), '1');
  });

  // A brand-new context (no cookies/localStorage at all) simulating "another device" — still sees
  // it, because it's genuinely server-side, not something carried by this browser profile.
  const freshContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await withMockedPage(freshContext, state, async page => {
    await page.goto('http://127.0.0.1:5174/tests/pixel-room/?tab=pixelRoom&user=appearance-user&testBalance=10000');
    await page.locator('.pr-actor').waitFor();
    assert.equal(await rowOf(page, 'skin'), '3');
    assert.equal(await rowOf(page, 'eyes'), '1');
  });
  await freshContext.close();

  // Legacy/unknown stored value (simulating data from before appearanceRows.ts knew this key, or
  // simple corruption) must fall back to the default look, never crash or render garbage.
  const legacyState = makeState({ skin_tone: 'no-longer-a-real-key', eye_color: 'also-not-real' });
  const legacyContext = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await withMockedPage(legacyContext, legacyState, async page => {
    await page.goto('http://127.0.0.1:5174/tests/pixel-room/?tab=pixelRoom&user=appearance-user&testBalance=10000');
    await page.locator('.pr-actor').waitFor();
    assert.equal(await rowOf(page, 'skin'), '0');
    assert.equal(await rowOf(page, 'eyes'), '0');
  });
  await legacyContext.close();

  console.log('PASS: base appearance (skin/eye color) renders immediately, persists across reload and fresh sessions, never touches equip items, and falls back safely on unknown stored values');
} finally {
  await browser.close();
}
