// 관리자 "선택과목만 풀기" 체크박스와 기본으로 접힌 학교 프린트 구역.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const BASE = `${process.env.EXAM_TEST_BASE_URL || 'http://127.0.0.1:5174'}/tests/exam/practice.html`;
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1180, height: 820 }]) {
    // 관리자: 체크하면 선택과목 문항만으로 시작한다.
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}?admin=1`);
    await page.getByTestId('exam-start').waitFor();
    await page.locator('[data-testid="exam-paper-card"][data-paper-id="2025-06-math"]').click();
    await page.getByTestId('exam-setup').waitFor();
    const check = page.getByTestId('exam-elective-only').locator('input');
    assert.equal(await check.isChecked(), false, '기본은 꺼짐');
    await page.getByRole('radio', { name: /자유/ }).click();
    await page.getByRole('radio', { name: /미적/ }).click();
    await check.check();
    assert.match(await page.getByTestId('exam-start-button').innerText(), /선택과목만/);
    await page.getByTestId('exam-start-button').click();
    await page.getByTestId('exam-solve').waitFor();
    const calls = await page.evaluate(() => window.__examLog.filter(row => row.method === 'startAttempt').map(row => row.args));
    assert.deepEqual(calls.at(-1), ['2025-06-math', 'free', '미적분', { electiveOnly: true }]);
    assert.match(await page.getByTestId('exam-counter').innerText(), /\/\s*8\b/, '미적분 8문항만');
    assert.equal(await page.getByTestId('exam-solve').getAttribute('data-question'), '23');
    assert.deepEqual(errors, []);
    await context.close();

    // 학생: 체크박스 없음. 학교 프린트는 접혀 있다가 누르면 펼쳐진다.
    const student = await browser.newContext({ viewport });
    const sp = await student.newPage();
    await sp.goto(`${BASE}?worksheet=1`);
    await sp.getByTestId('exam-start').waitFor();
    await sp.getByRole('button', { name: '고2', exact: true }).click();
    const fold = sp.locator('[data-testid="exam-paper-section"][data-section="worksheet"]');
    await fold.waitFor({ state: 'attached' });
    {
      assert.equal(await fold.evaluate(el => el.tagName), 'DETAILS');
      assert.equal(await fold.evaluate(el => el.open), false, '학교 프린트는 기본으로 접힘');
      assert.equal(await fold.locator('[data-testid="exam-paper-card"]').first().isVisible(), false);
      await fold.locator(':scope > summary').click();
      await fold.locator('[data-testid="exam-paper-card"]').first().waitFor();
    }
    await sp.goto(BASE);
    await sp.getByTestId('exam-start').waitFor();
    await sp.locator('[data-testid="exam-paper-card"][data-paper-id="2025-06-math"]').click();
    await sp.getByTestId('exam-setup').waitFor();
    assert.equal(await sp.getByTestId('exam-elective-only').count(), 0);
    await student.close();
    console.log(`ok — elective-only + worksheet fold (${viewport.width})`);
  }
} finally { await browser.close(); }
