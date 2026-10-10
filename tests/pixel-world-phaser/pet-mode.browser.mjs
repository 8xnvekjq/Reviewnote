// 장면별 산책·비행·따라오기와 곰 승하차를 실제 게임에서 검증한다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.env.PWP_BASE ?? 'http://127.0.0.1:5175';
const browser = await chromium.launch({ headless: true });
const debug = page => page.evaluate(() => window.__pixelWorldPhaser.debug());
const ready = (page, scene) => page.waitForFunction(scene => {
  const d = window.__pixelWorldPhaser?.debug();
  return d?.scene === scene && !d.transitioning && document.querySelector('.pwp-root')?.dataset.status === 'ready';
}, scene, { timeout: 20000 });
const exit = async (page, id, scene) => {
  await page.evaluate(id => {
    const h = window.__pixelWorldPhaser, p = h.debug().exits[id];
    h.walkToScreen(p.x, p.y);
  }, id);
  await ready(page, scene);
};
const roam = async page => {
  await page.waitForFunction(() => !window.__pixelWorldPhaser.debug().moving);
  const start = await debug(page);
  await page.waitForFunction(p => {
    const d = window.__pixelWorldPhaser.debug();
    return Math.hypot(d.pet.x - p.x, d.pet.y - p.y) > 5;
  }, start.pet, { timeout: 25000 });
  const end = await debug(page);
  assert.equal(end.x, start.x);
  assert.equal(end.y, start.y);
};
const follow = async page => {
  const start = await debug(page);
  assert.ok(Math.hypot(start.pet.x - start.x, start.pet.y - start.y) < 45, '친구가 장면에 함께 들어온다');
  await page.keyboard.down('ArrowRight');
  try {
    let walked = false;
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(100);
      const d = await debug(page);
      walked ||= Math.abs(d.x - start.x) > 10;
      assert.ok(Math.hypot(d.pet.x - d.x, d.pet.y - d.y) < 70, '걷는 주인 곁에서 따라온다');
    }
    assert.ok(walked);
  } finally { await page.keyboard.up('ArrowRight'); }
};
try {
  for (const pet of ['pet_dog', 'pet_pigeon']) {
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/services/supabase.ts', route => route.fulfill({
      contentType: 'application/javascript', body: "export { supabase } from '/tests/pixel-world-phaser/fakeRealtime.mjs';",
    }));
    // 재현 가능한 난수열로 실제 산책·비행 목적지 선택을 실행한다.
    await page.addInitScript(() => {
      let seed = 12345;
      Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
    });
    await page.goto(`${base}/tests/pixel-world-phaser/harness.html?pet=${pet}&fishing=1`);
    await ready(page, 'yard');
    if (pet === 'pet_pigeon') {
      // 출발부터 관찰하므로 첫 비행을 놓치지 않는다.
      const start = await debug(page);
      await page.waitForFunction(() => window.__pixelWorldPhaser.debug().petFrame >= 16, null, { timeout: 25000, polling: 50 });
      assert.equal((await debug(page)).x, start.x);
      assert.equal((await debug(page)).y, start.y);
    }
    await roam(page);
    await exit(page, 'door', 'room');
    await roam(page);
    await exit(page, 'door', 'yard');
    await exit(page, 'yard→river', 'river');
    await follow(page);
    await exit(page, 'river→yard', 'yard');
    await roam(page);
    await exit(page, 'gate', 'plaza');
    await follow(page);
    await exit(page, 'yard', 'yard');
    await roam(page);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${pet}: yard/room roaming, river/plaza following, round trips`);
  }
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  await page.goto(`${base}/tests/pixel-world-phaser/harness.html?pet=pet_bear`);
  await ready(page, 'yard');
  await page.evaluate(() => window.__pixelWorldPhaser.toggleRide());
  assert.equal((await debug(page)).riding, true);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowRight');
  const riding = await debug(page);
  assert.ok(Math.hypot(riding.pet.x - riding.x, riding.pet.y - riding.y) < 2);
  await page.waitForTimeout(2000);
  assert.deepEqual((await debug(page)).pet, riding.pet);
  await page.evaluate(() => window.__pixelWorldPhaser.dismount());
  assert.equal((await debug(page)).riding, false);
  await roam(page);
  await page.close();
  console.log('PASS bear: mount stays with owner; dismount resumes roaming');
} finally { await browser.close(); }
