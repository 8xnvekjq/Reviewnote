// 기출문제 풀이 화면(시작 → 전체화면 풀이 → OMR 검토 → OMR 결과)을 mock client 하네스로 검증한다.
// v2: 채점해 보기 잠금(새로고침 후에도), 전체 문제 보기(썸네일·스톱워치), 시험지별 진행 카드(A4), 결과 표준점수·백분위.
// 실행: (vite dev 서버가 http://127.0.0.1:5174 에 떠 있어야 함) node tests/exam/practice.browser.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { assertViewerDock, duplicateSubmittedAttempt } from './ui-cleanup.assertions.mjs';
import { assertCompactTopbar } from './compact-topbar.assertions.mjs';

const BASE = `${process.env.EXAM_TEST_BASE_URL || 'http://127.0.0.1:5174'}/tests/exam/practice.html`;
const out = '.test-artifacts/ui-cleanup';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {

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

async function noPaperCardOverlap(page) {
  const cards = await page.getByTestId('exam-paper-card').evaluateAll(nodes => nodes.map(node => {
    const card = node.getBoundingClientRect();
    const children = [...node.children].map(child => child.getBoundingClientRect());
    return {
      title: node.querySelector('.exam-paper-title').textContent,
      contained: children.every(child => child.top >= card.top + 12 && child.bottom <= card.bottom - 12 && child.left >= card.left + 12 && child.right <= card.right - 12),
      separated: children.every((child, index) => index === 0 || child.top >= children[index - 1].bottom),
      bodyFits: node.querySelector('.exam-paper-body').scrollHeight <= node.querySelector('.exam-paper-body').clientHeight + 1,
    };
  }));
  for (const card of cards) {
    assert.ok(card.contained && card.separated && card.bodyFits, `${card.title}: 카드 내용 겹침·넘침 없음`);
  }
}

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
  await page.locator('[data-testid="exam-body"] .exam-ink').waitFor();
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
  await assertCompactTopbar(page);

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
  await assertCompactTopbar(page, { digits: true });
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
  // 담은 문항 중 필기가 있는 1번만 '원래풀이'(문항 이미지 + 서버 필기 PNG)가 스캐폴딩으로 붙는다.
  await page.getByText('원래 풀이 1장도 함께 붙였어요.').waitFor();
  const originalCall = await page.evaluate(() => window.__examLog.find(e => e.method === 'addOriginalSolutions'));
  assert.equal(originalCall.args[0].length, 1);
  assert.equal(originalCall.args[0][0].mistakeId, `mistake-${addCall.args[0]}-q-c-01`);
  assert.equal(originalCall.args[0][0].png, true);

  // 문항 크게 보기 + 내 필기(IndexedDB·서버에서 복원) — 그 위에 덧쓰기는 이 기기에만 남고 서버로 가지 않는다.
  const viewerInk = '[data-testid="exam-viewer"] .exam-ink';
  const viewerStrokes = () => page.locator(viewerInk).getAttribute('data-stroke-count');
  await page.locator('.exam-item-row[data-number="1"]').click();
  await page.getByTestId('exam-viewer').waitFor();
  // 1번은 맞혔지만 🤔 애매 표시 — 틀린 문항처럼 다른 학생 풀이 버튼이 보인다(누르지는 않는다: 아래 요청 수 검사 유지).
  assert.equal(await page.getByTestId('exam-peer-toggle').count(), 1, 'correct but unsure questions offer peer solutions');
  await page.waitForFunction(sel => document.querySelector(sel)?.getAttribute('data-stroke-count') === '1', viewerInk);
  const notesTools = page.getByTestId('exam-notes-tools');
  await notesTools.waitFor();
  assert.equal(await page.getByTestId('exam-viewer').getByRole('button', { name: '실행 취소', exact: true }).isDisabled(), true);
  await page.getByText('서버에 저장된 필기도 문항별로 볼 수 있어요.').waitFor(); // 원래 필기 동기화가 끝난 뒤부터 센다
  const inkRequestsBefore = await page.evaluate(() => window.__inkStats.requests);
  const viewerBox = await page.locator(viewerInk).boundingBox();
  await page.mouse.move(viewerBox.x + viewerBox.width * 0.3, viewerBox.y + 60); await page.mouse.down();
  for (let i = 1; i <= 6; i += 1) await page.mouse.move(viewerBox.x + viewerBox.width * (0.3 + i * 0.03), viewerBox.y + 60 + i * 8);
  await page.mouse.up();
  assert.equal(await viewerStrokes(), '2');
  await page.getByTestId('exam-viewer').getByRole('button', { name: '실행 취소', exact: true }).click();
  assert.equal(await viewerStrokes(), '1');
  await page.getByTestId('exam-viewer').getByRole('button', { name: '다시 실행', exact: true }).click();
  assert.equal(await viewerStrokes(), '2');
  // 필기 순서 보기(재생)는 서버의 원래 필기만 보여 준다. 재생 중에는 쓸 수 없으니 덧쓰기 도구를 숨긴다.
  await page.getByRole('button', { name: '필기 순서 보기', exact: true }).click();
  assert.equal(await notesTools.count(), 0);
  await page.getByTestId('exam-replay-dock').waitFor();
  const notesSlider = page.getByRole('slider', { name: '필기 재생 위치' });
  await notesSlider.focus(); await notesSlider.press('End');
  await page.waitForFunction(sel => document.querySelector(sel)?.getAttribute('data-stroke-count') === '1', viewerInk);
  await page.getByRole('button', { name: '최종 풀이 보기', exact: true }).click();
  assert.equal(await viewerStrokes(), '2');
  // 최종 풀이 보기로 닫으면 도구가 다시 나오고 덧쓴 최종 필기로 돌아온다
  await page.getByRole('button', { name: '필기 순서 보기', exact: true }).click();
  await page.getByTestId('exam-replay-dock').waitFor();
  await page.getByRole('button', { name: '최종 풀이 보기', exact: true }).click();
  await notesTools.getByRole('button', { name: '형광펜', exact: true }).click();
  assert.equal(await page.getByTestId('exam-replay-dock').count(), 0);
  assert.equal(await viewerStrokes(), '2');
  await notesTools.getByRole('button', { name: '펜', exact: true }).click();
  // 휴대폰 뒤로가기는 문항 크게 보기만 닫고 결과 화면에 남는다.
  await page.goBack();
  await page.getByTestId('exam-viewer').waitFor({ state: 'detached' });
  assert.equal(await page.getByTestId('exam-result').isVisible(), true);
  // 다시 열어도 덧쓴 필기가 남아 있고, '원래 풀이로'를 누르면 원래 필기만 남는다.
  await page.locator('.exam-item-row[data-number="1"]').click();
  await page.waitForFunction(sel => document.querySelector(sel)?.getAttribute('data-stroke-count') === '2', viewerInk);
  const notesKeys = () => page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('rn-exam-result-notes:')).length);
  assert.equal(await notesKeys(), 1);
  await page.getByRole('button', { name: '원래 풀이로', exact: true }).click();
  assert.equal(await viewerStrokes(), '1');
  assert.equal(await notesKeys(), 0);
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => window.__inkStats.requests), inkRequestsBefore, 'result-screen notes never hit the ink server');
  await page.getByTestId('exam-viewer').getByRole('button', { name: '닫기', exact: true }).click();

  // 맞혔고 애매 표시도 없는 문항(22번)도 다른 풀이를 볼 수 있다.
  assert.equal(await page.locator('.exam-item-row[data-number="22"] .exam-item-unsure').innerText(), '');
  await page.locator('.exam-item-row[data-number="22"]').click();
  await page.getByTestId('exam-viewer').waitFor();
  assert.equal(await page.getByTestId('exam-peer-toggle').count(), 1, 'correct questions also offer peer solutions');
  await page.getByTestId('exam-viewer').getByRole('button', { name: '닫기', exact: true }).click();

  // 익명 동료 풀이: 요청은 클릭 때만, 재생은 재생 클릭 때만, 메모리 재사용과 내 덧쓰기 보존.
  const peerCalls = method => page.evaluate(name => window.__examLog.filter(row => row.method === name).length, method);
  assert.equal(await peerCalls('listPeerSolutions'), 0);
  await page.locator('.exam-item-row[data-number="2"]').click();
  await page.getByTestId('exam-notes-tools').waitFor();
  const myInk = page.getByTestId('exam-viewer').locator('.exam-ink');
  const myCount = Number(await myInk.getAttribute('data-stroke-count'));
  const myBox = await myInk.boundingBox();
  await page.mouse.move(myBox.x + myBox.width * .2, myBox.y + 50); await page.mouse.down();
  await page.mouse.move(myBox.x + myBox.width * .5, myBox.y + 90); await page.mouse.up();
  assert.equal(Number(await myInk.getAttribute('data-stroke-count')), myCount + 1);
  const storedInk = async () => page.evaluate(async () => {
    const local = Object.fromEntries(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]));
    const databases = await indexedDB.databases();
    const values = [];
    for (const info of databases.sort((a,b) => a.name.localeCompare(b.name))) {
      const db = await new Promise((resolve,reject) => { const r = indexedDB.open(info.name); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
      for (const name of [...db.objectStoreNames].sort()) {
        const read = action => new Promise((resolve,reject) => { const r = db.transaction(name,'readonly').objectStore(name)[action](); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
        values.push({ db:info.name, store:name, keys:await read('getAllKeys'), rows:await read('getAll') });
      }
      db.close();
    }
    return { local, values };
  });
  const beforePeerStorage = await storedInk();
  assert.equal(await peerCalls('listPeerSolutions'), 0);
  await page.getByTestId('exam-peer-toggle').click();
  await page.getByTestId('exam-peer-row').first().click();
  const peerView = page.getByTestId('exam-peer-solution');
  await peerView.waitFor();
  const peerLabel = page.getByTestId('exam-peer-label');
  assert.equal(await peerLabel.getAttribute('aria-label'), '🐱 수학의 신(고2)');
  assert.match((await peerLabel.innerText()).replace(/\s+/g, ' '), /^🐱 👑 수학의 신 ?\(고2\)$/);
  // 칭호는 헤더·랭킹과 같은 getTitleBadgeStyle 배지 — '수학의 신'은 그라데이션+반짝임(animate-pulse) 그대로.
  const peerTitle = peerLabel.getByTestId('exam-peer-title');
  const titleLook = await peerTitle.evaluate(el => ({ cls: el.className, bg: getComputedStyle(el).backgroundImage, anim: getComputedStyle(el).animationName }));
  assert.match(titleLook.cls, /bg-gradient-to-r/); assert.match(titleLook.cls, /animate-pulse/);
  assert.match(titleLook.bg, /gradient/); assert.notEqual(titleLook.anim, 'none');
  // 작은 머리 줄 안에 들어간다(라이트/다크, 가로 화면과 390px).
  for (const size of [LANDSCAPE, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    for (const theme of ['light','dark']) {
      await page.evaluate(async value => { const { applyThemeColor } = await import('/src/utils/theme.ts'); applyThemeColor(value === 'light' ? '#FFFFFF' : undefined); }, theme);
      const fit = await page.evaluate(() => {
        const head = document.querySelector('.exam-peer-head').getBoundingClientRect();
        const title = document.querySelector('[data-testid="exam-peer-title"]').getBoundingClientRect();
        return { inside: title.left >= head.left - 1 && title.right <= head.right + 1, height: title.height };
      });
      assert.ok(fit.inside, `peer title badge stays inside the head (${theme}/${size.width})`);
      assert.ok(fit.height <= 40, `peer title badge stays small: ${fit.height}px`);
      await page.locator('.exam-peer-head').screenshot({ path: `${out}/peer-label-${theme}-${size.width}.png` });
    }
    await page.evaluate(async () => { const { applyThemeColor } = await import('/src/utils/theme.ts'); applyThemeColor(); });
    await noHorizontalOverflow(page, `peer label/${size.width}`);
  }
  await page.setViewportSize(LANDSCAPE);
  assert.match(await peerView.innerText(), /다른 풀이 · 읽기 전용/);
  // 자동 재생이 처음(획 0개)부터 시작한다 — 끝까지 가면 3획(아래 End 확인).
  assert.equal(await peerView.getByTestId('exam-ink-replay').getAttribute('data-replaying'), 'true');
  assert.equal(await peerView.getByTestId('exam-notes-tools').count(), 0);
  await page.getByTestId('exam-viewer').screenshot({ path: `${out}/peer-solution.png` });
  assert.equal(await peerCalls('listPeerSolutions'), 1);
  // 내 풀이처럼 열자마자 필기 순서를 재생한다.
  await peerView.getByTestId('exam-replay-dock').waitFor();
  assert.equal(await peerCalls('getPeerSolutionByKey'), 1);
  // 버튼은 툴바 크기(큰 버튼이 상단을 차지하지 않음)
  const backBox = await page.getByTestId('exam-peer-toggle').boundingBox();
  assert.ok(backBox.height <= 40, `small peer button: ${backBox.height}px`);
  await peerView.getByRole('slider', { name:'필기 재생 위치' }).press('End');
  await page.waitForFunction(() => document.querySelector('[data-testid="exam-peer-solution"] .exam-ink')?.dataset.strokeCount === '3');
  await peerView.getByRole('button', { name:'최종 풀이 보기', exact:true }).click();
  await peerView.getByRole('button', { name:'필기 순서 보기', exact:true }).click();
  await peerView.getByTestId('exam-replay-dock').waitFor();
  assert.equal(await peerCalls('getPeerSolutionByKey'), 1, 'replay reused in memory');
  await assertViewerDock(page, peerView.getByTestId('exam-replay-dock'), page.viewportSize().width);
  assert.deepEqual(await storedInk(), beforePeerStorage, 'peer drawings, replay and position never persist');
  await page.getByTestId('exam-peer-back').click();
  assert.equal(await peerView.count(), 0);
  assert.equal(Number(await myInk.getAttribute('data-stroke-count')), myCount + 1);
  assert.equal(await page.getByTestId('exam-notes-tools').getByRole('button', { name:'실행 취소', exact:true }).isEnabled(),true);
  await page.getByTestId('exam-peer-toggle').click(); await page.getByTestId('exam-peer-row').first().click(); await peerView.waitFor();
  await page.getByTestId('exam-viewer').getByRole('button', { name:'닫기', exact:true }).click();
  await page.locator('.exam-item-row[data-number="2"]').click();
  assert.equal(Number(await page.getByTestId('exam-viewer').locator('.exam-ink').getAttribute('data-stroke-count')), myCount + 1);
  await page.getByTestId('exam-peer-toggle').click(); await page.getByTestId('exam-peer-row').first().click(); await peerView.waitFor();
  assert.equal(await peerCalls('listPeerSolutions'), 3, 'reopening refreshes current candidates');
  await page.getByTestId('exam-viewer').getByRole('button', { name:'닫기', exact:true }).click();
  await page.locator('.exam-item-row[data-number="3"]').click();
  await page.getByTestId('exam-peer-toggle').click();
  await page.getByText('아직 이 문제를 맞힌 다른 풀이가 없어요', { exact:true }).waitFor();
  assert.equal(await page.getByTestId('exam-peer-toggle').isEnabled(),true, 'empty lists remain refreshable');
  await page.getByTestId('exam-viewer').getByRole('button', { name:'닫기', exact:true }).click();

  // 시험지 목록 → 지난 결과
  await page.getByRole('button', { name: '← 시험지 목록' }).click();
  await page.getByText('지난 OMR 결과').waitFor();
  await page.locator('.exam-past-row').first().click();
  await page.getByTestId('exam-result').waitFor();
  await page.locator('.exam-item-row[data-number="2"]').click();
  await page.getByTestId('exam-peer-toggle').click(); await page.getByTestId('exam-peer-row').first().click(); await peerView.waitFor();
  assert.equal(await peerCalls('listPeerSolutions'), 5, 'leaving the result screen releases its memory cache');
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
  await assertCompactTopbar(page);
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
  await assertCompactTopbar(page, { digits: true });
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
  await assertCompactTopbar(page);
  await page.getByTestId('exam-overview-open').click();
  await page.getByTestId('exam-overview').waitFor();
  await noHorizontalOverflow(page, 'overview/phone');
  await page.screenshot({ path: `${out}/overview-phone.png` });
  await page.getByRole('button', { name: '닫기' }).click();
  await goToByOverview(page, 22);
  await noHorizontalOverflow(page, 'short/phone');
  await assertCompactTopbar(page, { digits: true });
  await page.screenshot({ path: `${out}/solve-phone.png` });
  await context.close();
  console.log('ok — phone layout');
}

// ── 5b. 시험지 고르기 구역별 필터: 수능·모평 연도·월 / 내신 연도·학기·중간기말·학교, 한능검은 없음 ─────
{
  const section = (page, kind) => page.locator(`[data-testid="exam-paper-section"][data-section="${kind}"]`);
  const row = (page, kind, key) => section(page, kind).locator(`[data-testid="exam-filter-row"][data-filter="${key}"]`);
  const chip = (page, kind, key, value) => row(page, kind, key).locator(`[data-testid="exam-filter-chip"][data-value="${value}"]`);
  const ids = (page, kind) => section(page, kind).getByTestId('exam-paper-card').evaluateAll(nodes => nodes.map(node => node.dataset.paperId));
  const filterQuery = '?filters=1&admin=1';

  const { context, page, errors } = await open(LANDSCAPE, filterQuery);
  await section(page, 'csat').waitFor();
  // 고3 수능·모평: 최신 순, 연도(학년도)·월 칩 줄.
  assert.deepEqual(await ids(page, 'csat'), ['mock-csat-2026-11', 'mock-csat-2026-06', PAPER_B, PAPER_A]);
  assert.deepEqual(await row(page, 'csat', 'year').getByTestId('exam-filter-chip').allInnerTexts(), ['전체', '2026학년도', '2025학년도']);
  assert.deepEqual(await row(page, 'csat', 'month').getByTestId('exam-filter-chip').allInnerTexts(), ['전체', '수능', '9월 모평', '6월 모평']);
  assert.equal(await chip(page, 'csat', 'year', 'all').getAttribute('aria-pressed'), 'true');
  await chip(page, 'csat', 'year', '2025').click();
  assert.deepEqual(await ids(page, 'csat'), [PAPER_B, PAPER_A]);
  // AND: 2025학년도 + 수능 → 없음 → 필터 초기화.
  await chip(page, 'csat', 'month', '11').click();
  await section(page, 'csat').getByTestId('exam-filter-empty').waitFor();
  assert.match(await section(page, 'csat').getByTestId('exam-filter-empty').innerText(), /조건에 맞는 시험지가 없어요/);
  await section(page, 'csat').getByTestId('exam-filter-reset').click();
  assert.deepEqual((await ids(page, 'csat')).length, 4);
  assert.equal(await chip(page, 'csat', 'month', 'all').getAttribute('aria-pressed'), 'true');
  await chip(page, 'csat', 'year', '2026').click();
  await chip(page, 'csat', 'month', '6').click();
  assert.deepEqual(await ids(page, 'csat'), ['mock-csat-2026-06']);
  // 필터에 가려진 시험지는 풀이 설정도 닫힌다.
  await paperCard(page, 'mock-csat-2026-06').click();
  await page.getByTestId('exam-setup').waitFor();
  await chip(page, 'csat', 'month', '11').click();
  assert.deepEqual(await ids(page, 'csat'), ['mock-csat-2026-11']);
  assert.equal(await page.getByTestId('exam-setup').count(), 0);
  await chip(page, 'csat', 'month', '6').click();
  await page.screenshot({ path: `${out}/filters-1180.png`, fullPage: true });

  // 고1 내신: 학교 3곳·학기 2개·중간/기말 → 칩 줄 4개. AND로 좁힌다.
  await page.getByRole('button', { name: '고1', exact: true }).click();
  await section(page, 'school').waitFor();
  assert.deepEqual(await section(page, 'school').getByTestId('exam-filter-row').evaluateAll(nodes => nodes.map(node => node.dataset.filter)), ['year', 'semester', 'term', 'school']);
  assert.deepEqual(await ids(page, 'school'), ['2026-dongbuk-g1-s2-mid-common2', 'mock-school-2026-s1-final', 'mock-school-2025-s2-final']);
  await chip(page, 'school', 'term', 'final').click();
  assert.deepEqual(await ids(page, 'school'), ['mock-school-2026-s1-final', 'mock-school-2025-s2-final']);
  await chip(page, 'school', 'school', '상일여고').click();
  assert.deepEqual(await ids(page, 'school'), ['mock-school-2025-s2-final']);
  await page.screenshot({ path: `${out}/filters-school-1180.png`, fullPage: true });
  // 한능검은 필터 없음.
  await page.getByRole('button', { name: '한능검', exact: true }).click();
  await page.getByTestId('exam-paper-card').first().waitFor();
  assert.equal(await page.getByTestId('exam-filter-bar').count(), 0);

  // 기기에 기억: 새로고침해도 학년·구역별 선택 그대로(고3 2026학년도·6월, 고1 기말·상일여고).
  await page.reload();
  await section(page, 'csat').waitFor();
  assert.equal(await chip(page, 'csat', 'year', '2026').getAttribute('aria-pressed'), 'true');
  assert.equal(await chip(page, 'csat', 'month', '6').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await ids(page, 'csat'), ['mock-csat-2026-06']);
  await page.getByRole('button', { name: '고1', exact: true }).click();
  assert.deepEqual(await ids(page, 'school'), ['mock-school-2025-s2-final']);
  const stored = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('rn-exam-paper-filters:')));
  assert.equal(stored.length, 1);
  assert.deepEqual(errors, []);
  await context.close();

  const student = await open(LANDSCAPE, '?filters=1');
  await student.page.getByRole('button', { name: '고1', exact: true }).click();
  await section(student.page, 'school').waitFor();
  assert.deepEqual(await section(student.page, 'school').getByTestId('exam-filter-row').evaluateAll(nodes => nodes.map(node => node.dataset.filter)), ['year', 'semester', 'school'], '값이 하나뿐인 중간·기말 줄은 숨김');
  await student.context.close();

  // 820·390: 칩 줄이 넘치면 줄바꿈 대신 가로 스크롤, 페이지 가로 넘침 없음. 라이트 테마도.
  for (const viewport of [PORTRAIT, { width: 390, height: 844 }]) {
    const { context: ctx, page: p, errors: errs } = await open(viewport, filterQuery);
    await section(p, 'csat').waitFor();
    for (const grade of ['고3', '고1']) {
      await p.getByRole('button', { name: grade, exact: true }).click();
      const kind = grade === '고3' ? 'csat' : 'school';
      await section(p, kind).getByTestId('exam-filter-bar').waitFor();
      await noHorizontalOverflow(p, `filters/${grade}/${viewport.width}`);
      const rows = await section(p, kind).getByTestId('exam-filter-row').evaluateAll(nodes => nodes.map(node => ({
        overflowX: getComputedStyle(node).overflowX, spread: (centers => Math.max(...centers) - Math.min(...centers))([...node.children].map(child => { const box = child.getBoundingClientRect(); return (box.top + box.bottom) / 2; })),
      })));
      for (const r of rows) { assert.equal(r.overflowX, 'auto'); assert.ok(r.spread < 4, `칩 줄은 한 줄 (${r.spread})`); }
      await noPaperCardOverlap(p);
      await p.waitForTimeout(250); // 탭 테두리 전환(140ms)이 끝난 뒤 찍는다.
      await p.screenshot({ path: `${out}/filters-${grade === '고3' ? '' : 'school-'}${viewport.width}.png`, fullPage: true });
    }
    // 앱의 흰색 테마(applyThemeColor('#FFFFFF'))와 같은 변수·클래스.
    await p.evaluate(() => {
      const root = document.documentElement;
      for (const [name, value] of [['--theme-bg-main', '255 255 255'], ['--theme-bg-surface', '248 250 252'], ['--theme-bg-elevated', '241 245 249'], ['--theme-header', '255 255 255']]) root.style.setProperty(name, value);
      root.classList.add('theme-light');
    });
    const lightChip = await section(p, 'school').locator('[data-testid="exam-filter-chip"][data-value="all"]').first().evaluate(node => ({ color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor }));
    assert.equal(lightChip.color, 'rgb(15, 23, 42)', '라이트 테마 칩 글자는 진한 남색');
    await p.waitForFunction(() => getComputedStyle(document.querySelector('[data-testid="exam-filter-chip"].is-on')).backgroundColor === 'rgb(238, 242, 255)');
    await p.waitForTimeout(300); // 칩 배경 전환이 끝난 뒤
    await p.screenshot({ path: `${out}/filters-school-${viewport.width}-light.png`, fullPage: true });
    assert.deepEqual(errs, []);
    await ctx.close();
  }
  console.log('ok — paper filters');
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
  const box = await paperCard(page, PAPER_A).boundingBox();
  assert.ok(box.height >= 249.5, `card height ${box.height}`); // CSS subpixel rounding
  await noPaperCardOverlap(page);
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
  for (const theme of ['light','dark']) {
    await page.evaluate(async value => {
      const { applyThemeColor } = await import('/src/utils/theme.ts');
      applyThemeColor(value === 'light' ? '#FFFFFF' : undefined);
    },theme);
    await page.locator('.exam-past').screenshot({ path:`${out}/past-omr-${theme}-${viewport.width}.png` });
    await noHorizontalOverflow(page, `past OMR/${theme}/${viewport.width}`);
  }
  await page.evaluate(async () => { const { applyThemeColor } = await import('/src/utils/theme.ts'); applyThemeColor(); });
  assert.match(await paperCard(page, PAPER_A).innerText(), /최근 1차 · \d+점/);
  assert.doesNotMatch(await paperCard(page, PAPER_A).innerText(), /번 풀었어요|시행/);
  assert.equal(await paperCard(page, PAPER_B).getAttribute('data-state'), 'in-progress');
  await startExam(page, '실전 모드', '미적분', PAPER_A);
  await page.getByRole('button', { name: '나가기' }).click();
  await page.getByTestId('exam-exit-confirm').click();
  await paperCard(page, PAPER_A).getByTestId('exam-paper-progress').waitFor();
  assert.equal(await paperCard(page, PAPER_A).getByTestId('exam-paper-last').count(), 1);
  await noPaperCardOverlap(page);
  await noHorizontalOverflow(page, `start-progress-and-result/${viewport.width}`);
  if (viewport.width === 390) {
    await page.setViewportSize({ width: 320, height: 740 });
    await noPaperCardOverlap(page);
    await noHorizontalOverflow(page, 'start-progress-and-result/320');
  }
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`ok — papers progress separately (${viewport.width}×${viewport.height})`);
}

