// 같은 학생이 두 기기(A, B)로 들어온다. 가짜 서버(이 파일의 serverRows) 하나를 함께 쓴다.
// A에서 저장 → B가 내 방에 다시 들어가면 A의 배치가 보인다. 탭 복귀 때도 따라잡고,
// 오래된 화면에서 저장하려 하면 서버를 덮어쓰지 않고 서버 배치를 불러온다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.PWP_BASE ?? 'http://127.0.0.1:5174';
const SHOTS = '.pixel-world-test.local';
await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch({ headless: true });

let serverRows = [{ item_id: 'furniture_desk', x: 3, y: 4 }];
const payloads = [];
const reads = { A: 0, B: 0 };
const errors = [];

async function device(name) {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  await page.route('**/rest/v1/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const table = url.pathname.split('/').at(-1);
    let body = [];
    if (table === 'save_pixel_room_layout') {
      const { p_placements } = request.postDataJSON();
      payloads.push({ device: name, p_placements });
      serverRows = p_placements.map(p => ({ item_id: p.itemId, x: p.x, y: p.y }));
      body = { ok: true, count: p_placements.length };
    } else if (table === 'pixel_furniture_placement') {
      assert.equal(url.searchParams.get('user_id'), 'eq.scene-test-user');
      reads[name]++;
      body = serverRows;
    } else if (table === 'pixel_item_ownership') body = [{ item_id: 'furniture_desk' }, { item_id: 'furniture_chair' }, { item_id: 'furniture_plant' }];
    else if (table === 'pixel_avatar_equipment') body = null;
    else if (table === 'pixel_pet_equipment') body = { active_pet: null };
    else if (table === 'get_pixel_farm') body = { serverNow: new Date().toISOString(), plots: [{ index: 0, crop: null }, { index: 1, crop: null }] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`${BASE}/tests/pixel-world-phaser/harness.html?petWander=0&saved=1`);
  await page.waitForFunction(() => document.querySelector('.pwp-root')?.dataset.status === 'ready');
  return { context, page };
}
const debug = page => page.evaluate(() => window.__pixelWorldPhaser.debug());
const layout = page => page.evaluate(() => window.__pixelWorldPhaser.getFurniture());
const readyScene = (page, scene) => page.waitForFunction(id => {
  const d = window.__pixelWorldPhaser?.debug();
  return d?.scene === id && !d.transitioning;
}, scene);
const throughDoor = async (page, scene) => {
  await page.evaluate(() => { const h = window.__pixelWorldPhaser, p = h.debug().exits.door; h.walkToScreen(p.x, p.y); });
  await readyScene(page, scene);
};
const roomCellScreen = (d, x, y) => ({ x: ((x + 1.5) * 16 - d.camera.x) * d.cssZoom, y: ((y + 2.5) * 16 - d.camera.y) * d.cssZoom });
const place = async (page, type, x, y) => {
  await page.getByRole('button', { name: '꾸미기', exact: true }).click();
  const panel = page.getByRole('dialog', { name: '가구', exact: true });
  await panel.locator(`[data-room-item="${type}"]`).getByRole('button').first().click();
  await panel.waitFor({ state: 'detached' });
  const point = roomCellScreen(await debug(page), x, y);
  await page.touchscreen.tap(point.x, point.y);
};
const placedAt = (page, type, x, y) => page.waitForFunction(({ type, x, y }) => {
  const item = window.__pixelWorldPhaser.getFurniture().find(item => item.type === type);
  return item?.x === x && item?.y === y;
}, { type, x, y }, { timeout: 5000 });
const find = (items, type) => items.find(item => item.type === type);

try {
  const A = await device('A');
  const B = await device('B');
  for (const { page } of [A, B]) {
    await throughDoor(page, 'room');
    assert.deepEqual(find(await layout(page), 'desk'), { type: 'desk', x: 3, y: 4 });
  }

  // 1) A에서 책상을 옮겨 저장한다. B는 아직 예전 화면이다(방에 계속 있음).
  await place(A.page, 'desk', 4, 2);
  await placedAt(A.page, 'desk', 4, 2);
  assert.deepEqual(serverRows, [{ item_id: 'furniture_desk', x: 4, y: 2 }]);
  assert.deepEqual(find(await layout(B.page), 'desk'), { type: 'desk', x: 3, y: 4 }, 'B has not refreshed yet');

  // 2) B가 앞마당에 나갔다가 내 방에 다시 들어가면 A의 배치가 보인다.
  await throughDoor(B.page, 'yard');
  await throughDoor(B.page, 'room');
  await placedAt(B.page, 'desk', 4, 2);
  await B.page.screenshot({ path: `${SHOTS}/furniture-sync-B-after-reenter.png` });

  // 3) 탭이 다시 보일 때도 따라잡는다(iPad에서 앱 전환 후 복귀).
  await place(A.page, 'plant', 8, 3);
  await placedAt(A.page, 'plant', 8, 3);
  assert.equal(find(await layout(B.page), 'plant'), undefined);
  await B.page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await placedAt(B.page, 'plant', 8, 3);

  // 4) B가 따라잡기 전에 저장하려 하면, A의 새 배치를 덮어쓰지 않고 서버 배치를 불러온다.
  await place(A.page, 'chair', 7, 1);
  await placedAt(A.page, 'chair', 7, 1);
  const before = payloads.length;
  const serverBefore = structuredClone(serverRows);
  await place(B.page, 'desk', 1, 5);
  await B.page.getByRole('status').filter({ hasText: '다른 기기에서 바뀐 방 배치를 불러왔어요' }).waitFor();
  assert.equal(payloads.length, before, 'stale device did not write');
  assert.deepEqual(serverRows, serverBefore, 'server keeps A\'s newer layout');
  await placedAt(B.page, 'chair', 7, 1);
  assert.deepEqual(find(await layout(B.page), 'desk'), { type: 'desk', x: 4, y: 2 });
  await B.page.screenshot({ path: `${SHOTS}/furniture-sync-B-conflict.png` });
  // 다시 놓으면(이제 최신 배치 기준) 정상 저장되고, A의 의자·화분도 함께 남는다.
  await B.page.touchscreen.tap(...Object.values(roomCellScreen(await debug(B.page), 1, 5)));
  await placedAt(B.page, 'desk', 1, 5);
  assert.equal(payloads.at(-1).device, 'B');
  assert.deepEqual(new Set(serverRows.map(row => `${row.item_id}@${row.x},${row.y}`)),
    new Set(['furniture_desk@1,5', 'furniture_plant@8,3', 'furniture_chair@7,1']));

  // 5) A가 내 방에 다시 들어가면 B의 저장을 본다.
  await throughDoor(A.page, 'yard');
  await throughDoor(A.page, 'room');
  await placedAt(A.page, 'desk', 1, 5);
  await A.page.screenshot({ path: `${SHOTS}/furniture-sync-A-after-reenter.png` });

  assert.deepEqual(errors, []);
  for (const { context } of [A, B]) await context.close();
  console.log(`PASS furniture sync: re-enter catches up, visibility catches up, stale save refused without writing (reads A=${reads.A} B=${reads.B}, writes=${payloads.length})`);
} finally { await browser.close(); }
