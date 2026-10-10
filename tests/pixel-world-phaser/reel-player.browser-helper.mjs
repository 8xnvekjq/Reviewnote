import assert from 'node:assert/strict';

// DOM 상태를 읽고 실제 조이스틱과 탭을 함께 사용하는 추적 플레이어.
export async function trackReel(page, pointerType = 'keyboard', onFrame = async () => {}) {
  await assertDifficultyHidden(page);
  const movementStick = await page.locator('.pwp-movement-stick-zone').count() > 0;
  const stick = page.locator(movementStick ? '.pwp-movement-stick-zone' : '.pwp-reel-stick');
  const box = await stick.boundingBox();
  assert.ok(box, 'joystick input area is available');
  const cx = box.x + (movementStick ? Math.min(100, box.width / 2) : box.width / 2);
  const cy = movementStick ? box.y + box.height - 110 : box.y + box.height / 2;
  // 실제 게임은 왼쪽이 이동 조이스틱이라 오른쪽을 톡톡, 단독 낚시 화면(probe)은 예전처럼 왼쪽 끝(게임 영역 안).
  const tapX = movementStick ? page.viewportSize().width * .75 : 20;
  const touch = pointerType === 'touch' ? await page.context().newCDPSession(page) : null;
  let stickX = cx;
  const point = () => ({ x: stickX, y: cy, id: 1 });
  if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point()] });
  else { await page.mouse.move(cx, cy); await page.mouse.down(); }
  let last = -1000;
  try {
    for (let frame = 0; frame < 1900; frame++) {
      const s = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="reel-bar"]');
        if (!el) return null;
        return {
        x: +el.dataset.zoneX, y: +el.dataset.zone, vy: +el.dataset.velocity,
        fx: +el.dataset.fishX, fy: +el.dataset.fish,
        fvx: +el.dataset.fishVx, fvy: +el.dataset.fishVy, time: +el.dataset.elapsed * 1000,
        };
      });
      if (!s) return;
      const axis = Math.max(-1, Math.min(1, ((s.fx - s.x) * 5 + s.fvx * .7) / 1.8));
      stickX = cx + (movementStick ? Math.sign(axis) * (56 * .16 + Math.abs(axis) * 56 * .84) : axis * 38);
      if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point()] });
      else await page.mouse.move(stickX, cy);
      if (s.time - last >= 150 && s.y + s.vy * .18 < s.fy - .055) {
        last = s.time;
        if (pointerType === 'keyboard') await page.keyboard.press('Space');
        else if (touch) {
          await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(), { x: tapX, y: 300, id: 2 }] });
          // touchEnd의 touchPoints는 '떼는' 손가락 — 톡톡 손가락(id 2)만 떼고 조이스틱 손가락은 그대로 둔다.
          await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: tapX, y: 300, id: 2 }] });
        }
        else {
          await page.locator('.pwp-root').dispatchEvent('pointerdown', { pointerId: 91, pointerType, button: 0, bubbles: true, cancelable: true });
          await page.locator('.pwp-root').dispatchEvent('pointerup', { pointerId: 91, pointerType, button: 0, bubbles: true });
        }
      }
      await onFrame(frame);
      await page.waitForTimeout(40);
    }
    throw new Error('2D tracking did not finish within 75 seconds');
  } finally {
    if (touch) { await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await touch.detach(); }
    else await page.mouse.up();
  }
}

export async function assertReelLayout(page) {
  await assertDifficultyHidden(page);
  const circle = await page.locator('.pwp-reel-track').boundingBox();
  // 단독 낚시 화면(probe)엔 이동 조이스틱 영역이 없다 — 없으면 기다리지 않고 예전 릴 조이스틱을 본다.
  const movementZone = await page.locator('.pwp-movement-stick-zone').count() ? await page.locator('.pwp-movement-stick-zone').boundingBox() : null;
  const stick = movementZone
    ? { x: movementZone.x + Math.min(100, movementZone.width / 2) - 56, y: movementZone.y + movementZone.height - 166, width: 112, height: 112 }
    : await page.locator('.pwp-reel-stick').boundingBox();
  assert.ok(circle && stick);
  assert.ok(Math.abs(circle.width - circle.height) < 1, 'arena is circular');
  assert.ok(circle.y + circle.height < stick.y || circle.x > stick.x + stick.width, 'arena does not overlap joystick');
  const viewport = page.viewportSize();
  assert.ok(stick.x >= 0 && stick.y >= 0 && stick.x + stick.width <= viewport.width && stick.y + stick.height <= viewport.height, 'joystick remains on screen');
}

export async function assertDifficultyHidden(page) {
  const reel = page.getByTestId('reel-bar');
  assert.doesNotMatch(await reel.textContent(), /난이도|[●○]/);
  assert.equal(await reel.locator('.pwp-reel-difficulty, [data-difficulty], [aria-label*="난이도"]').count(), 0);
  assert.equal(await reel.getAttribute('data-difficulty'), null);
  assert.doesNotMatch(await reel.getAttribute('aria-label'), /난이도/);
}