// ── 9. 회차 기록: 카드 → 기록 → 선택과목 비교 → OMR → 기록 / 이어 풀기 ─────────────
// 시나리오 작성만. 이 작업에서는 Vite와 브라우저를 실행하지 않는다.
for (const viewport of [LANDSCAPE, PORTRAIT, { width: 390, height: 844 }]) {
  const { context, page, errors } = await open(viewport, '?persist=1');
  const historyButton = () => page.locator('.exam-past .exam-past-row').first();
  const submitCurrent = async () => {
    await page.getByRole('button', { name: '제출', exact: true }).click();
    await page.getByRole('button', { name: '제출하기', exact: true }).click();
    await page.getByTestId('exam-submit-confirm').click();
    await page.getByTestId('exam-result').waitFor();
    await page.waitForFunction(() => window.__examLog.some(row => row.method === 'listPaperHistory'));
    if (await page.locator('.exam-result-title').innerText().then(text => text.includes('1\uCC28'))) assert.equal(await page.getByTestId('exam-history').count(), 0);
    await page.getByRole('button', { name: '← 시험지 목록' }).click();
    await paperCard(page).waitFor();
  };
  // 빈 기록에서 새 회차를 시작하면 기존 모드·선택과목 설정으로 이어진다.
  assert.equal(await page.getByTestId('exam-history-open').count(), 0);
  await paperCard(page).click();
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
  if (viewport.width === 390) {
    await page.getByTestId('exam-history').evaluate(el => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `${out}/result-history-390.png` });
  }
  assert.equal(await page.evaluate(() => window.__examLog.filter(row => row.method === 'listPaperHistory').length), 1, 'history loads once per result');
  await page.getByTestId('exam-history-scroll').evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await noHorizontalOverflow(page, `history-scrolled/${viewport.width}`);
  // 제출 회차는 OMR로, 뒤로 돌아오면 같은 시험지의 기록으로.
  await page.locator('[data-testid="exam-history-attempt"][data-round="2"]').click();
  await page.getByTestId('exam-result').waitFor();
  assert.match(await page.locator('.exam-result-title').innerText(), /· 2차/);
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
    assert.ok(bounds.height >= 60 && bounds.height <= 76, '선지 버튼은 60px 이상, 수식 높이에 따라 확장');
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
  await page.screenshot({ path: `${out}/school-ten-${viewport.width}.png` });
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
  await page.getByRole('button', { name: '고1', exact: true }).click();
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
  await duplicateSubmittedAttempt(page);
  await page.locator('.exam-past .exam-past-row').first().click();
  await page.getByTestId('exam-history-table').waitFor();
  assert.equal(await page.getByTestId('exam-history-table').locator('tbody tr').count(), 21);
  assert.equal(await page.getByTestId('exam-history-elective').count(), 0);
  assert.doesNotMatch(await page.getByTestId('exam-history').innerText(), /등급|미적분/);
  assert.match(await page.locator('.exam-result-title').innerText(), /2026 동북고/);
  await noHorizontalOverflow(page, `school-history/${viewport.width}`);
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`ok — school paper: 10-choice, no grades, history (${viewport.width}×${viewport.height})`);
}

