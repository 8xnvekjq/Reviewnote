// 기출문제 풀이 화면(시작 → 전체화면 풀이 → OMR 검토 → OMR 결과)을 mock client 하네스로 검증한다.
// v2: 채점해 보기 잠금(새로고침 후에도), 전체 문제 보기(썸네일·스톱워치), 시험지별 진행 카드(A4), 결과 표준점수·백분위.
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

const PAPER_A = '2025-06-math';
const PAPER_B = 'mock-practice-b';
const paperCard = (page, paperId = PAPER_A) => page.locator(`[data-testid="exam-paper-card"][data-paper-id="${paperId}"]`);

async function startExam(page, modeTitle, elective, paperId = PAPER_A) {
  await paperCard(page, paperId).click();
  await page.getByTestId('exam-setup').waitFor();
  await page.getByRole('radio', { name: new RegExp(modeTitle) }).click();
  await page.getByRole('radio', { name: new RegExp(elective) }).click();
  await page.getByTestId('exam-start-button').click();
  await page.getByTestId('exam-solve').waitFor();
}

const question = page => page.getByTestId('exam-solve').getAttribute('data-question');
const strokeCount = page => page.locator('[data-testid="exam-body"] .exam-ink').getAttribute('data-stroke-count');

async function drawStroke(page) {
  const box = await page.locator('[data-testid="exam-body"] .exam-ink').boundingBox();
  assert.ok(box, 'ink canvas visible');
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.3);
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) await page.mouse.move(box.x + box.width * (0.2 + i * 0.04), box.y + box.height * (0.3 + i * 0.03));
  await page.mouse.up();
}

async function stopwatchMs(page) {
  return Number(await page.getByTestId('exam-stopwatch').getAttribute('data-ms'));
}

const thumb = (page, number) => page.locator(`.exam-thumb[data-number="${number}"]`);

