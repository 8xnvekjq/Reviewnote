// Real components, sprites, FSM and Supabase client; intercepted REST only.
// The duck (and the dog it swaps with) start owned on the mocked server, like dog.browser.mjs; buying
// is covered by plaza-shop/bear. Swapping/resting pets happens on the plaza shop's pet tab.
// Dev server port: PIXEL_TEST_PORT (default 5174), as in bgm.browser.mjs.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog.ts';
import { emptyFarm } from './emptyFarm.mjs';
const browser=await chromium.launch({headless: true});
const out='node_modules/.cache/pixel-duck';await mkdir(out,{recursive:true});
const catalog=PIXEL_CATALOG.map(i=>({item_id:i.itemId,category:i.category,slot:i.slot,price:i.price,asset_key:i.assetKey,display_name:i.displayName,tier:i.tier,stackable:false}));
const PORT=process.env.PIXEL_TEST_PORT||'5174';
const url=`http://127.0.0.1:${PORT}/tests/pixel-room/?tab=pixelRoom&user=duck-test&testBalance=10000`;
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
    }else if(path.pathname.endsWith('/purchase_pixel_item'))assert.fail('this test never buys');
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
async function observe(page,sel='.pr-duck'){
  return page.evaluate(async sel=>{const actions=new Set(),cells=[];const start=performance.now();while(performance.now()-start<5500){const el=document.querySelector(sel);if(el){actions.add(el.dataset.action);cells.push({x:+el.dataset.x,y:+el.dataset.y});}await new Promise(r=>setTimeout(r,50));}return {actions:[...actions],cells};},sel);
}
// Navigation (same helpers as bear.browser.mjs): room -> yard -> plaza, and the stall is the only way into the shop.
const nearShop=async page=>{const {x,y}=await page.locator('.pr-plaza-actor').evaluate(el=>({...el.dataset}));return +y===7&&+x>=12&&+x<=14;};
async function tapStall(page,touch){const stall=page.locator('.pr-plaza-shop-target');if(touch)await stall.tap();else await stall.click();}
async function exitRoom(page,touch){const exit=page.getByRole('button',{name:'5열 8행에 배치',exact:true});if(touch)await exit.tap();else await exit.click();await page.locator('.pr-yard-board').waitFor();}
async function toPlaza(page,errors,label){
  await page.getByRole('button',{name:'길을 따라 광장으로 걸어가기',exact:true}).click();
  try { await page.locator('.pr-self-target').waitFor({timeout:8000}); }
  catch(error){await page.screenshot({path:`${out}/${label}-failure.png`});console.error('Plaza transition diagnostics',errors,await page.locator('body').innerText(),await page.locator('.pr-plaza-actor').evaluateAll(elements=>elements.map(el=>({...el.dataset}))));throw error;}
}
async function openPets(page,touch){
  if(!await nearShop(page)){await tapStall(page,touch);await page.locator('.pr-plaza-shop-target[data-near=true]').waitFor();}
  await tapStall(page,touch);await page.locator('dialog[open]').waitFor();
  await page.locator('.pr-category-tabs button').filter({hasText:'펫',exact:true}).click();
}
async function closeShop(page){await page.getByRole('button',{name:'상점 닫고 광장으로'}).click();await page.locator('.pr-plaza-shop-dialog').waitFor({state:'detached'});}
async function home(page){await page.getByRole('button',{name:'↓ 집 앞으로 가는 길',exact:true}).click();await page.locator('.pr-yard-board').waitFor();}
async function room(page){await page.getByRole('button',{name:'집 문으로 걸어가기',exact:true}).click();await page.locator('.pr-actor').waitFor();}
const live=card=>card.getByRole('button',{name:'함께 살기',exact:true}),rest=card=>card.getByRole('button',{name:'잠시 쉬게 하기',exact:true});
try{
  for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
    const touch=viewport.width===390,label=viewport.width;
    const context=await browser.newContext({viewport,hasTouch:touch});
    const state={owned:new Set(['pet_duck','pet_dog']),active:'pet_duck',balance:10000,failActivate:false};
    const {page,errors}=await setup(context,state);await page.goto(url);await page.locator('.pr-actor').waitFor();
    // Owned + active on the server: the duck is home from the first frame, and walks around off the door carpet.
    await page.locator('.pr-duck').waitFor();assert.equal(await page.locator('.pr-dog').count(),0);
    const inside=await observe(page);assert.ok(inside.cells.length);assert.ok(inside.actions.includes('walk'));
    for(const p of inside.cells)assert.ok(!(p.x>=3&&p.x<=5&&p.y>=6));
    await page.screenshot({path:`${out}/${label}-room.png`});
    // Yard: stays on its grass patch, clear of the crop beds.
    await exitRoom(page,touch);await page.locator('.pr-yard-board .pr-duck').waitFor();
    const yard=await observe(page);assert.ok(yard.cells.length);
    for(const p of yard.cells){assert.ok(p.x>=9&&p.y>=4&&p.y<=9);assert.ok(!([4,5,7,8].includes(p.y)&&p.x<=12&&p.x+1>=11));}
    await page.screenshot({path:`${out}/${label}-yard.png`});
    await toPlaza(page,errors,label);assert.equal(await page.locator('.pr-duck,.pr-dog').count(),0,'no pets in plaza');
    // Pet tab: both previews; swap to the dog. On the phone the first save fails: nothing changes, retry works.
    await openPets(page,touch);
    const duck=page.locator('[data-item="pet_duck"]'),dog=page.locator('[data-item="pet_dog"]');
    await duck.locator('.pr-duck-sprite').waitFor();await dog.locator('.pr-dog-sprite').waitFor();
    await rest(duck).waitFor();
    await page.screenshot({path:`${out}/${label}-shop.png`});
    if(touch){state.failActivate=true;await live(dog).click();await page.getByText('펫 설정을 저장하지 못했어요. 다시 시도해 주세요.').first().waitFor();assert.equal(state.active,'pet_duck');await rest(duck).waitFor();}
    await live(dog).click();await rest(dog).waitFor();await live(duck).waitFor();assert.equal(state.active,'pet_dog');
    await closeShop(page);await home(page);await page.locator('.pr-yard-board .pr-dog').waitFor();assert.equal(await page.locator('.pr-duck').count(),0);
    // ...and back to the duck: exclusive, the dog leaves.
    await toPlaza(page,errors,label);await openPets(page,touch);
    await live(duck).click();await rest(duck).waitFor();await live(dog).waitFor();assert.equal(state.active,'pet_duck');
    await closeShop(page);await home(page);await page.locator('.pr-yard-board .pr-duck').waitFor();assert.equal(await page.locator('.pr-dog').count(),0);
    await room(page);await page.locator('.pr-duck').waitFor();assert.equal(await page.locator('.pr-dog').count(),0);
    // Rest the duck: gone everywhere, and still gone after a reload.
    await exitRoom(page,touch);await toPlaza(page,errors,label);await openPets(page,touch);
    await rest(duck).click();await live(duck).waitFor();assert.equal(state.active,null);
    await closeShop(page);await home(page);await page.waitForTimeout(400);assert.equal(await page.locator('.pr-duck,.pr-dog').count(),0);
    await room(page);await page.reload();await page.locator('.pr-actor').waitFor();await page.waitForTimeout(600);
    assert.equal(await page.locator('.pr-duck,.pr-dog').count(),0,'deactivation persists after reload');
    // Bring it back, then repeated room -> yard -> plaza -> yard -> room round trips.
    await exitRoom(page,touch);await toPlaza(page,errors,label);await openPets(page,touch);
    await live(duck).click();await rest(duck).waitFor();await closeShop(page);
    await home(page);await page.locator('.pr-yard-board .pr-duck').waitFor();await room(page);await page.locator('.pr-duck').waitFor();
    for(let round=0;round<2;round++){
      await exitRoom(page,touch);await page.locator('.pr-yard-board .pr-duck').waitFor();
      await toPlaza(page,errors,label);assert.equal(await page.locator('.pr-duck,.pr-dog').count(),0,'no pets in plaza');
      await home(page);await page.locator('.pr-yard-board .pr-duck').waitFor();
      await room(page);await page.locator('.pr-duck').waitFor();
    }
    await page.reload();await page.locator('.pr-duck').waitFor();assert.equal(await page.locator('.pr-dog').count(),0);
    const fresh=await browser.newContext({viewport});const second=await setup(fresh,state);await second.page.goto(url);await second.page.locator('.pr-duck').waitFor();assert.deepEqual(second.errors,[]);await fresh.close();
    assert.deepEqual(errors,[]);await context.close();
    console.log(`PASS ${viewport.width}: owned duck at home, room/yard movement, crop clearance, both previews, failed-activation retry, dog/duck exclusive swap, rest + reload, repeated plaza round trips, reload/fresh-context persistence`);
  }
}finally{await browser.close();}
