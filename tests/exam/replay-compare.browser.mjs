import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = `${process.env.EXAM_TEST_BASE_URL || 'http://127.0.0.1:5175'}/tests/exam/practice.html`;
const out = '.test-artifacts/replay-compare';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 820, 1180]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
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
    assert.deepEqual(await dialog.getByRole('combobox', { name: '재생 배속' }).locator('option').allTextContents(), ['0.5×', '1×', '2×', '4×']);
    const grid = page.getByTestId('compare-grid');
    const columns = await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    assert.equal(columns, width === 390 ? 1 : width === 820 ? 2 : 3);
    await page.screenshot({ path: `${out}/grid-${width}.png` });
    await dialog.getByRole('button', { name: '다음 문항', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="compare-grid"]')?.dataset.playing === 'true');
    assert.equal(await dialog.getByRole('combobox', { name: '문항 번호' }).inputValue(), '2');
    const restarted = await cells.evaluateAll(els => els.map(el => Number(el.dataset.time)));
    assert.equal(new Set(restarted).size, 1); assert.ok(restarted[0] < 400);
    await cells.nth(1).getByRole('button').click();
    assert.equal(await cells.count(), 1);
    await dialog.getByRole('combobox', { name: '재생 배속' }).selectOption('2');
    assert.equal(await dialog.getByRole('combobox', { name: '재생 배속' }).inputValue(), '2');
    await dialog.getByRole('slider', { name: '필기 재생 위치' }).press('End');
    assert.equal(await cells.first().getAttribute('data-finished'), 'true');
    await dialog.getByRole('slider', { name: '필기 재생 위치' }).press('Home');
    assert.equal(await cells.first().getAttribute('data-time'), '0');
    await page.screenshot({ path: `${out}/focus-${width}.png` });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="compare-cell"]').length === 3);
    assert.equal(await cells.count(), 3);
    await cells.nth(1).getByRole('button').click();
    await dialog.getByRole('button', { name: '← 전체 보기', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="compare-cell"]').length === 3);
    await cells.nth(1).getByRole('button').click();
    await page.goBack();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="compare-cell"]').length === 3);
    await dialog.getByRole('combobox', { name: '문항 번호' }).selectOption('3');
    await cells.nth(2).getByTestId('compare-ended').waitFor();
    assert.equal(await cells.nth(2).getByTestId('compare-ended').innerText(), '풀이 없음');
    await dialog.getByRole('combobox', { name: '문항 번호' }).selectOption('1');
    await page.waitForFunction(() => document.querySelector('[data-testid="compare-grid"]')?.dataset.playing === 'true');
    const calls = await page.evaluate(() => window.__compare.calls);
    assert.equal(calls.length, 9, 'only current questions load and revisits use cache');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await dialog.evaluate(el => { el.scrollTop = el.scrollHeight; });
    const close = dialog.getByRole('button', { name: '풀이 비교 닫기' });
    const box = await close.boundingBox();
    assert.ok(box.y >= 0 && box.y + box.height <= 844, 'sticky close stays reachable');
    await close.click(); assert.equal(await dialog.count(), 0);
    assert.deepEqual(errors, []);
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
