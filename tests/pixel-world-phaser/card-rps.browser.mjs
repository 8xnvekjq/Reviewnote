import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
const base = process.env.PWP_BASE ?? 'http://127.0.0.1:5174';
const browser = await chromium.launch({ headless: true });
try {
  await mkdir('.test-artifacts', { recursive: true });
  for (const width of [390, 820, 1180]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, hasTouch: true });
    await page.goto(`${base}/tests/pixel-world-phaser/card-rps.harness.html`);
    await page.getByRole('dialog', { name: '천광명월 카드 가위바위보' }).waitFor();
    await page.screenshot({ path: `.test-artifacts/card-rps-${width}.png`, fullPage: true });
    const box = await page.locator('.pwp-rps').boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= width, `${width}px 화면 밖 넘침`);
    if (width === 820) {
      for (let round = 0; round < 3; round++) {
        if (await page.locator('.pwp-rps-result').count() || await page.getByText('승부차기!').count()) break;
        for (const name of ['내 바위 카드', '내 가위 카드', '내 보 카드']) {
          const button = page.getByRole('button').filter({ has: page.getByLabel(name) });
          while (await button.isEnabled()) await button.click();
        }
        const submit = page.getByRole('button', { name: '내기', exact: true });
        if (!await submit.isEnabled()) break;
        await submit.click();
        const auto = page.getByRole('button', { name: '▶▶ 자동 재생' });
        if (await auto.count()) { await auto.click(); await page.waitForFunction(() => !document.querySelector('.pwp-rps-playback'), null, { timeout: 15000 }); }
        if (await page.getByText('승부차기!').count() || await page.getByText(/^경기에서/).count()) break;
      }
      for (let guard = 0; guard < 8 && await page.getByText('승부차기!').count(); guard++) await page.getByRole('button', { name: /✊ 바위/ }).click();
      await page.locator('.pwp-rps-result').waitFor({ timeout: 15000 });
      await page.screenshot({ path: '.test-artifacts/card-rps-result.png', fullPage: true });
      await page.getByTestId('rules').click();
      await page.getByRole('button', { name: '다음 →' }).click();
      await page.screenshot({ path: '.test-artifacts/card-rps-rules-2.png', fullPage: true });
    }
    await page.close();
  }
  console.log('PASS 카드 가위바위보: NPC 한 경기, 390/820/1180px, 설명서 2쪽');
} finally { await browser.close(); }