for (const viewport of [LANDSCAPE, PORTRAIT, { width: 390, height: 844 }]) {
  for (const level of ['advanced', 'basic']) {
    const { context, page, errors } = await open(viewport, '?persist=1');
    const paperId = `2026-hanneung-79-${level}`;
    assert.equal(await paperCard(page, paperId).count(), 0);
    await page.getByRole('button', { name: '한능검', exact: true }).click();
    assert.equal(await page.getByTestId('exam-paper-card').count(), 2);
    await noPaperCardOverlap(page);
    await paperCard(page, paperId).click();
    assert.match(await page.getByTestId('exam-setup').innerText(), level === 'basic' ? /70분/ : /80분/);
    await page.getByTestId('exam-start-button').click();
    await page.getByTestId('exam-solve').waitFor();
    assert.match(await page.getByTestId('exam-counter').innerText(), /1\s*\/\s*50/);
    assert.equal(await page.locator('.exam-choice').count(), level === 'basic' ? 4 : 5);
    const bodyImage = () => page.locator('[data-testid="exam-body"] .exam-ink img').first().getAttribute('src');
    if (level === 'basic') {
      // 기본: 원본 페이지 통째(페이지 이동·확대).
      assert.match(await page.locator('.exam-page-nav').innerText(), /원본 1 \/ 12쪽/);
    } else {
      // 심화: 수능처럼 한 화면에 한 문항(문항별로 자른 이미지), 원본 페이지 이동·확대 없음.
      assert.equal(await page.locator('.exam-page-nav').count(), 0);
      assert.match(await bodyImage(), /2026-hanneung-79-advanced\/q-01\.jpg$/);
      await page.screenshot({ path: `${out}/hanneung-advanced-q1-${viewport.width}.png` });
    }
    await page.locator('.exam-choice[data-choice="1"]').click();
    if (level === 'basic') {
      await page.keyboard.press('5');
      assert.equal(await page.locator('.exam-choice.is-selected').getAttribute('data-choice'), '1');
      await page.getByRole('button', { name: '원본 확대', exact: true }).click();
      await noHorizontalOverflow(page, `hanneung-zoom/${viewport.width}`);
      await page.getByRole('button', { name: '화면에 맞추기', exact: true }).click();
    }
    await page.getByRole('button', { name: '다음 문항', exact: true }).click();
    if (level === 'basic') assert.match(await page.locator('.exam-page-nav').innerText(), /원본 1 \/ 12쪽/);
    else assert.match(await bodyImage(), /q-02\.jpg$/);
    await noHorizontalOverflow(page, `hanneung-question/${level}/${viewport.width}`);
    await goToByOverview(page, 50);
    if (level === 'basic') assert.match(await page.locator('.exam-page-nav').innerText(), /원본 12 \/ 12쪽/);
    else assert.match(await bodyImage(), /q-50\.jpg$/);
    await page.getByRole('button', { name: '나가기', exact: true }).click();
    await page.getByTestId('exam-exit-confirm').click();
    await page.getByTestId('exam-start').waitFor();
    await page.reload();
    await page.getByRole('button', { name: '한능검', exact: true }).click();
    await paperCard(page, paperId).click();
    await page.getByTestId('exam-solve').waitFor();
    assert.equal(await question(page), '50');
    await page.getByRole('button', { name: '제출', exact: true }).click();
    assert.equal(await page.locator('.exam-omr-row').count(), 50);
    assert.equal(await page.locator('.exam-omr-row[data-number="1"] .exam-omr-bubbles span').count(), level === 'basic' ? 4 : 5);
    await page.getByRole('button', { name: '제출하기', exact: true }).click();
    await page.getByTestId('exam-submit-confirm').click();
    await page.getByTestId('exam-result').waitFor();
    assert.equal(await page.getByTestId('exam-hanneung-grade').innerText(), '미합격');
    assert.equal(await page.getByTestId('exam-score-tiles').count(), 0);
    await page.locator('.exam-item-row[data-number="1"]').click();
    assert.equal(await page.getByTestId('exam-peer-toggle').count(),0, 'hanneung excludes peer solutions');
    await page.getByTestId('exam-viewer').getByRole('button', { name:'닫기',exact:true }).click();
    if (level === 'basic') {
      // 기본은 시대 태그 파일이 없어 시대별 결과를 보여 주지 않는다.
      assert.equal(await page.getByTestId('exam-eras').count(), 0);
      assert.equal(await page.locator('.exam-era-chip').count(), 0);
    } else {
      // 심화: 시대별 결과(표 순서 10개 시대), 1번만 오답으로 답해 모두 0% → 전부 "보충 필요" + 강의 링크.
      const eras = page.getByTestId('exam-eras');
      await eras.waitFor();
      assert.deepEqual(await eras.locator('.exam-era').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-era'))),
        ['prehistory', 'three-kingdoms', 'north-south', 'goryeo', 'joseon-early', 'joseon-late', 'opening', 'colonial', 'modern', 'cross']);
      assert.equal(await eras.locator('.exam-era[data-weak]').count(), 10);
      assert.match(await eras.locator('.exam-era[data-era="prehistory"]').innerText(), /0\/2문항[\s\S]*0\/2점[\s\S]*보충 필요|보충 필요[\s\S]*0\/2문항/);
      const links = eras.getByTestId('exam-era-lecture');
      assert.ok(await links.count() >= 10);
      for (const link of await links.all()) {
        assert.equal(await link.getAttribute('target'), '_blank');
        assert.equal(await link.getAttribute('rel'), 'noopener noreferrer');
        assert.match(await link.getAttribute('href'), /^https:\/\/www\.youtube\.com\//);
      }
      assert.equal(await page.locator('.exam-item-row[data-number="1"] .exam-era-chip').innerText(), '선사·초기 국가');
      assert.equal(await page.locator('.exam-item-row[data-number="50"] .exam-era-chip').innerText(), '시대 통합');
      await eras.screenshot({ path: `${out}/hanneung-eras-${viewport.width}.png` });
    }
    await noHorizontalOverflow(page, `hanneung-result/${viewport.width}`);
    assert.deepEqual(errors, []);
    await context.close();
  }
}

// 관리자 검토(같은 결과 본문)에서도 한능검 심화 시대별 결과가 보인다. 모든 답을 1로 냈으므로 정답이 1인 문항만 맞는다.
for (const viewport of [LANDSCAPE, { width: 390, height: 844 }]) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${BASE}?records=1&recordsPaper=2026-hanneung-79-advanced`);
  await page.locator('.exam-admin-attempt').first().click();
  const review = page.getByTestId('admin-exam-review');
  await review.getByTestId('exam-result').waitFor();
  const eras = review.getByTestId('exam-eras');
  await eras.waitFor();
  assert.equal(await eras.locator('.exam-era').count(), 10);
  assert.ok(await eras.locator('.exam-era[data-weak]').count() >= 1);
  assert.match(await eras.innerText(), /보충 필요|가장 약한 시대/);
  assert.equal(await review.locator('.exam-item-row .exam-era-chip').count(), 50);
  await noHorizontalOverflow(page, `admin-review-eras/${viewport.width}`);
  await eras.screenshot({ path: `${out}/admin-review-eras-${viewport.width}.png` });
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`ok — admin review shows hanneung era results (${viewport.width}×${viewport.height})`);
}

// A fresh browser has no IndexedDB; only the mock server snapshot is copied across devices.
{
  const { context, page } = await open(LANDSCAPE, '?persist=1');
  await startExam(page, '자유 모드', '미적', PAPER_A);
  await drawStroke(page);
  await page.waitForFunction(() => document.querySelector('[data-testid="exam-ink-sync"]')?.getAttribute('data-status') === 'saved');
  const remote = await page.evaluate(() => localStorage.getItem('exam-practice-harness'));
  const other = await browser.newContext({ viewport: PORTRAIT });
  await other.addInitScript(value => localStorage.setItem('exam-practice-harness', value), remote);
  const second = await other.newPage();
  await second.goto(`${BASE}?persist=1`);
  await paperCard(second, PAPER_A).click();
  await second.waitForFunction(() => document.querySelector('[data-testid="exam-body"] .exam-ink')?.getAttribute('data-stroke-count') === '1');
  assert.equal(await strokeCount(second), '1');
  await second.getByRole('button', { name: '제출', exact: true }).click();
  await second.getByRole('button', { name: '제출하기', exact: true }).click();
  await second.getByTestId('exam-submit-confirm').click();
  await second.getByTestId('exam-result').waitFor();
  await second.locator('.exam-item-row[data-number="1"]').click();
  await second.getByRole('button', { name: '필기 순서 보기', exact: true }).click();
  const slider = second.getByRole('slider', { name: '필기 재생 위치' });
  await slider.waitFor();
  await slider.focus(); await slider.press('End');
  await second.waitForFunction(() => document.querySelector('[data-testid="exam-viewer"] .exam-ink')?.getAttribute('data-stroke-count') === '1');
  await slider.press('Home');
  await second.waitForFunction(() => document.querySelector('[data-testid="exam-viewer"] .exam-ink')?.getAttribute('data-stroke-count') === '0');
  await second.getByRole('button', { name: '재생', exact: true }).click();
  await second.waitForFunction(() => document.querySelector('[data-testid="exam-replay-position"]')?.getAttribute('data-step') === '1');
  assert.equal(await second.getByRole('button', { name: '재생', exact: true }).count(), 1); // 끝나면 자동 정지
  await second.screenshot({ path: `${out}/student-replay.png` });
  await other.close(); await context.close();
  console.log('ok — ink and server replay restored on a second device without IndexedDB');
}

// 필기 저장은 바뀐 내용만 보낸다: 획이 쌓여도 한 획 추가 요청은 작게 유지되고, 다른 기기에서 그대로 복원된다.
{
  const { context, page, errors } = await open(LANDSCAPE, '?persist=1');
  await startExam(page, '자유 모드', '미적', PAPER_A);
  const stats = () => page.evaluate(() => ({ ...window.__inkStats }));
  const sizes = [];
  for (let i = 0; i < 6; i += 1) {
    const before = await stats();
    await drawStroke(page);
    await page.waitForFunction(count => window.__inkStats.requests > count
      && document.querySelector('[data-testid="exam-ink-sync"]')?.getAttribute('data-status') === 'saved', before.requests, { timeout: 15000 });
    const after = await stats();
    sizes.push(after.bytes - before.bytes);
  }
  assert.equal(await strokeCount(page), '6');
  const doc = await page.evaluate(() => JSON.parse(localStorage.getItem('exam-practice-harness')).ink.flat(2).find(row => row?.strokes)?.strokes);
  assert.equal(doc.length, 6);
  const docBytes = new TextEncoder().encode(JSON.stringify(doc)).length;
  assert.ok(sizes.every(size => size < 20 * 1024), `per-save bytes ${sizes}`);
  assert.ok(sizes.at(-1) < docBytes / 2, `last save ${sizes.at(-1)}B is a delta, not the ${docBytes}B drawing`);
  assert.ok(Math.max(...sizes) - Math.min(...sizes) < 2048, `request size does not grow with the drawing: ${sizes}`);
  const remote = await page.evaluate(() => localStorage.getItem('exam-practice-harness'));
  const other = await browser.newContext({ viewport: PORTRAIT });
  await other.addInitScript(value => localStorage.setItem('exam-practice-harness', value), remote);
  const second = await other.newPage();
  await second.goto(`${BASE}?persist=1`);
  await paperCard(second, PAPER_A).click();
  await second.waitForFunction(() => document.querySelector('[data-testid="exam-body"] .exam-ink')?.getAttribute('data-stroke-count') === '6');
  assert.deepEqual(errors, []);
  await other.close(); await context.close();
  console.log(`ok — ink saves send deltas (${sizes.join(', ')} bytes per save)`);
}

// Administrator can inspect both submitted and active attempts without editing a student's work.
for (const viewport of [LANDSCAPE, { width: 390, height: 844 }]) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${BASE}?records=1`);
  await page.locator('.exam-admin-attempt').first().waitFor();
  assert.equal(await page.locator('.exam-admin-attempt').count(), 2);
  assert.match(await page.locator('.exam-admin-attempt').first().innerText(), /100점/);
  await page.locator('.exam-admin-attempt').first().click();
  // 제출한 응시: 화면 전체를 덮는 읽기 전용 OMR 결과(오답노트 담기 없음).
  const review = page.getByTestId('admin-exam-review');
  await review.waitFor();
  const reviewBox = await review.boundingBox();
  assert.ok(reviewBox.width >= viewport.width - 1 && reviewBox.height >= viewport.height - 1, 'review covers the whole screen');
  assert.match(await review.innerText(), /테스트 학생 학생/);
  assert.match(await review.innerText(), /읽기 전용/);
  await review.getByTestId('exam-result').waitFor();
  assert.equal(await review.getByTestId('exam-candidates').count(), 0);
  assert.equal(await review.getByTestId('exam-history').count(), 0);
  assert.equal(await page.evaluate(() => window.__examLog.filter(row => row.method === 'listPaperHistory').length), 0);
  assert.match(await review.locator('.exam-item-row[data-number="1"]').innerText(), /학생 답/);
  await noHorizontalOverflow(page, `admin-review-result/${viewport.width}`);
  await page.screenshot({ path: `${out}/admin-review-result-${viewport.width}.png` });
  await review.locator('.exam-item-row[data-number="1"]').click();
  assert.equal(await page.getByTestId('exam-peer-toggle').count(),0, 'admin review excludes peer solutions');
  const inkSel = '[data-testid="exam-viewer"] .exam-ink';
  await page.locator(inkSel).waitFor();
  // 관리자가 문항을 열면 필기 순서를 바로 불러와 자동 재생한다('다른 풀이 보기'와 같은 문항 위 두 줄 막대).
  const dock = page.getByTestId('exam-replay-dock');
  await dock.waitFor();
  assert.equal(await page.getByRole('button', { name: '최종 풀이 보기', exact: true }).count(), 1);
  await assertViewerDock(page, dock, viewport.width);
  if (viewport.width === 390) await page.screenshot({ path: `${out}/viewer-bottom-dock-390.png` });
  assert.equal(await dock.evaluate(el => el.classList.contains('exam-replay-inline')), true);
  assert.equal(await dock.locator('.exam-replay-dock-head').isVisible(), false, 'no floating 필기 과정 header');
  const slider = page.getByRole('slider', { name: '필기 재생 위치' });
  await slider.waitFor();
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="exam-replay-position"]')?.getAttribute('data-step')) >= 1
    || document.querySelector('[data-testid="exam-replay-dock"] button[aria-label="일시정지"]'), null, { timeout: 3000 });
  // 휴대폰은 [막대·시간] / [재생 버튼·배속] 두 줄, 넓은 화면은 한 줄(다른 풀이 보기와 같은 얇은 막대).
  const sliderBox = await slider.boundingBox();
  const playBox = await dock.locator('.exam-replay-buttons').boundingBox();
  if (viewport.width <= 640) assert.ok(playBox.y >= sliderBox.y + sliderBox.height - 1, 'play buttons sit on the second row');
  else assert.ok(playBox.y < sliderBox.y + sliderBox.height && playBox.y + playBox.height > sliderBox.y, 'one row on wide screens');
  assert.ok((await dock.boundingBox()).height <= (viewport.width <= 640 ? 100 : 56), 'thin replay bar');
  await dock.screenshot({ path: `${out}/admin-review-replay-${viewport.width}.png` });
  // 재생 중에는 쓸 수 없으니 덧쓰기 도구를 숨긴다(최종 풀이 보기로 닫으면 나온다).
  assert.equal(await page.getByTestId('exam-notes-tools').count(), 0);
  // React가 다시 그린 뒤의 상태를 기다린다(버튼 클릭 직후에는 아직 반영 전일 수 있음).
  const expectReplay = (ink, step) => page.waitForFunction(([ink, step]) =>
    document.querySelector('[data-testid="exam-viewer"] .exam-ink')?.getAttribute('data-stroke-count') === ink
    && document.querySelector('[data-testid="exam-replay-position"]')?.getAttribute('data-step') === step, [ink, step], { timeout: 3000 });
  await slider.focus(); await slider.press('Home');
  await expectReplay('0', '0');
  // 이전/다음은 획 경계로 이동(그리기 → 지우기 → 실행 취소 순서의 기록).
  const next = page.getByRole('button', { name: '다음 필기 단계', exact: true });
  const prev = page.getByRole('button', { name: '이전 필기 단계', exact: true });
  await next.click(); await expectReplay('1', '1');
  await next.click(); await expectReplay('0', '2');
  await prev.click(); await expectReplay('1', '1');
  await slider.focus(); await slider.press('End');
  await expectReplay('1', '3');
  // 슬라이더는 시간 축: 값의 최대가 획 수(3)가 아니라 재생 시간(ms)이다.
  const max = Number(await slider.getAttribute('max'));
  assert.ok(max > 3, `slider max should be milliseconds, got ${max}`);
  assert.match(await page.getByTestId('exam-replay-position').innerText(), /^\d+:\d{2} \/ \d+:\d{2}/);
  // 재생하면 슬라이더 값이 시간에 따라 조금씩 늘어난다(획마다 한 칸씩 뛰지 않음).
  await page.getByRole('button', { name: '처음', exact: true }).click();
  await page.getByRole('group', { name: '배속', exact: true }).getByRole('button', { name: '1×', exact: true }).click();
  await page.getByRole('button', { name: '재생', exact: true }).click();
  const samples = [];
  for (let i = 0; i < 6; i++) { await page.waitForTimeout(120); samples.push(Number(await slider.inputValue())); }
  assert.ok(new Set(samples).size >= 4, `slider should move smoothly: ${samples}`);
  await page.getByRole('group', { name: '배속', exact: true }).getByRole('button', { name: '4×', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-testid="exam-replay-position"]')?.getAttribute('data-step') === '3');
  const box = await page.locator(inkSel).boundingBox();
  await page.mouse.move(box.x + 30, box.y + 30); await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 90); await page.mouse.up();
  assert.equal(await page.locator(inkSel).getAttribute('data-stroke-count'), '1', 'no writing while replaying');
  // 최종 풀이 보기로 재생을 닫으면 덧쓰기 도구가 나오고 학생 필기 위에 쓸 수 있다(이 기기에서만, 학생 풀이에는 저장 안 됨)
  await page.getByRole('button', { name: '최종 풀이 보기', exact: true }).click();
  assert.equal(await dock.count(), 0);
  assert.match(await page.getByTestId('exam-notes-tools').innerText(), /학생 풀이에는 저장되지 않아요/);
  await page.getByTestId('exam-notes-tools').getByRole('button', { name: '펜', exact: true }).click();
  const paper = await page.locator(inkSel).boundingBox();
  await page.mouse.move(paper.x + 40, paper.y + 40); await page.mouse.down();
  for (let i = 1; i <= 5; i++) await page.mouse.move(paper.x + 40 + i * 15, paper.y + 40 + i * 12);
  await page.mouse.up();
  assert.equal(await page.locator(inkSel).getAttribute('data-stroke-count'), '2', 'admin can write over the student ink');
  await noHorizontalOverflow(page, `admin-student-solution/${viewport.width}`);
  await page.screenshot({ path: `${out}/admin-student-${viewport.width}.png`, fullPage: true });
  // 크게 보기 → 닫기, Esc로 검토 화면 닫기.
  await page.getByTestId('exam-viewer').getByRole('button', { name: '닫기', exact: true }).click();
  await page.keyboard.press('Escape');
  await review.waitFor({ state: 'detached' });
  // 풀이 중인 응시: 문항 칩·학생 답·필기를 크게(아직 정답 없음).
  await page.locator('.exam-admin-attempt').nth(1).click();
  await review.waitFor();
  await page.locator('.exam-admin-paper .exam-ink').waitFor();
  // 풀이 중 검토도 완료된 응시 화면처럼(이미지 480px 이하, 필기가 오른쪽 여백까지 있으면 그만큼 줄임) + 자동 재생.
  await page.locator('.exam-admin-paper [data-testid="exam-replay-dock"]').waitFor();
  const progressImg = await page.locator('.exam-admin-paper .exam-ink img').boundingBox();
  assert.ok(progressImg.width <= 481, `in-progress review image ${progressImg.width}px is not zoomed in`);
  assert.doesNotMatch(await page.locator('.exam-admin-answer').innerText(), /정답/);
  assert.equal(await page.getByRole('button', { name: '제출하기', exact: true }).count(), 0);
  await page.getByRole('button', { name: '다음 문항', exact: true }).click();
  assert.equal(await page.locator('.exam-admin-qchip.is-on').innerText(), '2');
  await noHorizontalOverflow(page, `admin-review-progress/${viewport.width}`);
  await page.screenshot({ path: `${out}/admin-review-progress-${viewport.width}.png` });
  await page.locator('.exam-admin-review-bar').getByRole('button', { name: '← 닫기', exact: true }).click();
  await review.waitFor({ state: 'detached' });
  assert.deepEqual(errors, []);
  await context.close();
}

