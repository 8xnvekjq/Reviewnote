// Written only for coordinator execution. No live database: synthetic worksheet fixture.
// Start Vite, then EXAM_TEST_BASE_URL=http://127.0.0.1:5174 node tests/exam/worksheet.browser.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { assertCompactTopbar } from './compact-topbar.assertions.mjs';

const base = process.env.EXAM_TEST_BASE_URL || 'http://127.0.0.1:5174';
const output = 'scratch/worksheet-browser';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const width of [1180, 820, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 820 ? 1180 : 820 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/tests/exam/practice.html?worksheet=1&persist=1`);
    await page.getByRole('button', { name: '고2', exact: true }).click();
    await page.getByRole('heading', { name: '학교 프린트', exact: true }).waitFor();
    await page.locator('[data-paper-id="mock-worksheet"][data-testid="exam-paper-card"]').click();
    assert.equal(await page.getByRole('radio', { name: /실전 모드/ }).count(), 0);
    await page.getByTestId('exam-start-button').click();
    await page.getByTestId('worksheet-source').waitFor();
    assert.match(await page.getByTestId('worksheet-source').innerText(), /2017년 9월 고2/);
    assert.equal(await page.getByTestId('exam-remaining').count(), 0);
    await assertCompactTopbar(page, { freeCheck: true });
    await page.locator('.exam-choice[data-choice="4"]').click();
    await page.getByRole('button', { name: '채점해 보기', exact: true }).click();
    await page.getByRole('button', { name: '다음 문항', exact: true }).click();
    await page.getByRole('button', { name: '제출', exact: true }).click();
    await page.getByRole('button', { name: '제출하기', exact: true }).click();
    await page.getByRole('alertdialog', { name: '제출 확인' }).getByRole('button', { name: '제출하기', exact: true }).click();
    await page.getByTestId('exam-result').waitFor();
    assert.equal(await page.getByText(/추정.*등급|추정.*표준점수|추정.*백분위/).count(), 0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, `${width}px horizontal overflow`);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${output}/result-${width}.png` });
    await context.close();
  }
} finally {
  await browser.close();
}
