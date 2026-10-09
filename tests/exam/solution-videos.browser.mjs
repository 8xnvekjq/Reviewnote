// 관리자 해설 영상: 틀리거나 애매한 문항 줄의 걸린 시간 옆 유튜브 아이콘 → 그 문항 구역(공통·선택과목) 영상을 새 탭으로.
// 줄을 눌러 크게 보기와는 따로 동작하고, 크게 보기 머리줄에도 아이콘. 학생·학생 응시 검토에는 없다.
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
  // 1번만 맞히고(④) 나머지는 비워 둔다.
  await page.getByRole('button', { name: '제출', exact: true }).click();
  await page.getByRole('button', { name: '제출하기' }).click();
  await page.getByTestId('exam-submit-confirm').click();
  await page.getByTestId('exam-result').waitFor();
}

const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1180, height: 820 }]) {
    const context = await browser.newContext({ viewport });
    await context.addInitScript(() => { window.__opened = []; window.open = (url) => { window.__opened.push(url); return null; }; });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}?admin=1`);
    await page.getByTestId('exam-start').waitFor();
    await submitPaper(page);
    assert.equal(await page.getByTestId('exam-video-panel').count(), 0, '해설 영상 칸은 없다');
    await page.getByTestId('exam-video-mark').first().waitFor();
    const rows = await page.locator('.exam-item-row').evaluateAll(nodes => nodes.map(n => ({
      number: Number(n.dataset.number), wrongOrUnsure: n.dataset.correct === 'false' || !!n.querySelector('.exam-item-unsure')?.textContent,
      mark: n.querySelector('[data-testid="exam-video-mark"]')?.dataset.href ?? null,
      inTime: !!n.querySelector('.exam-item-time [data-testid="exam-video-mark"]'),
    })));
    for (const row of rows) {
      if (row.wrongOrUnsure) { assert.equal(row.mark, row.number >= 23 ? CALC : COMMON, `${row.number}번 링크`); assert.ok(row.inTime, '걸린 시간 옆'); }
      else assert.equal(row.mark, null, `${row.number}번은 맞힌 문항이라 아이콘 없음`);
    }
    // 아이콘 클릭: 새 탭으로 열고, 문항 크게 보기는 열리지 않는다.
    const wrong23 = page.locator('.exam-item-row[data-number="23"]');
    await wrong23.getByTestId('exam-video-mark').click();
    assert.deepEqual(await page.evaluate(() => window.__opened), [CALC]);
    assert.equal(await page.getByTestId('exam-viewer').count(), 0);
    // 크게 보기 머리줄에도 아이콘 링크.
    await wrong23.click();
    const link = page.getByTestId('exam-viewer').getByTestId('exam-video-link');
    await link.waitFor();
    assert.equal(await link.getAttribute('href'), CALC);
    assert.equal(await link.getAttribute('target'), '_blank');
    await page.getByTestId('exam-viewer').getByRole('button', { name: '닫기', exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
    await page.locator('.exam-item-row[data-number="23"]').screenshot({ path: `.test-artifacts/solution-video-row-${viewport.width}.png` }).catch(() => {});
    assert.deepEqual(errors, []);
    await context.close();

    // 학생: 아이콘 없음.
    const student = await browser.newContext({ viewport });
    const sp = await student.newPage();
    await sp.goto(BASE);
    await sp.getByTestId('exam-start').waitFor();
    await submitPaper(sp);
    assert.equal(await sp.getByTestId('exam-video-mark').count(), 0);
    await sp.locator('.exam-item-row[data-number="23"]').click();
    await sp.getByTestId('exam-viewer').waitFor();
    assert.equal(await sp.getByTestId('exam-video-link').count(), 0);
    await student.close();

    // 학생별 최근 점수: 내 응시 검토에는 아이콘, 학생 응시 검토에는 없음.
    const admin = await browser.newContext({ viewport });
    const ap = await admin.newPage();
    await ap.goto(`${BASE}?activity=1`);
    const activity = ap.locator('.exam-paper-entry').filter({ has: ap.locator('[data-testid="exam-paper-card"][data-paper-id="2025-06-math"]') }).getByTestId('exam-admin-activity');
    await activity.waitFor();
    await activity.locator('summary').click();
    const review = ap.getByTestId('admin-exam-review');
    await activity.getByTestId('exam-admin-student').filter({ has: ap.locator('.exam-admin-activity-name.is-mine') }).click();
    await review.getByTestId('exam-result').waitFor();
    await review.getByTestId('exam-video-mark').first().waitFor();
    await ap.keyboard.press('Escape');
    await review.waitFor({ state: 'detached' });
    await activity.getByTestId('exam-admin-student').first().click();
    await review.getByTestId('exam-result').waitFor();
    assert.equal(await review.getByTestId('exam-video-mark').count(), 0);
    await admin.close();
    console.log(`ok — admin solution video icons (${viewport.width})`);
  }
} finally { await browser.close(); }
