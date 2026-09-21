// Real components + real supabase-js client; REST/Edge Function responses are intercepted at the
// network layer (same convention as tests/pixel-room/farm.browser.mjs) — no need to mock
// src/services/supabase.ts itself, since Playwright's context.route('**/*', ...) catches every
// request regardless of which Supabase project URL the client happens to be configured with.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const out = 'node_modules/.cache/reviewcheck-grading';
await mkdir(out, { recursive: true });

function isoNow() { return new Date().toISOString(); }

// --- 학생 흐름 mock 서버 -----------------------------------------------------------------
// allGraded 플래그로 review-check-grade Edge Function 호출 결과를 통제한다: true면 AI가 전부
// 확신 있게 채점해서 세션이 곧바로 'graded'로 넘어간 것처럼, false면 manual_review가 남아
// 세션이 여전히 'submitted'인 것처럼(=admin 채점 대기 화면 그대로) 흉내낸다.
function studentServer({ allGraded }) {
  const state = {
    session: {
      id: 'session-1', student_id: 'student-1', grade: '공통수학2',
      start_chapter: '평면좌표', end_chapter: '평면좌표', status: 'in_progress',
      total_count: 1, correct_count: 0, created_at: isoNow(),
      submitted_at: null, graded_at: null, graded_by: null,
    },
    items: [{
      id: 'item-1', session_id: 'session-1', mistake_id: 'mistake-1', position: 0,
      submitted_answer: null, grade: null,
      ai_verdict: null, ai_confidence: null, ai_reason: null,
      ai_normalized_student_answer: null, ai_canonical_answer: null,
      ai_graded_at: null, ai_grading_version: null, graded_source: null,
    }],
  };
  const api = { state, gradeRequests: [] };
  api.route = async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname === '127.0.0.1') return route.continue();
    const path = url.pathname;

    if (path.endsWith('/rest/v1/review_check_sessions') && req.method() === 'GET') {
      return route.fulfill({ status: 200, json: state.session });
    }
    if (path.endsWith('/rest/v1/review_check_items') && req.method() === 'GET') {
      return route.fulfill({ status: 200, json: state.items });
    }
    if (path.endsWith('/rest/v1/rpc/submit_review_check_session')) {
      const body = req.postDataJSON();
      state.items = state.items.map(it => {
        const ans = (body.p_answers || []).find(a => a.mistakeId === it.mistake_id);
        return ans ? { ...it, submitted_answer: ans.answer } : it;
      });
      state.session = { ...state.session, status: 'submitted', submitted_at: isoNow() };
      return route.fulfill({ status: 200, json: null });
    }
    if (path.endsWith('/functions/v1/review-check-grade')) {
      api.gradeRequests.push(req.postDataJSON());
      if (allGraded) {
        state.items = state.items.map(it => ({
          ...it, grade: 'correct', ai_verdict: 'correct', ai_confidence: 0.95,
          ai_reason: '정답과 의미상 일치', graded_source: 'ai',
        }));
        state.session = {
          ...state.session, status: 'graded', correct_count: state.items.length,
          graded_at: isoNow(), graded_by: null,
        };
        return route.fulfill({ status: 200, json: { allGraded: true, gradedCount: state.items.length, manualReviewCount: 0 } });
      }
      // 일부(여기선 전부)가 manual_review로 남아 세션이 여전히 'submitted' — 기존 대기 화면이
      // 그대로 자연스럽게 유지되는지 확인하기 위한 케이스.
      return route.fulfill({ status: 200, json: { allGraded: false, gradedCount: 0, manualReviewCount: 1 } });
    }
    return route.abort();
  };
  return api;
}