// 기출문제 풀이 패널(관리자): 시험지 카드 아래 최근 응시자·학생별 최근 점수, 누르면 전체 화면 검토.
for (const viewport of [LANDSCAPE, PORTRAIT, { width: 390, height: 844 }]) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${BASE}?activity=1`);
  const entry = page.locator('.exam-paper-entry').filter({ has: page.locator('[data-testid="exam-paper-card"][data-paper-id="2025-06-math"]') });
  const activity = entry.getByTestId('exam-admin-activity');
  await activity.waitFor();
  assert.equal(await page.getByTestId('exam-admin-latest').count(), 0);
  assert.equal(await page.getByTestId('exam-history-open').count(), 0);
  assert.equal(await activity.locator('details').getAttribute('open'), null);
  const compare = activity.getByTestId('exam-compare-open');
  const summaryBox = await activity.locator('summary').boundingBox();
  const compareBox = await compare.boundingBox();
  const cardBox = await entry.getByTestId('exam-paper-card').boundingBox();
  assert.ok(compareBox.y >= summaryBox.y + summaryBox.height);
  assert.ok(compareBox.width < cardBox.width && compareBox.height <= 40);
  assert.ok(Math.abs(compareBox.x - summaryBox.x) <= 3);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/admin-list-${viewport.width}.png`, fullPage: true });
  // 관리자: 지난 OMR 결과 대신 최근 학생 결과(제출한 학생만, 내 풀이 제외).
  assert.equal(await page.getByRole('region', { name: '지난 OMR 결과' }).count(), 0);
  const recent = page.getByTestId('exam-recent-students');
  assert.equal(await recent.getByTestId('exam-recent-student').count(), 1);
  assert.match(await recent.innerText(), /김학생/);
  assert.doesNotMatch(await recent.innerText(), /이학생|선생님/);
  await activity.locator('summary').click();
  assert.equal(await activity.getByTestId('exam-admin-student').count(), 3);
  assert.match(await activity.getByTestId('exam-admin-student').nth(0).innerText(), /총 2회/);
  assert.match(await activity.getByTestId('exam-admin-student').nth(1).innerText(), /이학생[\s\S]*풀이 중/);
  assert.match(await activity.getByTestId('exam-admin-student').nth(2).innerText(), /내 풀이 · 선생님/);
  await noHorizontalOverflow(page, `admin-activity/${viewport.width}`);
  await page.screenshot({ path: `${out}/admin-activity-${viewport.width}.png`, fullPage: true });
  await activity.getByTestId('exam-admin-student').nth(1).click();
  const review = page.getByTestId('admin-exam-review');
  await review.waitFor();
  assert.match(await review.innerText(), /이학생 학생/);
  await page.locator('.exam-admin-paper .exam-ink').waitFor();
  await page.locator('.exam-admin-review-bar').getByRole('button', { name: '← 닫기', exact: true }).click();
  await review.waitFor({ state: 'detached' });
  await activity.getByTestId('exam-admin-student').first().click();
  await review.getByTestId('exam-result').waitFor();
  await page.keyboard.press('Escape');
  await review.waitFor({ state: 'detached' });
  await recent.getByTestId('exam-recent-student').first().click();
  await review.getByTestId('exam-result').waitFor();
  assert.match(await review.innerText(), /김학생 학생/);
  await page.keyboard.press('Escape');
  await review.waitFor({ state: 'detached' });
  assert.deepEqual(errors, []);
  await context.close();
  console.log(`ok — admin paper activity and full-screen review (${viewport.width}×${viewport.height})`);
}
// 학생(관리자 아님)에게는 응시 현황이 보이지 않는다.
{
  const context = await browser.newContext({ viewport: LANDSCAPE });
  const page = await context.newPage();
  await page.goto(BASE);
  await page.getByTestId('exam-paper-card').first().waitFor();
  await page.waitForTimeout(300);
  assert.equal(await page.getByTestId('exam-admin-activity').count(), 0);
  await context.close();
  console.log('ok — students do not see paper activity');
}

