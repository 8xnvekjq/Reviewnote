// 실행: npm run dev -- --host 127.0.0.1 --port 5174 후 node tests/exam/single-redo.browser.mjs
// DB 규칙은 single-redo-migration.test.ts에서 검증한다. 여기서는 한 문항 RPC 응답을 모의한다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ headless: true, ...(process.env.EXAM_BROWSER_CHANNEL ? { channel: process.env.EXAM_BROWSER_CHANNEL } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${process.env.EXAM_TEST_BASE_URL || 'http://127.0.0.1:5174'}/tests/exam/practice.html?admin=1&persist=1&fakeAudio=1`);
  await page.getByTestId('exam-start').waitFor();
  await page.evaluate(async () => {
    const c = window.__examClient;
    const source = await c.startAttempt('2025-06-math', 'free', '미적분');
    await c.submitAttempt(source.id, [], []);
  });
  await page.reload();
  await page.getByTestId('exam-start').waitFor();
  await page.evaluate(() => {
    const c = window.__examClient;
    c.startSingleRedo = async (sourceId, questionId) => {
      const source = await c.getResult(sourceId);
      const attempt = await c.startAttempt(source.paperId, 'free', source.elective);
      window.__redoId = attempt.id;
      return { ...attempt, attemptKind: 'single_redo', questions: attempt.questions.filter(q => q.id === questionId), items: [] };
    };
    // 서버 요약 모의: 원래 응시 결과에 제출된 다시 풀기의 최신 정답/오답을 붙인다.
    const getResult = c.getResult.bind(c);
    c.getResult = async id => {
      const result = await getResult(id);
      if (!window.__redoId || id === window.__redoId) return result;
      const redo = await getResult(window.__redoId).catch(() => null);
      const item = redo?.items.find(i => i.answer);
      return !item ? result : { ...result, items: result.items.map(i => i.questionId !== item.questionId ? i
        : { ...i, singleRedo: { inProgress: false, latestSubmitted: { submittedAt: redo.submittedAt, isCorrect: item.isCorrect } } }) };
    };
  });
  await page.locator('.exam-past-row').first().click();
  await page.getByTestId('exam-result').waitFor();
  const oldScore = await page.getByTestId('exam-score').innerText();
  await page.locator('.exam-item-row[data-number="1"]').click();
  // 버튼은 확대 화면 상단 바 안에 있다.
  await page.locator('.exam-replay-bar').getByRole('button', { name: '이 문제 다시 풀기', exact: true }).click();
  await page.getByTestId('exam-solve').waitFor();
  assert.equal(await page.getByTestId('exam-solve').getAttribute('data-question'), '1');
  assert.equal(await page.getByRole('button', { name: '채점해 보기', exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '이 문항 필기 지우기', exact: true }).count(), 1, '관리자는 한 번에 지우기를 쓸 수 있다');
  await page.getByTestId('exam-overview-open').click();
  assert.equal(await page.locator('.exam-thumb').count(), 1);
  await page.locator('.exam-thumb').click();
  await page.getByTestId('exam-audio-record').click();
  const ink = page.locator('[data-testid="exam-body"] .exam-ink');
  await ink.waitFor();
  const box = await ink.boundingBox();
  await page.mouse.move(box.x + 80, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 180, box.y + 170, { steps: 10 });
  await page.mouse.up();
  await page.getByRole('group', { name: '1번 답 고르기', exact: true }).getByRole('button', { name: '4번', exact: true }).click();
  await page.getByRole('button', { name: '제출', exact: true }).click();
  await page.getByRole('button', { name: '제출하기', exact: true }).click();
  await page.getByTestId('exam-submit-confirm').click();
  await page.getByTestId('exam-result').waitFor();
  assert.equal(await page.getByTestId('exam-score').innerText(), oldScore);
  // 돌아오자마자 문항 칸·확대 화면 표시가 갱신된다.
  assert.match(await page.locator('.exam-item-row[data-number="1"]').getByTestId('exam-redo-chip').innerText(), /^다시 풂 · (정답|오답)$/);
  assert.equal(await page.getByTestId('exam-redo-chip').count(), 1);
  await page.locator('.exam-item-row[data-number="1"]').click();
  assert.match(await page.getByTestId('exam-redo-notice').innerText(), /^다시 푼 풀이 있음 · (정답|오답) · /);
  assert.equal(await page.getByTestId('exam-redo-question').innerText(), '한 번 더 다시 풀기');
  const evidence = await page.evaluate(async () => ({
    submit: window.__examLog.find(r => r.method === 'submitAttempt' && r.args[0] === window.__redoId),
    ink: await window.__examClient.getInk(window.__redoId),
    audio: window.__examLog.filter(r => r.method === 'uploadSolutionAudio'),
    stopped: window.__audioStats.stops,
  }));
  assert.equal(evidence.submit.args[1].length, 1);
  assert.equal(evidence.submit.args[1][0].questionId, 'q-c-01');
  assert.ok(evidence.ink.length > 0);
  assert.ok(evidence.audio.length > 0 && evidence.stopped > 0);
  assert.deepEqual(errors, []);
  console.log('통과: 관리자 문항 다시 풀기 → 필기·녹음·답 입력 → 한 문항 제출 → 원래 결과 유지');
} finally { await browser.close(); }
