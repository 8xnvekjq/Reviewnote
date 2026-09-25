// Real components + intercepted REST for browser regression. Live RPCs are tested separately
// by server-roundtrip.sql, which rolls back all changes. No real account credentials needed.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const out = process.env.UI_OUTPUT || 'node_modules/.cache/pixel-fashion';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const catalog = PIXEL_CATALOG.map(i => ({ item_id:i.itemId, category:i.category, slot:i.slot, price:i.price, asset_key:i.assetKey, display_name:i.displayName, tier:i.tier, stackable:false }));
const errors=[];
try {
  for (const [width,height] of [[390,844],[1440,1000]]) {
    const context=await browser.newContext({ viewport:{width,height}, hasTouch:true, serviceWorkers:'block' });
    let activeUser='student-A';
    const states=new Map();
    function state(id) { if (!states.has(id)) states.set(id,{owned:new Set(),equipment:{top:null,bottom:null,shoes:null,hair:null,eyes:null},balance:10000,placements:new Map()}); return states.get(id); }
    await context.route('**/*', async route => {
      const url=new URL(route.request().url());
      if (url.hostname==='127.0.0.1') return route.continue();
      const s=state(url.searchParams.get('user_id')?.replace('eq.','') || activeUser);
      let data=[];
      if (url.pathname.endsWith('/pixel_item_catalog')) data=catalog;
      else if(url.pathname.endsWith('/pixel_item_ownership')) data=[...s.owned].map(item_id=>({item_id}));
      else if(url.pathname.endsWith('/pixel_avatar_equipment')) data=s.equipment;
      else if(url.pathname.endsWith('/pixel_furniture_placement')) data=[...s.placements.entries()].map(([item_id,pos])=>({item_id,x:pos.x,y:pos.y}));
      else if(url.pathname.endsWith('/save_pixel_room_layout')) {
        const activeState=state(activeUser); const {p_placements}=route.request().postDataJSON();
        for (const p of p_placements) { const item=catalog.find(i=>i.item_id===p.itemId); if(!item||item.category!=='furniture'||!activeState.owned.has(p.itemId)) { data={ok:false,reason:'not_owned',message:'not owned'}; return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)}); } }
        activeState.placements=new Map(p_placements.map(p=>[p.itemId,{x:p.x,y:p.y}]));
        data={ok:true,count:p_placements.length};
      }
      else if(url.pathname.endsWith('/purchase_pixel_item')) {
        const {p_item_id}=route.request().postDataJSON(); const item=catalog.find(i=>i.item_id===p_item_id);
        if(s.owned.has(p_item_id)) data={ok:false,reason:'already_owned'};
        else if(!item || s.balance<item.price) data={ok:false,reason:'insufficient_balance'};
        else {s.owned.add(p_item_id);s.balance-=item.price;data={ok:true,itemId:p_item_id,newBalance:s.balance};}
      } else if(url.pathname.endsWith('/equip_pixel_item')) {
        const {p_slot,p_item_id}=route.request().postDataJSON();
        const item=catalog.find(i=>i.item_id===p_item_id);
        if(p_item_id && (!s.owned.has(p_item_id) || item.slot!==p_slot)) data={ok:false,reason:'not_owned'};
        else {s.equipment[p_slot]=p_item_id;data={ok:true,slot:p_slot,itemId:p_item_id};}
      } else return route.abort();
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
    });
    const page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
    const url='http://127.0.0.1:5174/tests/pixel-room/?tab=pixelRoom&testBalance=10000';
    await page.goto(url); await page.locator('.pr-actor').waitFor();
    async function openShop() {
      const trigger=page.locator('.pr-sheet-trigger button').filter({hasText:'상점'});
      if(await trigger.getAttribute('aria-expanded')!=='true') await trigger.click();
      await page.locator('[data-item="top_sage"]').waitFor();
    }
    async function buy(id) {
      await openShop(); const card=page.locator(`[data-item="${id}"]`);
      await card.getByRole('button',{name:'구매하기',exact:true}).click();
      await card.getByRole('button',{name:'구매',exact:true}).click();
      await page.waitForFunction(()=>!document.querySelector('.pr-shop-confirm button:disabled'));
    }
    const garments=PIXEL_CATALOG.filter(i=>i.itemId.includes('blouse')||i.itemId.includes('bootcut'));
    for(const item of garments) {
      await buy(item.itemId);
      await page.locator(`.pr-actor [data-style="${item.assetKey}"]`).waitFor();
      assert.equal(state('student-A').equipment[item.slot],item.itemId);
    }
    assert.equal(state('student-A').balance,10000-720);
    await page.reload();
    await page.locator('.pr-actor [data-style="blouse_rose"]').waitFor();
    await page.locator('.pr-actor [data-style="bootcut_cream"]').waitFor();
    await openShop();
    await page.locator('[data-item="top_blouse_black"]').getByRole('button',{name:'장착하기',exact:true}).click();
    await page.locator('.pr-actor [data-style="blouse_black"]').waitFor();
    await page.locator('[data-item="bottom_bootcut_blue"]').getByRole('button',{name:'장착하기',exact:true}).click();
    await page.locator('.pr-actor [data-style="bootcut_blue"]').waitFor();
    await page.screenshot({path:`${out}/shop-${width}.png`,animations:'disabled'});
    assert.equal(await page.evaluate(()=>document.body.scrollWidth>innerWidth),false);
    await page.reload();
    await page.locator('.pr-actor [data-style="blouse_black"]').waitFor();
    await page.locator('.pr-actor [data-style="bootcut_blue"]').waitFor();
    activeUser='student-B'; await page.getByLabel('검증 계정').selectOption(activeUser);
    await page.locator('.pr-actor [data-slot="top"][data-row="0"]').waitFor();
    assert.equal(await page.locator('.pr-actor [data-style]').count(),0);
    console.log(`PASS ${width}: six purchases, equip/color change/reload, account isolation, no horizontal overflow`);
    await context.close();
  }
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