/** 전체 문제 보기(썸네일 격자)에서 문항을 눌러 이동. */
async function goToByOverview(page, number) {
  await page.getByTestId('exam-overview-open').click();
  await page.getByTestId('exam-overview').waitFor();
  await thumb(page, number).click();
  await page.getByTestId('exam-overview').waitFor({ state: 'detached' });
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
  await goToByOverview(page, 22);
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

  // 전체 문제 보기: 썸네일(이미지) 30개, 상태 배지
  await page.getByTestId('exam-counter').click();
  await page.getByTestId('exam-overview').waitFor();
  assert.equal(await page.locator('.exam-thumb').count(), 30);
  assert.equal(await page.locator('.exam-thumb img').count(), 30);
  assert.equal(await thumb(page, 1).getAttribute('data-status'), 'unsure');
  assert.equal(await thumb(page, 22).getAttribute('data-status'), 'answered');
  assert.equal(await thumb(page, 3).getAttribute('data-status'), 'empty');
  assert.match(await thumb(page, 22).getAttribute('class'), /is-current/);
  await noHorizontalOverflow(page, 'overview/landscape');
  await page.screenshot({ path: `${out}/overview-landscape.png` });
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
  // 8점 = 8등급컷 정확히 → 표준점수 71, 백분위 4
  assert.equal(await page.getByTestId('exam-standard').innerText(), '71');
  assert.equal(await page.getByTestId('exam-percentile').innerText(), '4');
  assert.match(await page.locator('.exam-grade-note').innerText(), /추정/);
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
  await page.waitForFunction(() => document.querySelector('[data-testid="exam-viewer"] .exam-ink')?.getAttribute('data-stroke-count') === '1');
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
  // 채점한 문항은 답이 잠긴다: ①~⑤ 비활성, 안내 문구, 채점 버튼 숨김, O/X 는 그대로. 🤔 는 바꿀 수 있다.
  await page.getByTestId('exam-lock-note').waitFor();
  assert.equal(await page.getByTestId('exam-answerbar').getAttribute('data-locked'), 'true');
  for (let n = 1; n <= 5; n += 1) assert.equal(await page.locator(`.exam-choice[data-choice="${n}"]`).isDisabled(), true);
  await page.locator('.exam-choice[data-choice="4"]').click({ force: true });
  assert.equal(await page.locator('.exam-choice[data-choice="3"]').getAttribute('aria-pressed'), 'true');
  await page.locator('body').click({ position: { x: 5, y: PORTRAIT.height - 5 } });
  await page.keyboard.press('4');
  assert.equal(await page.locator('.exam-choice[data-choice="3"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await check.count(), 0);
  assert.equal(await page.getByTestId('exam-freecheck').getAttribute('data-correct'), 'false');
  await page.getByRole('button', { name: '애매해요 표시' }).click();
  assert.equal(await page.getByRole('button', { name: '애매해요 표시' }).getAttribute('aria-pressed'), 'true');
  // 다른 문항으로 갔다 와도 잠금·결과 유지
  await page.getByRole('button', { name: '다음 문항' }).click();
  assert.equal(await page.getByTestId('exam-freecheck').count(), 0);
  await page.getByRole('button', { name: '이전 문항' }).click();
  assert.equal(await page.getByTestId('exam-freecheck').getAttribute('data-correct'), 'false');
  assert.equal(await page.locator('.exam-choice[data-choice="4"]').isDisabled(), true);

  // 단답 채점(22번 231)
  await goToByOverview(page, 22);
  await spinWheel(page, '백의 자리', 2);
  await spinWheel(page, '십의 자리', 3);
  await spinWheel(page, '일의 자리', 1);
  await check.click();
  await page.getByTestId('exam-freecheck').waitFor();
  assert.equal(await page.getByTestId('exam-freecheck').getAttribute('data-correct'), 'true');
  // 단답도 잠김: 휠·비우기 비활성, 휠을 굴려도 값 그대로
  assert.equal(await page.getByRole('spinbutton', { name: '일의 자리' }).getAttribute('aria-disabled'), 'true');
  assert.equal(await page.getByRole('button', { name: '비우기' }).isDisabled(), true);
  const ones = page.getByRole('spinbutton', { name: '일의 자리' });
  const onesBox = await ones.boundingBox();
  await page.mouse.move(onesBox.x + onesBox.width / 2, onesBox.y + onesBox.height / 2);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(200);
  assert.equal(await page.getByTestId('exam-short-value').innerText(), '231');

  // 전체 문제 보기에 채점 결과 배지, OMR 검토도 세로에서 넘치지 않음
  await page.getByTestId('exam-counter').click();
  await page.getByTestId('exam-overview').waitFor();
  assert.equal(await thumb(page, 1).getAttribute('data-checked'), 'false');
  assert.equal(await thumb(page, 22).getAttribute('data-checked'), 'true');
  await noHorizontalOverflow(page, 'overview/portrait');
  await page.screenshot({ path: `${out}/overview-portrait.png` });
  await page.getByRole('button', { name: 'OMR 카드 보기' }).click();
  await noHorizontalOverflow(page, 'review/portrait');
  await page.getByRole('button', { name: '제출하기' }).click();
  await page.getByTestId('exam-submit-confirm').click();
  await page.getByTestId('exam-result').waitFor();
  // 채점해 본 답이 그대로 제출됐다: 1번 ③(틀림), 22번 231(맞음)
  assert.equal(await page.locator('.exam-item-row[data-number="1"]').getAttribute('data-correct'), 'false');
  assert.equal(await page.locator('.exam-item-row[data-number="22"]').getAttribute('data-correct'), 'true');
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
  await page.locator(`[data-testid="exam-paper-card"][data-state="in-progress"]`).waitFor();
  await page.reload();
  await page.locator(`[data-testid="exam-paper-card"][data-state="in-progress"]`).waitFor();
  assert.match(await paperCard(page).innerText(), /푼 문제 1\/30/);
  await paperCard(page).click();
  await page.getByTestId('exam-solve').waitFor();
  assert.equal(await page.locator('.exam-choice[data-choice="5"]').getAttribute('aria-pressed'), 'true');
  await page.waitForFunction(() => document.querySelector('[data-testid="exam-body"] .exam-ink')?.getAttribute('data-stroke-count') === '1');
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
  // 0점: 8등급컷 아래 기울기로 연장(미적분 표준 63), 백분위는 0으로 잘림
  assert.equal(await page.getByTestId('exam-standard').innerText(), '63');
  assert.equal(await page.getByTestId('exam-percentile').innerText(), '0');
  assert.deepEqual(errors, []);
  await context.close();
  console.log('ok — auto submit at 0');
}

// ── 5. 폰 세로에서도 가로 넘침 없음 ─────────────────────────────────────────────
{
  const { context, page } = await open({ width: 390, height: 844 });
  await noHorizontalOverflow(page, 'start/phone');
  await page.screenshot({ path: `${out}/start-phone.png`, fullPage: true });
  await startExam(page, '실전 모드', '미적분');
  await noHorizontalOverflow(page, 'solve/phone');
  await page.getByTestId('exam-overview-open').click();
  await page.getByTestId('exam-overview').waitFor();
  await noHorizontalOverflow(page, 'overview/phone');
  await page.screenshot({ path: `${out}/overview-phone.png` });
  await page.getByRole('button', { name: '닫기' }).click();
  await goToByOverview(page, 22);
  await noHorizontalOverflow(page, 'short/phone');
  await page.screenshot({ path: `${out}/solve-phone.png` });
  await context.close();
  console.log('ok — phone layout');
}

// ── 6. v2: 채점해 본 문항은 새로고침·이어 풀기 뒤에도 잠김 ───────────────────────────
{
  const { context, page, errors } = await open(LANDSCAPE, '?persist=1');
  await startExam(page, '자유 모드', '미적분');
  await page.locator('.exam-choice[data-choice="2"]').click();
  await page.getByRole('button', { name: '채점해 보기' }).click();
  await page.getByTestId('exam-lock-note').waitFor();
  await page.getByRole('button', { name: '나가기' }).click();
  await page.getByTestId('exam-exit-confirm').click();
  await page.reload();
  await paperCard(page).waitFor();
  await paperCard(page).click();
  await page.getByTestId('exam-solve').waitFor();
  assert.equal(await question(page), '1');
  await page.getByTestId('exam-lock-note').waitFor();
  assert.equal(await page.getByTestId('exam-freecheck').getAttribute('data-correct'), 'false');
  assert.equal(await page.locator('.exam-choice[data-choice="2"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.exam-choice[data-choice="4"]').isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: '채점해 보기' }).count(), 0);
  // 서버(목)도 잠긴 답을 지킨다: 저장분에 다른 답이 와도 ② 유지
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('exam-practice-harness')).attempts[0].attempt.items.find(i => i.questionId === 'q-c-01'));
  assert.equal(saved.answer, '2');
  assert.equal(saved.checked.isCorrect, false);
  assert.deepEqual(errors, []);
  await context.close();
  console.log('ok — checked answer stays locked after reload');
}

