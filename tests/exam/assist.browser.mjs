// 작성만: 코디네이터가 practice mock 하네스의 dev 서버에서 실행한다.
// node tests/exam/assist.browser.mjs (EXAM_TEST_BASE_URL 지원)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = `${process.env.EXAM_TEST_BASE_URL || 'http://127.0.0.1:5174'}/tests/exam/practice.html`;
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
  await student.goto(`${base}?broadcast=student`);
  await student.locator('[data-paper-id="2025-06-math"]').click();
  await student.getByRole('radio', { name: /자유 모드/ }).click();
  await student.getByRole('radio', { name: /미적분/ }).click();
  await student.getByTestId('exam-start-button').click();
  await student.getByTestId('exam-solve').waitFor();
  await student.waitForFunction(() => [...window.__broadcast.topics].some(t => t.startsWith('exam-assist:')));
  assert.equal(await student.evaluate(() => window.__broadcast.log.length), 0, '미사용 시 메시지 0');
  await admin.goto(`${base}?broadcast=admin`);
  await admin.getByTestId('broadcast-open').click();
  await admin.getByTestId('exam-live-cell').waitFor();
  assert.equal(await admin.getByRole('button', { name: '도와주기 펜' }).count(), 0, '전체 보기는 읽기 전용');
  await admin.getByRole('button', { name: /방송 학생 풀이 확대/ }).click();
  await admin.getByRole('button', { name: '도와주기 펜' }).click();
  await admin.waitForFunction(() => [...window.__broadcast.topics].some(t => t.startsWith('exam-assist:')));
  await overlay(admin).waitFor();
  await admin.waitForTimeout(200);
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
  // 두 탭의 performance 시계를 함께 전진시켜 10초 유지와 전체 페이드를 검증한다.
  await student.clock.install(); await admin.clock.install();
  await draw(admin, overlay(admin));
  await student.clock.runFor(200); await admin.clock.runFor(200);
  assert.equal(await count(student), '1');
  await student.clock.runFor(9000); await admin.clock.runFor(9000);
  assert.equal(await count(student), '1');
  await student.clock.runFor(1800); await admin.clock.runFor(1800);
  assert.equal(await count(student), '0'); assert.equal(await count(admin), '0');
  await draw(admin, overlay(admin));
  await student.clock.runFor(200);
  assert.equal(await count(student), '1');
  await student.getByRole('button', { name: '다음 문항' }).click();
  await student.clock.runFor(50);
  assert.equal(await count(student), '0', '문항 이동 즉시 제거');
  await draw(student, student.locator('.exam-ink'));
  await admin.clock.runFor(300);
  await admin.waitForFunction(previous => document.querySelector('.exam-live-canvas')?.dataset.questionId !== previous &&
    document.querySelector('[data-testid="exam-assist-overlay"]')?.dataset.strokeCount === '0', assistMessages[0].payload.questionId);
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
console.log('exam assist browser tests passed');
