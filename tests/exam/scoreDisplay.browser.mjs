import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.env.EXAM_TEST_BASE_URL || 'http://127.0.0.1:5206';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const query = 'worksheet=1&recordsPaper=mock-worksheet';
  await page.goto(`${base}/tests/exam/practice.html?records=1&${query}`);
  const submitted = page.locator('.exam-admin-attempt').first();
  assert.match(await submitted.innerText(), /0점/);
  assert.match(await submitted.innerText(), /원점수 0 \/ 7점/);
  await submitted.click();
  await page.getByTestId('admin-exam-review').waitFor();
  assert.equal(await page.getByTestId('exam-score').innerText(), '0점');
  assert.equal(await page.locator('.exam-score-main .exam-score-raw').innerText(), '(원점수 0 / 7점)');

  await page.goto(`${base}/tests/exam/practice.html?activity=1&${query}`);
  await page.getByRole('button', { name: '고2', exact: true }).click();
  const activity = page.getByTestId('exam-admin-activity').filter({ has: page.locator('summary') }).first();
  await activity.locator('summary').click();
  assert.match(await activity.innerText(), /0점/);
  assert.match(await activity.innerText(), /원점수 0 \/ 7점/);
  assert.match(await activity.getByTestId('exam-admin-student').first().innerText(), /원점수 0 \/ 7점/);
  await activity.getByTestId('exam-admin-student').first().click();
  assert.equal(await page.getByTestId('exam-score').innerText(), '0점');
  assert.deepEqual(errors, []);
  console.log('PASS score display: admin attempt list, paper activity, read-only result');
} finally {
  await browser.close();
}
