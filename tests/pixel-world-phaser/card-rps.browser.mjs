import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.PWP_BASE ?? 'http://127.0.0.1:5174';
const browser = await chromium.launch({ headless: true, ...(process.env.EXAM_BROWSER_CHANNEL ? { channel: process.env.EXAM_BROWSER_CHANNEL } : {}) });
try {
  await mkdir('.test-artifacts', { recursive: true });
  for (const width of [390, 820, 1180]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: true });
    await page.goto(`${base}/tests/pixel-world-phaser/card-rps.harness.html`);
    await page.locator('.pwp-rps[data-status]').waitFor();
    await page.locator('.pwp-rps[data-status="choosing"]').waitFor();
    await page.screenshot({ path: `.test-artifacts/card-rps-${width}.png`, fullPage: true });
    const box = await page.locator('.pwp-rps').boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= width, `${width}px viewport overflow`);

    if (width === 820) {
      let revealCaptured = false;
      for (let guard = 0; guard < 30; guard++) {
        const status = await page.locator('.pwp-rps').getAttribute('data-status');
        if (status === 'finished') break;
        if (status === 'shootout') {
          await page.locator('.pwp-rps-shootout button').first().click();
          continue;
        }
        await page.locator('.pwp-rps-hand > button:enabled').first().click();
        await page.locator('.pwp-rps-submit:enabled').click();
        await page.locator('.pwp-rps-playback').waitFor();
        if (!revealCaptured) {
          await page.locator('.pwp-rps-playback button').first().click();
          await page.screenshot({ path: '.test-artifacts/card-rps-reveal.png', fullPage: true });
          revealCaptured = true;
        }
        if (await page.locator('.pwp-rps-playback').count()) {
          await page.locator('.pwp-rps-playback button').nth(1).click();
          await page.locator('.pwp-rps-playback').waitFor({ state: 'detached', timeout: 15000 });
        }
      }
      await page.locator('.pwp-rps-result').waitFor({ timeout: 15000 });
      await page.screenshot({ path: '.test-artifacts/card-rps-result.png', fullPage: true });
      await page.getByTestId('rules').evaluate(button => button.click());
      await page.locator('.pwp-rps-rules').waitFor();
      await page.locator('.pwp-rps-rules nav button').last().click();
      await page.screenshot({ path: '.test-artifacts/card-rps-rules-2.png', fullPage: true });
    }
    await page.close();
  }
  console.log('PASS card RPS: NPC match, 390/820/1180px, reveal, result, rules page 2');
} finally {
  await browser.close();
}