// Era practice: author-only in this worktree; coordinator runs the browser suite.
for (const viewport of [LANDSCAPE, PORTRAIT, { width: 390, height: 844 }]) {
  const { context, page, errors } = await open(viewport);
  await page.getByRole('button', { name: '한능검', exact: true }).click();
  const cards = page.getByTestId('exam-era-card');
  assert.equal(await cards.count(), 10);
  const goryeo = cards.filter({ has: page.locator('.exam-paper-title', { hasText: /^고려$/ }) });
  await goryeo.click();
  assert.equal(await page.getByRole('radio', { name: /실전 모드/ }).count(), 0);
  await page.getByTestId('exam-start-button').click();
  await page.getByTestId('exam-solve').waitFor();
  assert.equal(await page.getByTestId('exam-solve').getAttribute('data-mode'), 'free');
  assert.match(await page.getByTestId('exam-question-source').innerText(), /제74회 \d+번/);
  await page.locator('.exam-choice').first().click();
  await page.getByRole('button', { name: '채점해 보기', exact: true }).click();
  await page.getByTestId('exam-freecheck').waitFor();
  await noHorizontalOverflow(page, `era solve/${viewport.width}`);
  await page.getByRole('button', { name: '제출', exact: true }).click();
  await page.getByRole('button', { name: '제출하기', exact: true }).click();
  await page.getByTestId('exam-submit-confirm').click();
  await page.getByTestId('exam-result').waitFor();
  assert.equal(await page.getByTestId('exam-hanneung-grade').count(), 0);
  assert.equal(await page.getByTestId('exam-grade').count(), 0);
  assert.equal(await page.getByTestId('exam-standard').count(), 0);
  assert.match(await page.getByTestId('exam-result-source').first().innerText(), /제74회 \d+번/);
  assert.equal(await page.locator('.exam-era[data-era="goryeo"]').count(), 1);
  await page.locator('.exam-item-row').first().click();
  assert.equal(await page.getByTestId('exam-peer-toggle').count(),0, 'era sets exclude peer solutions');
  await page.getByTestId('exam-viewer').getByRole('button', { name:'닫기',exact:true }).click();
  await noHorizontalOverflow(page, `era result/${viewport.width}`);
  assert.deepEqual(errors, []);
  await context.close();
}

