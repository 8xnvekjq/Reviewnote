import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const BASE = process.env.PWP_BASE ?? 'http://127.0.0.1:5178';
const SHOTS = '.test-artifacts/pw-weather';
await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1180]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 820 } });
    const errors = [];
    const admin = await context.newPage();
    const student = await context.newPage();
    for (const page of [admin, student]) page.on('pageerror', error => errors.push(error.message));
    const ready = async page => page.waitForFunction(() => window.__pixelWorldPhaser && document.querySelector('.pwp-root')?.dataset.status === 'ready' && window.__pixelWorldRefreshClock, null, { timeout: 30000 });
    await admin.goto(`${BASE}/tests/pixel-world-phaser/harness.html?fishing=1&weatherTest=1&admin=1`);
    await ready(admin);
    await student.goto(`${BASE}/tests/pixel-world-phaser/harness.html?fishing=1&weatherTest=1`);
    await ready(student);
    // 날씨 관리는 상단 버튼이 아니라 관리자 앞마당의 자판기 안에 있다. 학생 마당에는 자판기가 없다.
    for (const page of [admin, student]) assert.equal(await page.getByRole('button', { name: /날씨/ }).count(), 0, 'no weather chip in the HUD');
    assert.equal(await student.evaluate(() => 'kiosk' in window.__pixelWorldPhaser.debug().targets), false);
    const openKiosk = async () => {
      // 게임 입력(A·걷기)은 게임 루프가 처리하니, 뒤에 깔린 탭이면 앞으로 가져온다.
      await admin.bringToFront();
      const kiosk = admin.getByRole('dialog', { name: '관리자 자판기' });
      // 자판기를 눌러 걸어가면 도착하자마자 열린다. 이미 앞에 서 있으면 A로 연다.
      if (await admin.evaluate(() => window.__pixelWorldPhaser.debug().prompt) === 'kiosk') await admin.locator('.pwp-btn-a').click();
      else await admin.evaluate(() => { const h = window.__pixelWorldPhaser, p = h.debug().targets.kiosk; h.walkToScreen(p.x, p.y); });
      await kiosk.waitFor();
      await kiosk.getByRole('button', { name: '날씨 관리', exact: true }).click();
      return kiosk;
    };
    const panel = await openKiosk();
    await panel.getByRole('button', { name: '🌧 비', exact: true }).click();
    await panel.getByRole('button', { name: '밤', exact: true }).click();
    await panel.getByRole('button', { name: '적용', exact: true }).click();
    await panel.getByText('모두에게 적용했어요.').waitFor();
    await admin.screenshot({ path: `${SHOTS}/admin-panel-${width}.png` });
    const waitWeather = async (page, phase, weather) => page.waitForFunction(([phase, weather]) => {
      const d = window.__pixelWorldPhaser.debug(); return d.worldTint?.phase === phase && d.worldTint?.weather === weather;
    }, [phase, weather]);
    await waitWeather(admin, 'night', 'rain');
    const beforeRefresh = await student.evaluate(() => window.__pixelWorldPhaser.debug().worldTint);
    assert.equal(beforeRefresh.phase, 'day'); assert.equal(beforeRefresh.weather, 'clear');
    // 실제 60초 폴링과 같은 경로를 별도 학생 클라이언트에서 즉시 실행한다.
    await student.evaluate(() => window.__pixelWorldRefreshClock());
    await waitWeather(student, 'night', 'rain');
    await panel.getByRole('button', { name: '관리자 자판기 닫기' }).click();
    await admin.screenshot({ path: `${SHOTS}/rain-night-${width}.png` });
    await openKiosk();
    await panel.getByRole('button', { name: '모두 자동으로', exact: true }).click();
    await panel.getByText('모두 자동으로 돌아왔어요.').waitFor();
    assert.equal(await admin.evaluate(() => JSON.parse(localStorage.getItem('pwp-weather-test'))), null);
    await student.evaluate(() => window.__pixelWorldRefreshClock());
    const automatic = await admin.evaluate(() => window.__pixelWorldPhaser.debug().worldTint);
    await waitWeather(student, automatic.phase, automatic.weather);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`weather ${width}: PASS`);
  }
} finally { await browser.close(); }
