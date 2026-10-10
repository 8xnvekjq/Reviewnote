import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { userAnimalFace } from '../../src/utils/animalFace.ts';

const BASE = process.env.PWP_BASE ?? 'http://127.0.0.1:5176';
const SHOTS = '.test-artifacts/pw-avatar';
await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const ready = (page, scene) => page.waitForFunction(scene => {
  const d = window.__pixelWorldPhaser?.debug(); return d?.scene === scene && !d.transitioning;
}, scene, { timeout: 30000 });
const exit = async (page, pattern, scene) => {
  await page.bringToFront();
  await page.evaluate(pattern => {
    const h = window.__pixelWorldPhaser, exits = h.debug().exits;
    const name = Object.keys(exits).find(k => new RegExp(pattern).test(k));
    if (!name) throw new Error(JSON.stringify(exits));
    h.walkToScreen(exits[name].x, exits[name].y);
  }, pattern);
  await ready(page, scene);
};
const fake = context => context.route('**/src/services/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: "export { supabase } from '/tests/pixel-world-phaser/fakeRealtime.mjs';" }));
try {
  for (const width of [390, 1180]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 820 } });
    await fake(context);
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '/tests/pixel-world-phaser/harness.html?user=7f91f87f-17a0-4d6f-8715-263663d00dc0&face=' + encodeURIComponent('🦦') + '&pet=none');
    await ready(page, 'yard');
    const tag = await page.evaluate(() => window.__pixelWorldPhaser.debug());
    assert.equal(tag.animalTag.face, '🦦'); assert.equal(tag.animalTag.x, Math.round(tag.x));
    assert.equal(tag.animalTag.y, Math.round(tag.y) + 2);
    await page.screenshot({ path: `${SHOTS}/yard-${width}.png` });
    await page.getByRole('button', { name: '옷장', exact: true }).click();
    const wardrobe = page.getByRole('dialog', { name: '옷장', exact: true });
    await wardrobe.locator('[data-item="hair_bald"]').getByRole('button', { name: '장착하기', exact: true }).click();
    await page.waitForFunction(() => window.__pixelWorldPhaser.debug().avatarKey.includes('bald'));
    await wardrobe.getByRole('button', { name: '기본 외형', exact: true }).click();
    await wardrobe.getByRole('button', { name: '진한 갈색', exact: true }).click();
    await page.waitForFunction(() => window.__pixelWorldPhaser.debug().avatarKey.includes('deep'));
    await page.waitForFunction(() => document.querySelector('.pwp-preview canvas')?.dataset.ready === 'true');
    await page.screenshot({ path: `${SHOTS}/wardrobe-${width}.png` });
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `${SHOTS}/bald-deep-${width}.png` });
    if (width === 1180) {
      const poses = await page.evaluate(async () => {
        const { composeAvatar } = await import('/src/features/pixel-world-phaser/game/avatarTexture.ts');
        const canvas = await composeAvatar({ top: null, bottom: null, shoes: null, hair: 'bald', skin: 'deep', eyes: 'sky' }).canvas;
        const out = document.createElement('canvas'); out.width = canvas.width * 4; out.height = canvas.height * 4;
        const ctx = out.getContext('2d'); ctx.imageSmoothingEnabled = false;
        ctx.drawImage(canvas, 0, 0, out.width, out.height); return out.toDataURL('image/png').split(',')[1];
      });
      await writeFile(`${SHOTS}/avatar-poses.png`, Buffer.from(poses, 'base64'));
    }
    await page.getByRole('button', { name: '옷장', exact: true }).click();
    await wardrobe.getByRole('button', { name: '펫', exact: true }).click();
    await wardrobe.locator('[data-item="pet_bear"]').getByRole('button', { name: '함께 살기', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__pixelWorldPhaser.debug().petId === 'pet_bear');
    await page.evaluate(() => window.__pixelWorldPhaser.toggleRide());
    await page.waitForFunction(() => {
      const d = window.__pixelWorldPhaser.debug(); return d.riding && d.animalTag.y === Math.round(d.y) + 4;
    });
    const riding = await page.evaluate(() => window.__pixelWorldPhaser.debug());
    assert.equal(riding.animalTag.y, Math.round(riding.y) + 4);
    await page.screenshot({ path: `${SHOTS}/bear-tag-${width}.png` });
    assert.deepEqual(errors, []);
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  await fake(context);
  const a = await context.newPage(), b = await context.newPage();
  // 구형 클라이언트가 face를 보내지 않는 경우도 실제 전송 경로에서 검사한다.
  await b.route('**/tests/pixel-world-phaser/fakeRealtime.mjs', async route => {
    const response = await route.fetch();
    const source = await response.text();
    const body = source.replace('async track(p) {', 'async track(p) { p = { ...p }; delete p.face;')
      .replace('async send({ event, payload }) {', 'async send({ event, payload }) { if (event === "move") { payload = { ...payload }; delete payload.face; }');
    assert.notEqual(body, source); await route.fulfill({ response, body });
  });
  await a.goto(BASE + '/tests/pixel-world-phaser/harness.html?user=f7df1fa8-8e97-49fc-a95b-b42e5fa28255&face=' + encodeURIComponent('🦒') + '&hair=bald&skin=deep&pet=none');
  await ready(a, 'yard');
  await b.goto(BASE + '/tests/pixel-world-phaser/harness.html?pet=none'); await ready(b, 'yard');
  for (const scene of ['plaza', 'river']) {
    for (const page of [a, b]) {
      if (scene === 'river') await exit(page, 'yard', 'yard');
      await exit(page, scene === 'plaza' ? 'gate' : 'river|east', scene);
    }
    await b.bringToFront();
    await b.waitForFunction(() => window.__pixelWorldPhaser.debug().classmates?.some(p => p.rendered && p.animalTag?.face === '🦒'));
    const before = await b.evaluate(() => window.__pixelWorldPhaser.debug().classmates.find(p => p.animalTag?.face === '🦒').animalTag.x);
    await a.bringToFront();
    await a.keyboard.down('ArrowRight'); await a.waitForTimeout(400); await a.keyboard.up('ArrowRight');
    await b.bringToFront();
    await b.waitForFunction(x => window.__pixelWorldPhaser.debug().classmates.some(p => p.animalTag?.face === '🦒' && p.animalTag.x > x), before);
    const payload = await b.evaluate(() => window.plazaTransport.last());
    assert.equal(payload.face, undefined);
    const expected = userAnimalFace(payload.sessionId);
    await a.bringToFront();
    await a.waitForFunction(face => window.__pixelWorldPhaser.debug().classmates?.some(p => p.rendered && p.animalTag?.face === face), expected);
    await b.screenshot({ path: `${SHOTS}/${scene}-override.png` });
    await a.screenshot({ path: `${SHOTS}/${scene}-legacy.png` });
  }
  await context.close();
  console.log('PASS avatar tags: yard, bear, wardrobe 390/1180, plaza/river override and legacy presence');
} finally { await browser.close(); }
