// 관리자 해설 영상: 틀리거나 애매한 문항 줄에서 [유튜브 아이콘] → [애매 표시] → [걸린 시간] 순서. 아이콘은 진짜 링크(<a>)라
// 줄을 눌러 크게 보기와 따로 열리고, 크게 보기 안에는 아이콘이 없다. 학생·학생 응시 검토에는 없다.
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
    const page = await context.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${BASE}?admin=1`);
    await page.getByTestId('exam-start').waitFor();
    await submitPaper(page);
    assert.equal(await page.getByTestId('exam-video-panel').count(), 0, '해설 영상 칸은 없다');
    await page.locator('.exam-item-row [data-testid="exam-video-link"]').first().waitFor();
    const rows = await page.locator('.exam-item-row').evaluateAll(nodes => nodes.map(n => {
      const link = n.querySelector('[data-testid="exam-video-link"]'), unsure = n.querySelector('.exam-item-unsure'), time = n.querySelector('.exam-item-time');
      return { number: Number(n.dataset.number), wrongOrUnsure: n.dataset.correct === 'false' || !!unsure?.textContent,
        href: link?.getAttribute('href') ?? null, tag: link?.tagName ?? null,
        order: link ? [link, unsure, time].map(el => el.getBoundingClientRect().left) : null };
    }));
    for (const row of rows) {
      if (row.wrongOrUnsure) {
        assert.equal(row.href, row.number >= 23 ? CALC : COMMON, `${row.number}번 링크`);
        assert.equal(row.tag, 'A');
        assert.ok(row.order[0] < row.order[1] && row.order[1] < row.order[2], `${row.number}번: 유튜브 → 애매 → 시간 순서`);
      } else assert.equal(row.href, null, `${row.number}번은 맞힌 문항이라 아이콘 없음`);
    }
    // 아이콘 클릭: 새 탭(팝업)으로 그 영상이 열리고, 문항 크게 보기는 열리지 않는다.
    const wrong23 = page.locator('.exam-item-row[data-number="23"]');
    await context.route('https://www.youtube.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }));
    const [popup] = await Promise.all([page.waitForEvent('popup'), wrong23.getByTestId('exam-video-link').click()]);
    assert.equal(popup.url(), CALC);
    await popup.close();
    assert.equal(await page.getByTestId('exam-viewer').count(), 0);
    // 줄을 누르면 크게 보기, 그 안에는 유튜브 아이콘이 없다. 키보드 Enter로도 열린다.
    await wrong23.click();
    await page.getByTestId('exam-viewer').waitFor();
    assert.equal(await page.getByTestId('exam-viewer').getByTestId('exam-video-link').count(), 0);
    await page.getByTestId('exam-viewer').getByRole('button', { name: '닫기', exact: true }).click();
    await wrong23.focus(); await page.keyboard.press('Enter');
    await page.getByTestId('exam-viewer').waitFor();
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
    await review.getByTestId('exam-video-link').first().waitFor();
    await ap.keyboard.press('Escape');
    await review.waitFor({ state: 'detached' });
    await activity.getByTestId('exam-admin-student').first().click();
    await review.getByTestId('exam-result').waitFor();
    assert.equal(await review.getByTestId('exam-video-link').count(), 0);
    await admin.close();
    console.log(`ok — admin solution video icons (${viewport.width})`);
  }
} finally { await browser.close(); }
