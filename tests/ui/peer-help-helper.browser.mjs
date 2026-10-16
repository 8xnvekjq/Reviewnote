import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const base = 'http://127.0.0.1:5182';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5182', '--strictPort'], { stdio: 'pipe', windowsHide: true });
let output = '', browser;
vite.stdout.on('data', data => { output += data; });
vite.stderr.on('data', data => { output += data; });
try {
  for (let i = 0; i < 100 && !output.includes('5182'); i++) {
    if (vite.exitCode !== null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  try {
    const image = `${base}/fake-help-problem.svg`;
    const label = { face: '🐱', title: null, grade: '고2' };
    let submitted = false, removed = false, file, empty = false, failList = false, failSubmit = true, givenShards = 0;
    const cancelled = [];
    const calls = [];
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.pathname === '/fake-help-problem.svg') return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="320"><rect width="600" height="320" fill="white"/><text x="30" y="70" font-size="32">x + 2 = 5</text></svg>' });
      if (url.origin === base) return route.continue();
      const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      const respond = (json, status = 200) => route.fulfill({ json, status, headers });
      const rpc = url.pathname.split('/rpc/')[1];
      if (rpc) calls.push({ rpc, body: req.postDataJSON() });
      if (rpc === 'list_help_requests') return failList ? respond({ message: '목록 오류예요' }, 400) : respond(empty ? [] : [{ id: 'request-1', image_url: image, title: '문제', chapter: '방정식', grade: '고2', created_at: new Date().toISOString(), solution_count: 1, requester: label, mine_submitted: submitted }, { id: 'request-2', image_url: image, chapter: '함수', grade: '고1', solution_count: 2, requester: label, mine_submitted: true }]);
      // 내가 도움 요청한 문제: 풀이가 온 요청 하나 + 해결된 요청 하나
      if (rpc === 'my_help_requests') return respond(empty ? [] : [
        { id: 'mine-1', mistake_id: 'm-1', status: 'open', created_at: '2026-10-16T02:00:00Z', image_url: image, title: '내 이차함수 문제', solution_count: 2, unseen_count: 1 },
        { id: 'mine-2', mistake_id: 'm-2', status: 'closed', created_at: '2026-10-15T02:00:00Z', image_url: image, title: '내 해결된 문제', solution_count: 1, unseen_count: 0 },
      ]);
      if (rpc === 'cancel_help_request') { cancelled.push(JSON.parse(route.request().postData() || '{}').p_request_id); return respond(null); }
      if (rpc === 'my_help_given') return respond(empty ? [] : [{ id: 'given-1', request_id: 'request-2', image_url: image, feedback: 'like', reward: givenShards ? 10 : 0, shards: givenShards, requester: label }, { id: 'given-2', request_id: 'request-3', image_url: image, feedback: 'unclear', reward: 5, requester: label }]);
      if (rpc === 'submit_help_solution') {
        if (failSubmit) { failSubmit = false; return respond({ message: '요청이 마감됐어요' }, 400); }
        submitted = true; return respond({ id: 'solution-1' });
      }
      if (rpc === 'admin_list_help') return respond([{ solution_id: 'solution-1', request_id: 'request-1', created_at: new Date().toISOString(), request_status: 'closed', image_url: image, mistake_title: '방정식', storage_path: 'helper/file.json.gz', stroke_count: 5, duration_ms: 24000, feedback: 'like', helper_reward: removed ? 0 : 30, requester_reward: removed ? 0 : 5, removed_at: removed ? new Date().toISOString() : null, file_available: true, request_created_at: new Date(Date.now() - 3600_000).toISOString(), solution_created_at: new Date().toISOString(), mistake_id: 'mistake-1', helper: { face: '🐱', title: null, grade: '중2' }, requester: { face: '🐻', title: null, grade: '중3' } }, { solution_id: null, request_id: 'request-2', created_at: new Date().toISOString(), request_status: 'open', image_url: image, mistake_title: '함수', storage_path: null, stroke_count: null, duration_ms: null, feedback: null, helper_reward: 0, requester_reward: 0, removed_at: null, file_available: false, request_created_at: new Date().toISOString(), solution_created_at: null, mistake_id: 'mistake-2', helper: null, requester: { face: '🐰', title: null, grade: '고1' } }]);
      if (url.pathname.endsWith('/rest/v1/mistakes')) return respond({ id: url.searchParams.get('id')?.slice(3), user_id: 'student', image_url: image, title: '방정식', created_at: new Date().toISOString() });
      if (rpc === 'admin_remove_help_solution') { removed = true; return respond({ removed: true, helper_clawback: 30, requester_clawback: 5 }); }
      if (url.pathname.includes('/storage/v1/object/')) {
        if (req.method() === 'POST') {
          const form = await new Request(req.url(), { method: 'POST', headers: { 'Content-Type': req.headers()['content-type'] }, body: req.postDataBuffer() }).formData();
          file = Buffer.from(await form.get('').arrayBuffer());
          return respond({ Key: 'file' });
        }
        return route.fulfill({ body: file, contentType: 'application/gzip', headers });
      }
      return respond([]);
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.clock.install();
    await page.goto(`${base}/tests/ui/peer-help-helper.html`);
    await page.getByText('보상 한도라 보상 없음', { exact: true }).waitFor();
    // 내가 도움 요청한 문제: 상태·새 풀이 수, 풀이 보기 버튼, 열린 요청만 취소 가능
    const mine = page.getByTestId('my-help-requests');
    await mine.getByText('도움 요청 중 · 풀이 2개 (새 풀이 1개)', { exact: true }).waitFor();
    await mine.getByText('해결됨 👍', { exact: true }).waitFor();
    assert.equal(await mine.getByRole('button', { name: '풀이 보기 (2)' }).count(), 1);
    assert.equal(await mine.getByRole('button', { name: '요청 취소' }).count(), 1, '해결된 요청은 취소 버튼이 없다');
    page.once('dialog', dialog => dialog.accept());
    await mine.getByRole('button', { name: '요청 취소' }).click();
    for (let i = 0; i < 50 && !cancelled.length; i++) await page.waitForTimeout(50);
    assert.deepEqual(cancelled, ['mine-1']);
    assert.equal(await page.getByText('+5P', { exact: true }).count(), 1);
    assert.equal(await page.getByRole('button').filter({ hasText: '내가 보냈어요' }).isDisabled(), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const open = () => page.getByRole('button').filter({ hasText: '방정식' }).click();
    await open();
    const send = page.getByRole('button', { name: '보내기', exact: true });
    assert.equal(await send.isDisabled(), true);
    await page.waitForFunction(() => document.querySelector('.exam-ink')?.dataset.ready === 'true');
    const draw = async index => {
      const box = await page.locator('.exam-ink-input').boundingBox();
      const x = box.x + 35, y = box.y + 40 + index * 18;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x + 75, y + 8, { steps: 6 }); await page.mouse.up();
    };
    await draw(0);
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: '나가기' }).click();
    assert.equal(await page.getByRole('dialog').count(), 1);
    await page.getByRole('button', { name: '실행 취소' }).click();
    assert.equal(await page.locator('.exam-ink').getAttribute('data-stroke-count'), '0');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '나가기' }).click();
    assert.equal(await page.getByRole('dialog').count(), 0);
    await open();
    await page.waitForFunction(() => document.querySelector('.exam-ink')?.dataset.ready === 'true');
    for (let i = 0; i < 5; i++) { await page.clock.fastForward(6000); await draw(i); }
    assert.equal(await send.isEnabled(), true);
    await send.click();
    await page.getByRole('alert').filter({ hasText: '요청이 마감됐어요' }).waitFor();
    await send.click();
    await page.getByText('보냈어요! 친구가 ‘도움 됐어요’를 누르면 지식의 조각 +1개 + 10P', { exact: true }).waitFor();
    assert.equal(calls.filter(call => call.rpc === 'submit_help_solution').length, 2);
    const submit = calls.find(call => call.rpc === 'submit_help_solution').body;
    assert.equal(submit.p_stroke_count, 5); assert.ok(submit.p_duration_ms >= 5000); assert.ok(file.length > 0);
    assert.ok(submit.p_storage_path.startsWith('11111111-1111-4111-8111-111111111111/'));
    await page.setViewportSize({ width: 1280, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    mkdirSync('.test-artifacts', { recursive: true });
    await page.screenshot({ path: '.test-artifacts/peer-help-helper-tablet.png' });
    givenShards = 1;
    await page.getByRole('button', { name: '새로고침' }).click();
    await page.getByText('지식의 조각 +1개 · +10P', { exact: true }).waitFor();
    assert.equal(await page.locator('body').getAttribute('data-points-changed'), 'true');
    empty = true;
    await page.getByRole('button', { name: '새로고침' }).click();
    await page.getByText('지금은 도움이 필요한 문제가 없어요.', { exact: false }).waitFor();
    failList = true;
    await page.getByRole('button', { name: '새로고침' }).click();
    await page.getByRole('alert').filter({ hasText: '목록 오류예요' }).waitFor();
    // 도와준 학생 로그인 알림: 👍/🤔와 받은 보상
    await page.goto(`${base}/tests/ui/peer-help-helper.html?feedback`);
    const notice = page.getByTestId('help-feedback-modal');
    await notice.getByText('내 풀이가 친구에게 도움이 됐어요!').waitFor();
    assert.match(await notice.innerText(), /지식의 조각 \+1개 · \+10P[\s\S]*\+5P/);
    await notice.getByRole('button', { name: '서로 도와주기에서 보기' }).click();
    await page.waitForFunction(() => document.body.dataset.goToHelp === 'true');
    await page.goto(`${base}/tests/ui/peer-help-helper.html?admin`);
    // 학생 화면과 같은 익명 라벨(이름 X), 질문·대답 날짜, 피드백은 이모지만, 포인트는 안 보인다.
    const answered = page.getByTestId('help-admin-row').filter({ hasText: '(중2)' });
    await answered.getByText('👍', { exact: true }).waitFor();
    assert.match(await answered.innerText(), /🐻[\s\S]*\(중3\)[\s\S]*질문 [\s\S]*대답 /);
    assert.doesNotMatch(await page.locator('body').innerText(), /\dP|secret/);
    // 아직 답이 없는 요청도 누가 물었는지 보인다(풀이 보기·지우기 버튼 없이).
    await page.getByTestId('help-admin-row').filter({ hasText: '(고1)' }).getByText('아직 답 없음').waitFor();
    assert.equal(await page.getByRole('button', { name: '풀이 보기' }).count(), 1);
    // 문제 사진을 누르면 그 오답노트가 열린다.
    await answered.getByRole('button', { name: '오답노트 열기' }).click();
    await page.waitForFunction(() => document.body.dataset.viewedMistake === 'mistake-1');
    await page.getByRole('button', { name: '풀이 보기' }).click();
    await page.getByRole('dialog').locator('.exam-ink').waitFor();
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    page.once('dialog', async dialog => { assert.match(dialog.message(), /포인트.*회수/); await dialog.dismiss(); });
    await page.getByRole('button', { name: '지우기', exact: true }).click();
    assert.equal(removed, false);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '지우기', exact: true }).click();
    await page.getByText('삭제됨', { exact: true }).waitFor();
    await page.getByRole('button', { name: '풀이 보기' }).click();
    await page.getByText('삭제된 풀이예요.', { exact: false }).waitFor();
    await page.getByRole('dialog').locator('.exam-ink').waitFor();
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: '.test-artifacts/peer-help-helper-admin-phone.png' });
    assert.deepEqual(errors, []);
    console.log('Peer help helper browser checks passed (390px / 1280px).');
  } finally { await context.close(); }
} finally {
  await browser?.close(); vite.kill();
  if (vite.exitCode === null) await new Promise(resolve => vite.once('exit', resolve));
}
