import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = `${process.env.EXAM_TEST_BASE_URL || 'http://127.0.0.1:5174'}/tests/exam/practice.html`;
const out = `${process.env.EXAM_TEST_ARTIFACT_DIR || '.test-artifacts'}/teacher-audio`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
async function start(page, query = '', mode = '자유 모드') {
  await page.goto(`${base}${query}`);
  await page.getByTestId('exam-start').waitFor();
  await page.locator('.exam-paper-card[data-paper-id="2025-06-math"]').click();
  await page.getByRole('radio', { name: new RegExp(mode) }).click();
  await page.getByRole('radio', { name: /확통/ }).click();
  await page.getByTestId('exam-start-button').click();
  await page.getByTestId('exam-solve').waitFor();
}
async function drafts(page) {
  return await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('rn-exam-solution-audio-v1');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const rows = await new Promise(resolve => {
      const request = db.transaction('clips').objectStore('clips').getAll(); request.onsuccess = () => resolve(request.result);
    });
    db.close(); return rows;
  });
}
try {
  const page = await browser.newPage({ viewport: { width: 820, height: 1180 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await start(page, '?admin=1&fakeAudio=1&persist=1');
  await page.evaluate(() => {
    const original = window.__examClient.uploadSolutionAudio;
    window.__audioUploadOriginal = original;
    window.__examClient.uploadSolutionAudio = async () => { throw new Error('offline'); };
  });
  const record = page.getByTestId('exam-audio-record');
  await record.click();
  await page.waitForFunction(() => document.querySelector('[data-testid="exam-audio-record"]')?.getAttribute('aria-pressed') === 'true');
  await page.waitForTimeout(500);
  const pending = await drafts(page);
  assert.equal(pending.length, 1); assert.ok(pending[0].chunks >= 1); assert.ok(pending[0].sizeBytes > 0);
  const firstQuestion = pending[0].questionId;
  await page.getByRole('button', { name: '다음 문항', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="exam-audio-record"]')?.getAttribute('aria-pressed') === 'false');
  await page.getByTestId('exam-audio-status').getByText('실패 · 다시 시도').waitFor();
  assert.equal((await drafts(page))[0].state, 'pending');
  await page.evaluate(() => { window.__examClient.uploadSolutionAudio = window.__audioUploadOriginal; });
  await page.getByText('실패 · 다시 시도', { exact: true }).click();
  await page.getByTestId('exam-audio-status').getByText('완료', { exact: true }).waitFor();
  assert.equal((await drafts(page)).length, 0);
  await record.click(); await page.waitForTimeout(400);
  await page.evaluate(() => {
    const original = window.__examClient.uploadSolutionAudio;
    window.__examClient.uploadSolutionAudio = async (...args) => { await new Promise(resolve => setTimeout(resolve, 700)); return original(...args); };
  });
  await record.click();
  await page.getByTestId('exam-audio-status').getByText('업로드 중', { exact: true }).waitFor();
  await page.getByTestId('exam-audio-status').getByText('완료', { exact: true }).waitFor();
  const uploads = await page.evaluate(() => window.__examLog.filter(row => row.method === 'uploadSolutionAudio').map(row => row.args[0]));
  assert.equal(uploads.length, 2); assert.equal(uploads[0].questionId, firstQuestion); assert.notEqual(uploads[1].questionId, firstQuestion);
  assert.ok(uploads[1].startedAt > uploads[0].startedAt);
  const stats = await page.evaluate(() => window.__audioStats);
  assert.equal(stats.starts, 2); assert.equal(stats.stops, 2); assert.deepEqual(stats.timeslices, [10000, 10000]);
  assert.equal(stats.constraints[0].audio.echoCancellation, false); assert.equal(stats.options[0].audioBitsPerSecond, 48000);
  await page.screenshot({ path: `${out}/admin-upload.png` });
  // 리로드 중인 녹음의 도착한 청크는 IndexedDB에서 복구된다.
  await page.evaluate(() => { window.__examClient.uploadSolutionAudio = async () => { throw new Error('offline'); }; });
  await record.click(); await page.waitForTimeout(350);
  assert.ok((await drafts(page))[0].chunks > 0);
  await page.reload();
  await page.getByTestId('exam-start').waitFor();
  const resume = page.getByRole('button', { name: /이어 풀기/ });
  if (await resume.count()) await resume.first().click();
  else {
    await page.locator('.exam-paper-card[data-paper-id="2025-06-math"]').click();
    await page.getByRole('button', { name: /이어 풀기/ }).first().click();
  }
  await page.getByTestId('exam-solve').waitFor();
  await page.getByTestId('exam-audio-status').getByText('완료', { exact: true }).waitFor();
  assert.equal((await drafts(page)).length, 0);
  await record.click(); await page.waitForTimeout(300);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByText('화면이 숨겨져 녹음을 멈추고 저장했어요.', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="exam-audio-record"]')?.getAttribute('aria-pressed') === 'false');
  await page.close();

  for (const outcome of ['success', 'retry', 'continue']) {
    const failure = outcome !== 'success';
    const submitPage = await browser.newPage();
    await start(submitPage, '?admin=1&fakeAudio=1');
    await submitPage.evaluate(fail => {
      const original = window.__examClient.uploadSolutionAudio;
      window.__audioUploadOriginal = original;
      window.__examClient.uploadSolutionAudio = async (...args) => {
        await new Promise(resolve => setTimeout(resolve, 700));
        if (fail) throw new Error('offline');
        return original(...args);
      };
    }, failure);
    await submitPage.getByTestId('exam-audio-record').click();
    await submitPage.waitForTimeout(400);
    await submitPage.getByRole('button', { name: '제출', exact: true }).click();
    await submitPage.getByRole('button', { name: '제출하기', exact: true }).click();
    await submitPage.getByTestId('exam-submit-confirm').click();
    const status = submitPage.getByTestId('exam-audio-submit');
    await status.getByText('음성 업로드 중…', { exact: true }).waitFor();
    assert.equal(await submitPage.getByTestId('exam-result').count(), 0);
    if (failure) {
      await status.getByRole('button', { name: '다시 시도', exact: true }).waitFor();
      assert.ok((await drafts(submitPage)).length > 0);
      if (outcome === 'continue') {
        await status.getByRole('button', { name: '그래도 계속', exact: true }).click();
        await submitPage.getByTestId('exam-result').waitFor();
        assert.ok((await drafts(submitPage)).length > 0);
        await submitPage.close();
        continue;
      }
      await submitPage.evaluate(() => { window.__examClient.uploadSolutionAudio = window.__audioUploadOriginal; });
      await status.getByRole('button', { name: '다시 시도', exact: true }).click();
    }
    await status.getByText('음성 업로드 완료!', { exact: true }).waitFor();
    await submitPage.getByTestId('exam-result').waitFor();
    assert.equal((await drafts(submitPage)).length, 0);
    await submitPage.close();
  }

  for (const auto of [false, true]) {
    const stalled = await browser.newPage();
    await start(stalled, `?admin=1&fakeAudio=1${auto ? '&limit=0.06' : ''}`, auto ? '실전 모드' : '자유 모드');
    await stalled.evaluate(() => { window.__examClient.uploadSolutionAudio = () => new Promise(() => {}); });
    await stalled.getByTestId('exam-audio-record').click();
    await stalled.waitForTimeout(300);
    if (!auto) {
      await stalled.getByRole('button', { name: '제출', exact: true }).click();
      await stalled.getByRole('button', { name: '제출하기', exact: true }).click();
      await stalled.getByTestId('exam-submit-confirm').click();
    }
    await stalled.getByTestId('exam-audio-submit').waitFor();
    if (!auto) await stalled.getByRole('button', { name: '그래도 계속', exact: true }).click();
    await stalled.getByTestId('exam-result').waitFor({ timeout: 40000 });
    assert.ok((await drafts(stalled)).length > 0);
    await stalled.close();
  }

  const denied = await browser.newPage();
  await start(denied, '?admin=1&fakeAudio=1&denyAudio=1');
  await denied.getByTestId('exam-audio-record').click();
  await denied.getByText('마이크 권한이 없어요. 브라우저 설정에서 허용한 뒤 다시 눌러 주세요.', { exact: true }).waitFor();
  await denied.close();

  const student = await browser.newPage({ viewport: { width: 390, height: 844 } });
  student.on('pageerror', error => errors.push(error.message));
  await start(student);
  assert.equal(await student.getByTestId('exam-audio-record').count(), 0);
  await student.locator('.exam-choice[data-choice="3"]').click();
  await student.getByRole('button', { name: '채점해 보기', exact: true }).click();
  await student.getByTestId('exam-free-peer').click();
  const teacher = student.getByTestId('exam-peer-row').last();
  assert.match(await teacher.innerText(), /🎙️/); await teacher.click();
  await student.getByTestId('exam-replay-audio').waitFor();
  assert.equal(await student.getByTestId('exam-replay-audio').getAttribute('data-muted'), 'true');
  const sound = student.getByTestId('exam-audio-sound');
  assert.equal(await sound.textContent(), '🔇소리 켜기');
  assert.equal(await sound.getAttribute('aria-label'), '소리 켜기');
  assert.equal(await sound.getAttribute('aria-pressed'), 'false');
  assert.equal(await sound.evaluate(el => !!el.closest('[data-testid="exam-replay-dock"]')), true);
  const soundBox = await sound.boundingBox();
  assert.ok(soundBox.width >= 40 && soundBox.height >= 40);
  for (const theme of ['light', 'dark']) {
    await student.evaluate(async value => {
      const { applyThemeColor } = await import('/src/utils/theme.ts');
      applyThemeColor(value === 'light' ? '#FFFFFF' : undefined);
    }, theme);
    assert.equal(await sound.evaluate(el => getComputedStyle(el).color), theme === 'light' ? 'rgb(15, 23, 42)' : 'rgb(243, 245, 251)');
    await student.getByTestId('exam-replay-dock').screenshot({ path: `${out}/speaker-${theme}.png` });
  }
  await student.waitForFunction(() => { const audio = document.querySelector('audio'); return audio && audio.muted && !audio.paused; });
  await student.getByTestId('exam-audio-sound').click();
  assert.equal(await student.getByTestId('exam-replay-audio').getAttribute('data-muted'), 'false');
  assert.equal(await sound.textContent(), '🔊소리 끄기');
  assert.equal(await sound.getAttribute('aria-label'), '소리 끄기');
  assert.equal(await sound.getAttribute('aria-pressed'), 'true');
  assert.equal(await student.getByTestId('exam-audio-player').evaluate(audio => audio.muted), false);
  await sound.click();
  assert.equal(await sound.textContent(), '🔇소리 켜기');
  assert.equal(await sound.getAttribute('aria-pressed'), 'false');
  assert.equal(await student.getByTestId('exam-audio-player').evaluate(audio => audio.muted), true);
  await sound.click();
  await student.getByRole('button', { name: '일시정지', exact: true }).click();
  assert.equal(await student.getByTestId('exam-audio-player').evaluate(audio => audio.paused), true);
  const slider = student.getByRole('slider', { name: '필기 재생 위치' });
  const seek = async value => {
    await slider.evaluate((input, next) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(next));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  };
  await seek(3000);
  await student.waitForFunction(() => Math.abs(document.querySelector('audio').currentTime - 3) < .1);
  await student.getByRole('button', { name: '2×', exact: true }).click();
  assert.equal(await student.getByTestId('exam-audio-player').evaluate(audio => audio.playbackRate), 2);
  await student.getByRole('button', { name: '재생', exact: true }).click();
  await student.waitForFunction(() => !document.querySelector('audio').paused);
  await seek(7500);
  await student.waitForFunction(() => Math.abs(document.querySelector('audio').currentTime - 1) < .1);
  await student.getByRole('button', { name: '마지막', exact: true }).click();
  assert.equal(await student.getByTestId('exam-audio-player').evaluate(audio => audio.paused), true);
  await student.getByRole('button', { name: '처음', exact: true }).click();
  await student.waitForFunction(() => document.querySelector('audio').currentTime < .1);
  await student.screenshot({ path: `${out}/student-muted-playback.png` });
  await student.getByTestId('exam-peer-back').click();
  await student.evaluate(() => { HTMLMediaElement.prototype.canPlayType = () => ''; });
  await student.getByTestId('exam-free-peer').click();
  await student.getByTestId('exam-peer-row').last().click();
  await student.getByText(/이 기기에서는 .*음성 형식을 재생할 수 없어요/).waitFor();
  await student.getByTestId('exam-peer-back').click();
  await student.getByRole('button', { name: '제출', exact: true }).click();
  await student.getByRole('button', { name: '제출하기', exact: true }).click();
  await student.getByTestId('exam-submit-confirm').click();
  await student.getByTestId('exam-result').waitFor();
  assert.equal(await student.getByTestId('exam-audio-submit').count(), 0);
  assert.deepEqual(errors, []);
  await student.close();
  console.log('Teacher audio browser: recording, durable recovery, admin submit progress/success/failure/retry/continue, stalled auto-submit timeout, unchanged student submit, muted autoplay and playback controls passed.');
} finally { await browser.close(); }
