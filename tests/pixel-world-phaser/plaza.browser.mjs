// Vite 5174. transport만 가짜로 바꾸고 실제 두 페이지/장면/훅을 검증한다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const BASE = process.env.PWP_BASE ?? 'http://127.0.0.1:5174';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ready = (page, scene) => page.waitForFunction(scene => window.__pixelWorldPhaser?.debug().scene === scene && !window.__pixelWorldPhaser.debug().transitioning, scene, { timeout: 20000 });
const target = async (page, name) => { await page.bringToFront(); return page.evaluate(name => { const h = window.__pixelWorldPhaser, p = h.debug().targets[name]; h.walkToScreen(p.x, p.y); }, name); };
const exit = async (page, name) => { await page.bringToFront(); return page.evaluate(name => { const h = window.__pixelWorldPhaser, p = h.debug().exits[name]; h.walkToScreen(p.x, p.y); }, name); };
try {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const errors = [];
  await context.route('**/src/services/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: "export { supabase } from '/tests/pixel-world-phaser/fakeRealtime.mjs';" }));
  const a = await context.newPage(), b = await context.newPage();
  for (const [page, pet] of [[a, 'pet_dog'], [b, 'pet_duck']]) {
    page.on('pageerror', e => errors.push(e.message));
    await page.bringToFront();
    await page.goto(BASE + '/tests/pixel-world-phaser/harness.html?top=' + (pet === 'pet_duck' ? 'blouse_rose' : 'stripe') + '&pet=' + pet);
    await page.waitForFunction(() => document.querySelector('.pwp-root')?.dataset.status === 'ready');
    await ready(page, 'yard');
    assert.equal(await page.evaluate(() => window.plazaTransport?.audit().active.length ?? 0), 0, 'yard has no subscription');
    await page.bringToFront();
    await exit(page, 'gate');
    await ready(page, 'plaza');
    await page.waitForFunction(() => document.querySelector('.pwp-plaza-reactions')?.dataset.ready === 'true');
  }
  for (const page of [a, b]) { await page.bringToFront(); await page.waitForFunction(() => window.__pixelWorldPhaser.debug().classmates?.length === 1 && window.__pixelWorldPhaser.debug().classmates[0].rendered && window.__pixelWorldPhaser.debug().classmates[0].pet); }
  // 탭한 가판대 앞까지 걸어가면 기존 상점 창이 열린다.
  await target(a, 'shop');
  const shop = a.getByRole('dialog', { name: '상점', exact: true }); await shop.waitFor({ timeout: 20000 });
  assert.equal(await a.evaluate(() => window.__pixelWorldPhaser.debug().prompt), 'shop');
  await shop.getByRole('button', { name: '상점 닫기' }).click();
  // 같은 자리에서 A로도 상점을 연다.
  await a.locator('.pwp-btn-a').click(); await shop.waitFor(); await a.keyboard.press('Escape');
  await target(a, 'podium');
  const contest = a.getByRole('dialog', { name: '이번 주 토마토 대회' }); await contest.waitFor({ timeout: 20000 });
  assert.ok((await contest.textContent()).includes('87/100')); await a.keyboard.press('Escape');
  await target(a, 'well');
  const well = a.getByRole('dialog', { name: '우물의 오늘 한마디' }); await well.waitFor({ timeout: 20000 });
  assert.ok((await well.locator('p').textContent()).length > 5); await a.keyboard.press('Escape');
  // 걷는 중인 분수 좌표가 상대에게 전달되고 가장 가까운 칸도 함께 남는다.
  await a.keyboard.down('ArrowDown'); await a.waitForTimeout(450); await a.keyboard.up('ArrowDown');
  await b.bringToFront();
  await b.waitForFunction(() => { const p = window.__pixelWorldPhaser.debug().classmates[0]; return p && (p.x % 1 !== 0 || p.y % 1 !== 0); });
  const payload = await a.evaluate(() => window.plazaTransport.last());
  assert.equal(payload.version, 2); assert.ok(Number.isInteger(payload.x) && Number.isInteger(payload.y)); assert.ok(payload.position);
  assert.ok(!('name' in payload) && !('userId' in payload));
  await a.waitForTimeout(4200);
  await a.getByRole('button', { name: '안녕!', exact: true }).click();
  await b.bringToFront();
  await b.waitForFunction(() => window.__pixelWorldPhaser.debug().reactions?.length === 1);
  await mkdir('.pixel-world-test.local', { recursive: true });
  await b.screenshot({ path: '.pixel-world-test.local/plaza-classmates.png' });
  await exit(a, 'yard'); await ready(a, 'yard');
  await b.bringToFront();
  await b.waitForFunction(() => window.__pixelWorldPhaser.debug().classmates.length === 0);
  await a.waitForFunction(() => window.plazaTransport.audit().active.length === 0);
  await exit(a, 'gate'); await ready(a, 'plaza');
  await b.bringToFront();
  await b.waitForFunction(() => window.__pixelWorldPhaser.debug().classmates.length === 1);
  await a.locator('.pwp-exit').click(); await a.getByTestId('exited').waitFor();
  await a.waitForFunction(() => window.plazaTransport.audit().active.length === 0);
  await b.waitForFunction(() => window.__pixelWorldPhaser.debug().classmates.length === 0);
  await b.locator('.pwp-exit').click(); await b.getByTestId('exited').waitFor();
  await b.waitForFunction(() => window.plazaTransport.audit().active.length === 0);
  assert.deepEqual(errors, []);
  // 구형 훅/스무딩 소비자와 같은 채널에서 양방향 호환을 확인한다.
  await b.bringToFront();
  await b.goto(BASE + '/tests/plaza/reconnect.html');
  await b.waitForFunction(() => document.querySelector('#sender')?.dataset.ready === 'true');
  await a.getByRole('button', { name: '다시 들어가기' }).click();
  await a.bringToFront();
  await a.waitForFunction(() => document.querySelector('.pwp-root')?.dataset.status === 'ready');
  await exit(a, 'gate'); await ready(a, 'plaza');
  await a.keyboard.down('ArrowRight'); await a.waitForTimeout(430); await a.keyboard.up('ArrowRight');
  await a.waitForTimeout(220);
  const betaPayload = await a.evaluate(() => window.plazaTransport.last());
  await b.bringToFront();
  await b.waitForFunction(p => {
    const beta = JSON.parse(document.querySelector('#raw').textContent).find(v => v.sessionId === p.sessionId);
    return beta && beta.x === p.x && beta.y === p.y && Number.isInteger(beta.x) && Number.isInteger(beta.y);
  }, betaPayload);
  await b.evaluate(() => { window.plazaSender({ x: 10, y: 8, direction: 'Left', moving: true }); window.plazaSender({ x: 10, y: 8, direction: 'Left', moving: false }); });
  await a.bringToFront();
  await a.waitForFunction(() => { const old = window.__pixelWorldPhaser.debug().classmates.find(p => p.id === 'sender'); return old && old.x === 10 && old.y === 8 && old.rendered && !old.pet; });
  await a.locator('.pwp-exit').click(); await a.getByTestId('exited').waitFor();
  await a.waitForFunction(() => window.plazaTransport.audit().active.length === 0);
  console.log('PASS mixed clients: legacy receives nearest tile, beta renders legacy tile coordinates');
  console.log('PASS plaza: fades, stall A/shop, contest RPC, well, two-page sprites/pets, fractional movement, reaction, leave/rejoin/exit cleanup');
  await context.close();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2.625 });
  await mobile.route('**/src/services/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: "export { supabase } from '/tests/pixel-world-phaser/fakeRealtime.mjs';" }));
  const phone = await mobile.newPage();
  phone.on('pageerror', e => errors.push(e.message));
  await phone.goto(BASE + '/tests/pixel-world-phaser/harness.html?pet=pet_duck');
  await phone.waitForFunction(() => document.querySelector('.pwp-root')?.dataset.status === 'ready');
  await exit(phone, 'gate'); await ready(phone, 'plaza');
  await target(phone, 'shop');
  const phoneShop = phone.getByRole('dialog', { name: '상점', exact: true });
  await phoneShop.waitFor({ timeout: 20000 });
  const rect = await phoneShop.boundingBox(); assert.ok(rect.x >= 0 && rect.x + rect.width <= 390);
  await phoneShop.getByRole('button', { name: '상점 닫기' }).click();
  await phone.screenshot({ path: '.pixel-world-test.local/plaza-phone.png' });
  await phone.locator('.pwp-exit').click(); await phone.getByTestId('exited').waitFor();
  await phone.waitForFunction(() => window.plazaTransport.audit().active.length === 0);
  assert.deepEqual(errors, []);
  console.log('PASS phone plaza: fractional DPR, stall/shop panel fits frame, exit cleanup');
  await mobile.close();
} finally { await browser.close(); }
