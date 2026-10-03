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

  // 중3 탭: 삼각비 창의융합 학습지 — 삼각비 표 링크는 새 탭에서 이미지로 열린다. 자유 모드로 채점·제출.
  for (const width of [1180, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 820 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/tests/exam/practice.html?worksheet=1`);
    for (const label of ['중3', '고1', '고2', '고3', '한능검']) await page.getByRole('button', { name: label, exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '고3', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-paper-id="2026-g3m-trig-creative"]').count(), 0, '중3 학습지는 고3 탭에 없다');
    await page.getByRole('button', { name: '중3', exact: true }).click();
    await page.getByRole('heading', { name: '학교 프린트', exact: true }).waitFor();
    assert.equal(await page.locator('[data-paper-id="mock-worksheet"][data-testid="exam-paper-card"]').count(), 0, '고2 학습지는 중3 탭에 없다');
    await page.locator('[data-paper-id="2026-g3m-trig-creative"][data-testid="exam-paper-card"]').click();
    assert.equal(await page.getByRole('radio', { name: /실전 모드/ }).count(), 0);
    await page.getByTestId('exam-start-button').click();
    await page.getByTestId('worksheet-source').waitFor();
    assert.match(await page.getByTestId('worksheet-source').innerText(), /리뷰노트 변형 문항 · 유형 A-①/);
    const link = page.getByTestId('worksheet-reference');
    assert.equal(await link.getAttribute('target'), '_blank');
    assert.equal(await link.getAttribute('href'), '/exams/2026-g3m-trig-creative/trig-table.png');
    const [tab] = await Promise.all([context.waitForEvent('page'), link.click()]);
    const response = await tab.waitForEvent('response', r => r.url().endsWith('/trig-table.png')).catch(() => null);
    await tab.waitForLoadState();
    assert.match(tab.url(), /\/exams\/2026-g3m-trig-creative\/trig-table\.png$/);
    if (response) assert.match(response.headers()['content-type'] ?? '', /image\/png/);
    assert.equal(await tab.evaluate(() => document.images[0]?.naturalWidth > 0), true, '삼각비 표 이미지가 열린다');
    await tab.close();
    assert.equal(await page.getByTestId('worksheet-source').count(), 1, '풀이 화면은 그대로');
    const ones = page.getByRole('spinbutton', { name: '일의 자리' });
    const box = await ones.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 4 * 40);
    await page.waitForFunction(() => document.querySelector('[data-testid="exam-short-value"]')?.textContent === '4');
    await page.getByRole('button', { name: '채점해 보기', exact: true }).click();
    await page.getByRole('button', { name: '다음 문항', exact: true }).click();
    await page.getByRole('button', { name: '제출', exact: true }).click();
    await page.getByRole('button', { name: '제출하기', exact: true }).click();
    await page.getByRole('alertdialog', { name: '제출 확인' }).getByRole('button', { name: '제출하기', exact: true }).click();
    await page.getByTestId('exam-result').waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, `${width}px horizontal overflow`);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${output}/trig-result-${width}.png` });
    await context.close();
  }
} finally {
  await browser.close();
}
