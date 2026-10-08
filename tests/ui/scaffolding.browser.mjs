// 진단 전후의 학습 기록, 학생 저장, 관리자 목록에서 상세 열기를 검사한다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = process.env.SCAFFOLDING_TEST_URL || 'http://127.0.0.1:5193';
const out = 'artifacts/scaffolding';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1180]) {
    for (const admin of [false, true]) {
      for (const analyzed of [false, true]) {
        const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
        try {
          const rows = [
            { id: 'hint-1', mistake_id: 'scaffold-mistake', student_id: 'student-1', teacher_id: 'teacher-1', caption: '근과 계수의 관계를 먼저 확인하세요.', image_url: '', created_at: '2026-10-08T00:00:00Z' },
            { id: 'note-1', mistake_id: 'scaffold-mistake', student_id: 'student-1', teacher_id: 'student-1', caption: '두 근의 합으로 다시 풀었어요.', image_url: '', created_at: '2026-10-08T01:00:00Z' },
          ];
          await context.routeWebSocket(/supabase/, ws => ws.close());
          await context.route('**/*', async route => {
            const req = route.request(), url = new URL(req.url());
            if (url.origin === base) return route.continue();
            if (url.pathname.endsWith('/mistake_scaffoldings')) {
              if (req.method() === 'POST') {
                const row = { ...req.postDataJSON()[0], id: 'saved-1', created_at: '2026-10-08T02:00:00Z' };
                rows.push(row);
                return route.fulfill({ json: row });
              }
              return route.fulfill({ json: rows });
            }
            if (url.pathname.endsWith('/profiles')) return route.fulfill({ json: [{ id: 'student-1', nickname: '테스트' }] });
            if (url.pathname.endsWith('/mistakes')) return route.fulfill({ json: [{ id: 'scaffold-mistake', user_id: 'student-1', title: '진단 없이 학습 기록 보기', date: '2026-10-08', image_url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="360" height="90"/%3E', analysis: null, reviews: ['', '', ''] }] });
            return route.abort();
          });
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', e => errors.push(e.message));
          const query = `${admin ? '&admin' : ''}${analyzed ? '&analyzed' : ''}`;
          await page.goto(`${base}/tests/ui/scaffolding.html?${query}`);
          await page.getByLabel('스캐폴딩 힌트가 있어요', { exact: true }).waitFor();
          await page.getByRole('button', { name: '진단 없이 학습 기록 보기 문제 열기' }).click();
          const dialog = page.getByRole('dialog');
          await dialog.getByText('📚 나의 학습 기록', { exact: true }).waitFor();
          await dialog.getByText('이전에 올린 재풀이 사진', { exact: true }).waitFor();
          await dialog.getByRole('button', { name: /풀이와 선생님 힌트.*2개/ }).click();
          await dialog.getByText(rows[0].caption, { exact: true }).waitFor();
          await dialog.getByText(rows[1].caption, { exact: true }).waitFor();
          assert.equal(await dialog.getByText('⚡ AI 엔진:', { exact: true }).count(), Number(admin && analyzed));
          assert.equal(await dialog.getByText('✓ 새로운 진단이 준비됐어요', { exact: true }).count(), Number(analyzed));
          assert.equal(await dialog.getByRole('button', { name: '✏️ 네, 다시 풀어볼게요', exact: true }).count(), Number(analyzed));
          if (analyzed) {
            await dialog.getByRole('button', { name: /정석 풀이 과정/ }).click();
            await dialog.getByText('두 근의 합과 곱을 확인합니다.', { exact: true }).waitFor();
          }
          if (!analyzed) {
            await dialog.getByText('📚 나의 학습 기록', { exact: true }).scrollIntoViewIfNeeded();
            await page.screenshot({ path: `${out}/without-analysis-${admin ? 'admin' : 'student'}-${width}.png` });
          }
          const memo = admin ? '새 선생님 힌트' : '새 내 풀이 메모';
          await dialog.getByPlaceholder(admin ? '말로 된 힌트 입력 (예: 1단계 공식 적용)' : '내 풀이 메모 입력 (예: 이렇게 풀었어요)').fill(memo);
          await dialog.getByRole('button', { name: admin ? '🧩 스캐폴딩 힌트 등록하기' : '👤 내 풀이 저장하기', exact: true }).click();
          await dialog.getByText(memo, { exact: true }).waitFor();
          assert.equal(rows.at(-1).teacher_id, admin ? 'teacher-1' : 'student-1');
          if (admin && !analyzed) {
            await page.goto(`${base}/tests/ui/scaffolding.html?admin&clinic`);
            await page.getByText('진단 없이 학습 기록 보기', { exact: true }).click();
            await dialog.getByText('📚 나의 학습 기록', { exact: true }).waitFor();
            await dialog.getByRole('button', { name: /풀이와 선생님 힌트/ }).click();
            await dialog.getByText(rows[0].caption, { exact: true }).waitFor();
          }
          assert.deepEqual(errors, []);
          console.log(`PASS: scaffolding ${width}px ${admin ? 'admin' : 'student'} ${analyzed ? 'with' : 'without'} analysis; badge, records, save, diagnosis gates${admin && !analyzed ? ', admin clinic' : ''}`);
        } finally { await context.close(); }
      }
    }
  }
} finally { await browser.close(); }
