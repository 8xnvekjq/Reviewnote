import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { emptyFarm } from './emptyFarm.mjs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
await mkdir('node_modules/.cache/front-yard', { recursive: true });
try {
  for (const viewport of [{ width: 390, height: 700 }, { width: 1440, height: 1000 }]) {
    const page = await browser.newPage({ viewport, hasTouch: viewport.width === 390 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/utils/pixelFarm.ts', route => route.fulfill({contentType:'application/javascript',body:`export const fetchPixelFarm=async()=>(${JSON.stringify(emptyFarm())}); export const actPixelFarm=async()=>{throw new Error('Unexpected farm action in movement test');};`}));
    await page.route('**/src/services/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: "export { supabase } from '/tests/plaza/fakeRealtime.mjs';" }));
    await page.route('**/src/utils/pixelShop.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
      export const fetchEquippedAppearance = async () => ({top:null,bottom:null,shoes:null,hair:null,eyes:null,skin:null});
      export const fetchOwnedPixelItemIds = async () => [];
      export const fetchPixelCatalog = async () => [];
      export const fetchPixelFurniturePlacement = async () => [];
      export const savePixelRoomLayout = async () => ({ok:true});
      export const purchasePixelItem = async () => ({ok:false});
      export const equipPixelItem = async () => ({ok:false});
      export const setPixelBaseAppearance = async () => ({ok:false});
    ` }));
    await page.goto('http://127.0.0.1:5174/tests/pixel-room/yard.html');
    const settled = async () => page.waitForFunction(() => !document.querySelector('.pr-transition-active'));
    const yardAt = async (x,y) => {
      await page.waitForFunction(({x,y}) => { const p = document.querySelector('.pr-yard-board .pr-plaza-actor'); return p?.dataset.x === String(x) && p?.dataset.y === String(y); }, {x,y});
      await settled();
      await page.waitForTimeout(450);
      assert.ok(await page.locator('.pr-yard-board').count(), 'arrival must not bounce to another scene');
      assert.deepEqual(await page.evaluate(() => window.plazaTransport.audit().active), []);
    };
    let session;
    for (let round = 0; round < 3; round++) {
      await page.locator('.pr-actor').waitFor(); await settled();
      await page.locator('.pr-grid button').nth(7 * 10 + 4).click();
      await yardAt(6,7);
      if (!round && viewport.width > 700) {
        await page.locator('.pr-yard-board').focus();
        await page.keyboard.down('a');
        await page.waitForFunction(() => document.querySelector('.pr-yard-board .pr-plaza-actor')?.dataset.x === '5');
        await page.keyboard.up('a');
      }
      if (!round) {
        const rect = await page.locator('.pr-yard-board').boundingBox();
        assert.ok(Math.abs(rect.width / rect.height - 4/3) < .01);
        assert.ok(rect.x >= 0 && rect.x + rect.width <= viewport.width);
        await page.screenshot({ path: `node_modules/.cache/front-yard/${viewport.width}.png` });
      }
      await page.getByRole('button', { name: '집 문으로 걸어가기' }).click();
      await page.locator('.pr-actor').waitFor(); await settled();
      assert.equal(await page.locator('.pr-actor').getAttribute('data-y'), '6');
      await page.waitForTimeout(450);
      assert.ok(await page.locator('.pr-actor').count());
      await page.locator('.pr-grid button').nth(7 * 10 + 4).click();
      await yardAt(6,7);
      if (viewport.width === 390) await page.getByRole('button', { name: '길을 따라 광장으로 걸어가기' }).tap();
      else await page.getByRole('button', { name: '길을 따라 광장으로 걸어가기' }).click();
      await page.locator('.pr-self-target').waitFor(); await settled();
      const active = await page.evaluate(() => window.plazaTransport.audit().active);
      assert.equal(active.length, 1);
      if (!session) session = active[0]; else assert.equal(active[0], session, 'plaza session stays stable across visits');
      await page.getByRole('button', { name: '↓ 집 앞으로 가는 길' }).click();
      await yardAt(6,10);
      await page.getByRole('button', { name: '집 문으로 걸어가기' }).click();
      await page.locator('.pr-actor').waitFor(); await settled();
    }
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}: three full round trips, safe arrivals, no private-scene realtime, stable plaza session`);
    await page.close();
  }
} finally { await browser.close(); }
