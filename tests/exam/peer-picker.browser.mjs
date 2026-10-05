import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = `${process.env.EXAM_TEST_BASE_URL || 'http://127.0.0.1:5174'}/tests/exam/practice.html`;
const out = `${process.env.EXAM_TEST_ARTIFACT_DIR || '.test-artifacts'}/peer-picker`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const viewport of [{ width:390,height:844 }, { width:820,height:1180 }]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    await page.getByTestId('exam-start').waitFor();
    await page.locator('.exam-paper-card[data-paper-id="2025-06-math"]').click();
    await page.getByRole('radio', { name:/자유 모드/ }).click();
    await page.getByRole('radio', { name:/확통/ }).click();
    await page.getByTestId('exam-start-button').click();
    await page.getByTestId('exam-solve').waitFor();
    assert.equal(await page.getByTestId('exam-free-peer').count(),0);
    await page.locator('.exam-choice[data-choice="3"]').click();
    await page.getByRole('button',{name:'채점해 보기',exact:true}).click();
    await page.getByTestId('exam-free-peer').click();
    const list = page.getByTestId('exam-peer-list');
    await list.waitFor();
    const rows = list.getByTestId('exam-peer-row');
    assert.equal(await rows.count(),3);
    assert.match(await rows.nth(0).innerText(),/🐱.*수학의 신.*고2.*4분 12초/s);
    assert.match(await rows.nth(1).innerText(),/🦊.*도전자.*고1.*15초/s);
    assert.match(await rows.last().innerText(),/🎓.*선생님.*1분 1초/s);
    assert.ok(!(await list.innerText()).includes('미제출'));
    for (const theme of ['light','dark']) {
      await page.evaluate(async value => { const { applyThemeColor } = await import('/src/utils/theme.ts'); applyThemeColor(value === 'light' ? '#FFFFFF' : undefined); },theme);
      const rect = await list.boundingBox();
      assert.ok(rect.x >= 0 && rect.x + rect.width <= viewport.width && rect.y + rect.height <= viewport.height);
      await list.screenshot({path:`${out}/list-${viewport.width}-${theme}.png`});
    }
    const listReadsBefore = await page.evaluate(() => window.__examLog.filter(row=>row.method==='listPeerSolutions').length);
    await page.evaluate(() => {
      const original = window.__examClient.getPeerSolutionByKey;
      let fail = true;
      window.__examClient.getPeerSolutionByKey = async (...args) => {
        if (fail) { fail = false; throw Object.assign(new Error('풀이가 바뀌었어요.'),{code:'EXAM_PEER_CHANGED'}); }
        return original(...args);
      };
    });
    await rows.first().focus();
    await page.keyboard.press('End');
    assert.equal(await rows.last().evaluate(el => el === document.activeElement),true);
    await page.keyboard.press('Home');
    await page.keyboard.press('Enter');
    await page.getByText('풀이가 바뀌었어요. 새 목록에서 다시 골라 주세요.',{exact:true}).waitFor();
    assert.equal(await page.evaluate(() => window.__examLog.filter(row=>row.method==='listPeerSolutions').length),listReadsBefore+1);
    await rows.first().click();
    const peer = page.getByTestId('exam-peer-solution');
    await peer.getByTestId('exam-replay-dock').waitFor();
    assert.equal(await list.count(),0);
    assert.match(await peer.getByTestId('exam-peer-label').innerText(),/수학의 신/);
    await peer.getByRole('slider',{name:'필기 재생 위치'}).press('End');
    await page.waitForFunction(() => document.querySelector('[data-testid="exam-peer-solution"] .exam-ink')?.dataset.strokeCount === '3');
    await peer.getByTestId('exam-peer-toggle').click();
    await rows.nth(1).click();
    await peer.getByTestId('exam-replay-dock').waitFor();
    assert.match(await peer.getByTestId('exam-peer-label').innerText(),/도전자/);
    const calls = await page.evaluate(() => window.__examLog.filter(row => row.method==='getPeerSolutionByKey').map(row=>row.args[2]));
    assert.deepEqual(calls,['mock-peer-fingerprint','mock-peer-second']);
    await peer.getByTestId('exam-peer-toggle').click();
    await page.keyboard.press('Escape');
    assert.equal(await list.count(),0); assert.equal(await page.getByTestId('exam-viewer').count(),1);
    await page.getByTestId('exam-viewer').getByRole('button',{name:'닫기',exact:true}).click();
    assert.equal(await page.getByTestId('exam-free-peer').evaluate(el=>el===document.activeElement),true);
    assert.equal(await page.getByTestId('exam-freecheck').getAttribute('data-correct'),'false');
    await page.getByRole('button',{name:'제출',exact:true}).click();
    await page.getByRole('button',{name:'제출하기',exact:true}).click();
    await page.getByTestId('exam-submit-confirm').click();
    await page.getByTestId('exam-result').waitFor();
    await page.locator('.exam-item-row[data-number="1"]').click();
    await page.getByTestId('exam-peer-toggle').click();
    await rows.last().click();
    await peer.getByTestId('exam-replay-dock').waitFor();
    assert.match(await peer.getByTestId('exam-peer-label').innerText(),/선생님/);
    assert.equal(await peer.getByTestId('exam-notes-tools').count(),0);
    assert.deepEqual(errors,[]);
    await page.close();
    console.log(`ok — peer picker free/result selection, switching, keyboard and themes (${viewport.width}px)`);
  }
} finally { await browser.close(); }
