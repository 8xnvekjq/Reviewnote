// 가짜 어댑터로 실제 셸의 밭·수확·출품·펫 흐름을 확인한다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const BASE = process.env.PWP_BASE ?? 'http://127.0.0.1:5174';
await mkdir('.pixel-world-test.local', { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ready = page => page.waitForFunction(() => document.querySelector('.pwp-root')?.dataset.status === 'ready');
const target = async (page, id) => {
  await page.evaluate(id => { const h = window.__pixelWorldPhaser, p = h.debug().targets[id]; h.walkToScreen(p.x, p.y); }, id);
};
const react = async (page, kind) => {
  await page.waitForTimeout(500);
  let d = await page.evaluate(() => window.__pixelWorldPhaser.debug());
  if (Math.hypot(d.pet.x - d.x, d.pet.y - d.y) < 5) {
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(1000); d = await page.evaluate(() => window.__pixelWorldPhaser.debug());
  }
  const dx = d.pet.x - d.x, dy = d.pet.y - d.y;
  const key = Math.abs(dx) > 3 ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
  await page.keyboard.down(key); await page.waitForTimeout(20); await page.keyboard.up(key);
  await page.waitForFunction(() => window.__pixelWorldPhaser.debug().prompt === 'pet');
  await page.locator('.pwp-btn-a').click();
  await page.getByRole('button', { name: kind === 'feed' ? '먹이 주기' : '쓰다듬기', exact: true }).click();
  await page.waitForFunction(kind => window.__pixelWorldPhaser.debug().petReaction === kind, kind);
  const start = await page.evaluate(() => window.__pixelWorldPhaser.debug());
  assert.equal(start.petFlipX, start.x > start.pet.x, 'pet turns toward player');
  await page.waitForTimeout(800);
  const next = await page.evaluate(() => window.__pixelWorldPhaser.debug());
  assert.deepEqual(next.pet, start.pet, 'pet holds position during reaction');
  assert.notEqual(next.petFrame, null);
  await page.waitForFunction(() => window.__pixelWorldPhaser.debug().petReaction === null);
};
try {
  for (const [name, viewport] of [['phone', { width: 390, height: 844 }], ['tablet', { width: 1180, height: 820 }]]) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '/tests/pixel-world-phaser/harness.html?farm=1&pet=pet_dog'); await ready(page);
    await react(page, 'feed');
    await target(page, 'farm:1');
    const bed = page.getByRole('dialog', { name: '2번 토마토 밭', exact: true }); await bed.waitFor();
    const before = await page.evaluate(() => window.__pixelWorldPhaser.debug());
    await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(200); await page.keyboard.up('ArrowLeft');
    assert.equal((await page.evaluate(() => window.__pixelWorldPhaser.debug())).x, before.x, 'menu freezes movement');
    const emptyTexture = before.bedTextures[1];
    await bed.getByRole('button', { name: '토마토 심기', exact: true }).dblclick();
    await bed.getByRole('button', { name: '물주기 · 무료', exact: true }).waitFor();
    await page.waitForFunction(texture => window.__pixelWorldPhaser.debug().bedTextures[1] !== texture, emptyTexture);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.farmCalls), '1', 'double click sends one action');
    await bed.getByRole('button', { name: '물주기 · 무료', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('button:disabled')?.textContent === '오늘은 촉촉해요' || [...document.querySelectorAll('button')].some(b => b.disabled && b.textContent === '오늘은 촉촉해요'));
    assert.equal(await page.evaluate(() => document.documentElement.dataset.farmCalls), '2');
    await page.keyboard.press('Escape'); await target(page, 'farm:0');
    const ripe = page.getByRole('dialog', { name: '1번 토마토 밭', exact: true }); await ripe.waitFor();
    const ripeTexture = await page.evaluate(() => window.__pixelWorldPhaser.debug().bedTextures[0]);
    await ripe.getByRole('button', { name: '토마토 수확하기', exact: true }).click();
    await ripe.getByRole('status').filter({ hasText: '82/100' }).waitFor();
    await ripe.getByRole('button', { name: '토마토 심기', exact: true }).waitFor();
    await page.waitForFunction(texture => window.__pixelWorldPhaser.debug().bedTextures[0] !== texture, ripeTexture);
    await page.screenshot({ path: '.pixel-world-test.local/' + name + '-harvest.png' });
    await page.keyboard.press('Escape'); await target(page, 'scarecrow');
    await page.getByRole('button', { name: '수확물 보기', exact: true }).click();
    const collection = page.getByRole('dialog', { name: '수확물 보기', exact: true });
    await collection.getByText('이번 주 토마토 대회', { exact: true }).waitFor();
    await collection.getByRole('button', { name: '출품하기 (+43P)', exact: true }).click();
    await collection.getByText('🏅 출품됨 · +43P', { exact: true }).waitFor();
    assert.match(await page.locator('.pwp-points').textContent(), /1,277/);
    await page.screenshot({ path: '.pixel-world-test.local/' + name + '-collection.png' });
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const h = window.__pixelWorldPhaser, p = h.debug().exits.door; h.walkToScreen(p.x, p.y); });
    await page.waitForFunction(() => window.__pixelWorldPhaser.debug().scene === 'room' && !window.__pixelWorldPhaser.debug().transitioning);
    await react(page, 'pet');
    assert.deepEqual(errors, []); await context.close(); console.log('PASS ' + name + ': plant, water, daily guard, harvest card, collection, submission, contest, yard feed, room pet');
  }
  for (const pet of ['pet_bear', 'pet_duck', 'pet_pigeon']) {
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
    await page.goto(BASE + '/tests/pixel-world-phaser/harness.html?pet=' + pet); await ready(page);
    await react(page, 'feed');
    await page.evaluate(() => { const h = window.__pixelWorldPhaser, p = h.debug().exits.door; h.walkToScreen(p.x, p.y); });
    await page.waitForFunction(() => window.__pixelWorldPhaser.debug().scene === 'room' && !window.__pixelWorldPhaser.debug().transitioning);
    await react(page, 'pet'); await page.close(); console.log('PASS ' + pet + ': yard feed and room pet animation');
  }
  for (const flag of ['farmError', 'farmChanged']) {
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
    await page.goto(BASE + '/tests/pixel-world-phaser/harness.html?farm=1&pet=none&' + flag + '=1'); await ready(page);
    await target(page, 'farm:1'); const bed = page.getByRole('dialog', { name: '2번 토마토 밭', exact: true }); await bed.waitFor();
    await bed.getByRole('button', { name: '토마토 심기', exact: true }).click();
    await bed.getByRole('status').filter({ hasText: flag === 'farmError' ? '저장 결과' : '다른 곳' }).waitFor();
    if (flag === 'farmError') { await bed.getByRole('button', { name: '다시 확인', exact: true }).click(); }
    await bed.getByRole('button', { name: '토마토 심기', exact: true }).waitFor();
    await page.close(); console.log('PASS ' + flag + ': authoritative state retained');
  }
} finally { await browser.close(); }
