import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = process.env.PWP_BASE ?? 'http://127.0.0.1:5196';
await mkdir('scratch/rods', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1180]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    await context.route('**/src/services/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
      const saved=JSON.parse(sessionStorage.getItem('rodMock')||'{}'); let balance=saved.balance??1234, rod=saved.rod??null; const owned=new Set(saved.owned??[]); window.rodRpcCalls=[]; const save=()=>sessionStorage.setItem('rodMock',JSON.stringify({balance,rod,owned:[...owned]}));
      const items=[['rod_bamboo','대나무 낚싯대',80,1],['rod_steel','강철 낚싯대',200,2],['rod_lucky','행운의 낚싯대',400,3],['rod_gold','황금 낚싯대',700,4]].map(([item_id,display_name,price,tier])=>({item_id,display_name,price,tier,category:'rod',slot:'rod',asset_key:item_id.slice(4),stackable:false}));
      export const supabase={ from(table){const q={select(){return q},eq(){return q},maybeSingle(){return Promise.resolve(table==='pixel_rod_equipment'?{data:rod?{rod_id:rod}:null,error:null}:{data:null,error:null})},then(resolve){return Promise.resolve({data:table==='pixel_item_catalog'?items:[...owned].map(item_id=>({item_id})),error:null}).then(resolve)}};return q},
        async rpc(fn,args){window.rodRpcCalls.push({fn,args});let data;
          if(fn==='purchase_pixel_item'){const item=items.find(i=>i.item_id===args.p_item_id);owned.add(item.item_id);balance-=item.price;save();data={ok:true,itemId:item.item_id,newBalance:balance}}
          if(fn==='equip_pixel_rod'){if(args.p_item_id&&!owned.has(args.p_item_id))return {data:{ok:false,reason:'not_owned'},error:null};rod=args.p_item_id;save();data={ok:true,rod:{id:rod,tier:items.find(i=>i.item_id===rod)?.tier??0}}}
          if(fn==='get_pixel_fishing_state')data={kstDate:'2026-10-08',phase:'day',weather:'clear',remaining:10,sparkleShadow:null,pigeonHint:null,album:[],rod:{id:rod,tier:items.find(i=>i.item_id===rod)?.tier??0}};
          if(fn==='start_pixel_cast')data={ok:true,castId:'rod-cast',shadow:'M',biteDelayMs:600,pattern:'quick',hint:null,difficulty:1.5,rod:{id:rod,tier:rod?3:0},speed:rod?1.25:1,trophy:true};
          if(fn==='finish_pixel_cast')data={ok:true,landed:false};return {data,error:null};}};
    ` }));
    const page = await context.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/tests/pixel-world-phaser/rods.harness.html`);
    const shop = page.getByRole('dialog', { name: '상점', exact: true });
    await shop.getByRole('button', { name: '낚싯대', exact: true }).click();
    await shop.locator('[data-item="rod_gold"]').waitFor();
    assert.equal(await shop.locator('[data-item]').count(), 4);
    assert.ok((await shop.textContent()).includes('희귀 물고기 +5%'));
    // 0인 효과는 숨긴다
    assert.equal(await shop.locator('[data-item="rod_bamboo"] .pwp-rod-effects').textContent(), '난이도 −0.3');
    assert.equal(await shop.locator('[data-item="rod_steel"] .pwp-rod-effects').textContent(), '난이도 −0.5 · 낚시 속도 +15%');
    assert.equal(await shop.locator('[data-item="rod_gold"] .pwp-rod-effects').textContent(), '난이도 −0.8 · 희귀 물고기 +8% · 낚시 속도 +35%');
    assert.equal(await shop.locator('img').evaluateAll(imgs => imgs.every(img => img.complete && img.naturalWidth === 16)), true);
    await page.screenshot({ path: `scratch/rods/shop-${width}.png` });
    const card = shop.locator('[data-item="rod_lucky"]');
    await card.getByRole('button', { name: '구매하기' }).click(); await card.getByRole('button', { name: '구매 확정' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="balance"]').textContent === '834');
    assert.equal(await page.getByTestId('callback-count').textContent(), '1');
    await card.getByText('보유 중', { exact: true }).waitFor();
    await shop.getByRole('button', { name: '상점 닫기' }).click(); await page.getByRole('button', { name: '옷장 열기' }).click();
    const wardrobe = page.getByRole('dialog', { name: '옷장', exact: true });
    await wardrobe.getByRole('button', { name: '낚싯대', exact: true }).click();
    assert.equal(await wardrobe.locator('[data-item]').count(), 1);
    await wardrobe.locator('[data-item="rod_lucky"]').getByRole('button', { name: '장착하기' }).click();
    await wardrobe.locator('[data-item="rod_lucky"][data-state="equipped"]').waitFor();
    assert.ok(await page.evaluate(() => window.rodRpcCalls.some(c => c.fn === 'equip_pixel_rod' && c.args.p_item_id === 'rod_lucky' && !('p_slot' in c.args))));
    await page.screenshot({ path: `scratch/rods/wardrobe-${width}.png` });
    // 새로고침해도 pixel_rod_equipment에서 다시 읽어 옷장·상점 모두 '장착 중'
    await page.reload();
    await shop.getByRole('button', { name: '낚싯대', exact: true }).click();
    await shop.locator('[data-item="rod_lucky"][data-state="equipped"]').getByText('장착 중').first().waitFor();
    await shop.getByRole('button', { name: '상점 닫기' }).click(); await page.getByRole('button', { name: '옷장 열기' }).click();
    await wardrobe.getByRole('button', { name: '낚싯대', exact: true }).click();
    await wardrobe.locator('[data-item="rod_lucky"][data-state="equipped"]').waitFor();
    await wardrobe.getByRole('button', { name: '옷장 닫기' }).click();
    await page.getByRole('button', { name: '낚시 시작' }).click(); await page.getByTestId('phase').getByText('bite', { exact: true }).waitFor();
    await page.getByRole('button', { name: '릴 감기' }).click();
    const reel = page.getByTestId('reel-bar'); await reel.waitFor();
    assert.ok((await reel.textContent()).includes('행운의 낚싯대')); assert.ok((await reel.textContent()).includes('대물이에요!'));
    assert.ok((await reel.locator('img').getAttribute('src')).includes('rod_lucky.png'));
    await page.screenshot({ path: `scratch/rods/reel-${width}.png` });
    await page.getByRole('button', { name: '낚시 취소' }).click();
    await page.getByRole('button', { name: '옷장 열기' }).click(); await wardrobe.getByRole('button', { name: '낚싯대', exact: true }).click();
    await wardrobe.getByRole('button', { name: '기본 낚싯대', exact: true }).click();
    await wardrobe.getByRole('button', { name: '기본 낚싯대', exact: true }).filter({ has: page.locator('strong') }).waitFor();
    await page.waitForFunction(() => window.rodRpcCalls.some(c => c.fn === 'equip_pixel_rod' && c.args.p_item_id === null));
    await wardrobe.getByRole('button', { name: '옷장 닫기' }).click();
    await page.getByRole('button', { name: '낚시 시작' }).click(); await page.getByTestId('phase').getByText('bite', { exact: true }).waitFor(); await page.getByRole('button', { name: '릴 감기' }).click();
    await reel.getByText('기본 낚싯대', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log(`PASS rods ${width}px: purchase balance callback, wardrobe equip/unequip, reel rod/icon, trophy, screenshots`);
    await context.close();
  }
} finally { await browser.close(); }
