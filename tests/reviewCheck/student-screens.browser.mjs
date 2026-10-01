// 학생용 복습체크 "지난 기록" 목록/상세 화면 + 시험 중 문제 이미지 확대(ReviewCheckImageZoom)를
// real component + real supabase-js 클라이언트로 검증한다(grading.browser.mjs와 같은 컨벤션).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const out = 'node_modules/.cache/reviewcheck-student-screens';
await mkdir(out, { recursive: true });

function ts(minutesAgo) { return new Date(Date.now() - minutesAgo * 60000).toISOString(); }

// --- 기록 목록/상세 mock 서버 -------------------------------------------------------------
// 세 세션(graded/submitted/in_progress)을 섞어, in_progress는 목록에서 제외되고 submitted는
// 아직 최종 결과가 아니라 "선생님 확인 중"으로만 안내되는지 확인한다. graded 세션의 두 문항은
// 하나는 정답(mistake-1, finalAnswer 있음), 하나는 오답(mistake-2, finalAnswer 없음 — fallback
// 문구 검증용)으로 섞었다. submitted 세션의 문항은 grade:null(manual_review)로 남겨 "확인 중"
// 차분한 상태를 검증한다.
// 옵션: graded(최근 채점 세션 필드 덮어쓰기), failList(목록 조회만 500), empty(세션 0개).
function historyServer({ graded = {}, failList = false, empty = false } = {}) {
  const sessionGraded = {
    id: 'session-graded', student_id: 'student-1', grade: '공통수학2',
    start_chapter: '평면좌표', end_chapter: '평면좌표', status: 'graded',
    total_count: 2, correct_count: 1, created_at: ts(0),
    submitted_at: ts(5), graded_at: ts(1), graded_by: 'teacher-1',
    ...graded,
  };
  const sessionSubmitted = {
    id: 'session-submitted', student_id: 'student-1', grade: '공통수학2',
    start_chapter: '평면좌표', end_chapter: '평면좌표', status: 'submitted',
    total_count: 1, correct_count: 0, created_at: ts(10),
    submitted_at: ts(9), graded_at: null, graded_by: null,
  };
  const sessionInProgress = {
    id: 'session-inprogress', student_id: 'student-1', grade: '공통수학2',
    start_chapter: '평면좌표', end_chapter: '평면좌표', status: 'in_progress',
    total_count: 1, correct_count: 0, created_at: ts(20),
    submitted_at: null, graded_at: null, graded_by: null,
  };
  // 이미 created_at 내림차순(가장 최근 먼저) — fetchLatestReviewCheckSession(limit 1)과
  // fetchStudentReviewCheckSessions 둘 다 이 순서를 그대로 믿는다.
  const sessions = empty ? [] : [sessionGraded, sessionSubmitted, sessionInProgress];

  const itemsBySession = {
    'session-graded': [
      {
        id: 'item-g1', session_id: 'session-graded', mistake_id: 'mistake-1', position: 0,
        submitted_answer: '5', grade: 'correct',
        ai_verdict: 'correct', ai_confidence: 0.95, ai_reason: '정답과 의미상 일치',
        ai_normalized_student_answer: '5', ai_canonical_answer: '5',
        ai_graded_at: ts(1), ai_grading_version: 1, graded_source: 'ai',
      },
      {
        id: 'item-g2', session_id: 'session-graded', mistake_id: 'mistake-2', position: 1,
        submitted_answer: '오답임', grade: 'incorrect',
        ai_verdict: 'incorrect', ai_confidence: 0.9, ai_reason: '틀린 풀이',
        ai_normalized_student_answer: '오답임', ai_canonical_answer: null,
        ai_graded_at: ts(1), ai_grading_version: 1, graded_source: 'ai',
      },
    ],
    'session-submitted': [
      {
        id: 'item-s1', session_id: 'session-submitted', mistake_id: 'mistake-3', position: 0,
        submitted_answer: '모르겠어요', grade: null,
        ai_verdict: 'manual_review', ai_confidence: 0.3, ai_reason: '학생 답이 모호해 확신할 수 없음',
        ai_normalized_student_answer: null, ai_canonical_answer: null,
        ai_graded_at: ts(9), ai_grading_version: 1, graded_source: null,
      },
    ],
  };

  const api = {};
  api.route = async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname === '127.0.0.1') return route.continue();
    const path = url.pathname;

    if (path.endsWith('/rest/v1/review_check_sessions') && req.method() === 'GET') {
      // fetchLatestReviewCheckSession은 .limit(1).maybeSingle() -> 단일 객체.
      // fetchStudentReviewCheckSessions는 limit 없음 -> 배열.
      if (url.searchParams.has('limit')) {
        // maybeSingle()은 0건이면 406 대신 빈 배열을 기대한다(Accept 헤더) — null 처리.
        return sessions[0]
          ? route.fulfill({ status: 200, json: sessions[0] })
          : route.fulfill({ status: 200, json: [] });
      }
      if (failList) return route.fulfill({ status: 500, json: { message: 'list failed' } });
      return route.fulfill({ status: 200, json: sessions });
    }
    if (path.endsWith('/rest/v1/review_check_items') && req.method() === 'GET') {
      const sessionId = (url.searchParams.get('session_id') || '').replace('eq.', '');
      return route.fulfill({ status: 200, json: itemsBySession[sessionId] || [] });
    }
    return route.abort();
  };
  return api;
}

