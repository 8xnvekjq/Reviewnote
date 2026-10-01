// 관리자 학생 상세 모달 "최근 복습체크 현황" — 요약(총 횟수/평균 정답률/채점 대기/풀이 중),
// 최근 5회 목록, 빈/로딩/실패 상태, 학생 전환 시 늦게 도착한 응답이 섞이지 않는지 검증한다.
// 실행: vite dev 서버(127.0.0.1:5174)가 떠 있는 상태에서
//   node tests/admin/student-review-check-summary.browser.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const out = 'node_modules/.cache/admin-student-review-check-summary';
await mkdir(out, { recursive: true });

function session(id, studentId, status, total, correct, createdAt, extra = {}) {
  return {
    id, student_id: studentId, grade: '공통수학2', start_chapter: '도형의 방정식', end_chapter: '도형의 방정식',
    status, total_count: total, correct_count: correct, created_at: createdAt,
    submitted_at: status === 'in_progress' ? null : createdAt, graded_at: status === 'graded' ? createdAt : null,
    graded_by: status === 'graded' ? 'admin-1' : null, ...extra,
  };
}

// created_at desc(최신순) — 서버 order와 동일하게 미리 정렬해 둔다. 날짜는 오프셋 없는 로컬
// 정오라 어느 타임존에서 돌려도 M/DD가 바뀌지 않는다.
const sessionsByStudent = {
  'student-1': [
    session('s7', 'student-1', 'in_progress', 5, 0, '2026-09-30T12:00:00'),
    session('s6', 'student-1', 'submitted', 5, 0, '2026-09-28T12:00:00', { start_chapter: '집합', end_chapter: '명제' }),
    session('s5', 'student-1', 'graded', 4, 3, '2026-09-25T12:00:00'),
    session('s4', 'student-1', 'graded', 5, 2, '2026-09-20T12:00:00'),
    session('s3', 'student-1', 'graded', 1, 1, '2026-09-15T12:00:00'),
    session('s2', 'student-1', 'graded', 0, 0, '2026-09-10T12:00:00'),
    session('s1', 'student-1', 'graded', 10, 4, '2026-09-05T12:00:00'),
  ],
  'student-slow': [session('slow-1', 'student-slow', 'graded', 2, 2, '2026-09-29T12:00:00')],
  'student-empty': [],
  'student-only-progress': [session('p1', 'student-only-progress', 'in_progress', 3, 0, '2026-09-29T12:00:00')],
};

function route(state) {
  return async r => {
    const req = r.request();
    const url = new URL(req.url());
    if (url.hostname === '127.0.0.1') return r.continue();
    if (url.pathname.endsWith('/rest/v1/review_check_sessions') && req.method() === 'GET') {
      const studentId = (url.searchParams.get('student_id') || '').replace(/^eq\./, '');
      state.requests.push(studentId);
      if (studentId === 'student-error') return r.fulfill({ status: 500, json: { message: 'boom' } });
      if (state.delays[studentId]) await new Promise(res => setTimeout(res, state.delays[studentId]));
      return r.fulfill({ status: 200, json: sessionsByStudent[studentId] || [] });
    }
    return r.abort();
  };
}

