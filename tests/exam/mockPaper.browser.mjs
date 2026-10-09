// 학력평가 학년 탭 → 선택과목 없는 실전 → OMR 제출 → 추정 점수.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.EXAM_TEST_BASE_URL || 'http://127.0.0.1:5175';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/tests/exam/practice.html?mock=1`);
  await page.getByTestId('exam-start').waitFor();
  await page.getByRole('button', { name: '고3', exact: true }).click();
  await page.getByRole('heading', { name: '수능·모평', exact: true }).waitFor();
  assert.equal(await page.locator('[data-paper-id="2025-10-g2-math"]').count(), 0);
  await page.getByRole('button', { name: '고2', exact: true }).click();
  await page.getByRole('heading', { name: '학력평가', exact: true }).waitFor();
  await page.locator('[data-paper-id="2025-10-g2-math"]').click();
  await page.getByTestId('exam-setup').waitFor();
  assert.equal(await page.getByRole('radio', { name: /미적분|기하|확률과 통계/ }).count(), 0);
  await page.getByRole('radio', { name: /실전 모드/ }).click();
  await page.getByTestId('exam-start-button').click();
  await page.getByTestId('exam-solve').waitFor();
  assert.deepEqual(await page.evaluate(() => window.__examLog.find(row => row.method === 'startAttempt').args), ['2025-10-g2-math', 'real', null]);
  // 첫 문항의 정답을 실제 OMR에 입력한다.
  await page.locator('.exam-choice[data-choice="3"]').click();
  await page.getByRole('button', { name: '제출', exact: true }).click();
  await page.getByRole('button', { name: '제출하기', exact: true }).click();
  await page.getByTestId('exam-submit-confirm').click();
  await page.getByTestId('exam-result').waitFor();
  assert.equal(await page.getByTestId('exam-score').innerText(), '2');
  assert.match(await page.getByTestId('exam-result').innerText(), /9등급/);
  assert.match(await page.getByTestId('exam-standard').innerText(), /^\d+$/);
  assert.match(await page.getByTestId('exam-percentile').innerText(), /^\d+$/);
  assert.deepEqual(errors, []);
  console.log('ok — 학력평가 고2 구역·실전·선택과목 없음·OMR·추정 등급/표준점수/백분위');
} finally { await browser.close(); }