// Live: author-only in this worktree. The coordinator executes these cases.
for (const viewport of [LANDSCAPE, PORTRAIT, { width: 390, height: 844 }]) {
  const { context, page, errors } = await open(viewport, '?live=1');
  const badge = page.getByTestId('exam-live-badge');
  await badge.waitFor();
  assert.equal(await badge.count(), 1);
  assert.equal(await badge.evaluate(node => node.parentElement.querySelector('[data-paper-id]').dataset.paperId), PAPER_A);
  const heights = await Promise.all([paperCard(page, PAPER_A).boundingBox(), paperCard(page, PAPER_B).boundingBox()]);
  assert.equal(heights[0].height, heights[1].height, 'absolute Live badge preserves card height');
  assert.ok(await badge.evaluate(node => node.getBoundingClientRect().bottom <= node.parentElement.querySelector('.exam-paper-sheet-head').getBoundingClientRect().top), 'corner badge does not cover card text');
  await noHorizontalOverflow(page, `Live badge/${viewport.width}`);
  await page.screenshot({ path: `${out}/live-badge-${viewport.width}.png`, fullPage: true });
  await page.clock.install();
  await badge.click();
  const live = page.getByTestId('exam-live-view');
  await live.waitFor();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="exam-live-cell"]').length === 2);
  const cell = () => live.locator('[data-attempt-id="live-attempt-0"]');
  await page.waitForFunction(() => document.querySelector('[data-attempt-id="live-attempt-0"] .exam-ink')?.dataset.strokeCount === '1');
  const order = () => live.getByTestId('exam-live-cell').evaluateAll(nodes => nodes.map(node => node.dataset.attemptId));
  await page.waitForFunction(() => document.querySelector('[data-testid="exam-live-cell"]')?.dataset.attemptId === 'live-attempt-1');
  assert.deepEqual(await order(), ['live-attempt-1', 'live-attempt-0'], '누적 복습 완료 수 30 → 10 내림차순');
  assert.equal(await page.evaluate(() => window.__live.orderCalls()), 1);
  await page.evaluate(() => { window.__live.setCount(3); window.__live.draw(0); });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="exam-live-cell"]').length === 3
    && document.querySelector('[data-attempt-id="live-attempt-0"] .exam-ink')?.dataset.strokeCount === '2', null, { timeout: 12000 });
  assert.deepEqual((await order()).filter(id => id !== 'live-attempt-2'), ['live-attempt-1', 'live-attempt-0'], '미조회 신규 학생이 있어도 기존 상대 순서 유지');
  await page.clock.runFor(61_000);
  await page.waitForFunction(() => window.__live.orderCalls() === 2);
  assert.deepEqual(await order(), ['live-attempt-1', 'live-attempt-2', 'live-attempt-0'], '신규 학생 완료 수 20은 30과 10 사이에 삽입');
  await page.evaluate(() => window.__live.setCompletedCount(0, 100));
  await page.evaluate(() => window.__live.erase(0));
  await page.waitForFunction(() => document.querySelector('[data-attempt-id="live-attempt-0"] .exam-ink')?.dataset.strokeCount === '1', null, { timeout: 12000 });
  assert.deepEqual(await order(), ['live-attempt-1', 'live-attempt-2', 'live-attempt-0'], '활동·완료 수가 바뀌어도 이미 확정된 순서 유지');
  assert.equal(await page.evaluate(() => window.__live.orderCalls()), 2, '폴링마다 카운트를 조회하지 않는다');
  await noHorizontalOverflow(page, `Live split/${viewport.width}`);
  await page.screenshot({ path: `${out}/live-split-${viewport.width}.png`, fullPage: true });
  for (const back of ['button', 'escape', 'history']) {
    await cell().getByRole('button').click();
    assert.equal(await live.getByTestId('exam-live-cell').count(), 1);
    if (back === 'button') await live.getByRole('button', { name: '← 전체 보기', exact: true }).click();
    else if (back === 'escape') await page.keyboard.press('Escape');
    else await page.evaluate(() => history.back());
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="exam-live-cell"]').length === 3);
  }
  await cell().getByRole('button').click();
  await page.evaluate(() => window.__live.draw(0));
  await page.waitForFunction(() => document.querySelector('[data-attempt-id="live-attempt-0"] .exam-ink')?.dataset.strokeCount === '2', null, { timeout: 12000 });
  await noHorizontalOverflow(page, `Live focus/${viewport.width}`);
  await page.screenshot({ path: `${out}/live-focus-${viewport.width}.png`, fullPage: true });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="exam-live-cell"]').length === 3);
  await page.evaluate(() => window.__live.setCount(0));
  // 모의 시계를 쓰는 화면에서는 목록 폴링 시각도 명시적으로 진행시킨다.
  await page.clock.runFor(5000);
  await live.getByText('지금 풀고 있는 학생이 없어요').waitFor({ timeout: 12000 });
  await page.keyboard.press('Escape');
  await live.waitFor({ state: 'detached' });
  assert.deepEqual(errors, []);
  await context.close();
}
{
  const { context, page } = await open(LANDSCAPE);
  assert.equal(await page.getByTestId('exam-live-badge').count(), 0, 'ordinary students never see Live badges');
  await context.close();
}

