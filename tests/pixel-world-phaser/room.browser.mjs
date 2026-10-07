// 문 왕복, 가구 충돌/살펴보기, 펫과 배율을 실제 셸에서 확인한다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.PWP_BASE ?? 'http://127.0.0.1:5174';
const SHOTS = '.pixel-world-test.local';
await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const debug = page => page.evaluate(() => window.__pixelWorldPhaser.debug());
const readyScene = (page, scene) => page.waitForFunction(id => {
  const d = window.__pixelWorldPhaser?.debug();
  return d?.scene === id && !d.transitioning;
}, scene);
const walk = async (page, point) => {
  await page.evaluate(p => window.__pixelWorldPhaser.walkToScreen(p.x, p.y), point);
  await page.waitForFunction(() => window.__pixelWorldPhaser.debug().pathLength === 0);
};

try {
  for (const [name, viewport, dpr] of [
    ['phone', { width: 390, height: 844 }, 2.625],
    ['tablet', { width: 1180, height: 820 }, 2],
  ]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, hasTouch: true });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}/tests/pixel-world-phaser/harness.html?pet=pet_dog`);
    await page.waitForFunction(() => document.querySelector('.pwp-root')?.dataset.status === 'ready');
    await readyScene(page, 'yard');
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(40);
    await page.keyboard.up('ArrowUp');
    await page.waitForFunction(() => window.__pixelWorldPhaser.debug().prompt === 'door');
    await page.locator('.pwp-btn-a').click();
    await page.waitForFunction(() => window.__pixelWorldPhaser.debug().transitioning);
    await readyScene(page, 'room');
    assert.equal(await page.locator('.pwp-toast').textContent(), '내 방');
    assert.ok((await debug(page)).pet);
    await page.waitForTimeout(400);
    assert.equal((await debug(page)).scene, 'room', 'entry does not immediately bounce back');

    // 책상 아래 칸(방 좌표 4,5)까지 걷고, 위로 밀어도 가구를 통과하지 않는다.
    const d = await debug(page);
    const below = { x: d.targets['furniture:desk'].x + 16 * d.zoom / d.ratio,
      y: d.targets['furniture:desk'].y + 16 * d.zoom / d.ratio };
    await walk(page, below);
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(700);
    await page.keyboard.up('ArrowUp');
    const stopped = await debug(page);
    assert.ok(stopped.y >= 116 && stopped.y < 125, `desk blocks feet: ${stopped.y}`);
    assert.equal(stopped.prompt, 'furniture:desk');
    await page.locator('.pwp-btn-a').click();
    await page.locator('.pwp-dialogue').waitFor();
    assert.match(await page.locator('.pwp-dialogue p').getAttribute('data-full'), /책상/);
    await page.keyboard.press('Escape');

    // 멈추고 방향을 바꾼 뒤 펫이 안정적으로 정지한다.
    await page.waitForTimeout(2500);
    const pet1 = (await debug(page)).pet;
    await page.waitForTimeout(400);
    const pet2 = (await debug(page)).pet;
    assert.ok(Math.hypot(pet2.x - pet1.x, pet2.y - pet1.y) <= 2, 'room pet settles');
    await page.screenshot({ path: `${SHOTS}/${name}-room.png` });

    // 서버 배치가 늦게 바뀌어도 그림/충돌/상호작용이 함께 새로고침된다.
    await page.evaluate(() => window.__pixelWorldPhaser.setFurniture([{ type: 'plant', x: 4, y: 5 }]));
    const refreshed = await debug(page);
    assert.ok(refreshed.targets['furniture:plant']);
    assert.equal(refreshed.targets['furniture:desk'], undefined);
    assert.ok(!(refreshed.x >= 80 && refreshed.x < 96 && refreshed.y >= 112 && refreshed.y < 128), 'blocked player relocated');
    await page.evaluate(() => window.__pixelWorldPhaser.setFurniture([
      { type: 'desk', x: 3, y: 4 }, { type: 'bed', x: 0, y: 0 }, { type: 'plant', x: 8, y: 3 },
    ]));
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      const h = window.__pixelWorldPhaser;
      const p = h.debug().exits.door;
      h.walkToScreen(p.x, p.y);
    });
    await readyScene(page, 'yard');
    assert.equal(await page.locator('.pwp-toast').textContent(), '앞마당');
    assert.ok((await debug(page)).pet);
    await page.waitForTimeout(400);
    assert.equal((await debug(page)).scene, 'yard');

    // 이번에는 문 칸을 직접 밟아서 들어간다(앞의 왕복은 A로 시작).
    await page.evaluate(() => {
      const h = window.__pixelWorldPhaser, p = h.debug().exits.door;
      h.walkToScreen(p.x, p.y);
    });
    await readyScene(page, 'room');
    assert.ok(Number.isInteger((await debug(page)).zoom));
    assert.deepEqual(errors, []);
    await page.locator('.pwp-exit').click();
    await page.getByTestId('exited').waitFor();
    assert.equal(await page.locator('canvas').count(), 0);
    await context.close();
    console.log(`PASS ${name}: A entry, furniture collision/dialogue/refresh, pet settling, mat exit, walked entry`);
  }
  // 실제 진입 컴포넌트의 조회 → 실패/재시도 → 소유 필터 → 방 렌더 흐름. 서버 쓰기는 차단한다.
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const page = await context.newPage();
  let placementReads = 0;
  const writes = [];
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/rest/v1/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const table = url.pathname.split('/').at(-1);
    if (request.method() !== 'GET' && table !== 'get_pixel_farm') writes.push(request.url());
    let body = [];
    if (table === 'pixel_furniture_placement') {
      assert.equal(request.method(), 'GET');
      assert.equal(url.searchParams.get('user_id'), 'eq.scene-test-user');
      assert.equal(url.searchParams.get('select'), 'item_id,x,y');
      placementReads++;
      if (placementReads === 1) {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'test query failure' }) });
        return;
      }
      body = [{ item_id: 'furniture_desk', x: 3, y: 4 }, { item_id: 'furniture_plant', x: 8, y: 3 }];
    } else if (table === 'pixel_item_ownership') body = [{ item_id: 'furniture_desk' }];
    else if (table === 'pixel_avatar_equipment') body = null;
    else if (table === 'pixel_pet_equipment') body = { active_pet: null };
    else if (table === 'get_pixel_farm') body = { serverNow: new Date().toISOString(), plots: [{ index: 0, crop: null }, { index: 1, crop: null }] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`${BASE}/tests/pixel-world-phaser/harness.html?saved=1`);
  await page.getByRole('alert').waitFor();
  assert.equal(await page.locator('canvas').count(), 0, 'failed query is not shown as an empty saved room');
  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await page.waitForFunction(() => document.querySelector('.pwp-root')?.dataset.status === 'ready');
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(40); await page.keyboard.up('ArrowUp');
  await page.waitForFunction(() => window.__pixelWorldPhaser.debug().prompt === 'door');
  await page.locator('.pwp-btn-a').click();
  await readyScene(page, 'room');
  const saved = await debug(page);
  assert.ok(saved.targets['furniture:desk']);
  assert.equal(saved.targets['furniture:plant'], undefined, 'unowned placement is hidden');
  assert.equal(placementReads, 2);
  assert.deepEqual(writes, []);
  assert.deepEqual(errors, []);
  await page.locator('.pwp-exit').click();
  await context.close();
  console.log('PASS saved furniture: scoped read, error/retry, ownership filter, rendering, no layout writes');
} finally { await browser.close(); }