// --- admin 흐름 mock 서버 ---------------------------------------------------------------
// AI가 사전에 confident하게 채점한 문항 하나(grade='correct')와 manual_review로 남은 문항
// 하나(grade=null)를 섞어, admin 화면이 이 둘을 어떻게 다르게 보여주는지 검증한다.
function adminServer() {
  const state = {
    session: {
      id: 'session-1', student_id: 'student-1', grade: '공통수학2',
      start_chapter: '평면좌표', end_chapter: '평면좌표', status: 'submitted',
      total_count: 2, correct_count: 0, created_at: isoNow(),
      submitted_at: isoNow(), graded_at: null, graded_by: null,
    },
    items: [
      {
        id: 'item-1', session_id: 'session-1', mistake_id: 'mistake-1', position: 0,
        submitted_answer: '5', grade: 'correct',
        ai_verdict: 'correct', ai_confidence: 0.95, ai_reason: '정답과 의미상 일치',
        ai_normalized_student_answer: '5', ai_canonical_answer: '5',
        ai_graded_at: isoNow(), ai_grading_version: 1, graded_source: 'ai',
      },
      {
        id: 'item-2', session_id: 'session-1', mistake_id: 'mistake-2', position: 1,
        submitted_answer: '모르겠어요', grade: null,
        ai_verdict: 'manual_review', ai_confidence: 0.3, ai_reason: '학생 답이 모호해 확신할 수 없음',
        ai_normalized_student_answer: null, ai_canonical_answer: null,
        ai_graded_at: isoNow(), ai_grading_version: 1, graded_source: null,
      },
    ],
    mistakes: [
      { id: 'mistake-1', user_id: 'student-1', title: '평면좌표 연습', image_url: 'https://example.com/m1.png', date: '2026-09-01', analysis: { finalAnswer: '5', solvingProcess: '...' } },
      { id: 'mistake-2', user_id: 'student-1', title: '직선의 방정식 연습', image_url: 'https://example.com/m2.png', date: '2026-09-01', analysis: { finalAnswer: 'y=2x+1', solvingProcess: '...' } },
    ],
  };
  const api = { state, completeRequests: [] };
  api.route = async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.hostname === '127.0.0.1') return route.continue();
    const path = url.pathname;

    if (path.endsWith('/rest/v1/review_check_sessions') && req.method() === 'GET') {
      return route.fulfill({ status: 200, json: [state.session] });
    }
    if (path.endsWith('/rest/v1/review_check_items') && req.method() === 'GET') {
      return route.fulfill({ status: 200, json: state.items });
    }
    if (path.endsWith('/rest/v1/mistakes') && req.method() === 'GET') {
      return route.fulfill({ status: 200, json: state.mistakes });
    }
    if (path.endsWith('/rest/v1/rpc/grade_review_check_session')) {
      const body = req.postDataJSON();
      api.completeRequests.push(body);
      return route.fulfill({ status: 200, json: { totalCount: state.items.length, correctCount: 1, alreadyGraded: false } });
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
  // (a) 학생 제출 -> AI가 전부 확신 있게 채점(allGraded:true) -> 리로드 없이 곧바로 결과 화면.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const api = studentServer({ allGraded: true });
    const { page, errors } = await withPage(context, api, 'grading-student.html?user=student-1');
    await page.locator('#rc-answer').waitFor();
    await page.locator('#rc-answer').fill('5');
    await page.getByRole('button', { name: '제출하기' }).click();
    // "선생님이 채점하면..." 대기 화면에 멈추지 않고, 곧바로 결과(복습체크 결과) 요약이 뜬다.
    await page.getByText('복습체크 결과').waitFor({ timeout: 5000 });
    assert.equal(await page.getByText('복습체크 제출 완료').count(), 0, '결과가 바로 나오면 대기 화면이 남아있으면 안 됨');
    assert.equal(api.gradeRequests.length, 1);
    assert.equal(api.gradeRequests[0].sessionId, 'session-1');
    await page.screenshot({ path: `${out}/student-allgraded.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS (a): AI가 전부 확신 채점하면 대기 화면 없이 곧바로 결과가 보인다');
  }

  // (b) 학생 제출 -> 일부 manual_review로 남음(allGraded:false) -> 기존 대기 화면이 정상적으로 유지.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const api = studentServer({ allGraded: false });
    const { page, errors } = await withPage(context, api, 'grading-student.html?user=student-1');
    await page.locator('#rc-answer').waitFor();
    await page.locator('#rc-answer').fill('5');
    await page.getByRole('button', { name: '제출하기' }).click();
    await page.getByText('복습체크 제출 완료').waitFor({ timeout: 5000 });
    await page.getByText('선생님이 채점하면').waitFor();
    assert.equal(await page.getByText('복습체크 결과').count(), 0, '아직 채점 안 끝났으면 결과 요약이 보이면 안 됨');
    assert.equal(api.gradeRequests.length, 1);
    await page.screenshot({ path: `${out}/student-waiting.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS (b): manual_review가 남으면 기존 대기 화면이 깨지지 않고 그대로 보인다');
  }

  // (c) admin 채점 화면: AI가 이미 확신 채점한 문항은 O/X가 미리 선택돼 있고(그래도 덮어쓰기
  // 가능), manual_review로 남은 문항은 아무것도 선택돼 있지 않다.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const api = adminServer();
    const { page, errors } = await withPage(context, api, 'grading-admin.html?student=student-1');
    await page.getByText('아직 복습체크 기록이 없어요').waitFor({ state: 'hidden' }).catch(() => {});
    await page.getByText('채점 대기').waitFor();
    await page.locator('.rn-reviewcheck-history-row').first().click();

    // 미결정 문항(manual_review, item-2)부터 먼저 보여줘야 admin의 눈이 바로 "확인 필요"로 간다.
    await page.getByText('AI: 확인 필요').waitFor();
    await page.getByText('학생 답이 모호해 확신할 수 없음').waitFor();
    assert.equal(await page.locator('.rn-reviewcheck-ox-btn.is-correct.is-active').count(), 0, '미결정 문항은 아직 아무 쪽도 선택돼 있으면 안 됨');
    assert.equal(await page.locator('.rn-reviewcheck-ox-btn.is-incorrect.is-active').count(), 0);

    // 1번(AI가 이미 정답으로 confident하게 채점한) 문항으로 이동 — 미리 O가 선택돼 있어야 한다.
    await page.locator('button[aria-label="1번 문제로 이동"]').click();
    await page.getByText('AI: 정답 (신뢰도 95%)').waitFor();
    assert.equal(await page.locator('.rn-reviewcheck-ox-btn.is-correct.is-active').count(), 1, 'AI가 confident하게 채점한 문항은 O가 미리 선택돼 있어야 함');

    // admin은 AI 판정을 그대로 덮어쓸 수 있어야 한다(최종 결정은 항상 admin 우선). judge()는
    // 클릭 즉시 다음 문항으로 자동 이동하므로(연속 채점 UX), 1번으로 다시 돌아와 실제로 판정이
    // 덮어써져 남아있는지 확인한다.
    await page.getByRole('button', { name: 'X 오답' }).click();
    await page.locator('button[aria-label="1번 문제로 이동"]').click();
    assert.equal(await page.locator('.rn-reviewcheck-ox-btn.is-incorrect.is-active').count(), 1, 'admin이 클릭하면 AI 판정을 덮어써야 함');
    assert.equal(await page.locator('.rn-reviewcheck-ox-btn.is-correct.is-active').count(), 0);

    await page.screenshot({ path: `${out}/admin-grading.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS (c): admin 채점 화면 — AI 사전채점 미리 선택 + 확인 필요 우선 노출 + admin 덮어쓰기 가능');
  }
} finally {
  await browser.close();
}
