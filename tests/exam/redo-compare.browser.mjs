import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ headless: true, ...(process.env.EXAM_BROWSER_CHANNEL ? { channel: process.env.EXAM_BROWSER_CHANNEL } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 820, height: 1180 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${process.env.EXAM_TEST_BASE_URL || 'http://127.0.0.1:5176'}/tests/exam/practice.html?admin=1&compare=1`);
  await page.getByTestId('exam-compare-open').first().waitFor();
  await page.evaluate(() => {
    const mock = window.__compare;
    const teacher = mock.rows.find(row => row.isMine);
    Object.assign(teacher.questions[0], { replayAttemptId: 'redo-2', isSingleRedo: true, answer: '2', isCorrect: false });
    window.__redoQuestion = teacher.questions[0].questionId;
  });
  await page.getByTestId('exam-compare-open').first().click();
  const picker = page.getByTestId('compare-picker');
  await picker.getByRole('checkbox').nth(2).check();
  await picker.getByRole('button', { name: '함께 재생' }).click();
  const cell = page.getByTestId('compare-cell');
  await cell.getByText('다시 풀기', { exact: true }).waitFor();
  assert.match(await cell.innerText(), /답 2 X/);
  await page.waitForFunction(() => window.__compare.calls.some(c => c.attemptId === 'redo-2' && c.questionId === window.__redoQuestion));
  assert.equal(await cell.getAttribute('data-attempt-id'), 'compare-2');
  await cell.getByRole('button', { name: '선생님 풀이 확대' }).click();
  await page.getByRole('button', { name: '← 전체 보기' }).waitFor();
  await page.getByRole('button', { name: '다음 문항', exact: true }).click();
  await page.waitForFunction(() => window.__compare.calls.some(c => c.attemptId === 'compare-2' && c.questionId !== window.__redoQuestion));
  assert.equal(await page.getByText('다시 풀기', { exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  console.log('다시 풀기 표시·오답·재생 응시 선택·다른 문항 유지 검증 통과');
} finally { await browser.close(); }
