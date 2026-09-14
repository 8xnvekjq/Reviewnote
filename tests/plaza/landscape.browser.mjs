import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const output = 'node_modules/.cache/plaza-landscape';
await mkdir(output, { recursive: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/services/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: "export { supabase } from '/tests/plaza/fakeRealtime.mjs';" }));
    await page.route('**/src/utils/pixelShop.ts', route => route.fulfill({ contentType: 'application/javascript', body: 'export async function fetchEquippedAppearance(){return {top:null,bottom:null,shoes:null,hair:null,eyes:null}}' }));
    await page.goto('http://127.0.0.1:5174/tests/plaza/landscape.html');
    await page.locator('.pr-hub-well').waitFor();
    await page.waitForFunction(() => window.plazaTransport?.last('viewer'));
    const board = await page.locator('.pr-plaza-board').boundingBox();
    assert.ok(Math.abs(board.width / board.height - 16 / 12) < 0.01);
    assert.ok(board.x >= 0 && board.x + board.width <= viewport.width);
    await page.screenshot({ path: `${output}/${viewport.width}-empty.png` });
    await page.evaluate(() => {
      const template = window.plazaTransport.last('viewer');
      [[5,4],[10,5],[6,8],[9,9]].forEach(([x,y],i) => window.plazaTransport.broadcast({ ...template, sessionId: `guest-${i}`, x, y, seq: 1, moving: false }));
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${output}/${viewport.width}-populated.png` });
    await page.locator('.pr-plaza-grid button').nth(4 * 16 + 6).click();
    await page.waitForFunction(() => { const p = window.plazaTransport.last('viewer'); return p?.x === 6 && p.y === 4; });
    await page.getByRole('button', { name: '↓ 내 방으로 가는 길' }).click();
    await page.waitForFunction(() => document.body.dataset.returned === 'true');
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}: map ratio, walking around scenery, home entrance, no runtime errors`);
    await page.close();
  }
} finally { await browser.close(); }
