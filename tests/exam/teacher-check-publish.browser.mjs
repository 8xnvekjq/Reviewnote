// 선생님(관리자)이 자유 모드 진행 중에 "채점해 보기"를 누르면: 그 문항 녹음 멈춤 → 필기 저장 → 녹음 업로드 진행 창 → 채점.
// 그 뒤 같은 브라우저의 학생 탭은 그 문항에서만 🎓 선생님 풀이(음성 포함)를 본다. 채점하지 않은 문항은 비공개.
// 두 탭은 ?sharedTeacher=1 (mockTeacherShare, 서버 공개 규칙과 같은 규칙)로 선생님 풀이를 주고받는다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = `${process.env.EXAM_TEST_BASE_URL || 'http://127.0.0.1:5174'}/tests/exam/practice.html`;
const out = `${process.env.EXAM_TEST_ARTIFACT_DIR || '.test-artifacts'}/teacher-check-publish`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
async function start(page, query) {
  await page.goto(`${base}${query}`);
  await page.getByTestId('exam-start').waitFor();
  await page.locator('.exam-paper-card[data-paper-id="2025-06-math"]').click();
  await page.getByRole('radio', { name: /자유 모드/ }).click();
  await page.getByRole('radio', { name: /확통/ }).click();
  await page.getByTestId('exam-start-button').click();
  await page.getByTestId('exam-solve').waitFor();
}
/** 최소 기준(획 3개·점 60개)을 넘는 풀이를 그린다. */
async function solve(page) {
  const ink = page.locator('[data-testid="exam-body"] .exam-ink');
  await ink.waitFor();
  const box = await ink.boundingBox();
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(box.x + 30, box.y + 40 + i * 30);
    await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 60 + i * 30, { steps: 40 });
    await page.mouse.up();
  }
  await page.waitForFunction(() => document.querySelector('[data-testid="exam-body"] .exam-ink')?.dataset.strokeCount === '3');
}
const recording = page => page.waitForFunction(() => document.querySelector('[data-testid="exam-audio-record"]')?.getAttribute('aria-pressed') === 'true');
const stopped = page => page.waitForFunction(() => document.querySelector('[data-testid="exam-audio-record"]')?.getAttribute('aria-pressed') === 'false');

try {
  const context = await browser.newContext({ viewport: { width: 820, height: 1180 } });
  const errors = [];
  // ── 선생님 탭 ──
  const admin = await context.newPage();
  admin.on('pageerror', error => errors.push(`admin: ${error.message}`));
  await admin.goto(base);
  await admin.evaluate(() => localStorage.clear());
  await start(admin, '?admin=1&fakeAudio=1&sharedTeacher=1&user=teacher-1');
  await admin.evaluate(() => {
    const original = window.__examClient.uploadSolutionAudio;
    window.__examClient.uploadSolutionAudio = async (...args) => { await new Promise(resolve => setTimeout(resolve, 900)); return original(...args); };
  });
  await solve(admin);
  await admin.getByTestId('exam-audio-record').click();
  await recording(admin);
  await admin.waitForTimeout(500);
  await admin.locator('.exam-choice[data-choice="3"]').click(); // 1번 정답은 4 — 틀린 답이어도 선생님 풀이는 공개된다
  await admin.getByRole('button', { name: '채점해 보기', exact: true }).click();
  const gate = admin.getByTestId('exam-audio-submit');
  await gate.getByText('채점 전에 이 문항 음성을 올리는 중…', { exact: true }).waitFor();
  await stopped(admin);
  assert.equal(await admin.evaluate(() => window.__examLog.filter(row => row.method === 'checkAnswer').length), 0, 'check waits for the upload');
  await admin.screenshot({ path: `${out}/admin-gate.png` });
  await gate.getByText('음성 업로드 완료!', { exact: true }).waitFor();
  await gate.waitFor({ state: 'detached' });
  const log = await admin.evaluate(() => window.__examLog.map(row => row.method));
  assert.ok(log.lastIndexOf('uploadSolutionAudio') < log.indexOf('checkAnswer'), 'audio uploaded before the check');

  // 2번: 풀고 녹음했지만 채점하지 않는다 → 비공개.
  await admin.getByRole('button', { name: '다음 문항', exact: true }).click();
  await solve(admin);
  await admin.getByTestId('exam-audio-record').click();
  await recording(admin);
  await admin.waitForTimeout(400);
  await admin.getByTestId('exam-audio-record').click();
  await admin.getByTestId('exam-audio-status').getByText('완료', { exact: true }).last().waitFor();

  // ── 학생 탭(같은 브라우저) ──
  const student = await context.newPage();
  student.on('pageerror', error => errors.push(`student: ${error.message}`));
  await start(student, '?sharedTeacher=1&user=student-1');
  await student.locator('.exam-choice[data-choice="3"]').click();
  await student.getByRole('button', { name: '채점해 보기', exact: true }).click();
  assert.equal(await student.getByTestId('exam-audio-submit').count(), 0, 'student check shows no upload dialog');
  await student.getByTestId('exam-free-peer').click();
  const list = student.getByTestId('exam-peer-list');
  await list.waitFor();
  const rows = list.getByTestId('exam-peer-row');
  assert.match(await rows.last().innerText(), /🎓.*선생님/s);
  await student.screenshot({ path: `${out}/student-list.png` });
  await rows.last().click();
  const peer = student.getByTestId('exam-peer-solution');
  await peer.getByTestId('exam-replay-dock').waitFor();
  assert.match(await peer.getByTestId('exam-peer-label').innerText(), /선생님/);
  assert.ok(await peer.getByTestId('exam-audio-sound').count() > 0, 'teacher replay has audio');
  const byKey = await student.evaluate(() => window.__examLog.filter(row => row.method === 'getPeerSolutionByKey').at(-1).args[2]);
  assert.match(byKey, /^mock-teacher:/, 'the shared (checked) teacher solution, not the fixed fixture');
  await student.screenshot({ path: `${out}/student-teacher.png` });
  await student.getByTestId('exam-peer-back').click();

  // 2번: 선생님이 채점하지 않았으니 🎓이 없다.
  await student.getByRole('button', { name: '다음 문항', exact: true }).click();
  await student.locator('.exam-choice[data-choice="3"]').click(); // 2번 정답은 5
  await student.getByRole('button', { name: '채점해 보기', exact: true }).click();
  await student.getByTestId('exam-free-peer').click();
  await list.waitFor();
  assert.equal(await list.getByText('🎓').count(), 0, 'unchecked teacher question stays private');

  // 선생님이 제출하면 2번도 열린다(기존 동작).
  await admin.bringToFront();
  await admin.getByRole('button', { name: '제출', exact: true }).click();
  await admin.getByRole('button', { name: '제출하기', exact: true }).click();
  await admin.getByTestId('exam-submit-confirm').click();
  await admin.getByTestId('exam-result').waitFor();
  const afterSubmit = await student.evaluate(async () => {
    const attempt = window.__examLog.find(row => row.method === 'checkAnswer').args[0];
    const question = window.__examLog.filter(row => row.method === 'checkAnswer').at(-1).args[1];
    return (await window.__examClient.listPeerSolutions(attempt, question)).some(row => row.label.isTeacher);
  });
  assert.equal(afterSubmit, true, 'submitted teacher attempt opens every question');
  assert.deepEqual(errors, []);
  await context.close();
  console.log('ok — teacher 채점해 보기 uploads first and publishes only that question');
} finally { await browser.close(); }
