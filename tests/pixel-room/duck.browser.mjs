// Real components, sprites, FSM and Supabase client; intercepted REST only.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog.ts';
import { emptyFarm } from './emptyFarm.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true});
const out='node_modules/.cache/pixel-duck';await mkdir(out,{recursive:true});
const catalog=PIXEL_CATALOG.map(i=>({item_id:i.itemId,category:i.category,slot:i.slot,price:i.price,asset_key:i.assetKey,display_name:i.displayName,tier:i.tier,stackable:false}));
const url='http://127.0.0.1:5174/tests/pixel-room/?tab=pixelRoom&user=duck-test&testBalance=10000';
async function setup(context,state){
  await context.route('**/*',async route=>{
    const path=new URL(route.request().url());if(path.hostname==='127.0.0.1')return route.continue();
    const method=route.request().method();let data=[];
    if(path.pathname.endsWith('/pixel_item_catalog'))data=catalog;
    else if(path.pathname.endsWith('/pixel_item_ownership'))data=[...state.owned].map(item_id=>({item_id}));
    else if(path.pathname.endsWith('/pixel_avatar_equipment'))data={};
    else if(path.pathname.endsWith('/get_pixel_farm'))data=emptyFarm();
    else if(path.pathname.endsWith('/get_weekly_crop_contest'))data={weekStart:'2026-09-21',top:[],mine:{rank:null,sizeScore:null,participantCount:0}};
    else if(path.pathname.endsWith('/pixel_pet_equipment')){
      if(method==='GET')data={active_pet:state.active};
      else{
        const row=route.request().postDataJSON();
        if(state.failActivate){state.failActivate=false;return route.fulfill({status:503,json:{message:'test activation failure'}});}
        assert.ok(row.active_pet===null||state.owned.has(row.active_pet));state.active=row.active_pet;data={active_pet:state.active};
      }
    }else if(path.pathname.endsWith('/purchase_pixel_item')){
      const {p_item_id}=route.request().postDataJSON();const item=catalog.find(i=>i.item_id===p_item_id);
      if(state.owned.has(p_item_id))data={ok:false,reason:'already_owned'};
      else if(!item||state.balance<item.price)data={ok:false,reason:'insufficient_balance'};
      else{state.owned.add(p_item_id);state.balance-=item.price;data={ok:true,itemId:p_item_id,newBalance:state.balance};}
    }
    return route.fulfill({status:200,json:data});
  });
  await context.route('**/src/services/supabase.ts',async route=>{
    const response=await route.fetch();
    await route.fulfill({response,body:(await response.text())+`\nimport {supabase as fakeRealtime} from '/tests/plaza/fakeRealtime.mjs';\nsupabase.channel=(...args)=>fakeRealtime.channel(...args);\nsupabase.removeChannel=(...args)=>fakeRealtime.removeChannel(...args);`});
  });
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('Failed to load resource'))errors.push(message.text());});
  return {page,errors};
}
async function shop(page){
  const trigger=page.locator('.pr-sheet-trigger button').filter({hasText:'상점'});
  if(await trigger.getAttribute('aria-expanded')!=='true')await trigger.click();
  await page.locator('.pr-category-tabs button').filter({hasText:'펫',exact:true}).click();
}
async function closeShop(page){
  const trigger=page.locator('.pr-sheet-trigger button').filter({hasText:'상점'});
  if(await trigger.getAttribute('aria-expanded')==='true')await trigger.click();
}
async function buy(page,id){const card=page.locator(`[data-item="${id}"]`);await card.getByRole('button',{name:'구매하기',exact:true}).click();await card.getByRole('button',{name:'구매',exact:true}).click();}
async function observe(page){
  return page.evaluate(async()=>{const actions=new Set(),cells=[];const start=performance.now();while(performance.now()-start<5500){const el=document.querySelector('.pr-duck');if(el){actions.add(el.dataset.action);cells.push({x:+el.dataset.x,y:+el.dataset.y});}await new Promise(r=>setTimeout(r,50));}return {actions:[...actions],cells};});
}
try{
  for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
    const context=await browser.newContext({viewport,hasTouch:viewport.width===390});
    const state={owned:new Set(),active:null,balance:10000,failActivate:false};
    const {page,errors}=await setup(context,state);await page.goto(url);await page.locator('.pr-actor').waitFor();await shop(page);
    const duck=page.locator('[data-item="pet_duck"]'),dog=page.locator('[data-item="pet_dog"]');
    await duck.locator('.pr-duck-sprite').waitFor();await dog.locator('.pr-dog-sprite').waitFor();
    assert.equal(await page.locator('.pr-duck').count(),0);
    await page.screenshot({path:`${out}/${viewport.width}-shop.png`});
    // Purchase succeeds but activation fails: ownership remains, retry never buys twice.
    state.failActivate=viewport.width===390;await buy(page,'pet_duck');
    if(viewport.width===390){
      await duck.getByRole('button',{name:'함께 살기',exact:true}).waitFor();
      assert.equal(state.balance,9850);assert.equal(state.active,null);
      await duck.getByRole('button',{name:'함께 살기',exact:true}).click();
    }
    await page.locator('.pr-duck').waitFor();assert.equal(state.active,'pet_duck');assert.equal(state.balance,9850);
    await closeShop(page);const room=await observe(page);assert.ok(room.cells.length);assert.ok(room.actions.includes('walk'));
    for(const p of room.cells)assert.ok(!(p.x>=3&&p.x<=5&&p.y>=6));
    await page.screenshot({path:`${out}/${viewport.width}-room.png`});
    await shop(page);await buy(page,'pet_dog');await page.locator('.pr-dog').waitFor();
    assert.equal(await page.locator('.pr-duck').count(),0);assert.equal(state.balance,9650);
    await duck.getByRole('button',{name:'함께 살기',exact:true}).click();await page.locator('.pr-duck').waitFor();
    assert.equal(await page.locator('.pr-dog').count(),0);
    await duck.getByRole('button',{name:'잠시 쉬게 하기',exact:true}).click();await page.locator('.pr-duck').waitFor({state:'hidden'});assert.equal(state.active,null);
    await page.reload();await page.locator('.pr-actor').waitFor();await shop(page);
    assert.equal(await page.locator('.pr-duck,.pr-dog').count(),0,'deactivation persists after reload');
    await duck.getByRole('button',{name:'함께 살기',exact:true}).click();await page.locator('.pr-duck').waitFor();await closeShop(page);
    for(let round=0;round<2;round++){
      const exit=page.getByRole('button',{name:'5열 8행에 배치',exact:true});if(viewport.width===390)await exit.tap();else await exit.click();
      await page.locator('.pr-yard-board .pr-duck').waitFor();
      if(!round){const yard=await observe(page);assert.ok(yard.cells.length);for(const p of yard.cells){assert.ok(p.x>=9&&p.y>=4&&p.y<=9);assert.ok(!([4,5,7,8].includes(p.y)&&p.x<=12&&p.x+1>=11));}await page.screenshot({path:`${out}/${viewport.width}-yard.png`});}
      await page.getByRole('button',{name:'길을 따라 광장으로 걸어가기',exact:true}).click();
      try { await page.locator('.pr-self-target').waitFor({timeout:8000}); }
      catch(error){await page.screenshot({path:`${out}/${viewport.width}-failure.png`});console.error('Plaza transition diagnostics',errors,await page.locator('body').innerText(),await page.locator('.pr-plaza-actor').evaluateAll(elements=>elements.map(el=>({...el.dataset}))));throw error;}
      assert.equal(await page.locator('.pr-duck,.pr-dog').count(),0,'no pets in plaza');
      await page.getByRole('button',{name:'↓ 집 앞으로 가는 길',exact:true}).click();await page.locator('.pr-yard-board .pr-duck').waitFor();
      await page.getByRole('button',{name:'집 문으로 걸어가기',exact:true}).click();await page.locator('.pr-actor').waitFor();await page.locator('.pr-duck').waitFor();
    }
    await page.reload();await page.locator('.pr-duck').waitFor();assert.equal(await page.locator('.pr-dog').count(),0);
    const fresh=await browser.newContext({viewport});const second=await setup(fresh,state);await second.page.goto(url);await second.page.locator('.pr-duck').waitFor();assert.deepEqual(second.errors,[]);await fresh.close();
    assert.deepEqual(errors,[]);await context.close();
    console.log(`PASS ${viewport.width}: both previews, purchase + failed-activation retry, dog/duck exclusive swap, deactivate, room/yard movement, crop clearance, repeated plaza round trips, reload/fresh-context persistence`);
  }
}finally{await browser.close();}
