import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const base = 'http://127.0.0.1:5178';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5178', '--strictPort'], { stdio: 'pipe', windowsHide: true });
let output = '';
vite.stdout.on('data', value => { output += value; });
vite.stderr.on('data', value => { output += value; });
let browser;
try {
  for (let i = 0; i < 100 && !output.includes('5178'); i++) {
    if (vite.exitCode !== null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  try {
    let used = false, expired = false, fail = false;
    let creates = 0;
    const calls = [];
    const user = { id: '11111111-1111-4111-8111-111111111111', email: 'student@reviewnote.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
    const token = 'a'.repeat(43);
    const session = { access_token: 'test-access', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user };
    await context.routeWebSocket(/supabase/, ws => ws.close());
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === base) return route.continue();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
      const respond = (json, status = 200) => route.fulfill({ json, status, headers: { 'Access-Control-Allow-Origin': '*' } });
      if (url.pathname.endsWith('/rpc/create_qr_login_token')) {
        creates++;
        return respond({ id: '22222222-2222-4222-8222-222222222222', token, code: 'ABCDEFGH', expires_at: new Date(Date.now() + 60000).toISOString() });
      }
      if (url.pathname.endsWith('/rpc/qr_login_token_status')) return respond(used ? 'used' : expired ? 'expired' : 'pending');
      if (url.pathname.endsWith('/functions/v1/qr-login')) {
        calls.push({ kind: 'redeem', body: req.postDataJSON() });
        return fail ? respond({ error: '실패' }, 400) : respond({ token_hash: 'verified-hash' });
      }
      if (url.pathname.endsWith('/auth/v1/verify')) {
        calls.push({ kind: 'verify', body: req.postDataJSON() });
        return respond(session);
      }
      if (url.pathname.endsWith('/auth/v1/user')) return respond(user);
      if (url.pathname.endsWith('/auth/v1/token')) return respond(session);
      return respond([]);
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/tests/ui/qr-login.html?mode=phone`);
    await page.getByRole('button', { name: '내 계정 메뉴' }).click();
    await page.getByRole('button', { name: '다른 기기 로그인 (QR)', exact: true }).click();
    await page.waitForTimeout(400); await page.screenshot({ path: '.test-artifacts/qr-login-phone.png' }).catch(() => {});
    await page.getByAltText('다른 기기 로그인 QR 코드').waitFor();
    assert.match(await page.getByAltText('다른 기기 로그인 QR 코드').getAttribute('src'), /^data:image\/png/);
    assert.equal(await page.getByTestId('qr-login-code').innerText(), 'ABCD-EFGH');
    assert.match(await page.getByTestId('qr-login-countdown').innerText(), /남은 시간 \d+초/);
    assert.equal(creates, 1, 'StrictMode에서도 생성 요청은 한 번만 한다');
    used = true;
    await page.getByText('다른 기기에서 로그인됐어요 ✓').waitFor();
    await page.getByTestId('qr-login-modal').getByText('친구에게 보여주지 마세요', { exact: false }).waitFor();
    used = false;
    await page.goto(`${base}/tests/ui/qr-login.html?mode=phone`);
    await page.getByRole('button', { name: '내 계정 메뉴' }).click();
    await page.getByRole('button', { name: '다른 기기 로그인 (QR)', exact: true }).click();
    await page.getByTestId('qr-login-code').waitFor();
    expired = true;
    await page.getByRole('button', { name: '새로 만들기' }).waitFor();
    expired = false;
    await page.getByRole('button', { name: '새로 만들기' }).click();
    await page.getByTestId('qr-login-code').waitFor();

    await page.goto(`${base}/tests/ui/qr-login.html?mode=admin`);
    await page.getByRole('button', { name: '내 계정 메뉴' }).click();
    assert.equal(await page.getByRole('button', { name: '다른 기기 로그인 (QR)', exact: true }).count(), 0);

    await page.goto(`${base}/tests/ui/qr-login.html?qr=${token}&keep=1#anchor`);
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('qr'));
    await page.waitForFunction(() => localStorage.length > 0);
    assert.equal(new URL(page.url()).searchParams.get('keep'), '1');
    assert.equal(new URL(page.url()).hash, '#anchor');
    assert.deepEqual(calls.slice(-2), [
      { kind: 'redeem', body: { token } },
      { kind: 'verify', body: { token_hash: 'verified-hash', type: 'magiclink', gotrue_meta_security: {} } },
    ]);
    const previousCalls = calls.length;
    await page.goto(`${base}/tests/ui/qr-login.html?qr=${token}`);
    await page.waitForFunction(() => !new URL(location.href).searchParams.has('qr'));
    await page.waitForTimeout(500);
    assert.equal(calls.length, previousCalls, '기존 세션을 다른 계정으로 바꾸지 않는다');
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${base}/tests/ui/qr-login.html`);
    await page.getByRole('button', { name: '휴대폰으로 로그인 (코드 입력)' }).click();
    await page.getByRole('textbox', { name: '로그인 코드' }).fill('abcd-efgh');
    await page.screenshot({ path: '.test-artifacts/qr-login-code.png' }).catch(() => {});
    await page.getByRole('button', { name: '코드로 로그인', exact: true }).click();
    await page.waitForFunction(() => localStorage.length > 0);
    assert.deepEqual(calls.at(-2), { kind: 'redeem', body: { code: 'ABCDEFGH' } });
    await page.evaluate(() => localStorage.clear());
    fail = true;
    await page.goto(`${base}/tests/ui/qr-login.html?qr=${token}`);
    await page.getByText('QR이 만료됐거나 이미 사용됐어요. 휴대폰에서 새로 만들어 주세요.', { exact: false }).waitFor();
    assert.equal(new URL(page.url()).searchParams.has('qr'), false);
    assert.deepEqual(errors, []);
    console.log('QR 로그인 브라우저 검사 통과');
  } finally { await context.close(); }
} finally {
  await browser?.close();
  vite.kill();
  if (vite.exitCode === null) await new Promise(resolve => vite.once('exit', resolve));
}
