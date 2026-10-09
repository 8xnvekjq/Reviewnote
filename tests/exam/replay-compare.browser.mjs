import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = `${process.env.EXAM_TEST_BASE_URL || 'http://127.0.0.1:5176'}/tests/exam/practice.html`;
const out = '.test-artifacts/compare-fit6';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 820, 1180]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__scratchWrites = [];
      for (const method of ['setItem', 'removeItem', 'clear']) {
        const original = Storage.prototype[method];
        Storage.prototype[method] = function (...args) { window.__scratchWrites.push(`storage:${method}`); return original.apply(this, args); };
      }
      const transaction = IDBDatabase.prototype.transaction;
      IDBDatabase.prototype.transaction = function (...args) {
        if (args[1] === 'readwrite') window.__scratchWrites.push('indexedDB:readwrite');
        return transaction.apply(this, args);
      };
    });
    await page.goto(`${base}?admin=1&compare=1`);
    await page.locator('[data-testid="exam-compare-open"][data-paper-id="2025-06-math"]').click();
    const dialog = page.getByTestId('replay-compare');
    const picker = page.getByTestId('compare-picker');
    await picker.getByRole('checkbox').first().waitFor();
    assert.equal(await picker.getByRole('checkbox').count(), 3);
    assert.match(await picker.innerText(), /내 풀이/);
    await page.screenshot({ path: `${out}/picker-${width}.png` });
    for (const checkbox of await picker.getByRole('checkbox').all()) await checkbox.check();
    await picker.getByRole('button', { name: '함께 재생' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="compare-grid"]')?.dataset.playing === 'true');
    const cells = page.getByTestId('compare-cell');
    assert.equal(await cells.count(), 3);
    const times = await cells.evaluateAll(els => els.map(el => Number(el.dataset.time)));
    assert.equal(new Set(times).size, 1, 'all cells use the same initial clock');
    assert.ok(times[0] < 400, 'playback starts at the beginning');
    await page.waitForFunction(() => {
      const cells = [...document.querySelectorAll('[data-testid="compare-cell"]')];
      return cells[0]?.dataset.finished === 'true' && cells[1]?.dataset.finished === 'false';
    });
    assert.equal(await cells.first().getByTestId('compare-ended').innerText(), '끝');
    assert.equal(await cells.first().locator('.exam-ink').evaluate(el => getComputedStyle(el).filter), 'grayscale(1)');
    assert.equal(await page.getByTestId('compare-grid').getAttribute('data-playing'), 'true');
    await dialog.getByRole('button', { name: '일시정지', exact: true }).click();
    const pausedTime = await gridTime(page);
    await page.waitForTimeout(120);
    assert.equal(await gridTime(page), pausedTime, 'pause freezes the shared clock');
    assert.deepEqual(await dialog.locator('.exam-replay-speed button').allTextContents(), ['0.5×', '1×', '2×', '4×']);
    for (const value of ['0.5×', '2×', '4×', '1×']) {
      await dialog.getByRole('button', { name: value, exact: true }).click();
      assert.equal(await dialog.getByRole('button', { name: value, exact: true }).getAttribute('aria-pressed'), 'true');
    }
    assert.equal(await dialog.locator('select, input[type="range"]').count(), 0);
    const dock = page.getByTestId('compare-dock');
    const slider = dock.getByRole('slider');
    await dock.getByRole('button', { name: '마지막', exact: true }).click();
    const end = Number(await slider.getAttribute('aria-valuemax'));
    assert.equal(Number(await gridTime(page)), end);
    await dock.getByRole('button', { name: '처음', exact: true }).click();
    assert.equal(Number(await gridTime(page)), 0);
    await dock.getByRole('button', { name: '3초 앞으로' }).click();
    assert.equal(Number(await gridTime(page)), Math.min(3000, end));
    await dock.getByRole('button', { name: '3초 뒤로' }).click();
    assert.equal(Number(await gridTime(page)), 0);
    await slider.click({ position: { x: (await slider.boundingBox()).width / 2, y: 16 } });
    assert.ok(Math.abs(Number(await gridTime(page)) - end / 2) < 20);
    assert.match(await page.getByTestId('compare-position').innerText(), /^\d+:\d{2} \/ \d+:\d{2}$/);
    await page.getByTestId('compare-counter').click();
    const overview = page.getByTestId('compare-overview');
    await overview.waitFor();
    assert.equal(await overview.locator('.is-current').getAttribute('aria-label'), '1번 문항');
    assert.equal(await overview.locator('.exam-thumb img').count(), 3);
    await page.screenshot({ path: `${out}/overview-${width}.png` });
    await page.keyboard.press('Escape');
    await overview.waitFor({ state: 'hidden' });
    await dialog.getByRole('button', { name: '▦ 전체 문제', exact: true }).click();
    await page.goBack();
    await overview.waitFor({ state: 'hidden' });
    assert.equal(await dialog.count(), 1);
    await page.getByTestId('compare-counter').click();
    await overview.getByRole('button', { name: '1번 문항', exact: true }).click();
    await overview.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('[data-testid="compare-grid"]')?.dataset.playing === 'true');
    const overviewTimes = await cells.evaluateAll(els => els.map(el => Number(el.dataset.time)));
    assert.equal(new Set(overviewTimes).size, 1, 'overview restarts every grid cell together, even for the current question');
    assert.ok(overviewTimes[0] < 400);
    await dialog.getByRole('button', { name: '일시정지', exact: true }).click();
    const grid = page.getByTestId('compare-grid');
    const columns = await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert.equal(columns, width === 390 ? 1 : width === 820 ? 2 : 3);
    await page.screenshot({ path: `${out}/grid-${width}.png` });
    await dialog.getByRole('button', { name: '다음 문항', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="compare-grid"]')?.dataset.playing === 'true');
    assert.equal(await page.getByTestId('compare-counter').innerText(), '2번 / 총3');
    const restarted = await cells.evaluateAll(els => els.map(el => Number(el.dataset.time)));
    assert.equal(new Set(restarted).size, 1); assert.ok(restarted[0] < 400);
    await cells.nth(1).getByRole('button').click();
    assert.equal(await cells.count(), 1);
    await dialog.getByRole('button', { name: '0.5×', exact: true }).click();
    assert.equal(await dialog.getByRole('button', { name: '0.5×', exact: true }).getAttribute('aria-pressed'), 'true');
    await dialog.getByRole('slider', { name: '필기 재생 위치' }).press('End');
    assert.equal(await cells.first().getAttribute('data-finished'), 'true');
    await dialog.getByRole('slider', { name: '필기 재생 위치' }).press('Home');
    assert.equal(await cells.first().getAttribute('data-time'), '0');
    await dialog.getByRole('button', { name: '재생', exact: true }).click();
    const notes = page.getByTestId('compare-notes');
    const input = notes.locator('.exam-ink-input');
    await input.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="compare-grid"]')?.dataset.time) >= 600);
    const before = await scratchSnapshot(page);
    const replayTime = Number(await gridTime(page));
    const replayCanvas = cells.first().locator('.exam-replay-frame > .exam-ink canvas').nth(1);
    const replayPixels = await replayCanvas.evaluate(el => el.toDataURL());
    const box = await input.boundingBox();
    const drawY = Math.max(180, box.y + 45);
    await page.mouse.move(box.x + 30, drawY);
    await page.mouse.down();
    await page.mouse.move(box.x + 130, drawY + 40, { steps: 10 });
    await page.mouse.up();
    assert.equal(await notes.locator('.exam-ink').getAttribute('data-stroke-count'), '1');
    for (const [pointerId, pointerType] of [[71, 'touch'], [72, 'pen']]) {
      await input.evaluate((el, { pointerId, pointerType }) => {
        const r = el.getBoundingClientRect();
        for (const [type, x, y, buttons] of [['pointerdown', 40, 110, 1], ['pointermove', 140, 140, 1], ['pointerup', 140, 140, 0]]) {
          el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId, pointerType, isPrimary: true, button: 0, buttons, pressure: .5, clientX: r.x + x, clientY: r.y + y }));
        }
      }, { pointerId, pointerType });
    }
    assert.equal(await notes.locator('.exam-ink').getAttribute('data-stroke-count'), '3');
    await page.waitForTimeout(150);
    assert.ok(Number(await gridTime(page)) > replayTime, 'drawing leaves replay advancing');
    assert.ok(await replayCanvas.evaluate(el => el.toDataURL()) !== replayPixels, 'replay pixels advance underneath the notes');
    assert.equal(await page.getByTestId('compare-grid').getAttribute('data-playing'), 'true');
    assert.deepEqual(await scratchSnapshot(page), before, 'scratch drawing never writes storage or calls the server');
    assert.equal(await input.evaluate(el => getComputedStyle(el).touchAction), 'none');
    assert.equal(await dialog.evaluate(el => getComputedStyle(el).touchAction), 'auto');
    const painted = await notes.locator('canvas').nth(1).evaluate(el => {
      const data = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
      return data.some((value, i) => i % 4 === 3 && value > 0);
    });
    assert.ok(painted, 'notes have visible pixels');
    await page.screenshot({ path: `${out}/focus-notes-${width}.png` });
    await page.getByTestId('compare-counter').click();
    await overview.getByRole('button', { name: '1번 문항', exact: true }).click();
    await overview.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.querySelector('[data-testid="compare-grid"]')?.dataset.playing === 'true');
    assert.equal(await notes.locator('.exam-ink').getAttribute('data-stroke-count'), '0', 'question change clears notes');
    const jumps = await cells.evaluateAll(els => els.map(el => Number(el.dataset.time)));
    assert.ok(jumps[0] < 400, 'overview jump restarts playback');
    await input.evaluate(el => {
      const r = el.getBoundingClientRect();
      for (const type of ['pointerdown', 'pointermove', 'pointerup']) el.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 73, pointerType: 'pen', isPrimary: true, buttons: type === 'pointerup' ? 0 : 1, clientX: r.x + (type === 'pointerdown' ? 30 : 130), clientY: r.y + 80 }));
    });
    assert.equal(await notes.locator('.exam-ink').getAttribute('data-stroke-count'), '1');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="compare-cell"]').length === 3);
    assert.equal(await cells.count(), 3);
    assert.equal(await page.getByTestId('compare-notes').count(), 0);
    assert.equal(await dialog.getByRole('toolbar').count(), 0, 'no pen tools in the grid');
    await cells.nth(1).getByRole('button').click();
    assert.equal(await page.getByTestId('compare-notes').locator('.exam-ink').getAttribute('data-stroke-count'), '0', 'leaving focus clears notes');
    await dialog.getByRole('button', { name: '← 전체 보기', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="compare-cell"]').length === 3);
    await cells.nth(1).getByRole('button').click();
    await page.goBack();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="compare-cell"]').length === 3);
    await dialog.getByRole('button', { name: '다음 문항', exact: true }).click();
    await dialog.getByRole('button', { name: '다음 문항', exact: true }).click();
    await cells.nth(2).getByTestId('compare-ended').waitFor();
    assert.equal(await cells.nth(2).getByTestId('compare-ended').innerText(), '풀이 없음');
    await dialog.getByRole('button', { name: '이전 문항', exact: true }).click();
    await dialog.getByRole('button', { name: '이전 문항', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="compare-grid"]')?.dataset.playing === 'true');
    const calls = await page.evaluate(() => window.__compare.calls);
    assert.equal(calls.length, 9, 'adjacent questions prefetch and revisits use cache');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await dialog.evaluate(el => { el.scrollTop = el.scrollHeight; });
    const lastBox = await cells.last().boundingBox();
    const dockBox = await dock.boundingBox();
    assert.ok(lastBox.y + lastBox.height <= dockBox.y, 'bottom padding keeps the last row above the fixed bar');
    const close = dialog.getByRole('button', { name: '풀이 비교 닫기' });
    const closeBox = await close.boundingBox();
    assert.ok(closeBox.y >= 0 && closeBox.y + closeBox.height <= 844, 'sticky close stays reachable');
    await dialog.getByRole('button', { name: '학생 다시 고르기', exact: true }).click();
    await picker.waitFor();
    await picker.getByRole('button', { name: '함께 재생' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="compare-grid"]')?.dataset.playing === 'true');
    await close.click(); assert.equal(await dialog.count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  }

  for (const [width, height] of [[1180,820], [820,1180], [1366,768], [1920,1080], [390,844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}?admin=1&compare=1&compare6=1`);
    await page.locator('[data-testid="exam-compare-open"][data-paper-id="2025-06-math"]').click();
    const picker = page.getByTestId('compare-picker');
    await picker.getByRole('checkbox').first().waitFor();
    assert.equal(await picker.getByRole('checkbox').count(), 6);
    for (const checkbox of await picker.getByRole('checkbox').all()) await checkbox.check();
    await picker.getByRole('button', { name: '\uD568\uAED8 \uC7AC\uC0DD' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="compare-grid"]')?.dataset.playing === 'true');
    await page.waitForFunction(() => window.__compare.calls.length === 12);
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="compare-cell"] img')].every(img => img.complete && img.width > 10));
    const dialog = page.getByTestId('replay-compare');
    const cells = page.getByTestId('compare-cell');
    const geometry = await cells.evaluateAll(els => els.map(el => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, image: el.querySelector('img').getBoundingClientRect().width };
    }));
    assert.equal(geometry.length,6);
    for (const cell of geometry) {
      assert.ok(Math.abs(cell.width - geometry[0].width) <= 2);
      assert.ok(Math.abs(cell.height - geometry[0].height) <= 2);
      assert.ok(Math.abs(cell.image - geometry[0].image) <= 2);
      if (width > 640) assert.ok(cell.x >= 0 && cell.y >= 0 && cell.x + cell.width <= width + 1 && cell.y + cell.height <= height + 1, JSON.stringify(cell));
    }
    if (width > 640) {
      assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1),true);
      assert.equal(await dialog.evaluate(el => el.scrollHeight <= el.clientHeight + 1),true);
    } else {
      assert.equal(await page.getByTestId('compare-grid').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
    }
    if (width === 1180) {
      assert.ok((await dialog.locator('.exam-compare-head').boundingBox()).height <= 60);
      assert.ok((await page.getByTestId('compare-dock').boundingBox()).height <= 60);
    }
    await page.getByTestId('compare-dock').getByRole('slider').press('End');
    await page.screenshot({ path: `${out}/six-${width}x${height}.png` });
    // 캐시에 있는 문항은 준비 중 문구 없이 재생한다.
    await page.evaluate(() => {
      window.__loadingSeen = false;
      window.__loadingObserver = new MutationObserver(() => {
        if ([...document.querySelectorAll('[role="status"]')].some(el => el.textContent.includes('\uBAA8\uB4E0 \uD480\uC774'))) window.__loadingSeen = true;
      });
      window.__loadingObserver.observe(document.body,{ childList: true, subtree: true });
    });
    const prefetched = await page.evaluate(() => window.__compare.calls.filter(call => call.questionId === window.__compare.rows[0].questions[1].questionId).length);
    assert.equal(prefetched,6);
    await dialog.getByRole('button', { name: '\uB2E4\uC74C \uBB38\uD56D', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="compare-grid"]')?.dataset.playing === 'true');
    assert.equal(await page.evaluate(() => window.__loadingSeen),false);
    assert.equal(await page.evaluate(() => window.__compare.calls.filter(call => call.questionId === window.__compare.rows[0].questions[1].questionId).length),6);
    await page.evaluate(() => window.__loadingObserver.disconnect());
    assert.deepEqual(errors,[]);
    await page.close();
  }
  const student = await browser.newPage();
  await student.goto(`${base}?compare=1`);
  await student.getByTestId('exam-start').waitFor();
  assert.equal(await student.getByTestId('exam-compare-open').count(), 0);
  await student.close();
  console.log('PASS: picker, synchronized grid, finished/empty states, navigation/cache, focus, controls, Escape, layouts and admin entry');
} finally { await browser.close(); }

async function gridTime(page) {
  return page.getByTestId('compare-grid').getAttribute('data-time');
}

async function scratchSnapshot(page) {
  return page.evaluate(async () => ({
    writes: [...window.__scratchWrites],
    storage: { ...localStorage },
    databases: await indexedDB.databases(),
    log: window.__examLog,
    calls: window.__compare.calls,
  }));
}
