// 새 Pixel World(Phaser 베타) 앞마당 하네스 브라우저 테스트.
// 실행: Vite를 127.0.0.1:5174에서 띄운 뒤 `node tests/pixel-world-phaser/yard.browser.mjs`
// (다른 주소면 PWP_BASE=http://127.0.0.1:5199 처럼 지정). 스크린샷은 node_modules/.cache/pixel-world-phaser/.
// 멀티터치(조이스틱 + B 동시)는 CDP Input.dispatchTouchEvent로 실제 터치 이벤트를 만든다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.PWP_BASE ?? 'http://127.0.0.1:5174';
const SHOTS = '.pixel-world-test.local';
await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch({ headless: true });
const debug = page => page.evaluate(() => window.__pixelWorldPhaser.debug());
const until = (page, fn, arg, timeout = 6000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });

const VIEWPORTS = [
  { name: 'phone-portrait', viewport: { width: 390, height: 844 }, touch: true, mobile: true, dpr: 2.625, query: 'pet=pet_dog&top=blouse_rose&bottom=bootcut_blue&hair=long_black' },
  { name: 'tablet-landscape', viewport: { width: 1180, height: 820 }, touch: true, mobile: false, query: 'pet=pet_duck&skin=umber&eyes=sky&hair=buzz_blonde' },
  { name: 'tablet-portrait', viewport: { width: 800, height: 1280 }, touch: true, mobile: false, query: 'pet=pet_bear' },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, touch: false, mobile: false, query: 'pet=pet_pigeon' },
];