async function open(student, state) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.route('**/*', route(state));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:5174/tests/admin/student-review-check-summary.html?student=${student}`);
  return { context, page, errors };
}

const summary = page => page.getByTestId('admin-rc-summary');

try {
  // (A) 요약 + 최근 5회 목록 + 채점하러 가기
  {
    const state = { requests: [], delays: { 'student-1': 400 } };
    const { context, page, errors } = await open('student-1', state);
    await summary(page).getByText('불러오는 중…').waitFor();
    await page.getByTestId('admin-rc-total').waitFor();

    // in_progress 제외 6회. graded 합계: 정답 3+2+1+0+4=10 / 문항 4+5+1+0+10=20 -> 50%.
    assert.equal(await page.getByTestId('admin-rc-total').textContent(), '6회');
    assert.equal(await page.getByTestId('admin-rc-accuracy').textContent(), '50%');
    assert.equal(await page.getByTestId('admin-rc-pending').textContent(), '1건');
    assert.ok(await summary(page).getByText('풀이 중').first().isVisible(), '진행 중 세션이 있으면 "풀이 중" 표시');

    const rows = page.getByTestId('admin-rc-row');
    assert.equal(await rows.count(), 5, '최근 회차는 최대 5개');
    const texts = await rows.allTextContents();
    assert.match(texts[0], /9\/30/);
    assert.match(texts[0], /풀이 중/);
    assert.match(texts[1], /9\/28/);
    assert.match(texts[1], /공통수학2 · 집합~명제/);
    assert.match(texts[1], /채점 대기/);
    assert.match(texts[2], /9\/25/);
    assert.ok(texts[2].includes('공통수학2 · 도형의 방정식') && !texts[2].includes('~'), '시작=끝이면 단원 하나만');
    assert.match(texts[2], /3\/4\s*75%/);
    assert.match(texts[4], /1\/1\s*100%/);
    assert.ok(!texts.some(t => t.includes('9/05')), '6번째 이후 회차는 목록에 없음');

    await page.getByRole('button', { name: /채점하러 가기/ }).click();
    assert.equal(await page.evaluate(() => document.body.dataset.openGrading), 'true');

    await page.screenshot({ path: `${out}/summary.png` });
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS (A): 요약 타일/최근 5회 목록/배지/채점하러 가기');
  }

  // (B) 빈 기록 / 실패 / in_progress만 있는 학생
  {
    const state = { requests: [], delays: {} };
    const { context, page, errors } = await open('student-empty', state);
    await summary(page).getByText('아직 복습체크 기록이 없어요').waitFor();

    await page.locator('button[data-student="student-error"]').click();
    await summary(page).getByText('복습체크 기록을 불러오지 못했어요.').waitFor();
    assert.equal(await summary(page).locator('[class*="bg-red-"]').count(), 0, '빨간 에러 박스 없음');

    await page.locator('button[data-student="student-only-progress"]').click();
    await page.getByTestId('admin-rc-total').waitFor();
    assert.equal(await page.getByTestId('admin-rc-total').textContent(), '0회');
    assert.equal(await page.getByTestId('admin-rc-accuracy').textContent(), '—');
    assert.equal(await page.getByTestId('admin-rc-pending').textContent(), '0건');
    assert.equal(await page.getByRole('button', { name: /채점하러 가기/ }).count(), 0, '채점 대기 없으면 버튼 없음');

    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS (B): 빈 기록/조용한 실패 안내/풀이 중만 있는 학생');
  }

  // (C) 학생 전환 중 늦게 도착한 이전 학생 응답이 섞이지 않음
  {
    const state = { requests: [], delays: { 'student-slow': 1500 } };
    const { context, page, errors } = await open('student-empty', state);
    await summary(page).getByText('아직 복습체크 기록이 없어요').waitFor();

    await page.locator('button[data-student="student-slow"]').click();
    await summary(page).getByText('불러오는 중…').waitFor();
    await page.locator('button[data-student="student-1"]').click();
    await page.getByTestId('admin-rc-total').waitFor();
    assert.equal(await page.getByTestId('admin-rc-total').textContent(), '6회');

    await page.waitForTimeout(2000); // student-slow 응답이 도착할 시간
    assert.equal(await page.getByTestId('admin-rc-total').textContent(), '6회', '늦게 도착한 student-slow 응답이 덮어쓰면 안 됨');
    assert.equal(await page.getByTestId('admin-rc-row').count(), 5);
    assert.ok(state.requests.includes('student-slow'));

    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS (C): 학생 전환 시 늦은 응답 무시');
  }
} finally {
  await browser.close();
}
