import assert from 'node:assert/strict';

// DOM 상태를 읽고 실제 조이스틱과 탭을 함께 사용하는 추적 플레이어.
export async function trackReel(page, pointerType = 'keyboard', onFrame = async () => {}) {
  const stick = page.locator('.pwp-reel-stick');
  const box = await stick.boundingBox();
  assert.ok(box, 'reel joystick is visible');
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
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
      stickX = cx + axis * 38;
      if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point()] });
      else await page.mouse.move(stickX, cy);
      if (s.time - last >= 150 && s.y + s.vy * .18 < s.fy - .055) {
        last = s.time;
        if (pointerType === 'keyboard') await page.keyboard.press('Space');
        else if (touch) {
          await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(), { x: 20, y: 300, id: 2 }] });
          await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: 20, y: 300, id: 2 }] });
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
  const circle = await page.locator('.pwp-reel-track').boundingBox();
  const stick = await page.locator('.pwp-reel-stick').boundingBox();
  assert.ok(circle && stick);
  assert.ok(Math.abs(circle.width - circle.height) < 1, 'arena is circular');
  assert.ok(circle.y + circle.height < stick.y || circle.x > stick.x + stick.width, 'arena does not overlap joystick');
  const viewport = page.viewportSize();
  assert.ok(stick.x >= 0 && stick.y >= 0 && stick.x + stick.width <= viewport.width && stick.y + stick.height <= viewport.height, 'joystick remains on screen');
}
