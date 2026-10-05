// 실제 createBroadcastTransport를 로컬 Supabase 채널 API에 연결해 검증한다.
// node tests/exam/assist.browser.mjs (EXAM_TEST_BASE_URL 지원)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = `${process.env.EXAM_TEST_BASE_URL || 'http://127.0.0.1:5174'}/tests/exam/practice.html`;
const paperId = process.env.EXAM_ASSIST_PAPER_ID || '2025-06-math';
const worksheet = paperId !== '2025-06-math';
const query = `transport=supabase&broadcastPaper=${paperId}${worksheet ? '&worksheet=1' : ''}`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1180, height: 820 } });
const student = await context.newPage(), admin = await context.newPage();
const errors = [];
for (const page of [student, admin]) page.on('pageerror', error => errors.push(error.message));
const overlay = page => page.getByTestId('exam-assist-overlay');
const count = page => overlay(page).getAttribute('data-stroke-count');
const draw = async (page, target) => {
  const box = await target.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + 50, box.y + 70);
  await page.mouse.down();
  for (let i = 0; i < 12; i++) await page.mouse.move(box.x + 50 + i * 8, box.y + 70 + i * 3);
  await page.waitForTimeout(160);
  await page.mouse.up();
};
try {
  await student.goto(`${base}?broadcast=student&${query}`);
  if (worksheet) await student.getByRole('button', { name: '중3', exact: true }).click();
  await student.locator(`[data-testid="exam-paper-card"][data-paper-id="${paperId}"]`).click();
  if (!worksheet) {
    await student.getByRole('radio', { name: /자유 모드/ }).click();
    await student.getByRole('radio', { name: /미적분/ }).click();
  }
  await student.getByTestId('exam-start-button').click();
  await student.getByTestId('exam-solve').waitFor();
  await student.waitForFunction(() => [...window.__broadcast.topics].some(t => t.startsWith('exam-assist:')));
  assert.equal(await student.evaluate(() => window.__broadcast.log.length), 0, '미사용 시 메시지 0');
  await admin.goto(`${base}?broadcast=admin&${query}`);
  await admin.getByTestId('broadcast-open').click();
  await admin.getByTestId('exam-live-cell').waitFor();
  assert.equal(await admin.getByRole('button', { name: '도와주기 펜' }).count(), 0, '전체 보기는 읽기 전용');
  await admin.getByRole('button', { name: /방송 학생 풀이 확대/ }).click();
  const pen = admin.getByRole('button', { name: '도와주기 펜', exact: true });
  assert.equal(await pen.getAttribute('aria-pressed'), 'false');
  const offColor = await pen.evaluate(el => getComputedStyle(el).backgroundColor);
  await pen.click();
  await admin.mouse.move(0, 0);
  await admin.waitForTimeout(200);
  const activePen = admin.getByRole('button', { name: '도와주기 펜 켜짐', exact: true });
  assert.equal(await activePen.getAttribute('aria-pressed'), 'true');
  assert.notEqual(await activePen.evaluate(el => getComputedStyle(el).backgroundColor), offColor);
  for (const theme of ['theme-light', 'theme-dark']) {
    await admin.evaluate(async theme => {
      const { applyThemeColor } = await import('/src/utils/theme.ts');
      applyThemeColor(theme === 'theme-light' ? '#FFFFFF' : undefined);
    }, theme);
    assert.deepEqual(await activePen.evaluate(el => ({ background: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color })),
      { background: 'rgb(190, 18, 60)', color: 'rgb(255, 255, 255)' });
    if (theme === 'theme-light') {
      assert.equal(await admin.getByTestId('exam-assist-connection').evaluate(el => getComputedStyle(el).color), 'rgb(51, 65, 85)');
    }
    if (process.env.EXAM_TEST_ARTIFACT_DIR) {
      const directory = `${process.env.EXAM_TEST_ARTIFACT_DIR}/exam-assist`;
      await mkdir(directory, { recursive: true });
      await admin.screenshot({ path: `${directory}/${paperId}-${theme}.png` });
    }
  }
  await admin.waitForFunction(() => [...window.__broadcast.topics].some(t => t.startsWith('exam-assist:')));
  await overlay(admin).waitFor();
  await admin.waitForTimeout(200);
  assert.equal(await overlay(admin).evaluate(el => getComputedStyle(el).outlineWidth), '2px');
  assert.equal(await admin.getByTestId('exam-assist-connection').textContent(), '도와주기 연결됨');
  await admin.evaluate(() => window.__broadcast.setConnected(false));
  assert.equal(await admin.getByTestId('exam-assist-connection').textContent(), '도와주기 연결 대기 중');
  await draw(admin, overlay(admin));
  assert.equal(await count(admin), '0', '미연결이면 로컬 미리보기도 그리지 않는다');
  await admin.evaluate(() => window.__broadcast.setConnected(true));
  await activePen.click();
  assert.equal(await pen.getAttribute('aria-pressed'), 'false');
  await pen.click();
  await admin.evaluate(() => window.__broadcast.setSendFailure(true));
  await draw(admin, overlay(admin));
  assert.equal(await admin.getByTestId('exam-assist-connection').textContent(), '전송 실패 · 다시 그려 주세요');
  assert.equal(await count(student), '0', '전송 실패한 로컬 획은 학생에게 전달되지 않는다');
  // 첫 배치만 실패하고 후속 배치가 성공해도 같은 획의 실패 상태를 유지한다.
  const assistBox = await overlay(admin).boundingBox();
  await admin.mouse.move(assistBox.x + 50, assistBox.y + 70);
  await admin.mouse.down();
  await admin.waitForTimeout(40);
  await admin.evaluate(() => window.__broadcast.setSendFailure(false));
  await admin.mouse.move(assistBox.x + 80, assistBox.y + 90);
  await admin.mouse.up();
  await admin.waitForTimeout(80);
  assert.equal(await admin.getByTestId('exam-assist-connection').textContent(), '전송 실패 · 다시 그려 주세요');
  await admin.getByRole('button', { name: '지우기 (Clear)' }).click();
  await admin.waitForFunction(() => document.querySelector('[data-testid="exam-assist-overlay"]')?.dataset.strokeCount === '0');
  await draw(admin, overlay(admin));
  await student.waitForFunction(() => document.querySelector('[data-testid="exam-assist-overlay"]')?.dataset.strokeCount === '1', null, { timeout: 1500 });
  assert.ok(await overlay(student).evaluate(canvas => canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data.some((v, i) => i % 4 === 3 && v > 0)), '학생 오버레이에 실제 픽셀');
  assert.equal(await student.locator('.exam-ink').getAttribute('data-stroke-count'), '0', '저장 필기는 독립');
  const assistMessages = await admin.evaluate(() => window.__broadcast.log.filter(m => m.event === 'assist'));
  assert.ok(assistMessages.some(m => m.payload.done === false), '획 중 증분 전송');
  assert.ok(assistMessages.every(m => m.topic.startsWith('exam-assist:')), '시험지 단위 팬아웃 없음');
  // 학생 입력 통과: 오버레이 획과 독립적으로 학생 필기 한 획만 저장한다.
  await draw(student, student.locator('.exam-ink'));
  assert.equal(await student.locator('.exam-ink').getAttribute('data-stroke-count'), '1');
  await student.waitForTimeout(5200);
  const docs = await student.evaluate(() => JSON.parse(localStorage.getItem('exam-broadcast-docs') || '[]'));
  assert.equal(docs.reduce((n, doc) => n + doc.strokes.length, 0), 1, '도와주기 획은 저장·재생 데이터에 들어가지 않음');
  await admin.getByRole('button', { name: '지우기 (Clear)' }).click();
  await student.waitForFunction(() => document.querySelector('[data-testid="exam-assist-overlay"]')?.dataset.strokeCount === '0');
  assert.equal(await count(admin), '0');
  // 공유 시계를 전진시켜 10초 유지와 전체 페이드를 검증한다.
  // 두 탭은 같은 context라 가짜 시계를 하나로 공유한다 — 한 번만 설치·전진한다.
  await context.clock.install();
  // 실제 시간이 흐르지 않게 멈춰 두고 runFor로만 전진한다(그리는 동안의 실제 경과가 10초 계산에 섞이지 않게).
  const pauseAt = Date.now() + 1000;
  await context.clock.pauseAt(pauseAt);
  await draw(admin, overlay(admin));
  await context.clock.runFor(200);
  assert.equal(await count(student), '1');
  await context.clock.runFor(9000);
  assert.equal(await count(student), '1');
  await context.clock.runFor(1800);
  assert.equal(await count(student), '0'); assert.equal(await count(admin), '0');
  await draw(admin, overlay(admin));
  await student.clock.runFor(200);
  assert.equal(await count(student), '1');
  await student.getByRole('button', { name: '다음 문항' }).click();
  await student.clock.runFor(50);
  assert.equal(await count(student), '0', '문항 이동 즉시 제거');
  // 새 문항에 학생 필기가 없어도 관리자에게 문항 이동을 전달한다.
  // 시계가 멈춰 있어 waitForFunction(raf 폴링)이 돌지 않는다 — 공유 시계를 조금씩 전진하며 확인한다
  // (학생 방송 배치 750ms·저장 5초·관리자 폴링 5초).
  let switched = false;
  for (let i = 0; i < 12 && !switched; i++) {
    await context.clock.runFor(1000);
    switched = await admin.evaluate(previous => document.querySelector('.exam-live-canvas')?.dataset.questionId !== previous &&
      document.querySelector('[data-testid="exam-assist-overlay"]')?.dataset.strokeCount === '0', assistMessages[0].payload.questionId);
  }
  assert.ok(switched, `관리자 확대 화면이 학생의 다음 문항으로 바뀜: ${JSON.stringify(await student.evaluate(() => window.__broadcast.log.filter(m => m.event === 'ink')))}; ${JSON.stringify(await admin.evaluate(() => ({ stats: window.__examLiveStats, question: document.querySelector('.exam-live-canvas')?.dataset.questionId, assist: document.querySelector('[data-testid="exam-assist-overlay"]')?.dataset.strokeCount })))}`);
  assert.equal(await count(admin), '0', '관리자가 보는 문항도 이동하면 제거');
  await draw(admin, overlay(admin));
  await student.clock.runFor(200);
  assert.equal(await count(student), '1');
  await admin.getByRole('button', { name: /전체 보기/ }).click();
  await admin.getByRole('button', { name: /닫기/ }).click();
  await student.clock.runFor(11_000);
  assert.equal(await count(student), '0', 'Live 종료 후에도 학생 자체 타이머로 만료');
  assert.deepEqual(errors, []);
} finally { await context.close(); await browser.close(); }
console.log(`exam assist browser tests passed (${paperId})`);
