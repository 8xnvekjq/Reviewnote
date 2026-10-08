// 테스트 전용 충돌 오버레이: 실제 장면을 1180px 화면에서 검사한다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.PWP_BASE ?? 'http://127.0.0.1:5184';
const phase = process.env.PWP_AUDIT_PHASE ?? 'after';
const shots = '.pixel-world-test.local/walkable';
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/src/services/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: "export { supabase } from '/tests/pixel-world-phaser/fakeRealtime.mjs';" }));
  await page.route('**/game/WorldScene.ts*', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace(/camera\.setZoom\([^;\n]+;/, 'camera.setZoom(2);');
    await route.fulfill({ response, body });
  });
  await page.goto(`${base}/tests/pixel-world-phaser/harness.html?pet=none&pwClock=12:00&walkableOverlay=1`);
  const ready = scene => page.waitForFunction(scene => window.__pixelWorldPhaser?.debug().scene === scene && !window.__pixelWorldPhaser.debug().transitioning, scene, { timeout: 20000 });
  await ready('yard');
  for (const name of ['yard', 'plaza']) {
    if (name === 'plaza') {
      await page.evaluate(() => { const h = window.__pixelWorldPhaser, p = h.debug().exits.gate; h.walkToScreen(p.x, p.y); });
      await ready('plaza');
    }
    await page.evaluate(async name => {
      if (!new URLSearchParams(location.search).has('walkableOverlay')) return;
      const module = await import(`/src/features/pixel-world-phaser/logic/${name}World.ts`);
      const scene = name === 'yard' ? module.yardScene() : module.plazaScene();
      // 전체 지도를 화면 안에 담아 가장자리까지 검사한다.
      const d = window.__pixelWorldPhaser.debug();
      if (d.cssZoom !== 2) throw new Error('감사 화면 배율은 2여야 합니다.');
      const overlay = document.createElement('canvas');
      overlay.id = 'walkable-overlay'; overlay.width = innerWidth; overlay.height = innerHeight;
      overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
      const g = overlay.getContext('2d');
      g.fillStyle = '#ff222261'; g.strokeStyle = '#ff555570'; g.lineWidth = .5;
      for (let y = 0; y < scene.rows; y++) for (let x = 0; x < scene.cols; x++) {
        const sx = (x * 16 - d.camera.x) * d.cssZoom, sy = (y * 16 - d.camera.y) * d.cssZoom;
        if (scene.solid({ x, y })) g.fillRect(sx, sy, 16 * d.cssZoom, 16 * d.cssZoom);
        g.strokeRect(sx, sy, 16 * d.cssZoom, 16 * d.cssZoom);
      }
      document.body.append(overlay);
    }, name);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${shots}/${name}-${phase}-overlay.png` });
    await page.evaluate(() => document.querySelector('#walkable-overlay').remove());
    await page.waitForTimeout(100);
    await page.screenshot({ path: `${shots}/${name}-${phase}-art.png` });
  }
  if (phase === 'after') {
    // 실제 카메라 배율로 가장자리 이동, 안내판 A 대화, 강가 이름 알림을 확인한다.
    await page.unroute('**/game/WorldScene.ts*');
    await page.goto(`${base}/tests/pixel-world-phaser/harness.html?pet=none&pwClock=12:00`);
    await ready('yard');
    await page.evaluate(() => {
      const h = window.__pixelWorldPhaser, d = h.debug();
      h.walkToScreen((24 - d.camera.x) * d.cssZoom, (24 - d.camera.y) * d.cssZoom);
    });
    await page.waitForFunction(() => { const d = window.__pixelWorldPhaser.debug(); return Math.abs(d.x - 24) < 1 && Math.abs(d.y - 24) < 1 && !d.moving; }, null, { timeout: 20000 });
    const edge = await page.evaluate(() => window.__pixelWorldPhaser.debug());
    assert.ok((edge.x - edge.camera.x) * edge.cssZoom >= 0 && (edge.y - edge.camera.y) * edge.cssZoom >= 0);
    await page.screenshot({ path: `${shots}/yard-edge-camera.png` });
    await page.evaluate(() => { const h = window.__pixelWorldPhaser, p = h.debug().targets['river-sign']; h.walkToScreen(p.x, p.y); });
    await page.waitForFunction(() => window.__pixelWorldPhaser.debug().prompt === 'river-sign' && !window.__pixelWorldPhaser.debug().moving, null, { timeout: 20000 });
    await page.locator('.pwp-btn-a').click();
    const dialogue = page.getByRole('dialog', { name: '강가 안내판의 말' });
    await dialogue.waitFor();
    await page.waitForFunction(() => document.querySelector('.pwp-dialogue')?.textContent.includes('물고기 그림자를 눌러 낚시해 보세요!'));
    await page.screenshot({ path: `${shots}/river-sign-dialogue.png` });
    await page.keyboard.press('Escape');
    await page.evaluate(() => { const h = window.__pixelWorldPhaser, p = h.debug().exits['yard→river']; h.walkToScreen(p.x, p.y); });
    await ready('river');
    assert.equal(await page.locator('.pwp-toast').textContent(), '강가');
    await page.screenshot({ path: `${shots}/river-entry-toast.png` });
    console.log('PASS walkable flow: normal camera edge, sign A dialogue, east river exit and 강가 toast');
  }
  assert.deepEqual(errors, []);
  console.log(`PASS walkable ${phase}: 1180px yard/plaza collision overlays and art`);
} finally { await browser.close(); }