// --- 시험 중 이미지 확대 mock 서버 --------------------------------------------------------
// 최신 세션을 in_progress로 둬서 ReviewCheckScreen이 곧바로 ReviewCheckQuiz로 진입하게 한다.
function quizZoomServer() {
  const session = {
    id: 'session-q1', student_id: 'student-1', grade: '공통수학2',
    start_chapter: '이차함수와 그래프', end_chapter: '이차함수와 그래프', status: 'in_progress',
    total_count: 1, correct_count: 0, created_at: ts(0),
    submitted_at: null, graded_at: null, graded_by: null,
  };
  const items = [{
    id: 'item-q1', session_id: 'session-q1', mistake_id: 'mistake-3', position: 0,
    submitted_answer: null, grade: null,
    ai_verdict: null, ai_confidence: null, ai_reason: null,
    ai_normalized_student_answer: null, ai_canonical_answer: null,
    ai_graded_at: null, ai_grading_version: null, graded_source: null,
  }];

  const api = {};
  api.route = async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname === '127.0.0.1') return route.continue();
    const path = url.pathname;

    if (path.endsWith('/rest/v1/review_check_sessions') && req.method() === 'GET') {
      return route.fulfill({ status: 200, json: session });
    }
    if (path.endsWith('/rest/v1/review_check_items') && req.method() === 'GET') {
      return route.fulfill({ status: 200, json: items });
    }
    return route.abort();
  };
  return api;
}

