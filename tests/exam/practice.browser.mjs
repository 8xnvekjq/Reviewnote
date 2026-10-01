// 기출문제 풀이 화면(시작 → 전체화면 풀이 → OMR 검토 → OMR 결과)을 mock client 하네스로 검증한다.
// 실행: (vite dev 서버가 http://127.0.0.1:5174 에 떠 있어야 함) node tests/exam/practice.browser.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const BASE = 'http://127.0.0.1:5174/tests/exam/practice.html';
const out = 'node_modules/.cache/exam-practice';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });

const LANDSCAPE = { width: 1180, height: 820 };
const PORTRAIT = { width: 820, height: 1180 };

async function open(viewport, query = '') {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}${query}`);
  await page.getByTestId('exam-start').waitFor();
  return { context, page, errors };
}

async function noHorizontalOverflow(page, label) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(scrollWidth <= clientWidth, `${label}: horizontal overflow ${scrollWidth} > ${clientWidth}`);
}

async function startExam(page, modeTitle, elective) {
  await page.getByRole('radio', { name: new RegExp(modeTitle) }).click();
  await page.getByRole('radio', { name: new RegExp(elective) }).click();
  await page.getByTestId('exam-start-button').click();
  await page.getByTestId('exam-solve').waitFor();
}

const question = page => page.getByTestId('exam-solve').getAttribute('data-question');
const strokeCount = page => page.locator('[data-testid="exam-body"] svg').getAttribute('data-stroke-count');

async function drawStroke(page) {
  const box = await page.locator('[data-testid="exam-body"] svg').boundingBox();
  assert.ok(box, 'ink canvas visible');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) await page.mouse.move(box.x + box.width * (0.2 + i * 0.04), box.y + box.height * (0.3 + i * 0.03));
  await page.mouse.up();
}

async function stopwatchMs(page) {
  return Number(await page.getByTestId('exam-stopwatch').getAttribute('data-ms'));
}

async function goToByPad(page, number) {
  await page.getByTestId('exam-counter').click();
  await page.locator(`.exam-pad-cell[data-number="${number}"]`).click();
  assert.equal(await question(page), String(number));
}

async function spinWheel(page, place, steps) {
  const wheel = page.getByRole('spinbutton', { name: place });
  const box = await wheel.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, steps * 40);
  await page.waitForFunction(([name, value]) => document.querySelector(`[role="spinbutton"][aria-label="${name}"]`)?.getAttribute('aria-valuenow') === String(value), [place, steps]);
}

// ── 1. 실전 모드 전체 흐름 (아이패드 가로) ─────────────────────────────────────────
{
  const { context, page, errors } = await open(LANDSCAPE);
  await noHorizontalOverflow(page, 'start/landscape');
  await page.screenshot({ path: `${out}/start-landscape.png` });

  await startExam(page, '실전 모드', '미적분');
  // 풀이 화면이 앱 상단바·하단 탭까지 덮는다
  const solveBox = await page.getByTestId('exam-solve').boundingBox();
  assert.equal(Math.round(solveBox.x), 0);
  assert.equal(Math.round(solveBox.y), 0);
  assert.equal(Math.round(solveBox.width), LANDSCAPE.width);
  assert.equal(Math.round(solveBox.height), LANDSCAPE.height);
  assert.match(await page.getByTestId('exam-remaining').innerText(), /남은 (99|100):\d\d/);
  assert.equal(await question(page), '1');
  await noHorizontalOverflow(page, 'solve/landscape');

  // 객관식: 체크 → 다시 누르면 해제 → 다른 번호(하나만)
  const choice = n => page.locator(`.exam-choice[data-choice="${n}"]`);
  await choice(3).click();
  assert.equal(await choice(3).getAttribute('aria-pressed'), 'true');
  await choice(3).click();
  assert.equal(await choice(3).getAttribute('aria-pressed'), 'false');
  await choice(2).click();
  await choice(4).click();
  assert.equal(await choice(2).getAttribute('aria-pressed'), 'false');
  assert.equal(await choice(4).getAttribute('aria-pressed'), 'true');
  // 🤔
  await page.getByRole('button', { name: '애매해요 표시' }).click();
  assert.equal(await page.getByRole('button', { name: '애매해요 표시' }).getAttribute('aria-pressed'), 'true');

  // 필기 + 스톱워치
  await drawStroke(page);
  assert.equal(await strokeCount(page), '1');
  // 실행 취소 / 다시 실행 / 이 문항 필기 지우기(실행 취소 기록은 지금 보는 문항 안에서만)
  await page.getByRole('button', { name: '실행 취소' }).click();
  assert.equal(await strokeCount(page), '0');
  await page.getByRole('button', { name: '다시 실행' }).click();
  assert.equal(await strokeCount(page), '1');
  await drawStroke(page);
  assert.equal(await strokeCount(page), '2');
  await page.getByRole('button', { name: '이 문항 필기 지우기' }).click();
  assert.equal(await strokeCount(page), '0');
  await page.getByRole('button', { name: '실행 취소' }).click();
  assert.equal(await strokeCount(page), '2');
  await page.getByRole('button', { name: '실행 취소' }).click();
  assert.equal(await strokeCount(page), '1');
  await page.waitForTimeout(1800);

  const q1Time = await stopwatchMs(page);
  assert.ok(q1Time >= 1000, `q1 stopwatch ${q1Time}`);
  await page.screenshot({ path: `${out}/solve-landscape.png` });

  // 다음 → 이전: 답·🤔·필기·시간 유지, 다른 문항 시간은 따로
  await page.getByRole('button', { name: '다음 문항' }).click();
  assert.equal(await question(page), '2');
  assert.equal(await strokeCount(page), '0');
  assert.ok(await stopwatchMs(page) < 1000);
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: '이전 문항' }).click();
  assert.equal(await question(page), '1');
  assert.equal(await strokeCount(page), '1');
  assert.equal(await choice(4).getAttribute('aria-pressed'), 'true');
  assert.equal(await page.getByRole('button', { name: '애매해요 표시' }).getAttribute('aria-pressed'), 'true');
  const q1Back = await stopwatchMs(page);
  assert.ok(q1Back >= q1Time && q1Back < q1Time + 1500, `q1 time kept (${q1Time} → ${q1Back})`);

  // 단답(22번): 휠로 231
  await goToByPad(page, 22);
  assert.equal(await page.getByTestId('exam-short-value').innerText(), '미입력');
  await spinWheel(page, '백의 자리', 2);
  await spinWheel(page, '십의 자리', 3);
  await spinWheel(page, '일의 자리', 1);
  assert.equal(await page.getByTestId('exam-short-value').innerText(), '231');
  // 비우기 → 다시 입력(앞자리 0은 정규화)
  await page.getByRole('button', { name: '비우기' }).click();
  assert.equal(await page.getByTestId('exam-short-value').innerText(), '미입력');
  await spinWheel(page, '일의 자리', 7);
  assert.equal(await page.getByTestId('exam-short-value').innerText(), '7');
  await page.getByRole('button', { name: '비우기' }).click();
  await spinWheel(page, '백의 자리', 2);
  await spinWheel(page, '십의 자리', 3);
  await spinWheel(page, '일의 자리', 1);
  assert.equal(await page.getByTestId('exam-short-value').innerText(), '231');

  // 키보드: → 다음, 숫자키로 객관식
  await page.locator('body').click({ position: { x: 5, y: LANDSCAPE.height - 5 } });
  await page.keyboard.press('ArrowRight');
  assert.equal(await question(page), '23');
  await page.keyboard.press('2');
  assert.equal(await choice(2).getAttribute('aria-pressed'), 'true');
  await page.keyboard.press('ArrowLeft');
  assert.equal(await question(page), '22');
  assert.equal(await page.getByTestId('exam-short-value').innerText(), '231');

  // 번호판 상태
  await page.getByTestId('exam-counter').click();
  assert.equal(await page.locator('.exam-pad-cell[data-number="1"]').getAttribute('data-status'), 'unsure');
  assert.equal(await page.locator('.exam-pad-cell[data-number="22"]').getAttribute('data-status'), 'answered');
  assert.equal(await page.locator('.exam-pad-cell[data-number="3"]').getAttribute('data-status'), 'empty');
  await page.getByRole('button', { name: '닫기' }).click();

  // 자동 저장(디바운스) 호출 확인
  await page.waitForTimeout(3000);
  const saves = await page.evaluate(() => window.__examLog.filter(e => e.method === 'saveProgress'));
  assert.ok(saves.length > 0, 'saveProgress debounced call');
  const lastSave = saves[saves.length - 1].args[1];
  assert.equal(lastSave.find(item => item.questionId === 'q-c-22').answer, '231');

  // OMR 검토: 빈 문항·🤔 강조, 눌러서 이동
  await page.getByRole('button', { name: '제출', exact: true }).click();
  await page.getByTestId('exam-review').waitFor();
  await noHorizontalOverflow(page, 'review/landscape');
  await page.screenshot({ path: `${out}/review-landscape.png` });
  assert.match(await page.locator('.exam-omr-row[data-number="3"]').getAttribute('class'), /is-empty/);
  assert.match(await page.locator('.exam-omr-row[data-number="1"]').getAttribute('class'), /is-unsure/);
  await page.locator('.exam-omr-row[data-number="3"]').click();
  assert.equal(await question(page), '3');
  await page.getByRole('button', { name: '제출', exact: true }).click();
  await page.getByRole('button', { name: '제출하기' }).click();
  await page.getByRole('alertdialog', { name: '제출 확인' }).waitFor();
  await page.getByTestId('exam-submit-confirm').click();

  // OMR 결과: Q1 ④(2점) + Q22 231(4점) + Q23 ②(미적분 2점) = 8점
  await page.getByTestId('exam-result').waitFor();
  assert.equal(await page.getByTestId('exam-score').innerText(), '8');
  assert.match(await page.getByTestId('exam-correct-count').innerText(), /3 \/ 30/);
  assert.equal(await page.getByTestId('exam-grade').innerText(), '8등급'); // 미적분 8등급 컷 = 8
  assert.match(await page.locator('.exam-grade-note').innerText(), /종로학원/);
  assert.match(await page.locator('.exam-item-row[data-number="22"]').innerText(), /전국 오답률 92% 문제를 맞혔어요!/);
  assert.equal(await page.locator('.exam-item-row[data-number="1"]').getAttribute('data-correct'), 'true');
  await noHorizontalOverflow(page, 'result/landscape');
  await page.screenshot({ path: `${out}/result-landscape.png`, fullPage: true });

  // 오답노트 후보: 틀린 문제 + 🤔(1번은 맞혔지만 애매) — 기본은 모두 체크 해제
  const candidates = page.locator('.exam-candidate');
  assert.equal(await candidates.count(), 28);
  assert.equal(await page.locator('.exam-candidate input:checked').count(), 0);
  assert.equal(await page.getByTestId('exam-add-mistakes').isDisabled(), true);
  await page.locator('.exam-candidate[data-number="1"]').click();
  await page.locator('.exam-candidate[data-number="2"]').click();
  await page.getByTestId('exam-add-mistakes').click();
  await page.getByText('2문제를 오답노트에 담았어요.').waitFor();
  assert.equal(await page.locator('.exam-candidate.is-added').count(), 2);
  const addCall = await page.evaluate(() => window.__examLog.find(e => e.method === 'addToMistakes'));
  assert.deepEqual(addCall.args[1].sort(), ['q-c-01', 'q-c-02']);

  // 문항 크게 보기 + 내 필기(읽기 전용, IndexedDB 에서 복원)
  await page.locator('.exam-item-row[data-number="1"]').click();
  await page.getByTestId('exam-viewer').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="exam-viewer"] svg')?.getAttribute('data-stroke-count') === '1');
  await page.getByRole('button', { name: '닫기' }).click();

  // 시험지 목록 → 지난 결과
  await page.getByRole('button', { name: '← 시험지 목록' }).click();
  await page.getByText('지난 OMR 결과').waitFor();
  assert.deepEqual(errors, []);
  await context.close();
  console.log('ok — real mode flow (1180×820)');
}

// ── 2. 자유 모드: 채점해 보기 (아이패드 세로) ─────────────────────────────────────
{
  const { context, page, errors } = await open(PORTRAIT);
  await noHorizontalOverflow(page, 'start/portrait');
  await startExam(page, '자유 모드', '확통');
  assert.equal(await page.getByTestId('exam-remaining').count(), 0);
  await noHorizontalOverflow(page, 'solve/portrait');
  await page.screenshot({ path: `${out}/solve-portrait.png` });

  const check = page.getByRole('button', { name: '채점해 보기' });
  assert.equal(await check.isDisabled(), true);
  await page.locator('.exam-choice[data-choice="3"]').click();
  await check.click();
  await page.getByTestId('exam-freecheck').waitFor();
  assert.equal(await page.getByTestId('exam-freecheck').getAttribute('data-correct'), 'false');
  await page.getByRole('button', { name: '정답 보기' }).click();
  assert.match(await page.getByTestId('exam-freecheck').innerText(), /정답 ④/);
  // 답을 바꾸면 지난 채점 표시는 사라진다
  await page.locator('.exam-choice[data-choice="4"]').click();
  assert.equal(await page.getByTestId('exam-freecheck').count(), 0);
  await check.click();
  await page.getByTestId('exam-freecheck').waitFor();
  assert.equal(await page.getByTestId('exam-freecheck').getAttribute('data-correct'), 'true');

  // 단답 채점(22번 231)
  await goToByPad(page, 22);
  await spinWheel(page, '백의 자리', 2);
  await spinWheel(page, '십의 자리', 3);
  await spinWheel(page, '일의 자리', 1);
  await check.click();
  await page.getByTestId('exam-freecheck').waitFor();
  assert.equal(await page.getByTestId('exam-freecheck').getAttribute('data-correct'), 'true');

  // 번호판·OMR 검토도 세로에서 넘치지 않음
  await page.getByTestId('exam-counter').click();
  await noHorizontalOverflow(page, 'pad/portrait');
  await page.getByRole('button', { name: 'OMR 카드 보기' }).click();
  await noHorizontalOverflow(page, 'review/portrait');
  await page.getByRole('button', { name: '제출하기' }).click();
  await page.getByTestId('exam-submit-confirm').click();
  await page.getByTestId('exam-result').waitFor();
  await noHorizontalOverflow(page, 'result/portrait');
  await page.screenshot({ path: `${out}/result-portrait.png`, fullPage: true });
  assert.deepEqual(errors, []);
  await context.close();
  console.log('ok — free mode check (820×1180)');
}

// ── 3. 나가기 → 새로고침 → 이어 풀기(답·필기 복원) ───────────────────────────────
{
  const { context, page, errors } = await open(LANDSCAPE, '?persist=1');
  await startExam(page, '실전 모드', '기하');
  await page.locator('.exam-choice[data-choice="5"]').click();
  await drawStroke(page);
  await page.getByRole('button', { name: '나가기' }).click();
  await page.getByRole('alertdialog', { name: '나가기 확인' }).waitFor();
  await page.getByTestId('exam-exit-confirm').click();
  await page.getByTestId('exam-resume').waitFor();
  await page.reload();
  await page.getByTestId('exam-resume').waitFor();
  await page.getByRole('button', { name: '이어 풀기' }).click();
  await page.getByTestId('exam-solve').waitFor();
  assert.equal(await page.locator('.exam-choice[data-choice="5"]').getAttribute('aria-pressed'), 'true');
  await page.waitForFunction(() => document.querySelector('[data-testid="exam-body"] svg')?.getAttribute('data-stroke-count') === '1');
  assert.deepEqual(errors, []);
  await context.close();
  console.log('ok — exit, reload, resume');
}

// ── 4. 실전 모드 시간 종료 → 자동 제출 ──────────────────────────────────────────
{
  const { context, page, errors } = await open(LANDSCAPE, '?limit=0.05');
  await startExam(page, '실전 모드', '미적분');
  await page.getByTestId('exam-result').waitFor({ timeout: 15_000 });
  assert.equal(await page.getByTestId('exam-score').innerText(), '0');
  assert.deepEqual(errors, []);
  await context.close();
  console.log('ok — auto submit at 0');
}

// ── 5. 폰 세로에서도 가로 넘침 없음 ─────────────────────────────────────────────
{
  const { context, page } = await open({ width: 390, height: 844 });
  await startExam(page, '실전 모드', '미적분');
  await noHorizontalOverflow(page, 'solve/phone');
  await goToByPad(page, 22);
  await noHorizontalOverflow(page, 'short/phone');
  await page.screenshot({ path: `${out}/solve-phone.png` });
  await context.close();
  console.log('ok — phone layout');
}

await browser.close();
console.log('exam practice browser tests passed');