try {
  for (const { name, viewport, touch, mobile, query, dpr = 1 } of VIEWPORTS) {
    const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: mobile, deviceScaleFactor: dpr });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${BASE}/tests/pixel-world-phaser/harness.html?petWander=0&${query}`);
    await until(page, () => window.__pixelWorldPhaser && document.querySelector('.pwp-root')?.dataset.status === 'ready', null, 20000);
    await page.waitForTimeout(300);

    // ── 화면 채우기: 캔버스 = 뷰포트, 페이지 스크롤 없음, HUD/버튼이 프레임 안 ──
    const frame = await page.evaluate(() => {
      const canvas = document.querySelector('.pwp-stage canvas').getBoundingClientRect();
      const rect = el => { const r = document.querySelector(el).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
      return { canvas: { w: canvas.width, h: canvas.height, x: canvas.x, y: canvas.y }, scroll: (window.scrollTo(0, 200), window.scrollY), overflow: getComputedStyle(document.documentElement).overflow + '/' + getComputedStyle(document.body).overflow,
        a: rect('.pwp-btn-a'), b: rect('.pwp-btn-b'), exit: rect('.pwp-exit'), points: document.querySelector('.pwp-points').textContent, open: document.documentElement.classList.contains('pwp-open') };
    });
    assert.equal(frame.canvas.w, viewport.width); assert.equal(frame.canvas.h, viewport.height);
    assert.equal(frame.canvas.x, 0); assert.equal(frame.canvas.y, 0);
    assert.equal(frame.scroll, 0, 'page cannot scroll under the game');
    assert.equal(frame.overflow, 'hidden/hidden');
    assert.ok(frame.open, 'app scroll is locked while the game is open');
    assert.match(frame.points, /1,234/);
    for (const btn of [frame.a, frame.b]) {
      assert.ok(btn.w >= 56 && btn.h >= 56, `${name}: button ≥56px`);
      assert.ok(btn.x >= viewport.width / 2 && btn.x + btn.w <= viewport.width && btn.y + btn.h <= viewport.height, `${name}: button inside the right half of the frame`);
    }
    const start = await debug(page);
    assert.equal(start.moving, false);
    assert.equal(start.scene, 'yard');
    assert.ok(Math.abs(start.ratio - dpr) < 0.01);
    assert.ok(Math.abs(start.cssZoom * start.ratio - start.zoom) < 0.01);
    const pixels = await page.locator('canvas').evaluate(c => [c.width, c.height]);
    assert.deepEqual(pixels, [Math.round(viewport.width * dpr), Math.round(viewport.height * dpr)]);
    assert.ok(Number.isInteger(start.zoom) && start.zoom >= 2);
    await page.screenshot({ path: `${SHOTS}/${name}-start.png` });

    if (touch) {
      const cdp = await context.newCDPSession(page);
      const touchEvent = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
      const stick = { x: 90, y: viewport.height - 220 };
      const a = { x: frame.a.x + frame.a.w / 2, y: frame.a.y + frame.a.h / 2 };
      const b = { x: frame.b.x + frame.b.w / 2, y: frame.b.y + frame.b.h / 2 };

      // ── 조이스틱: 누른 자리에 링, 오른쪽으로 밀면 오른쪽으로 부드럽게(타일 단위 아님) 걷는다 ──
      await touchEvent('touchStart', [{ x: stick.x, y: stick.y, id: 1 }]);
      await until(page, () => getComputedStyle(document.querySelector('.pwp-stick')).opacity === '1'); // 누른 자리에 희미한 링
      for (let i = 1; i <= 6; i++) await touchEvent('touchMove', [{ x: stick.x + i * 10, y: stick.y, id: 1 }]);
      await until(page, x0 => window.__pixelWorldPhaser.debug().x > x0 + 6, start.x);
      const walking = await debug(page);
      assert.equal(walking.facing, 'Right'); assert.equal(walking.moving, true); assert.equal(walking.running, false);
      assert.ok(walking.x % 16 !== 0 || walking.y % 16 !== 8, 'free (non-tile) position');

      // ── 멀티터치: 조이스틱을 잡은 채 B를 누르면 달린다 ──
      const t0 = Date.now(), x0 = (await debug(page)).x;
      await page.waitForTimeout(400);
      const walkSpeed = ((await debug(page)).x - x0) / ((Date.now() - t0) / 1000);
      await touchEvent('touchMove', [{ x: stick.x - 60, y: stick.y, id: 1 }]); // 왼쪽으로 돌아서(벽에 막히지 않게)
      await touchEvent('touchStart', [{ x: stick.x - 60, y: stick.y, id: 1 }, { x: b.x, y: b.y, id: 2 }]); // 두 번째 손가락 = B
      await until(page, () => window.__pixelWorldPhaser.debug().running === true);
      const r0 = await debug(page), rt0 = Date.now();
      await page.waitForTimeout(300);
      const runSpeed = Math.abs((await debug(page)).x - r0.x) / ((Date.now() - rt0) / 1000);
      assert.equal((await debug(page)).facing, 'Left');
      assert.ok(runSpeed > walkSpeed * 1.2, `running (${runSpeed.toFixed(0)}) faster than walking (${walkSpeed.toFixed(0)})`);
      await page.screenshot({ path: `${SHOTS}/${name}-running.png` });
      // B만 떼면(남은 손가락 = 조이스틱) 다시 걷기, 손가락을 모두 떼면 멈춘다.
      await touchEvent('touchMove', [{ x: stick.x - 60, y: stick.y, id: 1 }]);
      await until(page, () => window.__pixelWorldPhaser.debug().running === false);
      await touchEvent('touchEnd', []);
      await until(page, () => window.__pixelWorldPhaser.debug().moving === false);
      await until(page, () => getComputedStyle(document.querySelector('.pwp-stick')).opacity === '0');

      // ── 터치 취소(전화/제스처 등) → 멈춘 상태 유지(계속 걷는 버그 없음) ──
      await touchEvent('touchStart', [{ x: stick.x, y: stick.y, id: 3 }]);
      await touchEvent('touchMove', [{ x: stick.x, y: stick.y + 50, id: 3 }]);
      await until(page, () => window.__pixelWorldPhaser.debug().moving === true);
      await touchEvent('touchCancel', []);
      await until(page, () => window.__pixelWorldPhaser.debug().moving === false);
      const afterCancel = await debug(page);
      await page.waitForTimeout(250);
      assert.deepEqual([(await debug(page)).x, (await debug(page)).y], [afterCancel.x, afterCancel.y], 'no stuck movement after pointercancel');

      // ── 탭해서 걷기: 허수아비를 콕 → 옆까지 걸어가 바라보고 대화가 열린다 ──
      // 허수아비가 화면 밖이면 먼저 보이는 쪽(오른쪽 위)을 콕 찍어 다가간다 — 이것도 탭해서 걷기.
      const visible = p => p.x > 20 && p.x < viewport.width - 20 && p.y > 80 && p.y < viewport.height - 160;
      if (!visible((await debug(page)).targets.scarecrow)) {
        await page.evaluate(() => {
          const h = window.__pixelWorldPhaser, d = h.debug();
          h.walkToScreen(d.targets.scarecrow.x - 16 * d.zoom / d.ratio, d.targets.scarecrow.y);
        });
        await until(page, () => window.__pixelWorldPhaser.debug().pathLength === 0 && !window.__pixelWorldPhaser.debug().moving, null, 10000);
        await page.waitForTimeout(500); // 따라오는 카메라도 목적지에서 안정된 뒤 탭한다.
      }
      const target = (await debug(page)).targets.scarecrow;
      assert.ok(visible(target), `scarecrow reachable on screen: ${JSON.stringify(await debug(page))}`);
      await touchEvent('touchStart', [{ x: target.x, y: target.y, id: 4 }]);
      await touchEvent('touchEnd', []);
      await page.getByRole('button', { name: '이야기하기', exact: true }).click();
      await page.locator('.pwp-dialogue').waitFor({ timeout: 10000 });
      assert.equal((await debug(page)).prompt, 'scarecrow');
      // A: 찍히는 중이면 전부 보이기 → 다음 줄/닫기.
      const tapA = async () => { await touchEvent('touchStart', [{ x: a.x, y: a.y, id: 5 }]); await touchEvent('touchEnd', []); };
      for (let i = 0; i < 6 && await page.locator('.pwp-dialogue').count(); i++) {
        const full = await page.locator('.pwp-dialogue p').getAttribute('data-full');
        assert.ok(full && full.length > 3);
        await tapA();
        await page.waitForTimeout(80);
      }
      assert.equal(await page.locator('.pwp-dialogue').count(), 0, 'A advances and finally closes the dialogue');

      // ── "!" 표시 + A로 다시 말 걸기 (조이스틱과 A 동시 입력도 허용) ──
      assert.match(await page.locator('.pwp-btn-a').getAttribute('aria-label'), /말 걸기/);
      await tapA();
      await page.getByRole('button', { name: '이야기하기', exact: true }).click();
      await page.locator('.pwp-dialogue').waitFor();
      const line = await page.locator('.pwp-dialogue p').getAttribute('data-full');
      await page.screenshot({ path: `${SHOTS}/${name}-dialogue.png` });
      // 대화 중에는 조이스틱으로 움직이지 않는다. B는 대화를 닫는다.
      const frozen = await debug(page);
      await touchEvent('touchStart', [{ x: stick.x, y: stick.y, id: 6 }]);
      await touchEvent('touchMove', [{ x: stick.x, y: stick.y + 60, id: 6 }]);
      await page.waitForTimeout(200);
      assert.equal((await debug(page)).y, frozen.y, 'frozen during dialogue');
      await touchEvent('touchEnd', []);
      await touchEvent('touchStart', [{ x: b.x, y: b.y, id: 7 }]); await touchEvent('touchEnd', []);
      assert.equal(await page.locator('.pwp-dialogue').count(), 0, 'B closes the dialogue');
      console.log(`  ${name}: walk ${walkSpeed.toFixed(0)}px/s, run ${runSpeed.toFixed(0)}px/s, scarecrow said "${line}"`);
    } else {
      // ── 데스크톱: 키보드(WASD/화살표, Shift 달리기, Space = A) ──
      await page.keyboard.down('d');
      await until(page, x0 => window.__pixelWorldPhaser.debug().x > x0 + 6, start.x);
      await page.keyboard.up('d');
      await until(page, () => window.__pixelWorldPhaser.debug().moving === false);
      await page.keyboard.down('Shift'); await page.keyboard.down('ArrowLeft');
      await until(page, () => window.__pixelWorldPhaser.debug().running === true);
      await page.keyboard.up('ArrowLeft'); await page.keyboard.up('Shift');
      // 마우스 클릭으로 허수아비까지 걸어가기 → 도착하면 대화.
      const target = (await debug(page)).targets.scarecrow;
      await page.mouse.click(target.x, target.y);
      await page.getByRole('button', { name: '이야기하기', exact: true }).click();
      await page.locator('.pwp-dialogue').waitFor({ timeout: 10000 });
      for (let i = 0; i < 6 && await page.locator('.pwp-dialogue').count(); i++) { await page.keyboard.press('Space'); await page.waitForTimeout(80); }
      assert.equal(await page.locator('.pwp-dialogue').count(), 0);
      await page.keyboard.press('Space');
      await page.getByRole('button', { name: '이야기하기', exact: true }).click();
      await page.locator('.pwp-dialogue').waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.pwp-dialogue').count(), 0);
    }

    // ── 펫이 따라온다 ──
    const end = await debug(page);
    assert.ok(end.pet, 'active pet is in the scene');
    assert.ok(Math.hypot(end.pet.x - end.x, end.pet.y - end.y) < 64, 'pet follows the player');
    assert.equal(end.renderer, 'webgl');

    // ── 회전/리사이즈: 레이아웃이 따라온다 ──
    if (name === 'phone-portrait') {
      await page.setViewportSize({ width: 844, height: 390 });
      await until(page, () => document.querySelector('.pwp-root').dataset.orientation === 'landscape');
      const rotated = await page.evaluate(() => { const c = document.querySelector('.pwp-stage canvas').getBoundingClientRect(); const a = document.querySelector('.pwp-btn-a').getBoundingClientRect(); return { w: c.width, h: c.height, ax: a.right, ay: a.bottom }; });
      assert.deepEqual([rotated.w, rotated.h], [844, 390]);
      assert.ok(rotated.ax <= 844 && rotated.ay <= 390);
      await page.screenshot({ path: `${SHOTS}/${name}-rotated.png` });
    }

    // ── 나가기: 게임 파괴, 앱 스크롤/inert 복원 ──
    await page.locator('.pwp-exit').click();
    await page.getByTestId('exited').waitFor();
    const after = await page.evaluate(() => ({ canvas: document.querySelectorAll('canvas').length, open: document.documentElement.classList.contains('pwp-open'), inert: document.getElementById('root').inert, handle: !!window.__pixelWorldPhaser }));
    assert.deepEqual(after, { canvas: 0, open: false, inert: false, handle: false });
    // 다시 들어가도 정상 부팅(리스너/텍스처 누수 없이).
    await page.getByRole('button', { name: '다시 들어가기' }).click();
    await until(page, () => window.__pixelWorldPhaser && document.querySelector('.pwp-root')?.dataset.status === 'ready', null, 20000);
    assert.equal(await page.locator('canvas').count(), 1);

    assert.deepEqual(errors, []);
    console.log(`PASS ${name}`);
    await context.close();
  }
} finally { await browser.close(); }