async function withPage(context, api, path) {
  await context.route('**/*', api.route);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:5174/tests/reviewCheck/${path}`);
  return { page, errors };
}

try {
  // (a)(b)(c) 지난 기록 목록 -> 상세(정상 채점) -> 상세(아직 manual_review 남음), 모두 390px 모바일 뷰포트.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const api = historyServer();
    const { page, errors } = await withPage(context, api, 'student-screens.html?user=student-1');

    // 최신 세션이 graded라 시작 화면에 "복습체크 결과" 요약이 먼저 보인다.
    await page.getByText('복습체크 결과').waitFor();

    // "나의 복습 흐름": submitted는 횟수에만 들어가고(2회) 점수는 graded 1건(1/2)만으로 계산.
    // in_progress는 어디에도 포함되지 않는다. graded가 1건뿐이라 "지난번보다" 비교는 없다.
    const progress = page.getByRole('region', { name: '나의 복습 흐름' });
    await progress.waitFor();
    await progress.getByText('지금까지 복습체크 2회').waitFor();
    await progress.getByText('평균 정답률 50%').waitFor();
    await progress.getByText('선생님 확인 중 1회는 점수에서 빠져 있어요.').waitFor();
    assert.equal(await progress.getByText(/지난번/).count(), 0, 'graded 1건이면 지난번 비교 문구가 없어야 함');
    const bars = progress.locator('.rn-reviewcheck-trend-col');
    assert.equal(await bars.count(), 1, '막대는 graded 세션만');
    assert.match(await bars.first().getAttribute('aria-label'), /2문제 중 1문제 정답/);
    // 범위 선택 바보다 위에 있어야 한다.
    const progressBox = await progress.boundingBox();
    const rangeBox = await page.locator('.rn-examprep-range-bar').boundingBox();
    assert.ok(progressBox.y + progressBox.height <= rangeBox.y, '요약은 범위 선택 바 위에 있어야 함');
    // 390px에서 페이지가 가로로 넘치지 않아야 한다.
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    // 문항별: 맞은 문제는 눌러지지 않고, 틀린 문제를 누르면 그 문제의 오답카드를 요청한다.
    await progress.getByRole('img', { name: /1번 평면좌표 연습 정답/ }).waitFor();
    await progress.getByRole('button', { name: /2번 직선의 방정식 연습 오답 — 오답카드 열기/ }).click();
    assert.equal(await page.evaluate(() => document.body.dataset.openedMistake), 'mistake-2');
    await page.screenshot({ path: `${out}/progress-summary.png` });

    await page.getByRole('button', { name: '전체 기록 보기 (2회)' }).click();

    // (a) 목록: in_progress 세션은 "기록"이 아니므로 제외 -> 2건만 보여야 함.
    await page.getByText('지난 기록').waitFor();
    const rows = page.locator('.rn-reviewcheck-history-row');
    await rows.first().waitFor();
    assert.equal(await rows.count(), 2, 'in_progress 세션은 기록 목록에 보이면 안 됨');
    await page.getByText('1 / 2문제 정답').waitFor();
    await page.getByText('선생님 확인 중 · 1문제').waitFor();

    // graded 세션 상세로 이동
    await rows.first().click();

    // (b) 상세: 제출한 답 / 저장된 정답(+fallback) / 최종 O,X(item.grade 그대로) / AI 풀이,
    // 그리고 어디에도 채점 컨트롤(rn-reviewcheck-ox-btn)이 없어야 한다.
    await page.getByText('내가 쓴 답').waitFor();
    await page.getByText('O 정답').waitFor();
    assert.equal(await page.locator('.rn-reviewcheck-ox-btn').count(), 0, '학생 상세 화면에는 채점 컨트롤이 없어야 함');
    await page.getByText('AI 풀이 다시 보기').click();
    await page.getByText('두 점 사이의 거리를 구하면 된다').waitFor();

    await page.getByRole('button', { name: '다음 문제 ›' }).click();
    await page.getByText('오답임').waitFor();
    await page.getByText('저장된 정답 없음').waitFor();
    await page.getByText('X 오답').waitFor();
    await page.getByText('기울기 공식을 다시 정리해서 외우기').waitFor();
    assert.equal(await page.locator('.rn-reviewcheck-ox-btn').count(), 0);

    await page.getByRole('button', { name: '목록' }).click();

    // (c) submitted(아직 manual_review 남음) 세션 상세 — 에러 박스가 아니라 차분한 "확인 중" 상태.
    await rows.nth(1).click();
    await page.locator('.rn-reviewcheck-result-badge.is-pending').waitFor();
    await page.getByText('선생님이 확인하고 있어요').waitFor();
    assert.equal(await page.locator('.rn-examprep-warning').count(), 0, 'manual_review는 에러 박스로 보이면 안 됨');
    assert.equal(await page.locator('.rn-reviewcheck-ox-btn').count(), 0);

    await page.screenshot({ path: `${out}/student-history.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS (a-c): 학생 기록 목록/상세 — in_progress 제외, 최종 grade 렌더, 채점 컨트롤 없음, manual_review는 차분한 상태');
  }

  // (f) 시작 화면 최근 결과 카드 — 날짜·범위 한 줄, 0개 맞혀도 "완벽"이 아니라 중립 문구,
  // 카드를 누르면 상세로 바로 가고 상세의 "목록"은 기록 목록으로 간다. 키보드(Enter)로도 열린다.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const createdAt = new Date(2026, 8, 30, 15, 0).toISOString();
    const api = historyServer({ graded: { correct_count: 0, created_at: createdAt, start_chapter: '평면좌표', end_chapter: '무리함수' } });
    const { page, errors } = await withPage(context, api, 'student-screens.html?user=student-1');

    const card = page.getByRole('button', { name: /복습체크 결과/ });
    await card.waitFor();
    await page.getByText('9/30 · 공통수학2 · 평면좌표 ~ 무리함수').waitFor();
    await page.getByText('맞힌 문제 0개 · 다시 볼 문제 2개').waitFor();
    assert.equal(await page.getByText(/완벽/).count(), 0, '다 맞히지 않았으면 축하 문구가 나오면 안 됨');
    await page.getByRole('button', { name: '전체 기록 보기 (2회)' }).waitFor();
    await page.screenshot({ path: `${out}/start-result-card.png` });

    await card.focus();
    await page.keyboard.press('Enter');
    await page.getByText('내가 쓴 답').waitFor();
    await page.getByRole('button', { name: '목록' }).click();
    await page.locator('.rn-reviewcheck-history-row').first().waitFor();
    await page.getByText('지난 기록').waitFor();

    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS (f): 최근 결과 카드 — 날짜/범위, 중립 문구, 카드 -> 상세 -> 목록');
  }

  // (g) 전부 맞힌 경우에만 축하 문구. 기록 개수를 못 불러와도 "전체 기록 보기"는 동작한다.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const api = historyServer({ graded: { correct_count: 2 }, failList: true });
    const { page, errors } = await withPage(context, api, 'student-screens.html?user=student-1');

    await page.getByText('완벽해요! 2문제 모두 맞혔어요').waitFor();
    await page.getByText('평면좌표', { exact: false }).first().waitFor();
    const historyButton = page.getByRole('button', { name: '전체 기록 보기', exact: true });
    await historyButton.waitFor();
    await historyButton.click();
    await page.getByText('지난 기록').waitFor();

    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS (g): 전부 정답일 때만 축하 문구, 개수 조회 실패해도 기록 버튼 동작');
  }

  // (h) 기록이 하나도 없는 학생 — 결과 카드는 없지만 기록 화면 진입 버튼은 남아 있다.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const api = historyServer({ empty: true });
    const { page, errors } = await withPage(context, api, 'student-screens.html?user=student-1');

    const historyButton = page.getByRole('button', { name: '전체 기록 보기', exact: true });
    await historyButton.waitFor();
    assert.equal(await page.getByText('복습체크 결과').count(), 0);
    await historyButton.click();
    await page.getByText('아직 복습체크 기록이 없어요.').waitFor();

    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS (h): 기록 없는 학생도 기록 화면으로 갈 수 있다');
  }

  // (d)(e) 시험(퀴즈) 중 문제 이미지 확대 — 390px 모바일 뷰포트에서 탭해서 열고, 닫아도 입력하던 답 유지.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const api = quizZoomServer();
    const { page, errors } = await withPage(context, api, 'student-screens.html?user=student-1');

    await page.locator('#rc-answer').waitFor();
    await page.locator('#rc-answer').fill('x=3');

    await page.getByRole('button', { name: '문제 이미지 확대해서 보기' }).click();
    await page.getByRole('dialog', { name: '문제 이미지 확대' }).waitFor();

    await page.getByRole('button', { name: '확대 닫기' }).click();
    await page.getByRole('dialog', { name: '문제 이미지 확대' }).waitFor({ state: 'hidden' });

    assert.equal(await page.locator('#rc-answer').inputValue(), 'x=3', '확대를 열었다 닫아도 입력하던 답이 남아있어야 함');

    // 확대창은 화면을 한 번 톡 치면 닫히고(닫기 버튼이 손에 닿지 않는 태블릿 대응), 그 탭이
    // 아래 문제 이미지 버튼에 떨어져 확대창을 다시 여는 일(고스트 클릭)도 없어야 한다.
    await page.getByRole('button', { name: '문제 이미지 확대해서 보기' }).click();
    const zoom = page.getByRole('dialog', { name: '문제 이미지 확대' });
    await zoom.waitFor();
    await page.touchscreen.tap(195, 422);
    await zoom.waitFor({ state: 'hidden' });
    await page.waitForTimeout(400);
    assert.equal(await zoom.count(), 0, '탭으로 닫은 뒤 확대창이 다시 열리면 안 됨');

    // 풀이노트 — 문제 위 필기창과 추가 필기장이 열리고, 저장 버튼은 없다.
    await page.getByRole('button', { name: '풀이노트 열기' }).click();
    await page.getByRole('dialog', { name: '손 필기 풀이창' }).waitFor();
    assert.equal(await page.getByRole('button', { name: /저장하기/ }).count(), 0, '복습체크 풀이노트에는 저장 버튼이 없어야 함');
    await page.getByRole('button', { name: /새 필기장/ }).click();
    await page.getByText('풀이노트 · 추가 필기장').waitFor();
    for (let i = 0; i < 2; i++) await page.getByRole('button', { name: '필기창 닫기' }).first().click();
    await page.getByRole('dialog', { name: '손 필기 풀이창' }).first().waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#rc-answer').inputValue(), 'x=3', '풀이노트를 열고 닫아도 답이 남아있어야 함');

    await page.screenshot({ path: `${out}/quiz-zoom.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS (d-e): 시험 중 문제 이미지 확대 — 탭하면 열리고, 닫아도 입력하던 답이 그대로 유지된다');
  }

  // (f) "나의 복습 흐름" — graded 여러 회차: 최근 5회만 오래된->최근 순, 지난번 대비 문구,
  // 그리고 최종 O/X는 aiVerdict가 아니라 item.grade(관리자 override)를 따른다.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const counts = [[3, 5], [2, 5], [4, 5], [1, 5], [2, 4], [3, 3]]; // 최신순, 6번째(가장 오래된)는 막대에서 빠짐
    const sessions = counts.map(([correct, total], i) => ({
      id: `s-${i}`, student_id: 'student-1', grade: '공통수학2',
      start_chapter: '평면좌표', end_chapter: '평면좌표', status: 'graded',
      total_count: total, correct_count: correct,
      created_at: new Date(Date.UTC(2026, 8, 20 - i * 2, 3)).toISOString(),
      submitted_at: null, graded_at: null, graded_by: 'teacher-1',
    }));
    const item = (id, mistakeId, position, grade, aiVerdict) => ({
      id, session_id: 's-0', mistake_id: mistakeId, position, submitted_answer: 'a', grade,
      ai_verdict: aiVerdict, ai_confidence: 0.9, ai_reason: null,
      ai_normalized_student_answer: null, ai_canonical_answer: null,
      ai_graded_at: null, ai_grading_version: 1, graded_source: 'admin',
    });
    // AI는 mistake-1을 오답이라 했지만 선생님이 정답으로 고쳤고, mistake-3은 그 반대.
    const items = [item('i1', 'mistake-1', 0, 'correct', 'incorrect'), item('i3', 'mistake-3', 1, 'incorrect', 'correct')];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') return route.continue();
      if (url.pathname.endsWith('/rest/v1/review_check_sessions')) {
        return route.fulfill({ status: 200, json: url.searchParams.has('limit') ? sessions[0] : sessions });
      }
      if (url.pathname.endsWith('/rest/v1/review_check_items')) return route.fulfill({ status: 200, json: items });
      return route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:5174/tests/reviewCheck/student-screens.html?user=student-1');

    const progress = page.getByRole('region', { name: '나의 복습 흐름' });
    await progress.getByText('지금까지 복습체크 6회').waitFor();
    // (3+2+4+1+2+3) / (5+5+5+5+4+3) = 15/27 -> 56%
    await progress.getByText('평균 정답률 56%').waitFor();
    await progress.getByText('지난번보다 +1문제').waitFor();
    const labels = await progress.locator('.rn-reviewcheck-trend-col').evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
    assert.deepEqual(labels, [
      '9/12 4문제 중 2문제 정답', '9/14 5문제 중 1문제 정답', '9/16 5문제 중 4문제 정답',
      '9/18 5문제 중 2문제 정답', '9/20 5문제 중 3문제 정답',
    ]);
    await progress.getByRole('img', { name: /1번 평면좌표 연습 정답/ }).waitFor();
    await progress.getByRole('button', { name: /2번 이차함수 그래프 오답/ }).click();
    assert.equal(await page.evaluate(() => document.body.dataset.openedMistake), 'mistake-3');
    await page.screenshot({ path: `${out}/progress-summary-trend.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS (f): 나의 복습 흐름 — 최근 5회 추이, 지난번 대비, 최종 O/X는 item.grade');
  }

  // (g) 기록 0회 / 세션 목록 에러 — 요약은 아무것도 그리지 않고 빨간 에러도 띄우지 않는다.
  for (const mode of ['empty', 'error']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname === '127.0.0.1') return route.continue();
      if (url.pathname.endsWith('/rest/v1/review_check_sessions')) {
        if (url.searchParams.has('limit')) return route.fulfill({ status: 200, json: null });
        return mode === 'empty'
          ? route.fulfill({ status: 200, json: [] })
          : route.fulfill({ status: 500, json: { message: 'boom' } });
      }
      return route.abort();
    });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:5174/tests/reviewCheck/student-screens.html?user=student-1');
    await page.getByRole('button', { name: '복습체크 시작' }).waitFor();
    await page.waitForTimeout(500);
    assert.equal(await page.getByRole('region', { name: '나의 복습 흐름' }).count(), 0, `${mode}: 요약이 보이면 안 됨`);
    assert.equal(await page.locator('.rn-examprep-warning').count(), 0, `${mode}: 에러 박스가 보이면 안 됨`);
    await context.close();
  }
  console.log('PASS (g): 나의 복습 흐름 — 기록 0회/에러 시 조용히 숨김');
} finally {
  await browser.close();
}
