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
// 텃밭 0번 칸(익은 토마토): 아래 칸까지 걸어간 뒤 그 칸을 찍어 딴다(도구 막대가 뜬 뒤).
async function harvestCell0(page) {
  await page.evaluate(()=>{const h=window.__pixelWorldPhaser,p=h.debug().garden.points[8];h.walkToScreen(p.x,p.y)});
  await page.waitForFunction(()=>{const d=window.__pixelWorldPhaser.debug();return !d.moving&&d.pathLength===0&&d.garden?.near});
  await page.locator('.pwp-garden-tools').waitFor();
  const p=(await page.evaluate(()=>window.__pixelWorldPhaser.debug())).garden.points[0];
  await page.mouse.click(p.x,p.y);
}
try {
  for (const width of [390, 1180]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    await context.route('**/src/services/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
      let balance=200, charges=73, xp=1148, farmXp=1148; window.baitCalls=[];
      // 지수형 곡선: Lv.12는 누적 1003, Lv.13은 1168(다음 165 → 184). 레벨은 활동마다 따로.
      const level=()=>({xp,level:xp>=1168?13:12,xpIntoLevel:xp>=1168?xp-1168:xp-1003,xpForNext:xp>=1168?184:165,maxLevel:100,tracks:{fishing:{xp},farming:{xp:farmXp},gathering:{xp:0}}});
      let farm={serverNow:'2026-10-09T03:00:00Z',today:'2026-10-09',harvestCount:0,bestSize:null,lastHarvestSize:null,
        plots:[{index:0,revision:1,crop:{id:'ready',plantedAt:'2026-10-01T03:00:00Z',readyAt:'2026-10-08T03:00:00Z',careCount:3,lastWateredOn:'2026-10-07',reviewGained:0}},{index:1,revision:1,crop:null}]};
      export const supabase={from(table){const q={select(){return q},eq(){return q},maybeSingle(){return Promise.resolve({data:null,error:null})},then(resolve){return Promise.resolve({data:table==='pixel_item_catalog'?[{item_id:'bait_worm',category:'bait',slot:'bait',price:50,asset_key:'worm',display_name:'지렁이 미끼 (100회)',tier:1,stackable:true}]:[],error:null}).then(resolve)}};return q},
      rpc(fn){window.baitCalls.push(fn); let data;
        if(fn==='get_pixel_level')data=level();
        else if(fn==='get_pixel_farm')data=farm;
        else if(fn==='act_pixel_farm'){farmXp+=40;farm={...farm,harvestCount:1,lastHarvestSize:82,bestSize:82,plots:[{index:0,revision:2,crop:null},farm.plots[1]]};data={...farm,result:'ok',harvest:{sizeScore:82,bonusApplied:true},xpGain:{gained:40,xp:farmXp,level:13,leveledUp:true,track:'farming'}};}
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
    const badge = page.getByRole('button', { name: '레벨 정보 낚시 Lv. 12 · 농사 Lv. 12 · 채집 Lv. 1' });
    await badge.waitFor();
    // 접힌 'Lv' 버튼만 보이고, 누르면 옆으로 세 활동 레벨이 펼쳐진다.
    assert.equal(await page.getByRole('progressbar', { name: '낚시 다음 레벨 경험치' }).count(), 0);
    const overlaps = await badge.evaluate(el => {
      const a=el.getBoundingClientRect(); return [...document.querySelectorAll('.pwp-hud .pwp-chip,.pwp-panel-access .pwp-chip,.pwp-btn')].some(other => {const b=other.getBoundingClientRect();return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;});
    });
    assert.equal(overlaps, false);
    await page.screenshot({ path: `scratch/level/hud-${width}.png` });
    await badge.click();
    assert.equal(await page.getByRole('progressbar', { name: '낚시 다음 레벨 경험치' }).getAttribute('aria-valuenow'), '145');
    await page.getByRole('button', { name: '자세히' }).click(); const panel=page.getByRole('dialog', {name:'레벨 정보'});
    await panel.locator('[data-track="fishing"]').getByText('145 / 165 XP · 다음 레벨까지 20 XP', {exact:true}).waitFor();
    await page.screenshot({ path: `scratch/level/panel-${width}.png` });
    await panel.getByRole('button', {name:'레벨 정보 닫기'}).click();
    assert.equal(await panel.count(),0);
    await page.getByRole('button', { name: '자세히' }).click(); await page.keyboard.press('Escape'); assert.equal(await panel.count(),0);
    await badge.click(); assert.equal(await page.getByRole('button', { name: '자세히' }).count(), 0, 'Lv 버튼을 다시 누르면 접힌다');
    // 강가 거북이까지 실제 걸어가 '상점' 탭에서 구매한다(광장 상점은 낚시 도구를 팔지 않는다).
    await exit(page, 'river'); await ready(page, 'river');
    await page.evaluate(() => { const h=window.__pixelWorldPhaser,t=h.debug().targets; if(!t.turtle)throw new Error(JSON.stringify(t));h.walkToScreen(t.turtle.x,t.turtle.y); });
    // 거북이를 눌러 걸어가면 도착하자마자 창이 열린다.
    const album=page.getByRole('dialog',{name:'거북이의 물고기 도감',exact:true}); await album.waitFor();
    await album.getByRole('navigation',{name:'거북이 메뉴'}).getByRole('button',{name:'상점',exact:true}).click();
    const shop=page.getByRole('dialog',{name:'거북이 낚시 상점',exact:true}); await shop.waitFor();
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
    await shop.getByRole('button',{name:'거북이 낚시 상점 닫기'}).click();
    await exit(page,'yard'); await ready(page,'yard');
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
    await page.locator('.pwp-level-toast').getByText('🎣 낚시 레벨 업! Lv. 13',{exact:true}).waitFor();
    await page.locator('.pwp-level-toast').getByText('낚시 난이도 −12%',{exact:true}).waitFor();
    await page.getByRole('button',{name:/^레벨 정보 낚시 Lv\. 13 · 농사 Lv\. 12/}).waitFor();
    const feedbackOverlap = await page.locator('.pwp-level-toast').evaluate(el => {
      const a=el.getBoundingClientRect(),b=document.querySelector('.pwp-catch-card').getBoundingClientRect();
      return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
    });
    assert.equal(feedbackOverlap,false);
    await page.locator('.pwp-catch-card .pwp-xp-gain').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
    await page.screenshot({path:`scratch/level/xp-${width}.png`});
    // 구형 서버의 성공한 수확도 표시용 경험치만 보여 준다.
    await page.goto(base + '/tests/pixel-world-phaser/harness.html?farm=1'); await ready(page,'yard');
    await harvestCell0(page);
    const farm=page.locator('.pwp-garden-message'); await farm.filter({hasText:'+40 XP'}).waitFor();
    await page.getByRole('button',{name:/^레벨 정보 낚시 Lv\. 1 · 농사 Lv\. 1 /}).waitFor();
    await page.screenshot({path:`scratch/level/harvest-${width}.png`});
    await page.goto(base + '/tests/pixel-world-phaser/level.harness.html?harvest=1'); await ready(page,'yard');
    await page.getByRole('button',{name:/농사 Lv\. 12 /}).waitFor();
    await harvestCell0(page);
    await page.locator('.pwp-garden-message').filter({hasText:'+40 XP'}).waitFor();
    // 수확 경험치는 농사 레벨에만 쌓인다(낚시 레벨은 그대로 12).
    await page.locator('.pwp-level-toast').getByText('🌱 농사 레벨 업! Lv. 13',{exact:true}).waitFor();
    const farmBadge = page.getByRole('button',{name:'레벨 정보 낚시 Lv. 12 · 농사 Lv. 13 · 채집 Lv. 1'}); await farmBadge.waitFor();
    await farmBadge.click();
    assert.equal(await page.getByRole('progressbar',{name:'농사 다음 레벨 경험치'}).getAttribute('aria-valuenow'),'20');
    assert.ok(await page.evaluate(()=>window.baitCalls.includes('act_pixel_farm')&&window.baitCalls.includes('get_pixel_level')));
    await page.screenshot({path:`scratch/level/harvest-server-${width}.png`});
    assert.deepEqual(errors,[]);
    console.log(`PASS level ${width}px: HUD/bar, no button overlap, panel close/Escape, landed +25 XP, fishing Lv.13 toast, server worm catalog, stacked bait and balance callback, reel charges/no difficulty, legacy harvest display only, server harvest +40 XP/farming Lv.13`);
    await context.close();
  }
} finally {await browser.close();}
