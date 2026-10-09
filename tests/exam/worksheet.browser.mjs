// Written only for coordinator execution. No live database: synthetic worksheet fixture.
// Start Vite, then EXAM_TEST_BASE_URL=http://127.0.0.1:5174 node tests/exam/worksheet.browser.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { duplicateSubmittedAttempt } from './ui-cleanup.assertions.mjs';
import { assertCompactTopbar } from './compact-topbar.assertions.mjs';

// 학교 프린트 구역은 기본으로 접혀 있다 — 학년 탭을 고른 뒤 펼친다(이미 펼쳐져 있으면 그대로).
async function openPrints(page) {
  const section = page.locator('[data-testid="exam-paper-section"][data-section="worksheet"]');
  if (!(await section.count())) return;
  if (!(await section.evaluate(el => el.tagName !== 'DETAILS' || el.open))) await section.locator(':scope > summary').click();
}

const base = process.env.EXAM_TEST_BASE_URL || 'http://127.0.0.1:5174';
const output = 'scratch/worksheet-browser';
const TRIG_IDS = ['2026-g3m-trig-creative-1', '2026-g3m-trig-creative-2'];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [1180, 820, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 820 ? 1180 : 820 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/tests/exam/practice.html?worksheet=1&persist=1`);
    await page.getByRole('button', { name: '고2', exact: true }).click(); await openPrints(page);
    await page.locator('[data-paper-id="mock-worksheet"][data-testid="exam-paper-card"]').click();
    assert.equal(await page.getByRole('radio', { name: /실전 모드/ }).count(), 0);
    await page.getByTestId('exam-start-button').click();
    await page.getByTestId('worksheet-source').waitFor();
    assert.match(await page.getByTestId('worksheet-source').innerText(), /2017년 9월 고2/);
    assert.equal(await page.getByTestId('worksheet-reference').count(), 0, '삼각비 표 버튼은 해당 학습지에만');
    assert.equal(await page.getByTestId('exam-remaining').count(), 0);
    await assertCompactTopbar(page, { freeCheck: true });
    await page.locator('.exam-choice[data-choice="4"]').click();
    await page.getByRole('button', { name: '채점해 보기', exact: true }).click();
    await page.getByRole('button', { name: '다음 문항', exact: true }).click();
    await page.getByRole('button', { name: '제출', exact: true }).click();
    await page.getByRole('button', { name: '제출하기', exact: true }).click();
    await page.getByRole('alertdialog', { name: '제출 확인' }).getByRole('button', { name: '제출하기', exact: true }).click();
    await page.getByTestId('exam-result').waitFor();
    assert.equal(await page.getByTestId('exam-score').innerText(), '42.9점');
    assert.equal(await page.locator('.exam-score-main .exam-score-raw').innerText(), '(원점수 3 / 7점)');
    assert.equal(await page.getByText(/추정.*등급|추정.*표준점수|추정.*백분위/).count(), 0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, `${width}px horizontal overflow`);
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${output}/result-${width}.png` });
    await page.getByRole('button', { name: '← 시험지 목록', exact: true }).click();
    await page.getByRole('button', { name: '고2', exact: true }).click(); await openPrints(page);
    const card = page.locator('[data-paper-id="mock-worksheet"][data-testid="exam-paper-card"]');
    await card.waitFor();
    assert.match(await card.innerText(), /42\.9점/);
    assert.match(await card.innerText(), /원점수 3 \/ 7점/);
    assert.match(await page.locator('.exam-past .exam-past-row').first().innerText(), /42\.9점/);
    assert.equal(await page.getByTestId('exam-history-open').count(), 0);
    await page.locator('.exam-past .exam-past-row').first().click();
    await page.waitForFunction(() => window.__examLog.some(row => row.method === 'listPaperHistory'));
    assert.equal(await page.getByTestId('exam-history').count(), 0);
    await duplicateSubmittedAttempt(page);
    await page.locator('.exam-past .exam-past-row').first().click();
    await page.getByTestId('exam-history-table').waitFor();
    assert.match(await page.getByTestId('exam-history-attempt').first().innerText(), /42\.9점/);
    assert.match(await page.getByTestId('exam-history-attempt').first().innerText(), /원점수 3 \/ 7점/);
    const trend = page.getByTestId('exam-history-trend');
    assert.deepEqual(await trend.locator('svg > g text').allTextContents(), ['0', '50', '100']);
    assert.match(await trend.locator('svg').getAttribute('aria-label'), /42\.9점/);
    assert.match(await trend.locator('circle title').first().textContent(), /42\.9점/);
    assert.ok(Math.abs(Number(await trend.locator('circle').first().getAttribute('cy')) - (96 - .429 * 72)) < .001);
    await context.close();
  }

  // 중3 탭: 삼각비 창의융합 학습지 개편판 1차·2차(기존 18문항판은 비공개로 내려가 목록에 없다) — 삼각비 표 버튼은 앱 안 이미지 보기 창으로 열린다. 자유 모드로 채점·제출.
  for (const width of [1180, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 820 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/tests/exam/practice.html?worksheet=1`);
    for (const label of ['중3', '고1', '고2', '고3', '한능검']) await page.getByRole('button', { name: label, exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '고3', exact: true }).getAttribute('aria-pressed'), 'true');
    for (const id of TRIG_IDS) assert.equal(await page.locator(`[data-paper-id="${id}"]`).count(), 0, '중3 학습지는 고3 탭에 없다');
    await page.getByRole('button', { name: '중3', exact: true }).click(); await openPrints(page);
    assert.equal(await page.locator('[data-paper-id="mock-worksheet"][data-testid="exam-paper-card"]').count(), 0, '고2 학습지는 중3 탭에 없다');
    const trigCards = page.locator('[data-testid="exam-paper-card"][data-paper-id^="2026-g3m-trig-creative"]');
    assert.deepEqual(await trigCards.evaluateAll(cards => cards.map(card => card.dataset.paperId).sort()), TRIG_IDS, '중3 탭에 1차·2차가 보이고 기존 18문항판은 없다');
    assert.match(await page.locator(`[data-paper-id="${TRIG_IDS[0]}"][data-testid="exam-paper-card"]`).innerText(), /\(1차\)/);
    assert.match(await page.locator(`[data-paper-id="${TRIG_IDS[1]}"][data-testid="exam-paper-card"]`).innerText(), /\(2차\)/);
    await page.locator(`[data-paper-id="${TRIG_IDS[0]}"][data-testid="exam-paper-card"]`).click();
    assert.equal(await page.getByRole('radio', { name: /실전 모드/ }).count(), 0);
    await page.getByTestId('exam-start-button').click();
    await page.getByTestId('worksheet-source').waitFor();
    assert.match(await page.getByTestId('worksheet-source').innerText(), /리뷰노트 변형 문항 · 유형 A-①/);
    // 삼각비 표: 새 탭이 아니라 앱 안 이미지 보기 창. 드래그·확대 뒤 click은 닫지 않고, 탭 한 번 · Esc · 뒤로가기로 닫힌다.
    const opened = [];
    context.on('page', p => opened.push(p));
    const button = page.getByRole('button', { name: '삼각비 표', exact: true });
    assert.equal(await button.getAttribute('data-testid'), 'worksheet-reference');
    assert.equal(await page.locator('a[data-testid="worksheet-reference"]').count(), 0, '새 탭 링크는 없다');
    await button.click();
    const viewer = page.getByTestId('exam-image-viewer');
    await viewer.waitFor();
    const image = viewer.locator('img');
    assert.equal(await image.getAttribute('src'), `/exams/${TRIG_IDS[0]}/trig-table.png`);
    await page.waitForFunction(() => {
      const img = document.querySelector('[data-testid="exam-image-viewer"] img');
      return img?.complete && img.naturalWidth > 0 && img.getBoundingClientRect().width > 0;
    });
    const fit = await page.evaluate(() => {
      const img = document.querySelector('[data-testid="exam-image-viewer"] img');
      const r = img.getBoundingClientRect();
      return { w: r.width, h: r.height, ratio: img.naturalWidth / img.naturalHeight, vw: innerWidth, vh: innerHeight };
    });
    assert.ok(Math.abs(fit.w / fit.h - fit.ratio) < 0.02, '이미지 비율 유지');
    assert.ok(fit.w <= fit.vw && fit.h <= fit.vh, '처음엔 화면 안에 들어온다');
    assert.ok(fit.w >= fit.vw - 40 || fit.h >= fit.vh - 40, '가로·세로 중 맞는 쪽으로 꽉 맞춘다');
    const stage = viewer.locator('.exam-image-viewer-stage');
    const sbox = await stage.boundingBox();
    const cx = sbox.x + sbox.width / 2, cy = sbox.y + sbox.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -600);
    await page.waitForFunction(() => Number(document.querySelector('.exam-image-viewer-stage')?.dataset.scale) > 1.2);
    for (let i = 0; i < 20; i++) await page.mouse.wheel(0, -2000);
    await page.waitForTimeout(100);
    assert.ok(Number(await stage.getAttribute('data-scale')) <= 5, '최대 5배');
    // 확대 상태에서 끌기 — 놓아도 닫히지 않는다.
    await page.mouse.down();
    await page.mouse.move(cx + 80, cy + 60, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    assert.equal(await viewer.count(), 1, '드래그로는 닫히지 않는다');
    // 탭 한 번이면 닫힌다(필기 캔버스로 click이 새지 않는다).
    await page.mouse.click(cx, cy);
    await viewer.waitFor({ state: 'detached' });
    // Esc · 뒤로가기로도 닫힌다.
    await button.click();
    await viewer.waitFor();
    await page.keyboard.press('Escape');
    await viewer.waitFor({ state: 'detached' });
    await button.click();
    await viewer.waitFor();
    await page.goBack();
    await viewer.waitFor({ state: 'detached' });
    // × 버튼
    await button.click();
    await page.getByRole('button', { name: '삼각비 표 닫기', exact: true }).click();
    await viewer.waitFor({ state: 'detached' });
    assert.equal(opened.length, 0, '새 탭이 열리지 않는다');
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

  // 2차 학습지: 같은 중3 탭에서 열리고, 출처 라벨은 '2차 유형 A', 삼각비 표 버튼은 2차 경로의 이미지를 띄운다.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 820 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/tests/exam/practice.html?worksheet=1`);
    await page.getByRole('button', { name: '중3', exact: true }).click(); await openPrints(page);
    await page.locator(`[data-paper-id="${TRIG_IDS[1]}"][data-testid="exam-paper-card"]`).click();
    assert.equal(await page.getByRole('radio', { name: /실전 모드/ }).count(), 0);
    await page.getByTestId('exam-start-button').click();
    await page.getByTestId('worksheet-source').waitFor();
    assert.match(await page.getByTestId('worksheet-source').innerText(), /리뷰노트 변형 문항 · 2차 유형 A/);
    await page.getByRole('button', { name: '삼각비 표', exact: true }).click();
    const viewer = page.getByTestId('exam-image-viewer');
    await viewer.waitFor();
    assert.equal(await viewer.locator('img').getAttribute('src'), `/exams/${TRIG_IDS[1]}/trig-table.png`);
    await page.keyboard.press('Escape');
    await viewer.waitFor({ state: 'detached' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, '390px horizontal overflow (2차)');
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${output}/trig2-solve-390.png` });
    await context.close();
  }

  // 학교 프린트 단원 필터: 단원이 하나뿐이면 칩 줄이 없고(기본 목록), 둘 이상이면 단원 칩으로 좁힌다. 1180/820/390.
  for (const width of [1180, 820, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 820 ? 1180 : 820 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/tests/exam/practice.html?worksheet=1`);
    await page.getByRole('button', { name: '중3', exact: true }).click(); await openPrints(page);
    assert.equal(await page.getByTestId('exam-filter-bar').count(), 0, '단원이 하나면 필터 없음');
    await page.goto(`${base}/tests/exam/practice.html?worksheet=1&filters=1`);
    await page.getByRole('button', { name: '중3', exact: true }).click(); await openPrints(page);
    const section = page.locator('[data-testid="exam-paper-section"][data-section="worksheet"]');
    const unitRow = section.locator('[data-testid="exam-filter-row"][data-filter="unit"]');
    await unitRow.waitFor();
    assert.deepEqual(await unitRow.getByTestId('exam-filter-chip').allInnerTexts(), ['전체', '삼각비의 활용', '이차함수']);
    const cardIds = () => section.getByTestId('exam-paper-card').evaluateAll(nodes => nodes.map(node => node.dataset.paperId));
    assert.equal((await cardIds()).length, 3);
    await unitRow.locator('[data-value="삼각비의 활용"]').click();
    assert.deepEqual((await cardIds()).sort(), TRIG_IDS);
    await page.reload();
    await page.getByRole('button', { name: '중3', exact: true }).click(); await openPrints(page);
    await unitRow.waitFor();
    assert.equal(await unitRow.locator('[data-value="삼각비의 활용"]').getAttribute('aria-pressed'), 'true', '새로고침해도 단원 선택 유지');
    assert.deepEqual((await cardIds()).sort(), TRIG_IDS);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, `${width}px horizontal overflow (단원 필터)`);
    assert.deepEqual(errors, []);
    await page.waitForTimeout(400); // 화면 등장·탭 전환 애니메이션이 끝난 뒤 찍는다.
    await page.screenshot({ path: `${output}/filters-worksheet-${width}.png`, fullPage: true });
    await context.close();
  }
} finally {
  await browser.close();
}
