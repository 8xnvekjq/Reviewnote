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
// 편집 표면은 CSS 좌표로 터치와 펜을 같은 칸에 맞춘다.
const roomCellScreen = (d, x, y) => ({ x: ((x + 1.5) * 16 - d.camera.x) * d.cssZoom,
  y: ((y + 2.5) * 16 - d.camera.y) * d.cssZoom });
const layout = page => page.evaluate(() => window.__pixelWorldPhaser.getFurniture());
const penDrag = async (page, from, to) => {
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...from, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen' });
  await session.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...to, button: 'left', buttons: 1, pointerType: 'pen' });
  await session.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...to, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
  await session.detach();
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
    await page.goto(`${BASE}/tests/pixel-world-phaser/harness.html?petWander=0&pet=pet_dog&roomEdit=1`);
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

    // 취소는 저장된 배치를 유지하고, 완료는 터치·펜으로 바꾼 배치를 반영한다.
    await page.waitForTimeout(300);
    const originalLayout = await layout(page);
    await page.getByRole('button', { name: '꾸미기', exact: true }).click();
    let editor = page.getByRole('dialog', { name: '내 방 꾸미기', exact: true });
    const frozen = await debug(page);
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(300); await page.keyboard.up('ArrowRight');
    assert.equal((await debug(page)).x, frozen.x, 'character frozen while editing');
    assert.equal((await debug(page)).y, frozen.y);
    await editor.locator('[data-room-item="desk"]').click();
    await editor.getByRole('button', { name: '위로 한 칸', exact: true }).click();
    await editor.getByRole('button', { name: '취소', exact: true }).click();
    assert.deepEqual(await layout(page), originalLayout, 'cancel restores the previous layout');

    await page.getByRole('button', { name: '꾸미기', exact: true }).click();
    editor = page.getByRole('dialog', { name: '내 방 꾸미기', exact: true });
    const editDebug = await debug(page);
    await penDrag(page, roomCellScreen(editDebug, 4, 4), roomCellScreen(editDebug, 4, 2));
    await editor.locator('[data-room-item="chair"]').click();
    const chairPoint = roomCellScreen(await debug(page), 7, 1);
    await page.touchscreen.tap(chairPoint.x, chairPoint.y);
    await page.screenshot({ path: `${SHOTS}/${name}-room-edit.png` });
    await editor.getByRole('button', { name: '완료', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    const editedLayout = await layout(page);
    assert.deepEqual(editedLayout.find(item => item.type === 'desk'), { type: 'desk', x: 3, y: 2 });
    assert.deepEqual(editedLayout.find(item => item.type === 'chair'), { type: 'chair', x: 7, y: 1 });
    const newDesk = (await debug(page)).targets['furniture:desk'];
    assert.ok(newDesk.y < editDebug.targets['furniture:desk'].y, 'saved interactions follow the new layout');
    await walk(page, roomCellScreen(await debug(page), 4, 4));
    assert.ok((await debug(page)).y > 96, 'old desk footprint is walkable after save');
    await page.getByRole('button', { name: '꾸미기', exact: true }).click();
    editor = page.getByRole('dialog', { name: '내 방 꾸미기', exact: true });
    await editor.locator('[data-room-item="chair"]').click();
    await editor.getByRole('button', { name: '보관함에 넣기', exact: true }).click();
    assert.match(await editor.locator('[data-room-item="chair"]').textContent(), /보관 중/);
    await editor.getByRole('button', { name: '완료', exact: true }).click();
    await editor.waitFor({ state: 'detached' });
    assert.equal((await layout(page)).find(item => item.type === 'chair'), undefined);

    // 멈추고 방향을 바꾼 뒤 펫이 안정적으로 정지한다.
    await page.waitForTimeout(2500);
    const pet1 = (await debug(page)).pet;
    await page.waitForTimeout(400);
    const pet2 = (await debug(page)).pet;
    assert.ok(Math.hypot(pet2.x - pet1.x, pet2.y - pet1.y) <= 2, 'room pet settles');
    await page.screenshot({ path: `${SHOTS}/${name}-room.png` });

    // Equip inside the room; the active sprite and the next yard visit must agree.
    const roomLook = (await debug(page)).avatarKey;
    await page.getByRole('button', { name: '옷장', exact: true }).click();
    const wardrobe = page.getByRole('dialog', { name: '옷장', exact: true });
    await wardrobe.getByRole('button', { name: '상의', exact: true }).click();
    await wardrobe.locator('[data-item="top_blouse_rose"]').getByRole('button', { name: '장착하기' }).click();
    await page.waitForFunction(key => window.__pixelWorldPhaser.debug().avatarKey !== key, roomLook);
    const equippedKey = (await debug(page)).avatarKey;
    await wardrobe.getByRole('button', { name: '펫', exact: true }).click();
    await wardrobe.locator('[data-item="pet_duck"]').getByRole('button', { name: '함께 살기' }).click();
    await page.waitForFunction(() => window.__pixelWorldPhaser.debug().petId === 'pet_duck');
    await wardrobe.getByRole('button', { name: '옷장 닫기' }).click();

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
    assert.equal((await debug(page)).avatarKey, equippedKey, 'room outfit persists in yard');
    assert.equal((await debug(page)).petId, 'pet_duck', 'room pet persists in yard');
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
    assert.equal((await debug(page)).avatarKey, equippedKey, 'outfit survives revisiting room');
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
  let layoutWrites = 0;
  const payloads = [];
  const writes = [];
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/rest/v1/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const table = url.pathname.split('/').at(-1);
    if (request.method() !== 'GET' && table !== 'get_pixel_farm') writes.push(request.url());
    let body = [];
    if (table === 'save_pixel_room_layout') {
      assert.equal(request.method(), 'POST');
      payloads.push(request.postDataJSON());
      layoutWrites++;
      body = layoutWrites === 1 ? { ok: false, reason: 'unknown', message: 'test save failure' } : { ok: true, count: 0 };
    } else if (table === 'pixel_furniture_placement') {
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
  await page.goto(`${BASE}/tests/pixel-world-phaser/harness.html?petWander=0&saved=1`);
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
  await page.getByRole('button', { name: '꾸미기', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '내 방 꾸미기', exact: true });
  assert.equal(await editor.locator('[data-room-item]').count(), 1, 'only owned furniture can be placed');
  await editor.locator('[data-room-item="desk"]').click();
  await editor.getByRole('button', { name: '보관함에 넣기', exact: true }).click();
  await editor.getByRole('button', { name: '완료', exact: true }).click();
  await editor.getByRole('status').filter({ hasText: '저장하지 못했어요' }).waitFor();
  assert.ok((await debug(page)).targets['furniture:desk'], 'failed save retains committed collisions');
  assert.deepEqual(payloads, [{ p_placements: [] }], 'same full-layout RPC payload as legacy');
  await editor.getByRole('button', { name: '완료', exact: true }).click();
  await editor.waitFor({ state: 'detached' });
  assert.equal((await debug(page)).targets['furniture:desk'], undefined);
  assert.equal(layoutWrites, 2, 'retry succeeds without duplicate concurrent writes');
  await page.getByRole('button', { name: '꾸미기', exact: true }).click();
  assert.match(await page.locator('[data-room-item="desk"]').textContent(), /보관 중/, 'removing placement preserves ownership');
  await page.getByRole('button', { name: '취소', exact: true }).click();
  assert.deepEqual(errors, []);
  await page.locator('.pwp-exit').click();
  await context.close();
  console.log('PASS saved furniture: scoped read, ownership filter, legacy save payload, failure/retry, inventory preservation');
} finally { await browser.close(); }
