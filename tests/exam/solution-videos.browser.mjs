// 관리자 본인 결과 화면의 해설 영상 링크: 공통·선택과목별 저장, 문항 크게 보기의 "▶ 해설"이 그 문항 구역 링크로 열린다. 학생에겐 없다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const BASE = `${process.env.EXAM_TEST_BASE_URL || 'http://127.0.0.1:5174'}/tests/exam/practice.html`;
const COMMON = 'https://www.youtube.com/watch?v=commonAAAAA';
const CALC = 'https://www.youtube.com/watch?v=zBWOAOh0amQ';

async function submitPaper(page) {
  await page.locator('[data-testid="exam-paper-card"][data-paper-id="2025-06-math"]').click();
  await page.getByTestId('exam-setup').waitFor();
  await page.getByRole('radio', { name: /자유/ }).click();
  await page.getByRole('radio', { name: /미적/ }).click();
  await page.getByTestId('exam-start-button').click();
  await page.getByTestId('exam-solve').waitFor();
  await page.getByRole('button', { name: '제출', exact: true }).click();
  await page.getByRole('button', { name: '제출하기' }).click();
  await page.getByTestId('exam-submit-confirm').click();
  await page.getByTestId('exam-result').waitFor();
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1180, height: 820 }]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}?admin=1`);
    await page.getByTestId('exam-start').waitFor();
    await submitPaper(page);
    const panel = page.getByTestId('exam-video-panel');
    await panel.waitFor();
    assert.deepEqual(await panel.locator('li').evaluateAll(rows => rows.map(r => r.dataset.section)), ['common', '미적분']);
    // 잘못된 링크는 막는다.
    await panel.locator('li[data-section="미적분"]').getByRole('button', { name: '링크 넣기' }).click();
    await panel.getByLabel('미적분 해설 영상 링크').fill('https://example.com/x');
    await panel.getByRole('button', { name: '저장', exact: true }).click();
    await panel.getByRole('alert').waitFor();
    assert.equal(await page.evaluate(() => window.__videoCalls.length), 0);
    await panel.getByLabel('미적분 해설 영상 링크').fill(CALC);
    await panel.getByRole('button', { name: '저장', exact: true }).click();
    await panel.locator('li[data-section="미적분"] a').waitFor();
    assert.equal(await panel.locator('li[data-section="미적분"] a').getAttribute('href'), CALC);
    await panel.locator('li[data-section="common"]').getByRole('button', { name: '링크 넣기' }).click();
    await panel.getByLabel('공통 해설 영상 링크').fill(COMMON);
    await panel.getByRole('button', { name: '저장', exact: true }).click();
    await panel.locator('li[data-section="common"] a').waitFor();
    // 공통 문항(1번) → 공통 링크, 선택 문항(23번) → 미적분 링크. 새 탭으로 연다.
    for (const [number, url] of [[1, COMMON], [23, CALC]]) {
      await page.locator(`.exam-item-row[data-number="${number}"]`).click();
      const link = page.getByTestId('exam-viewer').getByTestId('exam-video-link');
      await link.waitFor();
      assert.equal(await link.getAttribute('href'), url);
      assert.equal(await link.getAttribute('target'), '_blank');
      await page.getByTestId('exam-viewer').getByRole('button', { name: '닫기', exact: true }).click();
    }
    // 지우면 링크가 사라진다.
    await panel.locator('li[data-section="common"]').getByRole('button', { name: '지우기' }).click();
    await panel.locator('li[data-section="common"]').getByRole('button', { name: '링크 넣기' }).waitFor();
    await page.locator('.exam-item-row[data-number="1"]').click();
    await page.getByTestId('exam-viewer').waitFor();
    assert.equal(await page.getByTestId('exam-viewer').getByTestId('exam-video-link').count(), 0);
    await page.getByTestId('exam-viewer').getByRole('button', { name: '닫기', exact: true }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false);
    await panel.screenshot({ path: `.test-artifacts/solution-videos-${viewport.width}.png` }).catch(() => {});
    assert.deepEqual(errors, []);
    await context.close();
    // 학생: 칸도 링크도 없다.
    const student = await browser.newContext({ viewport });
    const sp = await student.newPage();
    await sp.goto(BASE);
    await sp.getByTestId('exam-start').waitFor();
    await submitPaper(sp);
    assert.equal(await sp.getByTestId('exam-video-panel').count(), 0);
    await sp.locator('.exam-item-row[data-number="23"]').click();
    await sp.getByTestId('exam-viewer').waitFor();
    assert.equal(await sp.getByTestId('exam-video-link').count(), 0);
    await student.close();
    // 학생별 최근 점수에서 내 응시를 열면 검토 화면에도 해설 영상 칸이 있다. 학생 응시를 열면 없다.
    const admin = await browser.newContext({ viewport });
    const ap = await admin.newPage();
    await ap.goto(`${BASE}?activity=1`);
    const activity = ap.locator('.exam-paper-entry').filter({ has: ap.locator('[data-testid="exam-paper-card"][data-paper-id="2025-06-math"]') }).getByTestId('exam-admin-activity');
    await activity.waitFor();
    await activity.locator('summary').click();
    const review = ap.getByTestId('admin-exam-review');
    await activity.getByTestId('exam-admin-student').filter({ has: ap.locator('.exam-admin-activity-name.is-mine') }).click();
    await review.getByTestId('exam-result').waitFor();
    await review.getByTestId('exam-video-panel').waitFor();
    await ap.keyboard.press('Escape');
    await review.waitFor({ state: 'detached' });
    await activity.getByTestId('exam-admin-student').first().click();
    await review.getByTestId('exam-result').waitFor();
    assert.equal(await review.getByTestId('exam-video-panel').count(), 0);
    await admin.close();
    console.log(`ok — admin solution video links (${viewport.width})`);
  }
} finally { await browser.close(); }
