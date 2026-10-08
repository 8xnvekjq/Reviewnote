// Real components, sprites, FSM and Supabase client; intercepted REST only.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog.ts';
import { emptyFarm } from './emptyFarm.mjs';
const browser=await chromium.launch({headless: true});
const out='node_modules/.cache/pixel-bear';await mkdir(out,{recursive:true});
const catalog=PIXEL_CATALOG.map(i=>({item_id:i.itemId,category:i.category,slot:i.slot,price:i.price,asset_key:i.assetKey,display_name:i.displayName,tier:i.tier,stackable:false}));
const url='http://127.0.0.1:5174/tests/pixel-room/?tab=pixelRoom&user=bear-test&testBalance=10000';
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
const nearShop=async page=>{const {x,y}=await page.locator('.pr-plaza-actor').evaluate(el=>({...el.dataset}));return +y===7&&+x>=12&&+x<=14;};
async function tapStall(page,touch){const stall=page.locator('.pr-plaza-shop-target');if(touch)await stall.tap();else await stall.click();}
// The stall itself is the only way in: tap it at the counter, or tap it from afar to walk there first.
async function open(page,touch=false){
  if(!await nearShop(page)){await tapStall(page,touch);await page.locator('.pr-plaza-shop-target[data-near=true]').waitFor();}
  await tapStall(page,touch);
  await page.locator('dialog[open]').waitFor();
}
async function buy(page,id){const card=page.locator(`[data-item="${id}"]`);await card.getByRole('button',{name:'구매하기',exact:true}).click();await card.getByRole('button',{name:'구매',exact:true}).click();}
async function observe(page,sel='.pr-bear'){
  return page.evaluate(async sel=>{const actions=new Set(),cells=[];const start=performance.now();while(performance.now()-start<9000){const el=document.querySelector(sel);if(el){actions.add(el.dataset.action);cells.push({x:+el.dataset.x,y:+el.dataset.y});}await new Promise(r=>setTimeout(r,50));}return {actions:[...actions],cells};},sel);
}
async function petTab(page){await page.locator('.pr-category-tabs button').filter({hasText:'펫',exact:true}).click();}
async function closeShop(page){await page.getByRole('button',{name:'상점 닫고 광장으로'}).click();await page.locator('.pr-plaza-shop-dialog').waitFor({state:'detached'});}
async function home(page){await page.getByRole('button',{name:'↓ 집 앞으로 가는 길',exact:true}).click();await page.locator('.pr-yard-board').waitFor();}
async function room(page){await page.getByRole('button',{name:'집 문으로 걸어가기',exact:true}).click();await page.locator('.pr-actor').waitFor();}
async function toPlaza(page){await page.getByRole('button',{name:'길을 따라 광장으로 걸어가기',exact:true}).click();await page.locator('.pr-self-target').waitFor({timeout:8000});}
const box=(page,sel)=>page.locator(sel).first().boundingBox();
try{
 for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
  const touch=viewport.width===390;
  const context=await browser.newContext({viewport,hasTouch:touch});
  const state={owned:new Set(),active:null,balance:10000,equipment:{},failActivate:false};
  const {page,errors}=await setup(context,state);await page.goto(url);await page.locator('.pr-actor').waitFor();
  await plaza(page);await open(page,touch);await petTab(page);
  await page.locator('[data-item=pet_bear] .pr-bear-sprite').waitFor();
  await page.screenshot({path:`${out}/${viewport.width}-shop.png`});
  // Purchase succeeds, activation fails once: ownership stays, retry never buys twice.
  state.failActivate=touch;await buy(page,'pet_bear');
  const bear=page.locator('[data-item=pet_bear]');
  if(touch){await bear.getByRole('button',{name:'함께 살기',exact:true}).waitFor();assert.equal(state.active,null);await bear.getByRole('button',{name:'함께 살기',exact:true}).click();}
  await bear.getByRole('button',{name:'잠시 쉬게 하기',exact:true}).waitFor();assert.equal(state.active,'pet_bear');assert.equal(state.balance,9700);
  await closeShop(page);
  assert.equal(await page.locator('.pr-bear,.pr-dog,.pr-duck').count(),0,'no pets in plaza');
  await home(page);await page.locator('.pr-yard-board .pr-bear').waitFor();
  const yard=await observe(page);assert.ok(yard.cells.length);assert.ok(yard.actions.includes('walk'),`yard actions ${yard.actions}`);
  for(const p of yard.cells){assert.ok(p.x>=9&&p.x+2<=15&&p.y>=4&&p.y<=9,`yard cell ${JSON.stringify(p)}`);}
  const yb=await box(page,'.pr-yard-board .pr-bear'),ya=await box(page,'.pr-yard-board .pr-plaza-actor');
  assert.ok(yb.height>ya.height*1.25&&yb.width>ya.width*1.25,'bear is clearly bigger than the person in the yard');
  await page.screenshot({path:`${out}/${viewport.width}-yard.png`});
  await room(page);await page.locator('.pr-bear').waitFor();
  const inside=await observe(page);assert.ok(inside.cells.length);assert.ok(inside.actions.length>=2,`room actions ${inside.actions}`);
  for(const p of inside.cells)for(let dx=0;dx<3;dx++)assert.ok(!(p.x+dx>=3&&p.x+dx<=5&&p.y>=6),'bear keeps off the door carpet');
  const rb=await box(page,'.pr-bear'),ra=await box(page,'.pr-actor');
  assert.ok(rb.height>ra.height*1.25&&rb.width>ra.width*1.25,'bear is clearly bigger than the person in the room');
  const stage=await box(page,'.pr-board');assert.ok(rb.width*rb.height<stage.width*stage.height*.16,'bear does not dominate the room');
  await page.screenshot({path:`${out}/${viewport.width}-room.png`});
  // Decorating pauses the bear into a sit.
  await page.getByRole('button',{name:'꾸미기',exact:true}).click();await page.locator('.pr-bear[data-action=sit]').waitFor();
  await page.getByRole('button',{name:'꾸미기 완료',exact:true}).click();
  // Swap: dog replaces bear, then bear replaces dog/duck; deactivate persists.
  await page.getByRole('button',{name:'5열 8행에 배치',exact:true}).click();await page.locator('.pr-yard-board .pr-bear').waitFor();
  await toPlaza(page);await open(page,touch);await petTab(page);
  await buy(page,'pet_dog');await page.locator('[data-item=pet_dog]').getByRole('button',{name:'잠시 쉬게 하기',exact:true}).waitFor();assert.equal(state.active,'pet_dog');
  await closeShop(page);await home(page);await page.locator('.pr-yard-board .pr-dog').waitFor();assert.equal(await page.locator('.pr-bear').count(),0);
  await room(page);await page.locator('.pr-dog').waitFor();assert.equal(await page.locator('.pr-bear').count(),0);
  await page.getByRole('button',{name:'5열 8행에 배치',exact:true}).click();await page.locator('.pr-yard-board .pr-dog').waitFor();
  await toPlaza(page);await open(page,touch);await petTab(page);
  await buy(page,'pet_duck');await page.locator('[data-item=pet_duck]').getByRole('button',{name:'잠시 쉬게 하기',exact:true}).waitFor();
  await bear.getByRole('button',{name:'함께 살기',exact:true}).click();await bear.getByRole('button',{name:'잠시 쉬게 하기',exact:true}).waitFor();assert.equal(state.active,'pet_bear');
  await bear.getByRole('button',{name:'잠시 쉬게 하기',exact:true}).click();await bear.getByRole('button',{name:'함께 살기',exact:true}).waitFor();assert.equal(state.active,null);
  await closeShop(page);await home(page);await page.waitForTimeout(400);assert.equal(await page.locator('.pr-bear,.pr-dog,.pr-duck').count(),0,'deactivated');
  await room(page);await page.reload();await page.locator('.pr-actor').waitFor();await page.waitForTimeout(600);assert.equal(await page.locator('.pr-bear,.pr-dog,.pr-duck').count(),0,'deactivation persists');
  // Re-activate and do repeated room -> yard -> plaza -> yard -> room round trips.
  await plaza(page);await open(page,touch);await petTab(page);await bear.getByRole('button',{name:'함께 살기',exact:true}).click();await bear.getByRole('button',{name:'잠시 쉬게 하기',exact:true}).waitFor();await closeShop(page);
  await home(page);await page.locator('.pr-yard-board .pr-bear').waitFor();await room(page);await page.locator('.pr-bear').waitFor();
  for(let round=0;round<2;round++){
    await page.getByRole('button',{name:'5열 8행에 배치',exact:true}).click();await page.locator('.pr-yard-board .pr-bear').waitFor();
    await toPlaza(page);assert.equal(await page.locator('.pr-bear,.pr-dog,.pr-duck').count(),0,'bear never follows into the plaza');
    await home(page);await page.locator('.pr-yard-board .pr-bear').waitFor();
    await room(page);await page.locator('.pr-bear').waitFor();
  }
  await page.reload();await page.locator('.pr-bear').waitFor();assert.equal(await page.locator('.pr-dog,.pr-duck').count(),0);
  assert.equal(await page.evaluate(()=>document.body.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);await context.close();
  console.log(`PASS ${viewport.width}: bear preview, purchase + failed-activation retry, yard/room roaming within footprint, bigger than the person, decorating sit, dog/duck/bear exclusive swap, deactivate + reload, plaza round trips without pets`);
 }
}finally{await browser.close();}
