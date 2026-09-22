// 관리자 채점 화면의 "문제카드 보기" 버튼 — 기존 MistakeDetailModal을 그대로 열고, 닫아도
// 복습체크 채점 상태(선택한 O/X, 현재 문항 인덱스)가 초기화되지 않는지 검증한다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const out = 'node_modules/.cache/reviewcheck-admin-view-mistake-card';
await mkdir(out, { recursive: true });

function isoNow() { return new Date().toISOString(); }

const mistakes = {
  'mistake-1': {
    id: 'mistake-1', user_id: 'student-1', title: '이차방정식 근의 공식 문제',
    image_url: 'https://example.com/mistake-1.png', date: '2026-09-01',
    analysis: { finalAnswer: '1/2', solvingProcess: '이것은 문제1 고유 AI풀이 서명입니다: x=1/2' },
    reviews: ['O', 'O', 'O'],
  },
  'mistake-2': {
    id: 'mistake-2', user_id: 'student-1', title: '삼각함수 그래프 문제',
    image_url: 'https://example.com/mistake-2.png', date: '2026-09-01',
    analysis: { finalAnswer: '60도', solvingProcess: '이것은 문제2 고유 AI풀이 서명입니다: 각도 60' },
    reviews: ['O', 'O', 'O'],
  },
};

function baseRoute(state) {
  return async route => {
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
      return route.fulfill({ status: 200, json: Object.values(mistakes) });
    }
    if (path.endsWith('/rest/v1/rpc/grade_review_check_session') || path.endsWith('/rest/v1/rpc/update_review_check_item_grade')) {
      return route.fulfill({ status: 200, json: { totalCount: state.items.length, correctCount: 0, alreadyGraded: false } });
    }
    return route.abort();
  };
}

async function withPage(context, route) {
  await context.route('**/*', route);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:5174/tests/reviewCheck/admin-view-mistake-card.html');
  return { page, errors };
}