// Author-only: the picker refreshes Live badges on its own (5s poll, mock clock) — no reload needed.
{
  const POLL = 5000;
  const context = await browser.newContext({ viewport: LANDSCAPE, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-10-04T09:00:00+09:00') });
  await page.goto(`${BASE}?live=1&livecount=0`);
  await page.getByTestId('exam-start').waitFor();
  await page.clock.runFor(1000);
  const badge = page.getByTestId('exam-live-badge');
  assert.equal(await badge.count(), 0, 'nobody drawing yet');
  const before = await paperCard(page, PAPER_A).boundingBox();
  const calls = () => page.evaluate(() => window.__live.listCalls());
  const firstCalls = await calls();
  // A student starts writing: the badge shows up within one interval, without reloading.
  await page.evaluate(() => { window.__live.setCount(1); window.__live.draw(0); });
  await page.clock.runFor(POLL + 500);
  await badge.waitFor({ timeout: 3000 });
  assert.equal(await calls(), firstCalls + 1, 'exactly one request per interval');
  const after = await paperCard(page, PAPER_A).boundingBox();
  assert.deepEqual(after, before, 'badge appearing does not move the card');
  // Fullscreen Live hides the picker: its badge requests stop until it is closed.
  await badge.click();
  const liveView = page.getByTestId('exam-live-view');
  await liveView.waitFor();
  const coveredCalls = await calls();
  await page.clock.runFor(POLL * 3);
  assert.equal(await calls(), coveredCalls, 'covered picker does not poll');
  await liveView.getByRole('button', { name: '← 닫기', exact: true }).click();
  await liveView.waitFor({ state: 'detached' });
  await page.waitForFunction(n => window.__live.listCalls() === n + 1, coveredCalls, { timeout: 3000 });
  // Hidden tab: no requests; back to visible: one immediate refresh.
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const hiddenCalls = await calls();
  await page.clock.runFor(POLL * 5);
  assert.equal(await calls(), hiddenCalls, 'hidden tab does not poll');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(n => window.__live.listCalls() === n + 1, hiddenCalls, { timeout: 3000 });
  // 10 minutes without new ink: the badge goes away on the next tick, card stays put.
  await page.clock.runFor(10 * 60_000 + POLL);
  await badge.waitFor({ state: 'detached', timeout: 3000 });
  assert.deepEqual(await paperCard(page, PAPER_A).boundingBox(), before, 'badge leaving does not move the card');
  assert.deepEqual(errors, []);
  await context.close();
}

// 작성만: Live의 revision별 필기 조회, 최근 활동 정렬, 탭 숨김과 복귀, 10분 만료를 함께 검증한다.
{
  const context = await browser.newContext({ viewport: LANDSCAPE });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-10-05T09:00:00+09:00') });
  await page.goto(`${BASE}?live=1&livecount=3`);
  await page.getByTestId('exam-live-badge').click();
  const live = page.getByTestId('exam-live-view');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="exam-live-cell"] .exam-ink').length === 3);
  const order = () => live.getByTestId('exam-live-cell').evaluateAll(nodes => nodes.map(node => node.dataset.attemptId));
  const calls = () => page.evaluate(() => ({ exam: window.__live.examCalls(), ink: window.__live.inkCalls(), order: window.__live.orderCalls() }));
  const expected = ['live-attempt-1', 'live-attempt-2', 'live-attempt-0'];
  await page.waitForFunction(() => document.querySelector('[data-testid="exam-live-cell"]')?.dataset.attemptId === 'live-attempt-1');
  assert.deepEqual(await order(), expected);
  const initial = await calls();
  await page.clock.runFor(15_500);
  assert.ok((await calls()).exam > initial.exam, '목록은 5초 주기로 갱신한다');
  assert.equal((await calls()).ink, initial.ink, 'revision이 같으면 필기 RPC를 보내지 않는다');
  assert.equal((await calls()).order, initial.order, '목록 구성원이 같으면 카운트 RPC를 보내지 않는다');
  await page.evaluate(() => window.__live.draw(1));
  await page.clock.runFor(5500);
  assert.equal((await calls()).ink, initial.ink + 1, '바뀐 학생의 필기만 1회 조회한다');
  assert.deepEqual(await order(), expected, '서버 활동순이 바뀌어도 완료 수 기준 확정 위치를 유지한다');
  await live.locator('[data-attempt-id="live-attempt-1"] button').click();
  await page.evaluate(() => window.__live.draw(0));
  await page.clock.runFor(5500);
  assert.deepEqual(await order(), ['live-attempt-1'], '다른 학생이 갱신돼도 확대 대상 유지');
  await live.getByRole('button', { name: '← 전체 보기', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="exam-live-cell"]').length === 3);
  assert.deepEqual(await order(), expected, '뒤로가기 후 전체 순서 유지');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const hidden = await calls();
  await page.clock.runFor(20_000);
  assert.deepEqual(await calls(), hidden, '숨긴 탭에서는 목록/필기 RPC 모두 정지');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(n => window.__live.examCalls() === n + 1, hidden.exam);
  assert.equal((await calls()).ink, hidden.ink, '복귀 즉시 목록을 가져오되 기존 revision은 재사용');
  await page.clock.runFor(10 * 60_000 + 5500);
  await live.getByText('지금 풀고 있는 학생이 없어요').waitFor();
  assert.deepEqual(errors, []);
  await context.close();
}

// 작성만: 초기 늦은 카운트 응답은 한 번 적용, 실패는 오류 UI 없이 이름순 대체.
for (const failure of [false, true]) {
  const { context, page, errors } = await open(LANDSCAPE, '?live=1');
  await page.clock.install();
  await page.evaluate(fail => { window.__live.setOrderDelay(10_000); window.__live.setOrderFailure(fail); }, failure);
  await page.getByTestId('exam-live-badge').click();
  const live = page.getByTestId('exam-live-view');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="exam-live-cell"]').length === 2);
  const order = () => live.getByTestId('exam-live-cell').evaluateAll(nodes => nodes.map(node => node.dataset.attemptId));
  assert.deepEqual(await order(), ['live-attempt-0', 'live-attempt-1'], '초기에는 이름순 임시 표시');
  await page.clock.runFor(5500);
  assert.equal(await page.evaluate(() => window.__live.orderCalls()), 1, '진행 중 요청 중복 없음');
  await page.clock.runFor(5500);
  const expected = failure ? ['live-attempt-0', 'live-attempt-1'] : ['live-attempt-1', 'live-attempt-0'];
  assert.deepEqual(await order(), expected, failure ? '실패 이름순 대체' : '첫 응답만 정렬 적용');
  await page.evaluate(() => { window.__live.setCompletedCount(0, 100); window.__live.draw(0); });
  await page.clock.runFor(65_000);
  assert.deepEqual(await order(), expected, '완료 수·활동 갱신 뒤 재정렬 없음');
  assert.equal(await page.evaluate(() => window.__live.orderCalls()), 1, '새 학생 없으면 실패 후에도 재요청 없음');
  assert.equal(await live.getByRole('alert').count(), 0, '카운트 조회 실패는 오류 UI를 만들지 않는다');
  assert.deepEqual(errors, []);
  await context.close();
}

// Author-only: private broadcast lifecycle with a real solving tab and a separate admin tab.
{
  const context = await browser.newContext({ viewport: LANDSCAPE });
  const student = await context.newPage();
  const admin = await context.newPage();
  const errors = [];
  student.on('pageerror', e => errors.push(e.message));
  admin.on('pageerror', e => errors.push(e.message));
  await student.goto(`${BASE}?broadcast=student`);
  await startExam(student, '자유 모드', '미적분');
  await drawStroke(student);
  await student.getByRole('button', { name: '이 문항 필기 지우기', exact: true }).click();
  await student.waitForTimeout(1000);
  assert.equal(await student.evaluate(() => window.__broadcast.log.length), 0, 'no admin means no student broadcasts');
  await admin.goto(`${BASE}?broadcast=admin`);
  await admin.getByTestId('broadcast-open').click();
  await admin.getByTestId('exam-live-cell').waitFor();
  await student.waitForFunction(() => window.__broadcast.log.length === 0);
  // An admin watch heartbeat opens the student's send-only ink channel.
  await admin.waitForFunction(() => window.__broadcast.log.some(m => m.payload.state === 'watching'));
  await admin.waitForFunction(() => document.querySelector('[data-testid="exam-live-broadcast-status"]')?.textContent === '실시간 연결됨');
  assert.equal(await student.getByTestId('exam-live-broadcast-status').count(), 0, 'diagnostics are admin-only');
  await student.waitForFunction(() => window.__broadcast.topics.has('exam-live:2025-06-math'));
  await drawStroke(student);
  await admin.waitForFunction(() => document.querySelector('[data-testid="exam-live-cell"] .exam-ink')?.dataset.strokeCount === '1', null, { timeout: 1500 });
  assert.equal(await student.evaluate(() => window.__inkStats.requests), 0, 'broadcast does not accelerate the five-second save');
  await student.getByRole('button', { name: '이 문항 필기 지우기', exact: true }).click();
  await admin.waitForFunction(() => document.querySelector('[data-testid="exam-live-cell"] .exam-ink')?.dataset.strokeCount === '0', null, { timeout: 1500 });
  const beforeHidden = await student.evaluate(() => window.__broadcast.log.length);
  await admin.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await admin.waitForFunction(() => window.__broadcast.log.at(-1)?.payload.state === 'stopped');
  await student.waitForTimeout(100);
  await drawStroke(student);
  await student.getByRole('button', { name: '실행 취소', exact: true }).click();
  await student.waitForTimeout(1000);
  assert.equal(await student.evaluate(() => window.__broadcast.log.length), beforeHidden, 'hidden admin suppresses broadcasting');
  await admin.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await admin.waitForFunction(() => window.__broadcast.log.at(-1)?.payload.state === 'watching');
  await admin.keyboard.press('Escape');
  await admin.getByTestId('exam-live-view').waitFor({ state: 'detached' });
  await student.waitForTimeout(100);
  const sentAtClose = await student.evaluate(() => window.__broadcast.log.filter(m => m.event === 'ink').length);
  await drawStroke(student);
  await student.waitForTimeout(1000);
  assert.equal(await student.evaluate(() => window.__broadcast.log.filter(m => m.event === 'ink').length), sentAtClose, 'stopped watch suppresses sending');
  await admin.getByTestId('broadcast-open').click();
  await admin.getByTestId('exam-live-cell').waitFor();
  await admin.evaluate(() => window.__broadcast.setConnected(false));
  await admin.waitForFunction(() => document.querySelector('[data-testid="exam-live-broadcast-status"]')?.textContent === '폴링만 · 5초마다 갱신');
  await drawStroke(student);
  // Dropped broadcasts still reconcile through the original save + polling paths.
  await admin.waitForFunction(() => document.querySelector('[data-testid="exam-live-cell"] .exam-ink')?.dataset.strokeCount === '2', null, { timeout: 13000 });
  assert.deepEqual(errors, []);
  await context.close();
}

// Author-only: Live gaps — a poll snapshot taken before the student's 5-second save must not erase
// broadcast strokes, and a question switch never shows ink without its (slow) question image.
{
  const liveStroke = id => ({ id, tool: 'pen', color: '#ef4444', size: 3,
    points: [{ x: .2, y: .5, pressure: .5, t: 0 }, { x: 1.2, y: .6, pressure: .5, t: 100 }] });
  const openHintLive = async () => {
    const opened = await open(LANDSCAPE, '?live=1&hint=1');
    const questions = await opened.page.evaluate(() => window.__live.questions.map(q => ({ id: q.id, number: q.number, imageUrl: q.imageUrl })));
    return { ...opened, questions };
  };
  const startLive = async page => {
    await page.getByTestId('exam-live-badge').click();
    await page.getByTestId('exam-live-view').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-attempt-id="live-attempt-0"] .exam-ink')?.dataset.strokeCount === '1');
  };
  const send = (page, sequence, question, added) => page.evaluate(m => window.__live.broadcast(m), { version: 1, attemptId: 'live-attempt-0',
    questionId: question.id, number: question.number, imageUrl: question.imageUrl, sessionId: 'browser-student', sequence, added, removed: [] });

  {
    const { context, page, errors, questions } = await openHintLive();
    await startLive(page);
    await send(page, 1, questions[0], [{ index: 1, stroke: liveStroke('hint-1') }]);
    await page.waitForFunction(() => document.querySelector('[data-attempt-id="live-attempt-0"] .exam-ink')?.dataset.strokeCount === '2', null, { timeout: 1500 });
    // The server saves another stroke but not hint-1 yet: the authoritative refresh must keep hint-1.
    await page.evaluate(() => window.__live.draw(0));
    const counts = await page.evaluate(async () => {
      const seen = [];
      const until = Date.now() + 13000;
      while (Date.now() < until) {
        const n = Number(document.querySelector('[data-attempt-id="live-attempt-0"] .exam-ink')?.dataset.strokeCount);
        seen.push(n);
        if (n === 3) break;
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      return seen;
    });
    assert.equal(counts.at(-1), 3, 'server stroke arrives by polling and the broadcast stroke is still there');
    assert.ok(counts.every(n => n >= 2), `broadcast stroke never disappears (${[...new Set(counts)]})`);
    assert.ok(await page.evaluate(() => window.__examLiveStats.vanishedOnPoll === 0), 'diagnostics: no stroke vanished on poll');
    assert.deepEqual(errors, []);
    await context.close();
  }

  {
    const { context, page, errors, questions } = await openHintLive();
    // Question 2's image is slow: its path arrives with the broadcast (no DB request) and is not decoded yet.
    await page.route(url => url.href.includes(questions[1].imageUrl), async route => {
      await new Promise(resolve => setTimeout(resolve, 5000));
      await route.continue();
    });
    await startLive(page);
    const sampling = page.evaluate(async () => {
      const seen = [];
      const until = Date.now() + 9000;
      while (Date.now() < until) {
        const cell = document.querySelector('[data-attempt-id="live-attempt-0"]');
        seen.push({ question: cell?.querySelector('.exam-live-canvas')?.dataset.questionId ?? '',
          painted: cell?.querySelector('.exam-ink')?.dataset.imagePainted ?? 'none',
          pending: !!cell?.querySelector('[data-testid="exam-live-image-pending"]'),
          title: cell?.querySelector('strong')?.textContent ?? '' });
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      return seen;
    });
    await send(page, 1, questions[1], [{ index: 0, stroke: liveStroke('q2-1') }]);
    const samples = await sampling;
    assert.ok(samples.every(x => x.pending || x.painted === 'true'), 'no frame shows ink without its question image');
    const held = samples.filter(x => x.question === questions[0].id);
    assert.ok(held.length > 10, 'previous question stays while the new image downloads');
    assert.ok(held.every(x => x.title.includes(`${questions[0].number}번`)), 'title matches the frame that is shown');
    assert.deepEqual(samples.at(-1), { question: questions[1].id, painted: 'true', pending: false, title: samples.at(-1).title });
    assert.ok(samples.at(-1).title.includes(`${questions[1].number}번`));
    await page.waitForFunction(() => document.querySelector('[data-attempt-id="live-attempt-0"] .exam-ink')?.dataset.strokeCount === '1');
    assert.deepEqual(errors, []);
    await context.close();
  }

  {
    const { context, page, errors, questions } = await openHintLive();
    // Question 2's image fails (loader and the cell's <img>), then the server recovers: the loader retry must
    // also reload the visible <img>, not just clear the notice over a broken image.
    let failing = true;
    await page.route(url => url.href.includes(questions[1].imageUrl), route => (failing ? route.abort() : route.continue()));
    await startLive(page);
    await send(page, 1, questions[1], [{ index: 0, stroke: liveStroke('q2-1') }]);
    const cell = '[data-attempt-id="live-attempt-0"]';
    await page.waitForSelector(`${cell} [data-testid="exam-live-image-failed"]`, { timeout: 15000 });
    assert.equal(await page.evaluate(sel => document.querySelector(`${sel} .exam-live-canvas`)?.dataset.questionId, cell), questions[1].id);
    failing = false;
    await page.waitForSelector(`${cell} [data-testid="exam-live-image-failed"]`, { state: 'detached', timeout: 15000 });
    await page.waitForFunction(sel => {
      const img = document.querySelector(`${sel} .exam-ink img`);
      return img?.complete && img.naturalWidth > 0;
    }, cell, { timeout: 5000 });
    assert.equal(await page.evaluate(sel => document.querySelector(`${sel} .exam-ink`)?.dataset.imagePainted, cell), 'true');
    assert.equal(await page.evaluate(sel => document.querySelector(`${sel} .exam-ink`)?.dataset.strokeCount, cell), '1');
    assert.deepEqual(errors, []);
    await context.close();
  }
}

} finally {
  await browser.close();
}
console.log('exam practice browser tests passed');