// ── 7. v2: 전체 문제 보기 — 썸네일로 이동, 열린 동안 스톱워치는 보던 문항에 쌓임 ─────────────
{
  const { context, page, errors } = await open(PORTRAIT);
  await startExam(page, '자유 모드', '기하');
  await page.waitForTimeout(800);
  await page.getByTestId('exam-overview-open').click();
  await page.getByTestId('exam-overview').waitFor();
  const before = await stopwatchMs(page);
  await page.waitForTimeout(1500);
  const during = await stopwatchMs(page);
  assert.ok(during >= before + 1000, `stopwatch keeps running on q1 while overview is open (${before} → ${during})`);
  await thumb(page, 5).click();
  await page.getByTestId('exam-overview').waitFor({ state: 'detached' });
  assert.equal(await question(page), '5');
  assert.ok(await stopwatchMs(page) < 1000, 'q5 starts fresh');
  await goToByOverview(page, 1);
  const q1 = await stopwatchMs(page);
  assert.ok(q1 >= during && q1 < during + 1500, `q1 kept its time (${during} → ${q1})`);
  // 썸네일은 번호 순서
  await page.getByTestId('exam-overview-open').click();
  const numbers = await page.locator('.exam-thumb').evaluateAll(els => els.map(el => Number(el.getAttribute('data-number'))));
  assert.deepEqual(numbers, Array.from({ length: 30 }, (_, i) => i + 1));
  assert.deepEqual(errors, []);
  await context.close();
  console.log('ok — overview thumbnails + stopwatch');
}