try {
  // (A) 채점 진행 중(submitted) 세션 — ReviewCheckGrading 화면에서 검증.
  {
    const state = {
      session: {
        id: 'session-1', student_id: 'student-1', grade: '공통수학2',
        start_chapter: 'a', end_chapter: 'a', status: 'submitted',
        total_count: 2, correct_count: 0, created_at: isoNow(),
        submitted_at: isoNow(), graded_at: null, graded_by: null,
      },
      items: [
        { id: 'item-1', session_id: 'session-1', mistake_id: 'mistake-1', position: 0, submitted_answer: '1/2', grade: null, ai_verdict: null, ai_confidence: null, ai_reason: null, ai_normalized_student_answer: null, ai_canonical_answer: null, ai_graded_at: null, ai_grading_version: null, graded_source: null },
        { id: 'item-2', session_id: 'session-1', mistake_id: 'mistake-2', position: 1, submitted_answer: '90도', grade: null, ai_verdict: null, ai_confidence: null, ai_reason: null, ai_normalized_student_answer: null, ai_canonical_answer: null, ai_graded_at: null, ai_grading_version: null, graded_source: null },
      ],
    };
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const { page, errors } = await withPage(context, baseRoute(state));

    await page.locator('.rn-reviewcheck-history-row').first().click();
    await page.getByRole('button', { name: 'O 정답' }).waitFor();

    // 1번 문항(mistake-1)을 O로 채점.
    await page.getByRole('button', { name: 'O 정답' }).click();
    await page.locator('button[aria-label="1번 문제로 이동"]').click(); // judge()가 자동으로 다음으로 넘어가므로 1번으로 복귀
    assert.equal(await page.locator('.rn-reviewcheck-ox-btn.is-correct.is-active').count(), 1, '1번 문항 O 채점 상태가 유지되어야 함');

    // "문제카드 보기" -> mistake-1의 실제 문제카드 상세가 열려야 함(정답: 올바른 카드).
    await page.getByRole('button', { name: '문제카드 보기' }).click();
    await page.getByRole('dialog', { name: '이차방정식 근의 공식 문제' }).waitFor();
    // AI 풀이는 기본 접힘 섹션이라 펼쳐야 내용이 보인다(실제 관리자 사용 흐름과 동일).
    await page.getByRole('button', { name: /정석 풀이 과정/ }).click();
    await page.getByText('이것은 문제1 고유 AI풀이 서명입니다').waitFor();

    await page.getByRole('button', { name: '문제 상세 닫기' }).click();
    await page.getByRole('dialog', { name: '이차방정식 근의 공식 문제' }).waitFor({ state: 'hidden' });

    // 닫은 뒤 1번 문항의 O 채점 상태가 그대로 유지되어야 한다(모달 열고 닫아도 초기화 안 됨).
    assert.equal(await page.locator('.rn-reviewcheck-ox-btn.is-correct.is-active').count(), 1, '문제카드 모달을 닫아도 기존 채점 상태가 유지되어야 함');

    // 2번 문항으로 이동 후 "문제카드 보기" -> mistake-2의 다른 카드가 열려야 함(여러 문항에서 각각 올바른 카드).
    await page.locator('button[aria-label="2번 문제로 이동"]').click();
    await page.getByRole('button', { name: '문제카드 보기' }).click();
    await page.getByRole('dialog', { name: '삼각함수 그래프 문제' }).waitFor();
    await page.getByRole('button', { name: /정석 풀이 과정/ }).click();
    await page.getByText('이것은 문제2 고유 AI풀이 서명입니다').waitFor();
    await page.screenshot({ path: `${out}/grading-view-card-open.png` });
    await page.getByRole('button', { name: '문제 상세 닫기' }).click();

    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS (A): 채점 중 화면 — "문제카드 보기"로 올바른 원본 카드가 열리고, 닫아도 채점 상태 유지, 문항별로 각각 다른 카드 열림');
  }

  // (B) 채점 완료(graded) 세션 — ReviewCheckGradedReview -> GradedDetail 화면에서 검증.
  {
    const state = {
      session: {
        id: 'session-2', student_id: 'student-1', grade: '공통수학2',
        start_chapter: 'a', end_chapter: 'a', status: 'graded',
        total_count: 2, correct_count: 1, created_at: isoNow(),
        submitted_at: isoNow(), graded_at: isoNow(), graded_by: 'admin-1',
      },
      items: [
        { id: 'item-1', session_id: 'session-2', mistake_id: 'mistake-1', position: 0, submitted_answer: '1/2', grade: 'correct', ai_verdict: 'correct', ai_confidence: 0.95, ai_reason: '정답과 일치', ai_normalized_student_answer: '1/2', ai_canonical_answer: '1/2', ai_graded_at: isoNow(), ai_grading_version: 1, graded_source: 'ai' },
        { id: 'item-2', session_id: 'session-2', mistake_id: 'mistake-2', position: 1, submitted_answer: '90도', grade: 'incorrect', ai_verdict: null, ai_confidence: null, ai_reason: null, ai_normalized_student_answer: null, ai_canonical_answer: null, ai_graded_at: null, ai_grading_version: null, graded_source: null },
      ],
    };
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const { page, errors } = await withPage(context, baseRoute(state));

    await page.locator('.rn-reviewcheck-history-row').first().click();
    await page.locator('.rn-reviewcheck-graded-open').first().click();
    await page.getByText('1 / 2').waitFor();

    await page.getByRole('button', { name: '문제카드 보기' }).click();
    await page.getByRole('dialog', { name: '이차방정식 근의 공식 문제' }).waitFor();
    await page.getByRole('button', { name: '문제 상세 닫기' }).click();
    await page.getByRole('dialog', { name: '이차방정식 근의 공식 문제' }).waitFor({ state: 'hidden' });

    // 이미 채점 완료된 기록의 상세 화면에서도 동일하게 동작 + 닫은 뒤에도 같은 문항 상세(1/2, 목록 버튼)에 그대로 남아 있어야 함.
    await page.getByText('1 / 2').waitFor();
    assert.equal(await page.getByRole('button', { name: 'X 오답' }).locator('..').count() >= 0, true);
    assert.equal(await page.locator('.rn-reviewcheck-ox-btn.is-correct.is-active').count(), 1, '채점 완료 상세에서도 기존 O 판정이 그대로 유지되어야 함');

    await page.screenshot({ path: `${out}/graded-detail-card-open.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS (B): 채점 완료된 기록 상세에서도 "문제카드 보기"가 동일하게 동작하고, 닫은 뒤 상세 화면/판정 상태가 그대로 유지됨');
  }
} finally {
  await browser.close();
}
