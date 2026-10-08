import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { trackReel } from './reel-player.browser-helper.mjs';
const base = process.env.PWP_BASE ?? 'http://127.0.0.1:5202';
await mkdir('scratch/level', { recursive: true });
const browser = await chromium.launch({ headless: true });
const ready = (page, scene) => page.waitForFunction(scene => window.__pixelWorldPhaser?.debug().scene === scene && !window.__pixelWorldPhaser.debug().transitioning, scene);
const exit = (page, pattern) => page.evaluate(pattern => {
  const h = window.__pixelWorldPhaser, exits = h.debug().exits;
  const key = Object.keys(exits).find(k => new RegExp(pattern).test(k));
  if (!key) throw new Error('출구 없음: ' + JSON.stringify(exits));
  h.walkToScreen(exits[key].x, exits[key].y);
}, pattern);
try {
  for (const width of [390, 1180]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    await context.route('**/src/services/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
      let balance=200, charges=73, xp=1245; window.baitCalls=[];
      const level=()=>({xp,level:xp>=1260?13:12,xpIntoLevel:xp>=1260?xp-1260:xp-1100,xpForNext:xp>=1260?170:160,maxLevel:100});
      let farm={serverNow:'2026-10-09T03:00:00Z',today:'2026-10-09',harvestCount:0,bestSize:null,lastHarvestSize:null,
        plots:[{index:0,revision:1,crop:{id:'ready',plantedAt:'2026-10-01T03:00:00Z',readyAt:'2026-10-08T03:00:00Z',careCount:3,lastWateredOn:'2026-10-07',reviewGained:0}},{index:1,revision:1,crop:null}]};
      export const supabase={from(table){const q={select(){return q},eq(){return q},maybeSingle(){return Promise.resolve({data:null,error:null})},then(resolve){return Promise.resolve({data:table==='pixel_item_catalog'?[{item_id:'bait_worm',category:'bait',slot:'bait',price:50,asset_key:'worm',display_name:'지렁이 미끼 (100회)',tier:1,stackable:true}]:[],error:null}).then(resolve)}};return q},
      rpc(fn){window.baitCalls.push(fn); let data;
        if(fn==='get_pixel_level')data=level();
        else if(fn==='get_pixel_farm')data=farm;
        else if(fn==='act_pixel_farm'){xp+=40;farm={...farm,harvestCount:1,lastHarvestSize:82,bestSize:82,plots:[{index:0,revision:2,crop:null},farm.plots[1]]};data={...farm,result:'ok',harvest:{sizeScore:82,bonusApplied:true},xpGain:{gained:40,xp,level:13,leveledUp:true}};}
        else if(fn==='get_weekly_crop_contest')data={top:[],mine:{rank:null,sizeScore:null,participantCount:0}};
        else if(fn==='buy_pixel_bait'){balance-=50;charges+=100;data={ok:true,newBalance:balance,charges};}
        else data={bait:{charges}};
        const result=Promise.resolve({data,error:null});result.abortSignal=()=>result;return result;},
      channel(){const channel={on(){return channel},subscribe(){return channel},track:async()=>{},untrack:async()=>{},send:async()=>{},presenceState:()=>({})};return channel},removeChannel:async()=>{},auth:{getSession:async()=>({data:{session:null}})}};
    ` }));
    const page = await context.newPage(), errors=[];
    page.on('pageerror', error => {errors.push(error.message); console.error(error.stack)});
    await page.goto(base + '/tests/pixel-world-phaser/level.harness.html');
    await ready(page, 'yard');
    const badge = page.getByRole('button', { name: '레벨 정보 Lv. 12' });
    await badge.waitFor();
    assert.equal(await badge.getByRole('progressbar').getAttribute('aria-valuenow'), '145');
    const overlaps = await badge.evaluate(el => {
      const a=el.getBoundingClientRect(); return [...document.querySelectorAll('.pwp-hud .pwp-chip,.pwp-panel-access .pwp-chip,.pwp-btn')].some(other => {const b=other.getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;});
    });
    assert.equal(overlaps, false);
    await page.screenshot({ path: `scratch/level/hud-${width}.png` });
    await badge.click(); const panel=page.getByRole('dialog', {name:'레벨 정보'});
    await panel.getByText('다음 레벨까지 15 XP', {exact:true}).waitFor();
    await page.screenshot({ path: `scratch/level/panel-${width}.png` });
    await panel.getByRole('button', {name:'레벨 정보 닫기'}).click();
    assert.equal(await panel.count(),0);
    await badge.click(); await page.keyboard.press('Escape'); assert.equal(await panel.count(),0);
    // 광장 상점까지 실제 걸어서 구매한다.
    await exit(page, 'plaza|gate|south'); await ready(page, 'plaza');
    await page.evaluate(() => { const h=window.__pixelWorldPhaser,t=h.debug().targets; const key=Object.keys(t).find(k=>/shop|stall/.test(k)); if(!key)throw new Error(JSON.stringify(t));h.walkToScreen(t[key].x,t[key].y); });
    await page.waitForFunction(()=>{const d=window.__pixelWorldPhaser.debug();return d.prompt==='shop'&&!d.moving}); await page.locator('.pwp-btn-a').click();
    const shop=page.getByRole('dialog',{name:'상점',exact:true}); await shop.waitFor();
    await page.waitForFunction(()=>document.querySelector('[data-testid="balance-callback"]').dataset.baitCatalog==='true');
    await shop.getByRole('button',{name:'미끼',exact:true}).click();
    const bait=shop.locator('[data-item="bait_worm"]');await bait.getByText('남은 미끼 73회',{exact:true}).waitFor();
    for(const [charges,balance,count] of [[173,150,1],[273,100,2]]) {
      await bait.getByRole('button',{name:'미끼 구매하기'}).click();
      await bait.getByText(`남은 미끼 ${charges}회`,{exact:true}).waitFor();
      await page.getByTestId('balance-callback').getByText(`${balance}/${count}`,{exact:true}).waitFor();
    }
    assert.equal(await page.evaluate(()=>window.baitCalls.filter(fn=>fn==='buy_pixel_bait').length),2);
    assert.equal(await page.evaluate(()=>window.baitCalls.includes('purchase_pixel_item')),false);
    assert.equal(await bait.locator('img').evaluate(img=>img.complete&&img.naturalWidth===16),true);
    await page.screenshot({path:`scratch/level/bait-${width}.png`});
    await shop.getByRole('button',{name:'상점 닫기'}).click();
    await exit(page,'yard|north'); await ready(page,'yard');
    await exit(page,'river|east');await ready(page,'river');
    await page.waitForFunction(()=>window.__pixelWorldPhaser.debug().targets['shadow:0']);
    await page.evaluate(()=>{const h=window.__pixelWorldPhaser,t=h.debug().targets['shadow:0'];h.walkToScreen(t.x,t.y)});
    await page.waitForFunction(()=>document.querySelector('.pwp-root').dataset.fishingPhase==='bite');
    await page.keyboard.press('z');await page.getByTestId('reel-bar').waitFor();
    await page.getByTestId('reel-bait').getByText('미끼 272회', {exact:true}).waitFor();
    assert.equal(await page.locator('[data-difficulty],.pwp-reel-difficulty').count(),0);
    assert.doesNotMatch(await page.getByTestId('reel-bar').innerText(), /난이도/);
    await page.screenshot({path:`scratch/level/reel-bait-${width}.png`});
    await trackReel(page);
    await page.getByTestId('catch-card').getByText('+25 XP',{exact:true}).waitFor();
    await page.locator('.pwp-level-toast').getByText('레벨 업! Lv. 13',{exact:true}).waitFor();
    await page.locator('.pwp-level-toast').getByText('낚시 난이도 −12%',{exact:true}).waitFor();
    await page.getByRole('button',{name:'레벨 정보 Lv. 13'}).waitFor();
    const feedbackOverlap = await page.locator('.pwp-level-toast').evaluate(el => {
      const a=el.getBoundingClientRect(),b=document.querySelector('.pwp-catch-card').getBoundingClientRect();
      return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
    });
    assert.equal(feedbackOverlap,false);
    await page.locator('.pwp-catch-card .pwp-xp-gain').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
    await page.screenshot({path:`scratch/level/xp-${width}.png`});
    // 구형 서버의 성공한 수확도 표시용 경험치만 보여 준다.
    await page.goto(base + '/tests/pixel-world-phaser/harness.html?farm=1'); await ready(page,'yard');
    await page.evaluate(()=>{const h=window.__pixelWorldPhaser,t=h.debug().targets['farm:0'];h.walkToScreen(t.x,t.y)});
    const farm=page.getByRole('dialog',{name:'1번 토마토 밭',exact:true}); await farm.waitFor();
    await farm.getByRole('button',{name:'토마토 수확하기',exact:true}).click();
    await farm.getByText('+40 XP',{exact:true}).waitFor();
    await page.getByRole('button',{name:'레벨 정보 Lv. 1'}).waitFor();
    await farm.locator('.pwp-xp-gain').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
    await page.screenshot({path:`scratch/level/harvest-${width}.png`});
    await page.goto(base + '/tests/pixel-world-phaser/level.harness.html?harvest=1'); await ready(page,'yard');
    await page.getByRole('button',{name:'레벨 정보 Lv. 12'}).waitFor();
    await page.evaluate(()=>{const h=window.__pixelWorldPhaser,t=h.debug().targets['farm:0'];h.walkToScreen(t.x,t.y)});
    const liveFarm=page.getByRole('dialog',{name:'1번 토마토 밭',exact:true}); await liveFarm.waitFor();
    await liveFarm.getByRole('button',{name:'토마토 수확하기',exact:true}).click();
    await liveFarm.getByText('+40 XP',{exact:true}).waitFor();
    await page.locator('.pwp-level-toast').getByText('레벨 업! Lv. 13',{exact:true}).waitFor();
    await page.getByRole('button',{name:'레벨 정보 Lv. 13'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'레벨 정보 Lv. 13'}).getByRole('progressbar').getAttribute('aria-valuenow'),'25');
    assert.ok(await page.evaluate(()=>window.baitCalls.includes('act_pixel_farm')&&window.baitCalls.includes('get_pixel_level')));
    await page.screenshot({path:`scratch/level/harvest-server-${width}.png`});
    assert.deepEqual(errors,[]);
    console.log(`PASS level ${width}px: HUD/bar, no button overlap, panel close/Escape, landed +25 XP, Lv.13 toast, server worm catalog, stacked bait and balance callback, reel charges/no difficulty, legacy harvest display only, server harvest +40 XP/Lv.13`);
    await context.close();
  }
} finally {await browser.close();}
