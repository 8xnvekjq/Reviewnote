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
function historyServer() {
  const sessionGraded = {
    id: 'session-graded', student_id: 'student-1', grade: '공통수학2',
    start_chapter: '평면좌표', end_chapter: '평면좌표', status: 'graded',
    total_count: 2, correct_count: 1, created_at: ts(0),
    submitted_at: ts(5), graded_at: ts(1), graded_by: 'teacher-1',
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
  const sessions = [sessionGraded, sessionSubmitted, sessionInProgress];

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
        return route.fulfill({ status: 200, json: sessions[0] });
      }
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
    await page.getByRole('button', { name: '지난 기록 보기' }).click();

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

  // (d)(e) 시험(퀴즈) 중 문제 이미지 확대 — 390px 모바일 뷰포트에서 탭해서 열고, 닫아도 입력하던 답 유지.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const api = quizZoomServer();
    const { page, errors } = await withPage(context, api, 'student-screens.html?user=student-1');

    await page.locator('#rc-answer').waitFor();
    await page.locator('#rc-answer').fill('x=3');

    await page.getByRole('button', { name: '문제 이미지 확대해서 보기' }).click();
    await page.getByRole('dialog', { name: '문제 이미지 확대' }).waitFor();

    await page.getByRole('button', { name: '확대 닫기' }).click();
    await page.getByRole('dialog', { name: '문제 이미지 확대' }).waitFor({ state: 'hidden' });

    assert.equal(await page.locator('#rc-answer').inputValue(), 'x=3', '확대를 열었다 닫아도 입력하던 답이 남아있어야 함');

    await page.screenshot({ path: `${out}/quiz-zoom.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS (d-e): 시험 중 문제 이미지 확대 — 탭하면 열리고, 닫아도 입력하던 답이 그대로 유지된다');
  }
} finally {
  await browser.close();
}
