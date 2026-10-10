export async function walkToCastDock(page) {
  await page.evaluate(() => {
    const h = window.__pixelWorldPhaser, d = h.debug();
    h.walkToScreen((17 * 16 + 8 - d.camera.x) * d.cssZoom, (11 * 16 + 8 - d.camera.y) * d.cssZoom);
  });
  await page.waitForFunction(() => { const d = window.__pixelWorldPhaser.debug(); return !d.moving && d.pathLength === 0 && d.x > 17 * 16; }, null, { timeout: 20000 });
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(30); await page.keyboard.up('ArrowRight');
}
export async function chargeCast(page, heldMs = 400, touch = true) {
  if (touch) {
    const box = await page.locator('.pwp-btn-a').boundingBox();
    const session = await page.context().newCDPSession(page);
    try {
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
      await page.waitForTimeout(heldMs);
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally { await session.detach(); }
  } else {
    await page.keyboard.down('Space'); await page.waitForTimeout(heldMs); await page.keyboard.up('Space');
  }
}
