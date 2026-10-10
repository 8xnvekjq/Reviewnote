import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.PWP_BASE ?? 'http://127.0.0.1:5176';
const shots = '.test-artifacts/pw-bugs-b';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const ready = (page, scene) => page.waitForFunction(scene => {
  const d = window.__pixelWorldPhaser?.debug();
  return d?.scene === scene && !d.transitioning && document.querySelector('.pwp-root')?.dataset.status === 'ready';
}, scene, { timeout: 20000 });
const exit = async (page, pattern, scene) => {
  await page.bringToFront();
  await page.evaluate(pattern => {
    const h = window.__pixelWorldPhaser, exits = h.debug().exits;
    const key = Object.keys(exits).find(k => new RegExp(pattern).test(k));
    h.walkToScreen(exits[key].x, exits[key].y);
  }, pattern);
  await ready(page, scene);
};
const debug = page => page.evaluate(() => window.__pixelWorldPhaser.debug());
try {
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const errors = [];
  await context.route('**/src/services/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: "export { supabase } from '/tests/pixel-world-phaser/fakeRealtime.mjs';" }));
  const a = await context.newPage(), b = await context.newPage();
  for (const page of [a, b]) page.on('pageerror', e => errors.push(e.message));
  for (const scene of ['river', 'plaza']) {
    await b.goto(`${base}/tests/pixel-world-phaser/harness.html?pet=none&top=blouse_rose&fishing=1&pwClock=12:00`);
    await ready(b, 'yard');
    await exit(b, scene === 'plaza' ? '^gate$' : 'river', scene);
    for (const pet of ['pet_dog', 'pet_duck', 'pet_pigeon', 'pet_bear']) {
      await a.bringToFront();
      await a.goto(`${base}/tests/pixel-world-phaser/harness.html?pet=${pet}&fishing=1&pwClock=12:00`);
      await ready(a, 'yard');
      await exit(a, scene === 'plaza' ? '^gate$' : 'river', scene);
      await b.bringToFront();
      await b.waitForFunction(() => window.__pixelWorldPhaser.debug().classmates?.some(p => p.rendered && p.pet));
      for (const key of ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown']) {
        await a.bringToFront();
        await a.keyboard.down(key);
        let moved = false;
        for (let i = 0; i < 6; i++) {
          await a.waitForTimeout(150);
          await b.bringToFront();
          await b.waitForTimeout(40);
          const local = await debug(a), remote = (await debug(b)).classmates[0];
          moved ||= local.moving;
          assert.ok(Math.hypot(remote.petPosition.x - (remote.x + (scene === 'plaza' ? 5.5 : .5)) * 16,
            remote.petPosition.y - (remote.y + (scene === 'plaza' ? 5.5 : .5)) * 16) < 70, `${scene}/${pet}: peer trails owner`);
          assert.ok(Math.hypot(local.pet.x - local.x, local.pet.y - local.y) < 70, `${scene}/${pet}: local trails owner`);
          await a.bringToFront();
        }
        await a.keyboard.up(key);
        assert.ok(moved, `${scene}/${pet}: owner walked ${key}`);
      }
      await a.waitForTimeout(1800);
      await b.bringToFront();
      await b.evaluate(scene => {
        const h = window.__pixelWorldPhaser, d = h.debug(), p = d.classmates[0];
        const margin = scene === 'plaza' ? 5.5 : .5;
        h.walkToScreen(((p.x + margin) * 16 - d.camera.x) * d.cssZoom, ((p.y + margin) * 16 - d.camera.y) * d.cssZoom);
      }, scene);
      await b.waitForFunction(() => !window.__pixelWorldPhaser.debug().moving && window.__pixelWorldPhaser.debug().pathLength === 0);
      const first = (await debug(b)).classmates[0].petPosition;
      await a.waitForTimeout(2500);
      const last = (await debug(b)).classmates[0].petPosition;
      assert.ok(Math.hypot(last.x - first.x, last.y - first.y) < 1, 'no idle wandering');
      await b.screenshot({ path: `${shots}/${scene}-${pet}-follow.png` });
      if (pet === 'pet_bear') {
        await a.bringToFront();
        await a.evaluate(() => window.__pixelWorldPhaser.toggleRide());
        await b.bringToFront();
        await b.waitForFunction(() => {
          const p = window.__pixelWorldPhaser.debug().classmates[0];
          return p.riding && p.mountAnimation?.startsWith('bear-ride:') && !p.follower && p.avatarPosition.cropped;
        });
        assert.equal(await a.evaluate(() => window.plazaTransport.last().riding), true, 'stationary mount updates presence');
        await a.bringToFront();
        await a.keyboard.down('ArrowRight');
        await a.waitForTimeout(200);
        await b.bringToFront();
        await b.waitForFunction(() => window.__pixelWorldPhaser.debug().classmates[0].mountAnimation?.endsWith(':walk'));
        const mounted = (await debug(b)).classmates[0];
        assert.ok(Math.abs(mounted.avatarPosition.depth - ((mounted.y + (scene === 'plaza' ? 5.5 : .5)) * 16 + .1)) < 1e-6);
        await b.screenshot({ path: `${shots}/${scene}-bear-mounted.png` });
        await a.keyboard.up('ArrowRight');
        await a.evaluate(() => window.__pixelWorldPhaser.dismount());
        await b.waitForFunction(() => {
          const p = window.__pixelWorldPhaser.debug().classmates[0];
          return !p.riding && !p.mountAnimation && p.follower && !p.avatarPosition.cropped;
        });
        assert.equal(await a.evaluate(() => window.plazaTransport.last().riding), false, 'stationary dismount updates presence');
        await a.waitForTimeout(800);
        await b.screenshot({ path: `${shots}/${scene}-bear-dismounted.png` });
        await a.evaluate(topic => {
          const bus = new BroadcastChannel('phaser-plaza-test');
          bus.postMessage({ topic, kind: 'track', player: { sessionId: 'legacy', presence_ref: 'legacy-ref', x: 3, y: 4,
            direction: 'Right', moving: false, seq: 1, updatedAt: Date.now(), appearance: { top: null, bottom: null, hair: null, shoes: null, eyes: null, skin: null } } });
          bus.close();
        }, scene === 'plaza' ? 'pixel-world-plaza' : 'pixel-world-river');
        await b.waitForFunction(() => window.__pixelWorldPhaser.debug().classmates.some(p => p.id === 'legacy' && p.rendered && !p.riding && !p.pet));
        await a.evaluate(() => window.__pixelWorldPhaser.toggleRide());
        await exit(a, scene === 'plaza' ? '^yard$' : 'yard', 'yard');
        await b.waitForFunction(() => window.__pixelWorldPhaser.debug().classmates.every(p => p.id === 'legacy'));
        assert.deepEqual(await a.evaluate(() => window.plazaTransport.audit().topics), [], 'scene exit clears channel presence');
      } else {
        await exit(a, scene === 'plaza' ? '^yard$' : 'yard', 'yard');
        await b.bringToFront();
        await b.waitForFunction(() => window.__pixelWorldPhaser.debug().classmates.length === 0);
      }
      console.log(`PASS ${scene}/${pet}: local and peer follow, idle stays near owner${pet === 'pet_bear' ? ', mount/dismount, legacy and scene cleanup' : ''}`);
    }
  }
  assert.deepEqual(errors, []);
  await context.close();
} finally { await browser.close(); }