// ── 8. v2: 시험지마다 따로 진행 — A 풀다 나와서 B 시작, 둘 다 카드에 진행 표시 ──────────────
for (const viewport of [LANDSCAPE, PORTRAIT, { width: 390, height: 844 }]) {
  const { context, page, errors } = await open(viewport);
  assert.equal(await page.getByTestId('exam-paper-card').count() >= 2, true);
  assert.equal(await paperCard(page, PAPER_A).getAttribute('data-state'), 'new');
  // 카드는 A4 비율(세로/가로 ≈ 1.414, 내용이 넘치면 더 길어질 수만 있다)
  const box = await paperCard(page, PAPER_A).boundingBox();
  assert.ok(box.height / box.width >= 1.4, `A4 card ratio ${box.height / box.width}`);
  await noHorizontalOverflow(page, `start/${viewport.width}`);

  await startExam(page, '자유 모드', '확통', PAPER_A);
  await page.locator('.exam-choice[data-choice="1"]').click();
  await page.getByRole('button', { name: '나가기' }).click();
  await page.getByTestId('exam-exit-confirm').click();
  await page.locator(`[data-testid="exam-paper-card"][data-paper-id="${PAPER_A}"][data-state="in-progress"]`).waitFor();

  await startExam(page, '실전 모드', '기하', PAPER_B);
  await page.locator('.exam-choice[data-choice="2"]').click();
  await page.getByRole('button', { name: '다음 문항' }).click();
  await page.locator('.exam-choice[data-choice="3"]').click();
  await page.getByRole('button', { name: '나가기' }).click();
  await page.getByTestId('exam-exit-confirm').click();
  await page.locator(`[data-testid="exam-paper-card"][data-paper-id="${PAPER_B}"][data-state="in-progress"]`).waitFor();

  assert.equal(await paperCard(page, PAPER_A).getAttribute('data-state'), 'in-progress');
  assert.match(await paperCard(page, PAPER_A).innerText(), /푼 문제 1\/30/);
  assert.match(await paperCard(page, PAPER_A).innerText(), /자유 · 확통/);
  assert.match(await paperCard(page, PAPER_B).innerText(), /푼 문제 2\/30/);
  assert.match(await paperCard(page, PAPER_B).innerText(), /실전 · 기하/);
  assert.match(await paperCard(page, PAPER_B).innerText(), /이어 풀기/);
  assert.equal(await paperCard(page, PAPER_A).locator('[role="progressbar"]').getAttribute('aria-valuenow'), '1');
  await noHorizontalOverflow(page, `start-progress/${viewport.width}`);
  await page.screenshot({ path: `${out}/papers-${viewport.width}.png`, fullPage: true });

  // 진행 중인 시험지는 이어 풀기만: 누르면 바로 그 시험(A는 자유 모드)으로
  await paperCard(page, PAPER_A).click();
  await page.getByTestId('exam-solve').waitFor();
  assert.equal(await page.getByTestId('exam-solve').getAttribute('data-mode'), 'free');
  assert.equal(await page.locator('.exam-choice[data-choice="1"]').getAttribute('aria-pressed'), 'true');
  // 끝까지 내서 결과(표준점수·백분위) → 카드에 최근 점수
  await page.getByRole('button', { name: '제출', exact: true }).click();
  await page.getByRole('button', { name: '제출하기' }).click();
  await page.getByTestId('exam-submit-confirm').click();
  await page.getByTestId('exam-result').waitFor();
  assert.match(await page.getByTestId('exam-standard').innerText(), /^\d+$/);
  assert.match(await page.getByTestId('exam-percentile').innerText(), /^\d+$/);
  await noHorizontalOverflow(page, `result/${viewport.width}`);
  await page.getByRole('button', { name: '← 시험지 목록' }).click();
  await page.locator(`[data-testid="exam-paper-card"][data-paper-id="${PAPER_A}"][data-state="done"]`).waitFor();
  assert.match(await paperCard(page, PAPER_A).innerText(), /최근 1차 · \d+점/);
  assert.match(await paperCard(page, PAPER_A).innerText(), /1번 풀었어요/);
  assert.equal(await paperCard(page, PAPER_B).getAttribute('data-state'), 'in-progress');
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`ok — papers progress separately (${viewport.width}×${viewport.height})`);
}

