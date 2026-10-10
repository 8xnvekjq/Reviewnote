import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// 실제 훅의 새로고침과 부모 포인트 갱신을 함께 검증한다.
export async function economyRegression(browser, base) {
  await mkdir('.test-artifacts/pw-bugs-a', { recursive: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  try {
    await context.addInitScript(() => {
      window.fullscreenCalls = 0;
      Element.prototype.requestFullscreen = async () => { window.fullscreenCalls++; };
      Object.defineProperty(document, 'fullscreenEnabled', { get: () => true });
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let balance = 1234, submitted = false, harvested = false, reads = 0, charges = 0;
    const owned = new Set();
    const snapshot = () => ({ serverNow: '2026-10-08T03:00:00Z', today: '2026-10-08', harvestCount: harvested ? 1 : 0,
      plots: [{ index: 0, revision: 1, crop: harvested ? null : { id: 'ripe', plantedAt: '2026-10-01T00:00:00Z', readyAt: '2026-10-05T00:00:00Z', lastWateredOn: null, careCount: 3, reviewGained: 0 } }, { index: 1, revision: 1, crop: null }] });
    await page.route('**/rest/v1/**', async route => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1);
      let body = [];
      if (name === 'pixel_item_ownership') { reads++; await new Promise(r => setTimeout(r, 300)); body = [...owned].map(item_id => ({ item_id })); }
      else if (['pixel_avatar_equipment', 'pixel_rod_equipment'].includes(name)) body = null;
      else if (name === 'pixel_pet_equipment') body = { active_pet: null };
      else if (name === 'get_pixel_farm') body = snapshot();
      else if (name === 'act_pixel_farm') { harvested = true; body = { ...snapshot(), result: 'ok', harvest: { sizeScore: 82 } }; }
      else if (name === 'pixel_farm_crops') body = harvested ? [{ id: 'crop', crop_type: 'tomato', size_score: 82, harvested_at: '2026-10-08T03:00:00Z', care_count: 3, status: submitted ? 'submitted' : 'stored', submitted_at: submitted ? '2026-10-08T03:00:00Z' : null, reward_points: submitted ? 43 : null }] : [];
      else if (name === 'get_weekly_crop_contest') body = { weekStart: '2026-10-05', top: [], mine: { rank: null, sizeScore: null, participantCount: 0 } };
      else if (name === 'submit_farm_crop') { submitted = true; balance += 43; body = { ok: true, cropId: 'crop', rewardPoints: 43, status: 'submitted', submittedAt: '2026-10-08T03:00:00Z' }; }
      else if (name === 'purchase_pixel_item') { const id = route.request().postDataJSON().p_item_id; owned.add(id); balance -= 25; body = { ok: true, itemId: id, newBalance: balance }; }
      else if (name === 'get_pixel_fishing_state') body = { kstDate: '2026-10-08', phase: 'day', weather: 'clear', remaining: 10, album: [], bait: { charges }, rod: { id: null, tier: 0 }, sparkleShadow: null, pigeonHint: null };
      else if (name === 'buy_pixel_bait') { charges += 100; balance -= 50; body = { ok: true, charges, newBalance: balance }; }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(`${base}/tests/pixel-world-phaser/harness.html?saved=1&petWander=0`);
    await page.waitForFunction(() => document.querySelector('.pwp-root')?.dataset.status === 'ready');
    await page.evaluate(() => { window.economyHandle = window.__pixelWorldPhaser; });
    // 위치·장면과 함께 그때까지의 전체화면 요청 수도 기억한다(처음 터치 때 한 번은 원래 동작).
    const debug = () => page.evaluate(() => ({ ...window.__pixelWorldPhaser.debug(), fullscreenCalls: window.fullscreenCalls }));
    const stable = async before => {
      const after = await debug();
      assert.deepEqual([after.x, after.y, after.scene], [before.x, before.y, before.scene]);
      assert.equal(await page.evaluate(() => window.economyHandle === window.__pixelWorldPhaser), true);
      assert.equal(after.fullscreenCalls, before.fullscreenCalls, '포인트가 바뀌는 동작은 전체화면을 새로 요청하지 않는다');
    };
    const walk = async (group, id) => {
      await page.evaluate(({ group, id }) => { const h = window.__pixelWorldPhaser, points = h.debug()[group], key = Object.keys(points).find(k => new RegExp(id).test(k)), p = points[key]; if (!p) throw new Error(JSON.stringify(points)); h.walkToScreen(p.x, p.y); }, { group, id });
    };
    await walk('targets', 'farm:0');
    const bed = page.getByRole('dialog', { name: '1번 토마토 밭', exact: true }); await bed.waitFor();
    let before = await debug();
    await bed.getByRole('button', { name: '토마토 수확하기', exact: true }).click();
    await bed.getByRole('status').filter({ hasText: '82/100' }).waitFor(); await stable(before);
    await page.keyboard.press('Escape'); await walk('targets', 'scarecrow');
    await page.getByRole('button', { name: '수확물 보기', exact: true }).click();
    const collection = page.getByRole('dialog', { name: '수확물 보기', exact: true });
    await collection.getByRole('button', { name: '출품하기 (+43P)', exact: true }).waitFor();
    before = await debug(); const initialReads = reads;
    await page.screenshot({ path: '.test-artifacts/pw-bugs-a/contest-before.png' });
    await collection.getByRole('button', { name: '출품하기 (+43P)', exact: true }).click();
    await collection.getByText(/\uCD9C\uD488\uB428 \u00b7 \+43P/).waitFor();
    await page.waitForTimeout(600); assert.ok(reads > initialReads); await stable(before);
    assert.match(await page.locator('.pwp-points').textContent(), /1,277/);
    await page.screenshot({ path: '.test-artifacts/pw-bugs-a/contest-after.png' });
    await page.keyboard.press('Escape'); await walk('exits', 'gate');
    await page.waitForFunction(() => window.__pixelWorldPhaser.debug().scene === 'plaza' && !window.__pixelWorldPhaser.debug().transitioning);
    await walk('targets', 'shop'); await page.waitForFunction(() => window.__pixelWorldPhaser.debug().prompt === 'shop' && !window.__pixelWorldPhaser.debug().moving);
    await page.locator('.pwp-btn-a').tap();
    const shop = page.getByRole('dialog', { name: '상점', exact: true }); await shop.waitFor(); before = await debug();
    const plant = shop.locator('[data-item="furniture_plant"]');
    await plant.getByRole('button', { name: '구매하기' }).click(); await plant.getByRole('button', { name: '구매 확정' }).click();
    await plant.getByText('보유 중', { exact: true }).waitFor(); await stable(before);
    await page.keyboard.press('Escape'); await walk('exits', 'yard');
    await page.waitForFunction(() => window.__pixelWorldPhaser.debug().scene === 'yard' && !window.__pixelWorldPhaser.debug().transitioning);
    await walk('exits', 'river|east');
    await page.waitForFunction(() => window.__pixelWorldPhaser.debug().scene === 'river' && !window.__pixelWorldPhaser.debug().transitioning);
    await walk('targets', 'turtle');
    await page.getByRole('dialog', { name: '거북이의 물고기 도감', exact: true }).waitFor();
    await page.getByRole('button', { name: '상점', exact: true }).click();
    const tackle = page.getByRole('dialog', { name: '거북이 낚시 상점', exact: true }); await tackle.waitFor(); before = await debug();
    await tackle.getByRole('button', { name: '미끼 구매하기' }).click(); await tackle.getByText('남은 미끼 100회', { exact: true }).waitFor(); await stable(before);
    // 처음 터치에서 한 번만 자동으로 전체화면을 요청하고(태블릿용 원래 동작), 그 뒤 터치는 요청하지 않는다.
    const auto = await page.evaluate(() => window.fullscreenCalls);
    assert.equal(auto, 1, '첫 터치(A 버튼)에서 한 번');
    await page.keyboard.press('Escape'); await page.locator('.pwp-surface').tap({ position: { x: 100, y: 200 } });
    assert.equal(await page.evaluate(() => window.fullscreenCalls), auto);
    await page.getByRole('button', { name: '전체화면', exact: true }).click();
    assert.equal(await page.evaluate(() => window.fullscreenCalls), auto + 1);
    assert.deepEqual(errors, []);
    console.log('PASS real economy hooks: harvest, contest reload, shop, bait, stable scene and position, explicit fullscreen');
  } finally { await context.close(); }
}
