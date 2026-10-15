import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { mkdirSync } from 'node:fs';

const base = 'http://127.0.0.1:5186';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5186', '--strictPort'], { stdio: 'pipe', windowsHide: true });
let output = '';
vite.stdout.on('data', value => { output += value; });
vite.stderr.on('data', value => { output += value; });
let browser;
try {
  for (let i = 0; i < 100 && !output.includes('5186'); i++) {
    if (vite.exitCode !== null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  mkdirSync('.test-artifacts', { recursive: true });
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, serviceWorkers: 'block' });
    try {
      let request = null, feedback = null, reward = 0, initialLoads = 0, downloads = 0, failCancel = false, requestCount = 0;
      const feedbackCalls = [];
      const stroke = { id: 'stroke', tool: 'pen', color: '#1f2937', size: 4, points: [{ x: .1, y: .2, pressure: .5, t: 0 }, { x: .4, y: .4, pressure: .5, t: 1000 }] };
      const file = gzipSync(JSON.stringify({ format: 'reviewnotes.help-solution', version: 1, events: [{ at: 1000, kind: 'draw', added: [{ stroke, index: 0 }], removed: [] }], strokes: [stroke] }));
      await context.routeWebSocket(/supabase/, ws => ws.close());
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (url.origin === base) return route.continue();
        const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
        const respond = (json, status = 200) => route.fulfill({ json, status, headers });
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        const name = url.pathname.split('/').at(-1);
        if (name === 'my_help_requests') { initialLoads++; return respond(request ? [request] : []); }
        // 첫 요청은 아직 풀이 없음, 다시 요청하면 곧바로 풀이 1개가 온 상태로
        if (name === 'request_help') { requestCount++; request = { id: 'request', mistake_id: 'mistake', status: 'open', created_at: '', solution_count: requestCount > 1 ? 1 : 0, unseen_count: requestCount > 1 ? 1 : 0 }; return respond(request); }
        if (name === 'cancel_help_request') {
          if (failCancel) return respond({ message: '요청을 취소할 수 없어요.' }, 400);
          request.status = 'cancelled'; return respond(null);
        }
        if (name === 'list_help_solutions') return respond([{ id: 'solution', storage_path: 'private/file.json.gz', stroke_count: 5, duration_ms: 21000, created_at: '', feedback, helper: { face: '🐱', title: '도전자', grade: '고2' }, file_available: true }]);
        if (name === 'give_help_feedback') {
          feedbackCalls.push(req.postDataJSON()); feedback = req.postDataJSON().p_kind;
          if (feedback === 'like') request.status = 'closed';
          request.unseen_count = 0;
          return respond({ helper_reward: 0, requester_reward: reward, closed: feedback === 'like' });
        }
        if (url.pathname.includes('/storage/v1/object/')) { downloads++; return route.fulfill({ body: file, contentType: 'application/gzip', headers }); }
        return respond([]);
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/tests/ui/peer-help-requester.html`);
      const dialogs = [];
      page.on('dialog', dialog => { dialogs.push(dialog.message()); void dialog.accept(); });
      const helpButton = page.getByTestId('help-request-button');
      await page.getByTestId('problem-actions').screenshot({ path: `.test-artifacts/peer-help-button-${width}.png` });
      await page.getByRole('button', { name: '도움 요청', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-testid=help-request-button]')?.textContent === '🙋 요청 중');
      assert.equal(initialLoads, 2, '목록과 상세, StrictMode의 최초 조회는 한 번으로 합쳐져야 한다');
      // 요청 중(풀이 없음)에 누르면 취소를 묻는다 — 실패하면 알림, 다시 누르면 취소
      failCancel = true;
      await helpButton.click();
      for (let i = 0; i < 40 && !dialogs.includes('요청을 취소할 수 없어요.'); i++) await page.waitForTimeout(50);
      assert.ok(dialogs.includes('도움 요청을 취소할까요?') && dialogs.includes('요청을 취소할 수 없어요.'), dialogs.join(' / '));
      failCancel = false;
      await helpButton.click();
      await page.waitForFunction(() => document.querySelector('[data-testid=help-request-button]')?.textContent === '🙋 도움 요청');
      await helpButton.click();
      await page.waitForFunction(() => document.querySelector('[data-testid=help-request-button]')?.textContent === '🆕 풀이 보기 (1)');
      await page.getByText('🙋 풀이 1개 도착', { exact: true }).waitFor();
      await page.getByTestId('problem-actions').screenshot({ path: `.test-artifacts/peer-help-button-new-${width}.png` });
      await page.getByRole('button', { name: '풀이 보기 (1)', exact: true }).click();
      const viewer = page.getByRole('dialog', { name: '친구 풀이 보기', exact: true });
      const solution = () => viewer.getByRole('button', { name: /🐱.*고2/ });
      await solution().click();
      await page.getByTestId('exam-replay-dock').waitFor();
      await viewer.getByRole('button', { name: '일시정지', exact: true }).waitFor();
      await page.screenshot({ path: `.test-artifacts/peer-help-requester-replay-${width}.png` });
      assert.ok(await viewer.evaluate(el => el.scrollWidth <= el.clientWidth));
      assert.equal(downloads, 1);
      await viewer.getByRole('button', { name: '닫기', exact: true }).click();
      await page.screenshot({ path: `.test-artifacts/peer-help-requester-feedback-${width}.png` });
      // '나중에'는 없고 Esc로도 닫히지 않는다 — 둘 중 하나를 꼭 고른다.
      assert.equal(await page.getByRole('button', { name: '나중에', exact: true }).count(), 0);
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: '풀이 피드백', exact: true }).waitFor();
      assert.equal(feedbackCalls.length, 0);
      await page.getByRole('button', { name: '🤔 이해 못 했어요', exact: true }).click();
      await viewer.getByText('피드백 고마워요!', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('포인트 갱신 횟수').innerText(), '1');
      await solution().click();
      await page.getByTestId('exam-replay-dock').waitFor();
      await viewer.getByRole('button', { name: '닫기', exact: true }).click();
      assert.equal(await page.getByRole('dialog', { name: '풀이 피드백', exact: true }).count(), 0);
      await viewer.getByRole('button', { name: '닫기', exact: true }).click();
      await page.waitForFunction(() => /풀이 보기 \(1\)/.test(document.querySelector('[data-testid=help-request-button]')?.textContent ?? ''));
      feedback = null; reward = 3;
      await page.getByRole('button', { name: '풀이 보기 (1)', exact: true }).click();
      await solution().click();
      await page.getByTestId('exam-replay-dock').waitFor();
      await viewer.getByRole('button', { name: '닫기', exact: true }).click();
      await page.getByRole('button', { name: '👍 도움 됐어요', exact: true }).click();
      await viewer.getByText('피드백 고마워요! +3P', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('포인트 갱신 횟수').innerText(), '2');
      await page.screenshot({ path: `.test-artifacts/peer-help-requester-${width}.png` });
      assert.ok(await viewer.evaluate(el => el.scrollWidth <= el.clientWidth), '모바일에서도 가로 넘침이 없어야 한다');
      await viewer.getByRole('button', { name: '닫기', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('[data-testid=help-request-button]')?.textContent === '👍 풀이 보기 (1)');
      assert.deepEqual(feedbackCalls.map(call => call.p_kind), ['unclear', 'like']);
      assert.deepEqual(errors, []);
    } finally { await context.close(); }
  }
  console.log('peer-help requester: phone and tablet passed');
} finally {
  if (browser) await browser.close();
  vite.kill();
}