// ── 9. 회차 기록: 카드 → 기록 → 선택과목 비교 → OMR → 기록 / 이어 풀기 ─────────────
// 시나리오 작성만. 이 작업에서는 Vite와 브라우저를 실행하지 않는다.
for (const viewport of [LANDSCAPE, PORTRAIT, { width: 390, height: 844 }]) {
  const { context, page, errors } = await open(viewport, '?persist=1');
  const historyButton = () => page.locator(`[data-testid="exam-history-open"][data-paper-id="${PAPER_A}"]`);
  const submitCurrent = async () => {
    await page.getByRole('button', { name: '제출', exact: true }).click();
    await page.getByRole('button', { name: '제출하기', exact: true }).click();
    await page.getByTestId('exam-submit-confirm').click();
    await page.getByTestId('exam-result').waitFor();
    await page.getByRole('button', { name: '← 시험지 목록' }).click();
    await paperCard(page).waitFor();
  };
  // 빈 기록에서 새 회차를 시작하면 기존 모드·선택과목 설정으로 이어진다.
  await historyButton().click();
  await page.getByTestId('exam-history-continue').waitFor();
  assert.match(await page.getByTestId('exam-history').innerText(), /아직 풀이 기록이 없어요/);
  assert.equal(await page.getByRole('button', { name: '계속 틀리는 문제만 다시 풀기', exact: true }).isDisabled(), true);
  await page.getByTestId('exam-history-continue').click();
  await page.getByTestId('exam-setup').waitFor();
  await page.getByRole('radio', { name: /자유 모드/ }).click();
  await page.getByRole('radio', { name: /미적분/ }).click();
  await page.getByTestId('exam-start-button').click();
  await page.getByTestId('exam-solve').waitFor();
  await page.locator('.exam-choice[data-choice="2"]').click(); // 1차 1번 오답
  await page.getByRole('button', { name: '애매해요 표시' }).click();
  await submitCurrent();
  await startExam(page, '자유 모드', '미적분');
  await page.locator('.exam-choice[data-choice="4"]').click(); // 2차 새로 맞힘
  await submitCurrent();
  await startExam(page, '자유 모드', '기하'); // 3차 선택과목 변경
  await submitCurrent();
  await startExam(page, '자유 모드', '미적분'); // 4차 진행 중, 채점했어도 기록에 정오 비공개
  await page.locator('.exam-choice[data-choice="4"]').click();
  await page.getByRole('button', { name: '채점해 보기', exact: true }).click();
  await page.getByTestId('exam-lock-note').waitFor();
  await page.getByRole('button', { name: '나가기', exact: true }).click();
  await page.getByTestId('exam-exit-confirm').click();
  await page.getByTestId('exam-start').waitFor();
  // 저장된 목 기록에 문항 시간을 넣어 시간 비교 표시도 확인한다.
  await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('exam-practice-harness'));
    saved.attempts.forEach((entry, index) => {
      entry.attempt.startedAt = new Date(Date.UTC(2026, 9, index + 1, 9)).toISOString();
      if (index > 1) return;
      const time = index === 0 ? 540000 : 240000;
      const q = entry.attempt.questions.find(q => q.number === 23);
      const existing = entry.attempt.items.find(i => i.questionId === q.id);
      if (existing) existing.timeSpentMs = time; // 이미 있는 문항 기록을 고친다(덧붙이면 첫 기록이 읽힌다)
      else entry.attempt.items.push({ questionId: q.id, answer: null, unsure: false, timeSpentMs: time, visits: 1 });
      entry.result.items.find(i => i.number === 23).timeSpentMs = time;
    });
    localStorage.setItem('exam-practice-harness', JSON.stringify(saved));
  });
  await page.reload();
  await paperCard(page).waitFor();
  assert.match(await paperCard(page).innerText(), /4차 진행 중/);
  assert.match(await paperCard(page).innerText(), /최근 3차 · 0점/);
  await historyButton().click();
  await page.getByTestId('exam-history-table').waitFor();
  assert.equal(await page.getByTestId('exam-history-attempt').count(), 4);
  await page.getByTestId('exam-history-trend').waitFor();
  const table = page.getByTestId('exam-history-table');
  assert.equal(await table.locator('tbody tr').count(), 30);
  assert.match(await table.locator('tr[data-number="1"] td[data-round="1"]').innerText(), /X.*🤔/s);
  assert.match(await table.locator('tr[data-number="1"] td[data-round="2"]').innerText(), /O.*새로 맞힘/s);
  const pendingCell = await table.locator('tr[data-number="1"] td[data-round="4"]').innerText();
  assert.match(pendingCell, /응답/); assert.doesNotMatch(pendingCell, /[OX]|새로 맞힘/);
  assert.equal(await table.locator('tr[data-number="30"]').getAttribute('data-persistent-wrong'), 'true');
  assert.equal(await table.locator('tr[data-number="23"] td[data-round="3"]').innerText(), '-');
  assert.match(await table.locator('tr[data-number="23"] .exam-history-time').innerText(), /9분 → 4분/);
  await page.getByTestId('exam-history-elective').selectOption('기하');
  assert.equal(await table.locator('tr[data-number="23"] td[data-round="1"]').innerText(), '-');
  assert.match(await table.locator('tr[data-number="23"] td[data-round="3"]').innerText(), /X 미응답/);
  await noHorizontalOverflow(page, `history/${viewport.width}`);
  await page.getByTestId('exam-history-scroll').evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await noHorizontalOverflow(page, `history-scrolled/${viewport.width}`);
  // 제출 회차는 OMR로, 뒤로 돌아오면 같은 시험지의 기록으로.
  await page.locator('[data-testid="exam-history-attempt"][data-round="2"]').click();
  await page.getByTestId('exam-result').waitFor();
  assert.match(await page.locator('.exam-result-title').innerText(), /· 2차/);
  await page.getByRole('button', { name: '← 풀이 기록', exact: true }).click();
  await page.getByTestId('exam-history-table').waitFor();
  await page.getByTestId('exam-history-continue').click();
  await page.getByTestId('exam-solve').waitFor();
  assert.equal(await page.getByTestId('exam-solve').getAttribute('data-mode'), 'free');
  await page.getByTestId('exam-lock-note').waitFor();
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`ok — paper round history (${viewport.width}×${viewport.height})`);
}

