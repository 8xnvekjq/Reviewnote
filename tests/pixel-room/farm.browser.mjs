// 예전 Pixel World 마당(관리자 비교용): 허수아비, 텃밭 자리(읽기 전용 안내 — 칸 돌보기는 새 Pixel World), 농작물 출품.
// Real components + Supabase client; REST responses are intercepted.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const BASE = process.env.PWP_BASE ?? 'http://127.0.0.1:5174';
const browser = await chromium.launch({ headless: true });
const out = 'node_modules/.cache/pixel-farm';
await mkdir(out, { recursive: true });
const hour = 3600000;
const now = Date.parse('2026-10-20T03:00:00Z');
const cells = [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 21, 24, 25, 26, 27, 28, 29];
function server() {
  const state = {
    serverNow: new Date(now).toISOString(), today: '2026-10-20', harvestCount: 1, bestSize: 58, lastHarvestSize: 58, rainToday: false,
    plots: cells.map(index => ({ index, revision: 0, soil: index < 2 ? 'tilled' : 'grass', wateredOn: null, sprinkler: false,
      crop: index === 0 ? { id: 'grow', type: 'tomato', plantedAt: new Date(now - hour).toISOString(), readyAt: new Date(now + 95 * hour).toISOString(), careCount: 0, lastWateredOn: null, reviewGained: 0, harvests: 0 }
        : index === 1 ? { id: 'ripe', type: 'strawberry', plantedAt: new Date(now - 70 * hour).toISOString(), readyAt: new Date(now - 6 * hour).toISOString(), careCount: 1, lastWateredOn: null, reviewGained: 0, harvests: 0 } : null })),
    harvested: [{ id: 'old-crop', crop_type: 'tomato', size_score: 58, harvested_at: new Date(now - 24 * hour).toISOString(), care_count: 2, status: 'stored', submitted_at: null, reward_points: null }],
  };
  const api = { state, actions: 0 };
  api.route = async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1') return route.continue();
    let data;
    if (url.pathname.endsWith('/get_pixel_farm')) data = { ...state, harvested: undefined };
    else if (url.pathname.endsWith('/act_pixel_farm')) { api.actions++; data = { ...state, result: 'changed' }; }
    else if (url.pathname.endsWith('/pixel_farm_crops') && route.request().method() === 'GET') {
      assert.equal(url.searchParams.get('crop_type'), 'eq.tomato', 'collection reads tomatoes only');
      data = state.harvested;
    } else if (url.pathname.endsWith('/submit_farm_crop')) {
      const { p_crop_id } = route.request().postDataJSON();
      const row = state.harvested.find(r => r.id === p_crop_id);
      if (!row || row.status !== 'stored') data = { ok: false, reason: 'already_submitted', message: '이미 출품했거나 아직 보관 중인 작물이 아니에요.' };
      else {
        const reward = 10 + Math.round(row.size_score * 0.4);
        Object.assign(row, { status: 'submitted', submitted_at: new Date(now).toISOString(), reward_points: reward });
        data = { ok: true, cropId: row.id, rewardPoints: reward, submittedAt: row.submitted_at, status: 'submitted' };
      }
    } else return route.abort();
    return route.fulfill({ status: 200, json: data });
  };
  return api;
}
async function setup(context, api) {
  await context.route('**/*', api.route);
  await context.route('**/src/utils/pixelShop.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    export const fetchEquippedAppearance=async()=>({top:null,bottom:null,shoes:null,hair:null,eyes:null});
    export const fetchOwnedPixelItemIds=async()=>['pet_dog'];
    export const fetchPixelCatalog=async()=>[];
    export const fetchPixelFurniturePlacement=async()=>[];
    export const savePixelRoomLayout=async()=>({ok:true});
    export const purchasePixelItem=async()=>({ok:false});
    export const equipPixelItem=async()=>({ok:false});
    export const setPixelBaseAppearance=async()=>({ok:false});
    export const equipPixelRod=async()=>({ok:false});
    export const fetchEquippedRod=async()=>null;
    export const buyPixelBait=async()=>({ok:false});
    export const fetchPixelBaitCharges=async()=>0;
  ` }));
  await context.route('**/src/utils/pixelPet.ts', route => route.fulfill({ contentType: 'application/javascript', body: 'export const fetchActivePet=async()=>"pet_dog"; export const saveActivePet=async()=>"pet_dog";' }));
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  return { page, errors };
}
async function enter(page) {
  await page.goto(BASE + '/tests/pixel-room/yard.html');
  await page.locator('.pr-actor').waitFor();
  await page.locator('.pr-grid button').nth(74).click();
  await page.locator('.pr-yard-board').waitFor();
  await page.waitForFunction(() => !document.querySelector('.pr-transition-active'));
}
try {
  for (const viewport of [{ width: 320, height: 568 }, { width: 1440, height: 1000 }]) {
    const api = server();
    const context = await browser.newContext({ viewport, hasTouch: viewport.width <= 390 });
    const { page, errors } = await setup(context, api);
    await enter(page);
    // 허수아비: 막힌 칸, 탭하면 잠깐 말풍선(판 밖으로 나가지 않는다).
    assert.ok(await page.locator('.pr-grid button').nth(3 * 16 + 11).isDisabled(), 'scarecrow cell is solid, matching yardWalkable');
    await page.locator('.pr-scarecrow').click();
    const boardBox = await page.locator('.pr-yard-board').boundingBox();
    const bubbleBox = await page.locator('.pr-scarecrow-bubble').boundingBox();
    assert.ok(bubbleBox.x >= boardBox.x - 1 && bubbleBox.x + bubbleBox.width <= boardBox.x + boardBox.width + 1, 'scarecrow bubble stays on-board');
    // 텃밭 자리(오른쪽 아래)는 걸어 들어갈 수 없고, 누르면 안내만 — 심기·물주기·수확 요청은 보내지 않는다.
    assert.ok(await page.locator('.pr-grid button').nth(11 * 16 + 10).isDisabled(), 'garden cells are solid in the old yard');
    const garden = page.locator('.pr-farm-garden');
    await page.waitForFunction(() => document.querySelector('.pr-farm-garden')?.getAttribute('data-crops') === '2');
    assert.equal(await garden.getAttribute('data-ripe'), '1');
    await garden.click();
    const notice = page.getByRole('dialog', { name: '텃밭 안내' });
    await notice.getByText('자라는 작물 1개 · 익은 작물 1개', { exact: true }).waitFor();
    await notice.getByText(/새 Pixel World 앞마당에서 괭이·씨앗·물뿌리개로/).waitFor();
    await notice.getByText('지금까지 토마토 수확 1개 · 최고 기록 58 · 최근 58', { exact: true }).waitFor();
    const noticeBox = await notice.boundingBox();
    assert.ok(noticeBox.x >= boardBox.x - 1 && noticeBox.x + noticeBox.width <= boardBox.x + boardBox.width + 1, 'notice stays on-board');
    await page.screenshot({ path: `${out}/${viewport.width}-garden-notice.png` });
    await page.keyboard.press('Escape'); await notice.waitFor({ state: 'detached' });
    assert.equal(api.actions, 0, 'legacy view never acts on the garden');
    // 농작물(수확물) 출품은 그대로: 10 + round(58×0.4) = 33.
    await page.getByRole('button', { name: /^농작물/ }).click();
    const card = page.locator('.pr-crop-card').first(); await card.waitFor();
    assert.match(await card.locator('.pr-crop-submit').innerText(), /\+33P/);
    await card.locator('.pr-crop-submit').click();
    await card.locator('.pr-crop-badge-submitted').waitFor();
    assert.equal(api.state.harvested[0].status, 'submitted');
    assert.deepEqual(errors, []);
    console.log(`PASS ${viewport.width}: scarecrow, read-only garden notice (counts from the garden snapshot, no actions), crop collection submission`);
    await context.close();
  }
} finally { await browser.close(); }
