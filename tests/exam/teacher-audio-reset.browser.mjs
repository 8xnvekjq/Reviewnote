// 선생님 녹음 관리: 녹음 하나 지우기 + "처음부터 다시"(필기+녹음), 제출한 선생님 응시의 "풀이 고치기"에서도.
// 실행: dev 서버(npm run dev -- --port 5174) 뒤 `node tests/exam/teacher-audio-reset.browser.mjs`
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = `${process.env.EXAM_TEST_BASE_URL || 'http://127.0.0.1:5174'}/tests/exam/practice.html`;
const out = `${process.env.EXAM_TEST_ARTIFACT_DIR || '.test-artifacts'}/teacher-audio-reset`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });

async function start(page) {
  await page.goto(`${base}?admin=1&fakeAudio=1`);
  await page.getByTestId('exam-start').waitFor();
  await page.locator('.exam-paper-card[data-paper-id="2025-06-math"]').click();
  await page.getByRole('radio', { name: /자유 모드/ }).click();
  await page.getByRole('radio', { name: /확통/ }).click();
  await page.getByTestId('exam-start-button').click();
  await page.getByTestId('exam-solve').waitFor();
}
const ink = page => page.locator('[data-testid="exam-body"] .exam-ink');
async function drawStroke(page, offset = 0) {
  await ink(page).waitFor();
  const box = await ink(page).boundingBox();
  assert.ok(box, 'ink canvas visible');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * (0.3 + offset));
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) await page.mouse.move(box.x + box.width * (0.2 + i * 0.04), box.y + box.height * (0.3 + offset + i * 0.03));
  await page.mouse.up();
}
async function recordClip(page) {
  const record = page.getByTestId('exam-audio-record');
  await record.click();
  await page.waitForFunction(() => document.querySelector('[data-testid="exam-audio-record"]')?.getAttribute('aria-pressed') === 'true');
  await page.waitForTimeout(450);
  await record.click();
  await page.waitForFunction(() => document.querySelector('[data-testid="exam-audio-record"]')?.getAttribute('aria-pressed') === 'false');
  await page.getByTestId('exam-audio-status').getByText('완료', { exact: true }).waitFor();
}
const calls = (page, method) => page.evaluate(name => window.__examLog.filter(row => row.method === name).map(row => row.args), method);
/** 목 서버에 저장된 이 문항의 필기·녹음. */
async function serverState(page) {
  return await page.evaluate(async () => {
    const attemptId = window.__examLog.find(row => row.method === 'uploadSolutionAudio')?.args[0].attemptId;
    const questionId = window.__examLog.find(row => row.method === 'uploadSolutionAudio')?.args[0].questionId;
    const replay = await window.__examClient.getInkReplay(attemptId, questionId);
    return { strokes: replay.strokes.length, batches: replay.batches.length, clips: replay.audioClips.map(clip => clip.id), revision: replay.revision };
  });
}
async function flushInk(page) {
  // 다음 문항으로 갔다가 돌아오면 앞 문항 필기를 바로 보낸다.
  await page.getByRole('button', { name: '다음 문항', exact: true }).click();
  await page.getByRole('button', { name: '이전 문항', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="exam-ink-sync"]')?.getAttribute('data-status') === 'saved');
}

try {
  const page = await browser.newPage({ viewport: { width: 820, height: 1180 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await drawStroke(page);
  await recordClip(page);
  await drawStroke(page, 0.2);
  await recordClip(page);
  await flushInk(page);
  let state = await serverState(page);
  assert.equal(state.clips.length, 2); assert.equal(state.strokes, 2);

  // ── 녹음 하나 지우기(확인 후) ──
  await page.getByTestId('exam-audio-manage').click();
  const manager = page.getByTestId('exam-audio-manager');
  await manager.waitFor();
  await assert.doesNotReject(manager.getByTestId('exam-audio-clip').nth(1).waitFor());
  assert.equal(await manager.getByTestId('exam-audio-clip').count(), 2);
  await page.screenshot({ path: `${out}/manager.png` });
  await manager.getByRole('button', { name: '1번 녹음 지우기' }).click();
  const confirm = page.getByTestId('exam-audio-confirm');
  await confirm.getByText('1번 녹음을 지울까요?').waitFor();
  await confirm.getByRole('button', { name: '취소' }).click();
  await confirm.waitFor({ state: 'detached' });
  assert.equal((await calls(page, 'deleteSolutionAudio')).length, 0, 'cancel deletes nothing');
  await manager.getByRole('button', { name: '1번 녹음 지우기' }).click();
  await page.getByTestId('exam-audio-confirm-delete').click();
  await confirm.waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="exam-audio-clip"]').length === 1);
  const deleted = await calls(page, 'deleteSolutionAudio');
  assert.equal(deleted.length, 1); assert.equal(deleted[0][0], state.clips[0]);
  state = await serverState(page);
  assert.equal(state.clips.length, 1); assert.equal(state.strokes, 2, 'deleting a clip keeps the ink');

  // ── 처음부터 다시: 필기와 녹음을 함께 지운다 ──
  await page.getByTestId('exam-audio-reset').click();
  await confirm.getByText('이 문제의 필기와 녹음을 모두 지우고 처음부터 다시 풀어요', { exact: false }).waitFor();
  await page.screenshot({ path: `${out}/reset-confirm.png` });
  await page.getByTestId('exam-audio-confirm-delete').click();
  await manager.getByTestId('exam-audio-empty').waitFor();
  assert.equal((await calls(page, 'resetQuestionSolution')).length, 1);
  state = await serverState(page);
  assert.deepEqual({ strokes: state.strokes, batches: state.batches, clips: state.clips }, { strokes: 0, batches: 0, clips: [] });
  await manager.getByRole('button', { name: '닫기' }).click();
  assert.equal(await ink(page).getAttribute('data-stroke-count'), '0', 'canvas is empty after the reset');
  assert.equal(await page.getByRole('button', { name: '실행 취소' }).isDisabled(), true, 'no undo back into the deleted ink');
  // 다시 풀고 녹음하면 깨끗한 시계에서 이어진다.
  await drawStroke(page);
  await recordClip(page);
  await flushInk(page);
  state = await serverState(page);
  assert.equal(state.strokes, 1); assert.equal(state.clips.length, 1); assert.equal(state.batches, 1);
  const replay = await page.evaluate(async () => {
    const row = window.__examLog.filter(r => r.method === 'uploadSolutionAudio').at(-1).args[0];
    return await window.__examClient.getInkReplay(row.attemptId, row.questionId);
  });
  assert.ok(Math.abs(replay.audioClips[0].offsetMs) < 5000, 'the new clip is aligned to the new ink, not the deleted one');

  // ── 제출한 선생님 응시: 결과 화면 → 풀이 고치기 → 처음부터 다시 ──
  await page.getByRole('button', { name: '제출', exact: true }).click();
  await page.getByRole('button', { name: '제출하기', exact: true }).click();
  await page.getByTestId('exam-submit-confirm').click();
  await page.getByTestId('exam-result').waitFor();
  await page.getByTestId('exam-result-revise').click();
  await page.getByTestId('exam-revising').waitFor();
  assert.equal(await page.getByRole('button', { name: '제출', exact: true }).count(), 0, 'no submit while revising');
  await page.getByTestId('exam-audio-manage').click();
  await manager.getByTestId('exam-audio-clip').first().waitFor();
  assert.equal(await manager.getByTestId('exam-audio-clip').count(), 1, 'the submitted clip is listed');
  await page.getByTestId('exam-audio-reset').click();
  await page.getByTestId('exam-audio-confirm-delete').click();
  await manager.getByTestId('exam-audio-empty').waitFor();
  await manager.getByRole('button', { name: '닫기' }).click();
  await drawStroke(page);
  await recordClip(page);
  await page.getByRole('button', { name: '나가기' }).click();
  await page.getByTestId('exam-exit-confirm').click();
  await page.getByTestId('exam-result').waitFor();
  state = await serverState(page);
  assert.equal(state.strokes, 1, 'ink edited on the submitted attempt is saved');
  assert.equal(state.clips.length, 1);
  await page.screenshot({ path: `${out}/revised-result.png` });
  assert.deepEqual(errors, []);
  await page.close();

  // 학생에게는 녹음 관리가 보이지 않는다.
  const student = await browser.newPage();
  await student.goto(`${base}`);
  await student.getByTestId('exam-start').waitFor();
  await student.locator('.exam-paper-card[data-paper-id="2025-06-math"]').click();
  await student.getByRole('radio', { name: /자유 모드/ }).click();
  await student.getByRole('radio', { name: /확통/ }).click();
  await student.getByTestId('exam-start-button').click();
  await student.getByTestId('exam-solve').waitFor();
  assert.equal(await student.getByTestId('exam-audio-manage').count(), 0);
  await student.close();
  console.log('Teacher audio reset browser: delete one clip (with cancel/confirm), start-over reset of ink+audio, clean re-recording, submitted teacher revise + reset passed.');
} finally { await browser.close(); }
