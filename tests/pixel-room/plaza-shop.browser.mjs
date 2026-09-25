// Real components, sprites, FSM and Supabase client; intercepted REST only.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog.ts';
import { emptyFarm } from './emptyFarm.mjs';
const browser=await chromium.launch({channel:'msedge',headless:true});
const out='node_modules/.cache/plaza-shop';await mkdir(out,{recursive:true});
const catalog=PIXEL_CATALOG.map(i=>({item_id:i.itemId,category:i.category,slot:i.slot,price:i.price,asset_key:i.assetKey,display_name:i.displayName,tier:i.tier,stackable:false}));
const url='http://127.0.0.1:5174/tests/pixel-room/?tab=pixelRoom&user=duck-test&testBalance=10000';
async function setup(context,state){
  await context.route('**/*',async route=>{
    const path=new URL(route.request().url());if(path.hostname==='127.0.0.1')return route.continue();
    const method=route.request().method();let data=[];
    if(path.pathname.endsWith('/pixel_item_catalog'))data=catalog;
    else if(path.pathname.endsWith('/pixel_item_ownership'))data=[...state.owned].map(item_id=>({item_id}));
    else if(path.pathname.endsWith('/pixel_avatar_equipment'))data=state.equipment;
    else if(path.pathname.endsWith('/get_pixel_farm'))data=emptyFarm();
    else if(path.pathname.endsWith('/get_weekly_crop_contest'))data={weekStart:'2026-09-21',top:[],mine:{rank:null,sizeScore:null,participantCount:0}};
    else if(path.pathname.endsWith('/pixel_pet_equipment')){
      if(method==='GET')data={active_pet:state.active};
      else{
        const row=route.request().postDataJSON();
        if(state.failActivate){state.failActivate=false;return route.fulfill({status:503,json:{message:'test activation failure'}});}
        assert.ok(row.active_pet===null||state.owned.has(row.active_pet));state.active=row.active_pet;data={active_pet:state.active};
      }
    }else if(path.pathname.endsWith('/equip_pixel_item')){
      const {p_slot,p_item_id}=route.request().postDataJSON();assert.ok(state.owned.has(p_item_id));state.equipment[p_slot]=p_item_id;data={ok:true};
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

async function plaza(page){
  await page.getByRole('button',{name:'5열 8행에 배치',exact:true}).click();
  await page.getByRole('button',{name:'길을 따라 광장으로 걸어가기',exact:true}).click();
  await page.locator('.pr-plaza-actor').waitFor();
}
async function open(page){
  if(await page.locator('.pr-plaza-shop-target').getAttribute('aria-disabled')==='true') await page.locator('.pr-plaza-grid button').nth(7*16+13).click();
  await page.getByRole('button',{name:'상점 보기',exact:true}).click();
  await page.locator('dialog[open]').waitFor();
}
async function buy(page,id){const card=page.locator(`[data-item="${id}"]`);await card.getByRole('button',{name:'구매하기',exact:true}).click();await card.getByRole('button',{name:'구매',exact:true}).click();}
try{
 for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
  const context=await browser.newContext({viewport,hasTouch:viewport.width===390});
  const state={owned:new Set(),active:null,balance:10000,equipment:{}};
  const {page,errors}=await setup(context,state);await page.goto(url);await page.locator('.pr-actor').waitFor();
  assert.equal(await page.locator('.pr-sheet-trigger button').filter({hasText:'상점'}).count(),0);
  await plaza(page);
  await page.locator('.pr-plaza-shop-target').evaluate(el=>el.click());
  assert.equal(await page.locator('dialog[open]').count(),0,'far tap cannot open shop');
  await page.screenshot({path:`${out}/${viewport.width}-plaza.png`});
  const connection=await page.evaluate(()=>window.plazaTransport.audit());
  await open(page);
  const position=await page.locator('.pr-plaza-actor').evaluate(el=>({...el.dataset}));
  await buy(page,'top_blouse_black');await page.locator('.pr-plaza-actor [data-style="blouse_black"]').waitFor({state:'attached'});
  await buy(page,'hair_buns');await buy(page,'shoes_low');
  await page.waitForFunction(()=>{ const t=window.plazaTransport;const self=t.last(t.audit().active[0]);return self?.appearance.top==='blouse_black'&&self?.appearance.hair==='buns'&&self?.appearance.shoes==='low'&&!self.moving; });
  await page.locator('.pr-category-tabs button').filter({hasText:'펫',exact:true}).click();
  await buy(page,'pet_dog');await page.locator('[data-item=pet_dog]').getByRole('button',{name:'잠시 쉬게 하기',exact:true}).waitFor();assert.equal(state.active,'pet_dog');
  await buy(page,'pet_duck');await page.locator('[data-item=pet_duck]').getByRole('button',{name:'잠시 쉬게 하기',exact:true}).waitFor();assert.equal(state.active,'pet_duck');
  await page.locator('[data-item="pet_duck"]').getByRole('button',{name:'잠시 쉬게 하기',exact:true}).click();await page.locator('[data-item=pet_duck]').getByRole('button',{name:'함께 살기',exact:true}).waitFor();assert.equal(state.active,null);
  await page.locator('[data-item="pet_duck"]').getByRole('button',{name:'함께 살기',exact:true}).click();await page.locator('[data-item=pet_duck]').getByRole('button',{name:'잠시 쉬게 하기',exact:true}).waitFor();assert.equal(state.active,'pet_duck');
  await page.screenshot({path:`${out}/${viewport.width}-shop.png`});
  await page.locator('.pr-category-tabs button').filter({hasText:'가구',exact:true}).click();await buy(page,'furniture_chair');
  await page.getByRole('button',{name:'상점 닫고 광장으로'}).click();
  assert.deepEqual(await page.locator('.pr-plaza-actor').evaluate(el=>({...el.dataset})),position);
  assert.deepEqual(await page.evaluate(()=>window.plazaTransport.audit()),connection,'shop never reconnects plaza');
  assert.equal(await page.locator('.pr-duck,.pr-dog').count(),0);
  await open(page);await page.keyboard.press('Escape');await page.locator('.pr-plaza-shop-dialog').waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>document.body.scrollWidth>innerWidth),false);
  await page.getByRole('button',{name:'↓ 집 앞으로 가는 길',exact:true}).click();await page.locator('.pr-yard-board .pr-duck').waitFor();
  await page.getByRole('button',{name:'집 문으로 걸어가기',exact:true}).click();await page.locator('.pr-actor').waitFor();await page.locator('.pr-duck').waitFor();
  await page.reload();await page.locator('.pr-actor [data-style="blouse_black"]').waitFor();await page.locator('.pr-duck').waitFor();
  assert.deepEqual(errors,[]);await context.close();
  console.log(`PASS ${viewport.width}: walk to shop, distance gate, clothes/hair/shoes/pets/furniture purchases, activation, close/Escape, retained position, home return and reload`);
 }
}finally{await browser.close();}

