// 가짜 어댑터로 실제 셸의 텃밭(도구 막대·칸 콕 찍기·A 버튼)·수확·수확물·출품·펫 흐름을 확인한다.
// 갈기 → 토마토·딸기 심기 → 물 주기 → (밭 시계를 앞당겨) 익음 → 수확. 손가락(터치)으로 칸을 찍고, A 버튼도 쓴다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { economyRegression } from './economy.browser-helper.mjs';
const BASE = process.env.PWP_BASE ?? 'http://127.0.0.1:5174';
await mkdir('.pixel-world-test.local', { recursive: true });
const browser = await chromium.launch({ headless: true });
const ready = page => page.waitForFunction(() => document.querySelector('.pwp-root')?.dataset.status === 'ready');
const debug = page => page.evaluate(() => window.__pixelWorldPhaser.debug());
const target = async (page, id) => {
  await page.evaluate(id => { const h = window.__pixelWorldPhaser, p = h.debug().targets[id]; h.walkToScreen(p.x, p.y); }, id);
};
/** 텃밭 칸 하나의 그림 열쇠(흙|스프링클러|작물). */
const cellKey = async (page, index) => (await debug(page)).garden.cells[[0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21, 24, 25, 26, 27, 28, 29].indexOf(index)];
const waitCell = (page, index, pattern) => page.waitForFunction(([index, source]) => {
  const d = window.__pixelWorldPhaser.debug(), order = [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21, 24, 25, 26, 27, 28, 29];
  return new RegExp(source).test(d.garden.cells[order.indexOf(index)] ?? '');
}, [index, pattern.source]);
const settled = page => page.waitForFunction(() => { const d = window.__pixelWorldPhaser.debug(); return !d.moving && d.pathLength === 0; });
/** 손가락으로 칸을 콕 찍는다(도구를 골랐으면 그 칸 앞까지 걸어가서 쓴다). */
const tapCell = async (page, index) => {
  const p = (await debug(page)).garden.points[index];
  await page.touchscreen.tap(p.x, p.y);
};
/** 멀리서 칸까지 걸어간다(화면 밖이어도 된다). */
const walkCell = async (page, index) => {
  await page.evaluate(index => { const h = window.__pixelWorldPhaser, p = h.debug().garden.points[index]; h.walkToScreen(p.x, p.y); }, index);
  await settled(page);
};
const pickTool = (page, name) => page.getByRole('toolbar', { name: '텃밭 도구' }).getByRole('button', { name, exact: true }).tap();
const calls = page => page.evaluate(() => Number(document.documentElement.dataset.farmCalls));
const react = async (page, kind) => {
  await page.waitForTimeout(500);
  let d = await debug(page);
  if (Math.hypot(d.pet.x - d.x, d.pet.y - d.y) < 5) {
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(1000); d = await debug(page);
  }
  const dx = d.pet.x - d.x, dy = d.pet.y - d.y;
  const key = Math.abs(dx) > 3 ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
  await page.keyboard.down(key); await page.waitForTimeout(20); await page.keyboard.up(key);
  await page.waitForFunction(() => window.__pixelWorldPhaser.debug().prompt === 'pet');
  await page.locator('.pwp-btn-a').click();
  await page.getByRole('button', { name: kind === 'feed' ? '먹이 주기' : '쓰다듬기', exact: true }).click();
  await page.waitForFunction(kind => window.__pixelWorldPhaser.debug().petReaction === kind, kind);
  const start = await debug(page);
  assert.equal(start.petFlipX, start.x > start.pet.x, 'pet turns toward player');
  await page.waitForTimeout(800);
  const next = await debug(page);
  assert.deepEqual(next.pet, start.pet, 'pet holds position during reaction');
  assert.notEqual(next.petFrame, null);
  await page.waitForFunction(() => window.__pixelWorldPhaser.debug().petReaction === null);
};
try {
  await economyRegression(browser, BASE);
  for (const [name, viewport] of [['phone', { width: 390, height: 844 }], ['tablet', { width: 1180, height: 820 }]]) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '/tests/pixel-world-phaser/harness.html?petWander=0&farm=1&pet=pet_dog'); await ready(page);
    await react(page, 'feed');
    // 텃밭은 마당 오른쪽 아래. 멀리서는 도구 막대가 없다.
    assert.equal(await page.getByRole('toolbar', { name: '텃밭 도구' }).count(), 0);
    assert.match(await cellKey(page, 0), /garden:soil:dry\|\|garden:tomato:ripe/, 'migrated ripe tomato sits on tilled soil at cell 0');
    // 텃밭 칸을 찍으면(도구 없이) 그 칸 위로 걸어간다 → 가까우니 도구 막대가 뜬다.
    await walkCell(page, 9);
    await page.getByRole('toolbar', { name: '텃밭 도구' }).waitFor();
    assert.equal((await debug(page)).garden.near, true);
    assert.equal(await page.getByRole('button', { name: '괭이', exact: true }).getAttribute('aria-pressed'), 'true', 'hoe is the default tool');
    await page.screenshot({ path: '.pixel-world-test.local/' + name + '-garden-toolbar.png' });

    // 괭이: 옆 칸을 찍으면 그 칸 앞에서 갈고, 칸 테두리가 보인다.
    const before = await calls(page);
    await tapCell(page, 10); await waitCell(page, 10, /^garden:soil:dry\|\|$/);
    assert.equal(await calls(page), before + 1);
    assert.equal((await debug(page)).garden.cursor, true);
    // 토마토 씨앗 → 10번 칸, 딸기는 괭이로 11번을 갈고 심는다.
    await pickTool(page, '토마토 씨앗'); await tapCell(page, 10); await waitCell(page, 10, /garden:tomato:seed$/);
    await pickTool(page, '괭이'); await tapCell(page, 11); await waitCell(page, 11, /^garden:soil:dry\|\|$/);
    await pickTool(page, '딸기 씨앗'); await tapCell(page, 11); await waitCell(page, 11, /garden:strawberry:seed$/);
    // 씨앗은 갈지 않은 잔디에는 못 심는다 — 안내만, 서버 요청 없음.
    const guarded = await calls(page);
    await tapCell(page, 12); await page.locator('.pwp-garden-message').filter({ hasText: '괭이로 먼저' }).waitFor();
    assert.equal(await calls(page), guarded);
    // 물뿌리개: A 버튼(바라보는 칸)으로 물 주기 → 젖은 흙. 같은 날 두 번은 안 된다.
    await pickTool(page, '물뿌리개'); await tapCell(page, 11); await waitCell(page, 11, /^garden:soil:wet/);
    await tapCell(page, 10); await waitCell(page, 10, /^garden:soil:wet/);
    await settled(page);
    const faced = (await debug(page)).garden.target;
    assert.equal(faced, 10, 'facing the cell just watered');
    assert.equal(await page.locator('.pwp-btn-a').getAttribute('aria-label'), 'A · 물 주기');
    const watered = await calls(page);
    await page.locator('.pwp-btn-a').tap();
    await page.locator('.pwp-garden-message').filter({ hasText: '오늘은 이미 촉촉해요' }).waitFor();
    assert.equal(await calls(page), watered, 'already watered today: no request');
    await page.screenshot({ path: '.pixel-world-test.local/' + name + '-garden-planted.png' });

    // 하루 지나면 흙이 다시 마르고, 시계를 앞당기면 익는다(토마토 4일, 딸기 64시간).
    await page.evaluate(() => window.__gardenAdvance(100));
    await waitCell(page, 10, /^garden:soil:dry\|\|garden:tomato:ripe$/);
    await waitCell(page, 11, /garden:strawberry:ripe$/);
    await page.screenshot({ path: '.pixel-world-test.local/' + name + '-garden-ripe.png' });
    // 익은 작물은 어떤 도구로든 딴다: 토마토는 수확물로(+XP), 칸은 간 흙으로 남는다.
    await tapCell(page, 10);
    await page.locator('.pwp-garden-message').filter({ hasText: /토마토를 땄어요! 82\/100.*\+40 XP/ }).waitFor();
    await waitCell(page, 10, /^garden:soil:dry\|\|$/);
    // 딸기는 가방으로, 포기는 '자람'으로 돌아간다.
    const bagBefore = await page.locator('.pwp-bag-chip').getAttribute('aria-label');
    await tapCell(page, 11);
    await page.locator('.pwp-garden-message').filter({ hasText: /딸기 \d알을 가방에 넣었어요! 앞으로 2번 더/ }).waitFor();
    await waitCell(page, 11, /garden:strawberry:grown$/);
    await page.waitForFunction(before => document.querySelector('.pwp-bag-chip')?.getAttribute('aria-label') !== before, bagBefore);
    // 0번 칸의 예전 익은 토마토도 그대로 딴다(A 버튼, 키보드 없이 손가락으로).
    await tapCell(page, 0);
    await page.locator('.pwp-garden-message').filter({ hasText: '토마토를 땄어요' }).waitFor();
    await page.screenshot({ path: '.pixel-world-test.local/' + name + '-harvest.png' });

    // 수확물 보기(허수아비)와 출품 안내.
    await target(page, 'scarecrow');
    await page.getByRole('button', { name: '수확물 보기', exact: true }).click();
    const collection = page.getByRole('dialog', { name: '수확물 보기', exact: true });
    await collection.getByText('이번 주 토마토 대회', { exact: true }).waitFor();
    await collection.getByText('🎒 가방에 있어요 · 광장 상점에서 출품 (+43P)', { exact: true }).first().waitFor();
    assert.equal(await collection.getByRole('button', { name: /출품하기/ }).count(), 0);
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const h = window.__pixelWorldPhaser, p = h.debug().exits.door; h.walkToScreen(p.x, p.y); });
    await page.waitForFunction(() => window.__pixelWorldPhaser.debug().scene === 'room' && !window.__pixelWorldPhaser.debug().transitioning);
    await react(page, 'pet');
    assert.deepEqual(errors, []); await context.close();
    console.log('PASS ' + name + ': till, plant tomato/strawberry, water (touch + A), daily guard, forced ripe, harvest (tomato collection, strawberry bag + regrow), collection, yard feed, room pet');
  }
  // 스프링클러: 사면 도구 막대에 생기고, 빈 칸에 놓고 거둔다.
  {
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
    await page.goto(BASE + '/tests/pixel-world-phaser/harness.html?petWander=0&farm=1&pet=none&sprinkler=1'); await ready(page);
    await walkCell(page, 17);
    await pickTool(page, '스프링클러'); await tapCell(page, 18); await waitCell(page, 18, /^\|garden:sprinkler\|$/);
    await pickTool(page, '괭이'); await tapCell(page, 18);
    await page.locator('.pwp-garden-message').filter({ hasText: '스프링클러가 있는 칸' }).waitFor();
    await pickTool(page, '스프링클러'); await tapCell(page, 18); await waitCell(page, 18, /^\|\|$/);
    await page.close(); console.log('PASS sprinkler: place, blocked for other tools, pick up');
  }
  for (const pet of ['pet_bear', 'pet_duck', 'pet_pigeon']) {
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
    await page.goto(BASE + '/tests/pixel-world-phaser/harness.html?petWander=0&pet=' + pet); await ready(page);
    await react(page, 'feed');
    await page.evaluate(() => { const h = window.__pixelWorldPhaser, p = h.debug().exits.door; h.walkToScreen(p.x, p.y); });
    await page.waitForFunction(() => window.__pixelWorldPhaser.debug().scene === 'room' && !window.__pixelWorldPhaser.debug().transitioning);
    await react(page, 'pet'); await page.close(); console.log('PASS ' + pet + ': yard feed and room pet animation');
  }
  for (const flag of ['farmError', 'farmChanged']) {
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
    await page.goto(BASE + '/tests/pixel-world-phaser/harness.html?petWander=0&farm=1&pet=none&' + flag + '=1'); await ready(page);
    await walkCell(page, 9);
    await tapCell(page, 10);
    await page.locator('.pwp-garden-message').filter({ hasText: flag === 'farmError' ? '저장 결과' : '다른 곳' }).waitFor();
    assert.match(await cellKey(page, 10), /^\|\|$/, 'authoritative state retained');
    await page.close(); console.log('PASS ' + flag + ': authoritative state retained');
  }
} finally { await browser.close(); }
