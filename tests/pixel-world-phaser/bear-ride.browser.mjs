import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.PWP_BASE ?? 'http://127.0.0.1:5175';
const shots = '.test-artifacts/bear-ride';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true });
const debug = page => page.evaluate(() => window.__pixelWorldPhaser.debug());
const ready = (page, scene = 'yard') => page.waitForFunction(scene => window.__pixelWorldPhaser?.debug().scene === scene && !window.__pixelWorldPhaser.debug().transitioning && document.querySelector('.pwp-root')?.dataset.status === 'ready', scene, { timeout: 20000 });
const petPanel = async page => {
  await page.evaluate(() => { const h = window.__pixelWorldPhaser, p = h.debug().targets.pet; h.walkToScreen(p.x, p.y); });
  await page.getByRole('dialog', { name: '친구와 놀기' }).waitFor();
};
const exit = async (page, id, scene) => {
  await page.evaluate(id => { const h = window.__pixelWorldPhaser, p = h.debug().exits[id]; if (!p) throw new Error(JSON.stringify(h.debug().exits)); h.walkToScreen(p.x, p.y); }, id);
  await ready(page, scene);
};
try {
  for (const width of [390, 1180]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/tests/pixel-world-phaser/harness.html?pet=pet_bear&petWander=0&fishing=1&pwClock=12:00`);
    await ready(page); await page.waitForTimeout(400);
    const start = await debug(page);
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(250); await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(60);
    const normal = (await debug(page)).x - start.x;
    await page.keyboard.down('ArrowLeft'); await page.waitForTimeout(250); await page.keyboard.up('ArrowLeft');
    await page.waitForTimeout(200);
    await petPanel(page);
    const frozen = await debug(page);
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(100); await page.keyboard.up('ArrowRight');
    assert.equal((await debug(page)).x, frozen.x);
    await page.getByRole('button', { name: '타고 다니기', exact: true }).click();
    assert.equal((await debug(page)).riding, true);
    const mounted = await debug(page);
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(250);
    const walking = await debug(page);
    assert.match(walking.mountAnimation, /bear-ride:0:walk/);
    assert.ok(walking.x - mounted.x > normal * 1.2, `${walking.x - mounted.x} > ${normal} × 1.2`);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.down('Shift'); await page.keyboard.down('ArrowLeft');
    await page.waitForTimeout(180);
    assert.equal((await debug(page)).running, true);
    await page.keyboard.up('ArrowLeft'); await page.keyboard.up('Shift');
    await page.keyboard.down('ArrowDown'); await page.waitForTimeout(450); await page.keyboard.up('ArrowDown');
    for (const [facing, key] of [['Left', 'ArrowLeft'], ['Right', 'ArrowRight'], ['Front', 'ArrowDown'], ['Back', 'ArrowUp']]) {
      await page.keyboard.down(key); await page.waitForTimeout(120); await page.keyboard.up(key); await page.waitForTimeout(80);
      assert.equal((await debug(page)).facing, facing);
      await page.screenshot({ path: `${shots}/${width}-${facing.toLowerCase()}.png` });
    }
    await petPanel(page);
    await page.getByRole('dialog', { name: '친구와 놀기' }).getByRole('button', { name: '내리기', exact: true }).click();
    assert.equal((await debug(page)).riding, false);
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(120); await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(500);
    assert.equal((await debug(page)).mountAnimation, null);
    assert.ok(Math.hypot((await debug(page)).pet.x - (await debug(page)).x, (await debug(page)).pet.y - (await debug(page)).y) < 40);
    await petPanel(page); await page.getByRole('button', { name: '타고 다니기', exact: true }).click();
    const chip = page.getByRole('button', { name: '곰에서 내리기', exact: true });
    await chip.tap(); assert.equal((await debug(page)).riding, false);
    await petPanel(page); await page.getByRole('button', { name: '타고 다니기', exact: true }).click();
    await chip.focus(); await page.keyboard.press('Enter'); assert.equal((await debug(page)).riding, false);
    await petPanel(page); await page.getByRole('button', { name: '타고 다니기', exact: true }).click();
    await exit(page, 'yard→river', 'river'); assert.equal((await debug(page)).riding, true);
    if (width === 1180) {
      await page.waitForFunction(() => !!window.__pixelWorldPhaser.debug().targets['shadow:0']);
      await page.evaluate(() => { const h = window.__pixelWorldPhaser, p = h.debug().targets['shadow:0']; h.walkToScreen(p.x, p.y); });
      await page.waitForFunction(() => document.querySelector('.pwp-root').dataset.fishingPhase !== 'idle', null, { timeout: 20000 });
      assert.equal((await debug(page)).riding, false);
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.querySelector('.pwp-root').dataset.fishingBusy === 'false');
      await petPanel(page); await page.getByRole('button', { name: '타고 다니기', exact: true }).click();
    }
    await exit(page, 'river→yard', 'yard'); assert.equal((await debug(page)).riding, true);
    await exit(page, 'gate', 'plaza'); assert.equal((await debug(page)).riding, true);
    await exit(page, 'yard', 'yard'); assert.equal((await debug(page)).riding, true);
    await exit(page, 'door', 'room'); assert.equal((await debug(page)).riding, false);
    await page.reload(); await ready(page); assert.equal((await debug(page)).riding, false);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS bear ride ${width}`);
  }
  const page = await browser.newPage();
  await page.goto(`${base}/tests/pixel-world-phaser/harness.html?pet=pet_dog&petWander=0`);
  await ready(page); await page.waitForTimeout(500);
  let dog = await debug(page);
  if (Math.hypot(dog.pet.x - dog.x, dog.pet.y - dog.y) < 5) {
    await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(1000); dog = await debug(page);
  }
  const dx = dog.pet.x - dog.x, dy = dog.pet.y - dog.y;
  const toward = Math.abs(dx) > 3 ? dx > 0 ? 'ArrowRight' : 'ArrowLeft' : dy > 0 ? 'ArrowDown' : 'ArrowUp';
  await page.keyboard.down(toward); await page.waitForTimeout(20); await page.keyboard.up(toward);
  await page.waitForFunction(() => window.__pixelWorldPhaser.debug().prompt === 'pet');
  await page.locator('.pwp-btn-a').click();
  await page.getByRole('dialog', { name: '친구와 놀기' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '타고 다니기' }).count(), 0);
  await page.close();
  console.log('PASS dog has no mount control');
} finally { await browser.close(); }