// ── 내신: 작성만. 코디네이터가 Vite·브라우저를 실행해 검증한다. ──
const SCHOOL = '2026-dongbuk-g1-s2-mid-common2';
{
  const { context, page } = await open(PORTRAIT);
  await page.getByRole('button', { name: '고1', exact: true }).click();
  assert.equal(await paperCard(page, SCHOOL).count(), 0, '학생은 비공개 내신을 볼 수 없음');
  await context.close();
}
for (const viewport of [LANDSCAPE, PORTRAIT, { width: 390, height: 844 }]) {
  const { context, page, errors } = await open(viewport, '?admin=1&persist=1');
  assert.equal(await page.getByRole('button', { name: '고3', exact: true }).getAttribute('aria-pressed'), 'true');
  await paperCard(page).click();
  await page.getByTestId('exam-setup').waitFor();
  assert.equal(await paperCard(page, SCHOOL).count(), 0);
  await page.getByRole('button', { name: '고2', exact: true }).click();
  assert.equal(await page.getByTestId('exam-paper-card').count(), 0);
  assert.equal(await page.getByTestId('exam-setup').count(), 0);
  assert.equal(await page.getByText('아직 고2 시험지가 없어요.').count(), 1);
  await noHorizontalOverflow(page, `grade-empty/${viewport.width}`);
  await page.getByRole('button', { name: '고1', exact: true }).click();
  assert.equal(await paperCard(page).count(), 0);
  assert.match(await paperCard(page, SCHOOL).innerText(), /2026.*동북고/s);
  assert.match(await paperCard(page, SCHOOL).innerText(), /21문항/);
  assert.match(await paperCard(page, SCHOOL).innerText(), /검토 중\(학생 비공개\)/);
  await noHorizontalOverflow(page, `school-start/${viewport.width}`);
  await paperCard(page, SCHOOL).click();
  await page.getByTestId('exam-setup').waitFor();
  assert.equal(await page.getByRole('radiogroup', { name: '선택과목' }).count(), 0);
  assert.match(await page.getByRole('radio', { name: /실전 모드/ }).innerText(), /50분/);
  await page.getByRole('radio', { name: /자유 모드/ }).click();
  await page.getByTestId('exam-start-button').click();
  await page.getByTestId('exam-solve').waitFor();
  await goToByOverview(page, 18);
  const choice = n => page.locator(`.exam-choices-ten .exam-choice[data-choice="${n}"]`);
  assert.equal(await page.locator('.exam-choices-ten .exam-choice').count(), 10);
  assert.equal(await page.locator('.exam-choices-ten .katex').count(), 10);
  const mathBounds = await page.locator('.exam-choice-math').evaluateAll(nodes => nodes.map(node => {
    const container = node.getBoundingClientRect();
    const formula = node.querySelector('.katex').getBoundingClientRect();
    return {
      top: formula.top - container.top,
      bottom: container.bottom - formula.bottom,
      height: node.closest('button').getBoundingClientRect().height,
    };
  }));
  for (const bounds of mathBounds) {
    assert.ok(bounds.top >= 0 && bounds.bottom >= 0, '루트·분수가 수식 영역 안에 표시됨');
    assert.equal(Math.round(bounds.height), 76, '선지 버튼 높이 유지');
  }
  const positions = await page.locator('.exam-choices-ten .exam-choice').evaluateAll(nodes => nodes.map(el => ({ x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y })));
  assert.equal(new Set(positions.map(p => Math.round(p.y))).size, 2, '2줄');
  assert.equal(new Set(positions.map(p => Math.round(p.x))).size, 5, '5열');
  await choice(10).click();
  assert.equal(await choice(10).getAttribute('aria-pressed'), 'true');
  await choice(10).click();
  assert.equal(await choice(10).getAttribute('aria-pressed'), 'false');
  await choice(7).click();
  await page.getByRole('button', { name: '애매해요 표시' }).click();
  await noHorizontalOverflow(page, `school-ten/${viewport.width}`);
  await page.screenshot({ path: `node_modules/.cache/exam-practice/school-ten-${viewport.width}.png` });
  await page.getByRole('button', { name: '제출', exact: true }).click();
  await page.getByTestId('exam-review').waitFor();
  const omrAnswer = page.locator('.exam-omr-row[data-number="18"]');
  assert.match(await omrAnswer.innerText(), /⑦/);
  assert.equal(await omrAnswer.locator('.katex').count(), 1, 'OMR 검토에 선지 수식');
  await noHorizontalOverflow(page, `school-review/${viewport.width}`);
  await omrAnswer.click();
  await page.getByRole('button', { name: '채점해 보기', exact: true }).click();
  await page.getByTestId('exam-freecheck').waitFor();
  assert.equal(await page.getByTestId('exam-freecheck').getAttribute('data-correct'), 'true');
  assert.equal(await choice(10).isDisabled(), true);
  // 새로고침 뒤에도 입력·채점 잠금과 선지가 유지된다.
  await page.reload();
  await page.getByTestId('exam-start').waitFor();
  await paperCard(page, SCHOOL).click();
  await page.getByTestId('exam-solve').waitFor();
  await goToByOverview(page, 18);
  await page.getByTestId('exam-lock-note').waitFor();
  assert.equal(await choice(7).getAttribute('aria-pressed'), 'true');
  assert.equal(await choice(10).isDisabled(), true);
  await page.getByRole('button', { name: '제출', exact: true }).click();
  await page.getByRole('button', { name: '제출하기', exact: true }).click();
  await page.getByTestId('exam-submit-confirm').click();
  await page.getByTestId('exam-result').waitFor();
  assert.equal(await page.getByTestId('exam-score').innerText(), '5');
  assert.match(await page.getByTestId('exam-correct-count').innerText(), /1 \/ 21/);
  assert.match(await page.locator('.exam-result-title').innerText(), /2026 동북고/);
  assert.match(await page.locator('.exam-score-card').innerText(), /정답률/);
  assert.doesNotMatch(await page.locator('.exam-score-card').innerText(), /등급|표준점수|백분위|미적분/);
  assert.equal(await page.getByTestId('exam-score-tiles').count(), 0);
  assert.equal(await page.locator('.exam-item-row[data-number="18"] .katex').count(), 2);
  await noHorizontalOverflow(page, `school-result/${viewport.width}`);
  await page.getByRole('button', { name: '← 시험지 목록', exact: true }).click();
  await page.getByRole('button', { name: '고1', exact: true }).click();
  await page.locator(`[data-testid="exam-history-open"][data-paper-id="${SCHOOL}"]`).click();
  await page.getByTestId('exam-history-table').waitFor();
  assert.equal(await page.getByTestId('exam-history-table').locator('tbody tr').count(), 21);
  assert.equal(await page.getByTestId('exam-history-elective').count(), 0);
  assert.doesNotMatch(await page.getByTestId('exam-history').innerText(), /등급|미적분/);
  assert.match(await page.getByTestId('exam-history').innerText(), /2026 동북고/);
  await noHorizontalOverflow(page, `school-history/${viewport.width}`);
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`ok — school paper: 10-choice, no grades, history (${viewport.width}×${viewport.height})`);
}

await browser.close();
console.log('exam practice browser tests passed');
