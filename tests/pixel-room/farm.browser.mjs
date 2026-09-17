// Real components + Supabase client; REST responses are intercepted.
// Authority/authorization are separately exercised by farm-server.sql on PostgreSQL.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const out = 'node_modules/.cache/pixel-farm';
await mkdir(out, { recursive: true });
const hour = 3600000;
const empty = now => ({ serverNow: new Date(now).toISOString(), today: '2026-09-18', harvestCount: 0, bestSize: null, lastHarvestSize: null, plots: [0,1].map(index => ({index,revision:0,crop:null})) });
const initialNow = Date.parse('2026-09-18T01:00:00Z');
// Deterministic stand-ins for the server's random rolls (luck kept neutral, review bonus keyed off
// careCount so plot0/plot1 below deterministically differ) so browser-test assertions can check
// exact sizes. Randomness/distribution is covered by the pure computeCropSize/computeCropSizeV2
// unit tests and the real-DB roundtrip in farm-server.sql, not here.
const MOCK_MAX_CARE_DAYS = 4; // matches FARM_GROWTH_DAYS
function mockSize(careCount) { return Math.round(40 + Math.min(1, careCount / MOCK_MAX_CARE_DAYS) * 30); }
function mockHarvest(careCount) {
  const base = mockSize(careCount);
  const bonusApplied = careCount > 0; // stand-in for a review-linked bonus proc
  const size = Math.max(10, Math.min(100, base + (bonusApplied ? 10 : 0)));
  return { size, bonusApplied };
}
function server() {
  const state = empty(initialNow);
  let now = initialNow, serial = 0;
  const api = { state, loseResponse: false, failRead: false, requests: [], advance: ms => { now += ms; }, snapshot: () => structuredClone({ ...state, serverNow: new Date(now).toISOString(), today: new Date(now + 9*hour).toISOString().slice(0,10) }) };
  api.route = async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    let data;
    if (url.pathname.endsWith('/get_pixel_farm')) {
      if (api.failRead) return route.fulfill({status:503,json:{message:'test unavailable'}});
      data = api.snapshot();
    } else if (url.pathname.endsWith('/act_pixel_farm')) {
      const args = route.request().postDataJSON(); api.requests.push(args);
      const plot = state.plots[args.p_plot];
      let result = 'ok', harvest;
      if (plot.revision !== args.p_revision) result = 'changed';
      else if (args.p_action === 'plant' && !plot.crop) { plot.crop = { id:`crop-${++serial}`, plantedAt:new Date(now).toISOString(), readyAt:new Date(now+96*hour).toISOString(), lastWateredOn:null,careCount:0 }; plot.revision++; }
      else if (args.p_action === 'water' && plot.crop && plot.crop.lastWateredOn !== api.snapshot().today) { plot.crop.careCount++; plot.crop.lastWateredOn=api.snapshot().today; plot.revision++; }
      else if (args.p_action === 'harvest' && plot.crop && now >= Date.parse(plot.crop.readyAt)) {
        const { size, bonusApplied } = mockHarvest(plot.crop.careCount);
        state.bestSize = state.bestSize === null ? size : Math.max(state.bestSize, size);
        state.lastHarvestSize = size;
        plot.crop=null; plot.revision++; state.harvestCount++; harvest={sizeScore:size,bonusApplied};
      }
      else result = 'growing';
      if (api.loseResponse) { api.loseResponse=false; return route.fulfill({status:503,json:{message:'test lost response after commit'}}); }
      data = {...api.snapshot(),result,...(harvest?{harvest}:{})};
    } else return route.abort();
    return route.fulfill({status:200,json:data});
  };
  return api;
}
async function setup(context, api) {
  await context.route('**/*', api.route);
  await context.route('**/src/utils/pixelShop.ts', route => route.fulfill({ contentType:'application/javascript',body:`
    export const fetchEquippedAppearance=async()=>({top:null,bottom:null,shoes:null,hair:null,eyes:null});
    export const fetchOwnedPixelItemIds=async()=>['pet_dog'];
    export const fetchPixelCatalog=async()=>[];
    export const fetchPixelFurniturePlacement=async()=>[];
    export const savePixelRoomLayout=async()=>({ok:true});
    export const purchasePixelItem=async()=>({ok:false});
    export const equipPixelItem=async()=>({ok:false});
    export const setPixelBaseAppearance=async()=>({ok:false});
  `}));
  await context.route('**/src/utils/pixelPet.ts', route => route.fulfill({contentType:'application/javascript',body:'export const fetchActivePet=async()=>"pet_dog"; export const saveActivePet=async()=>"pet_dog";'}));
  const page = await context.newPage();
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  return {page,errors};
}
async function enter(page) {
  await page.goto('http://127.0.0.1:5174/tests/pixel-room/yard.html');
  await page.locator('.pr-actor').waitFor();
  await page.locator('.pr-grid button').nth(74).click();
  await page.locator('.pr-yard-board').waitFor();
  await page.waitForFunction(()=>!document.querySelector('.pr-transition-active'));
}
async function bed(page,index=0) {
  const target = page.locator(`[data-plot="${index}"]`);
  if (page.viewportSize().width <= 390) await target.tap(); else await target.click();
  await page.getByRole('dialog',{name:`${index+1}번 토마토 밭`}).waitFor();
}
try {
  for (const viewport of [{width:320,height:568},{width:390,height:700},{width:1440,height:1000}]) {
    const api=server();
    const context=await browser.newContext({viewport,hasTouch:viewport.width<=390});
    const {page,errors}=await setup(context,api);
    await enter(page);
    assert.equal(await page.locator('.pr-dog').count(),1);
    assert.equal(await page.locator('.pr-farm-bubble').count(),0);
    const before=await page.locator('.pr-yard-board').boundingBox();
    await bed(page);
    const bubble=await page.locator('.pr-farm-bubble').boundingBox();
    assert.ok(bubble.x>=before.x && bubble.y>=before.y && bubble.x+bubble.width<=before.x+before.width && bubble.y+bubble.height<=before.y+before.height, 'bubble stays in board');
    assert.equal((await page.locator('.pr-yard-board').boundingBox()).height,before.height,'no extra panel reduces map');
    await page.getByRole('button',{name:'토마토 심기',exact:true}).click();
    await page.getByRole('button',{name:'물주기 · 무료',exact:true}).waitFor();
    assert.equal(await page.locator('[data-plot="0"]').getAttribute('data-stage'),'sprout');
    const cropId=api.state.plots[0].crop.id;
    // Server commits the water, but the response is lost: reload state, never resend blindly.
    api.loseResponse=true;
    await page.getByRole('button',{name:'물주기 · 무료',exact:true}).click();
    await page.getByRole('button',{name:'다시 확인'}).waitFor();
    await page.getByRole('button',{name:'다시 확인'}).click();
    await page.getByRole('button',{name:'오늘은 촉촉해요',exact:true}).waitFor();
    assert.ok(await page.getByRole('button',{name:'오늘은 촉촉해요',exact:true}).isDisabled());
    assert.equal(api.state.plots[0].crop.careCount,1);
    assert.equal(api.requests.length,2);
    await page.screenshot({path:`${out}/${viewport.width}-care.png`});
    await page.keyboard.press('Escape');
    await page.locator('.pr-farm-bubble').waitFor({state:'hidden'});
    assert.equal(await page.locator('.pr-farm-bubble').count(),0);
    // The dog stays outside the beds while the player tends a crop.
    const sample=await page.evaluate(async()=>{
      const seen=[]; for(let i=0;i<40;i++){const dog=document.querySelector('.pr-dog');if(dog)seen.push([Number(dog.dataset.x),Number(dog.dataset.y)]);await new Promise(r=>setTimeout(r,50));}return seen;
    });
    assert.ok(sample.length);
    for(const [x,y] of sample) assert.ok(!([4,5,7,8].includes(y)&&x<=12&&x+1>=11),'dog avoids crop footprint');
    // Reload gets the same persisted crop, including today's care.
    await enter(page); await bed(page);
    await page.getByRole('button',{name:'오늘은 촉촉해요',exact:true}).waitFor();
    assert.equal(api.state.plots[0].crop.id,cropId);
    await page.getByRole('button',{name:'밭 닫기'}).click();
    await bed(page,1);
    await page.getByRole('button',{name:'토마토 심기',exact:true}).click();
    await page.getByRole('button',{name:'물주기 · 무료',exact:true}).waitFor();
    await page.getByRole('button',{name:'밭 닫기'}).click();
    // Maturation from server time on focus, including an entirely unwatered plot. 97h clears the
    // real 96h (4-day) production duration.
    api.advance(97*hour);
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(()=>document.querySelector('[data-plot="0"]')?.getAttribute('data-stage')==='ripe');
    await page.screenshot({path:`${out}/${viewport.width}-ripe.png`});
    await bed(page);
    await page.getByRole('button',{name:'토마토 수확하기',exact:true}).click();
    // Size is revealed immediately in the light in-world feedback bubble, and persists as a
    // best/last-record summary (survives being purely transient — see the reload/fresh-context
    // checks below). plot0 was watered once (careCount>0 in the mock), so it also carries the
    // review-bonus hint text.
    await page.getByText(/이번 토마토는 .+예요 \(58\/100\) · 꾸준한 복습 보너스!/).waitFor();
    await page.getByText('지금까지 수확 1개 · 최고 기록 58 · 최근 58',{exact:true}).waitFor();
    assert.equal(api.state.plots[0].crop,null);
    assert.equal(api.state.bestSize,58); assert.equal(api.state.lastHarvestSize,58);
    await page.getByRole('button',{name:'토마토 심기',exact:true}).click();
    await page.getByRole('button',{name:'물주기 · 무료',exact:true}).waitFor();
    assert.notEqual(api.state.plots[0].crop.id,cropId);
    // A fresh browser context (no local storage) sees the same farm.
    const second=await browser.newContext({viewport,hasTouch:viewport.width<=390});
    const other=await setup(second,api);
    await enter(other.page); await bed(other.page,1);
    await other.page.getByRole('button',{name:'토마토 수확하기',exact:true}).waitFor();
    await other.page.getByRole('button',{name:'토마토 수확하기',exact:true}).click();
    // Unwatered plot still produces a valid (smaller) size — never a failure/no-harvest state —
    // and gets no review-bonus hint (mock careCount=0). The best-record persists across the fresh
    // context while the last-record updates.
    await other.page.getByText('지금까지 수확 2개 · 최고 기록 58 · 최근 40',{exact:true}).waitFor();
    assert.equal(api.state.bestSize,58); assert.equal(api.state.lastHarvestSize,40);
    assert.deepEqual(other.errors,[]);
    await second.close();
    assert.deepEqual(errors,[]);
    console.log(`PASS ${viewport.width}: in-world approach, plant/water/lost-response recovery, dog clearance, reload/fresh-context persistence, 4-day server-time growth, harvest/replant, no map height loss, crop size + review-bonus reveal + best/last record`);
    await context.close();
  }
} finally {await browser.close();}
