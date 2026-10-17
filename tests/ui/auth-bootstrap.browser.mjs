// 로그인 후 전체 불러오기(오답 목록 등)는 계정마다 한 번만: 같은 계정의 탭 복귀(SIGNED_IN)·토큰 갱신(TOKEN_REFRESHED)
// 때는 다시 받지 않고, 다른 계정으로 바뀌면 그 계정으로 다시, 로그아웃하면 비운 뒤 다시 로그인하면 다시 받는다.
// 실제 앱(index.html)을 띄우고 Supabase 요청은 가짜로 응답한다. 로그아웃·다른 계정 로그인은 실제 화면 버튼으로 한다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const port = 5179;
const base = `http://127.0.0.1:${port}`;
const storageKey = 'sb-authtest-auth-token'; // 아래 VITE_SUPABASE_URL(authtest.supabase.co) 기준
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'pipe', windowsHide: true, env: { ...process.env, VITE_SUPABASE_URL: 'https://authtest.supabase.co', VITE_SUPABASE_ANON_KEY: 'test-anon-key' } });
let output = '';
vite.stdout.on('data', value => { output += value; });
vite.stderr.on('data', value => { output += value; });

const userOf = (id, email) => ({ id, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-07-01T00:00:00Z' });
const A = userOf('11111111-1111-4111-8111-111111111111', 'student-a@reviewnote.com');
const B = userOf('22222222-2222-4222-8222-222222222222', 'student-b@reviewnote.com');
// setSession은 JWT 모양을 검사하므로 서명 없는 가짜 JWT를 만든다. 요청을 받은 쪽은 tag로 어느 토큰인지 구분한다.
const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (user, tag, expiresIn) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: user.id, email: user.email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + expiresIn, tag })}.sig`;
const tagOf = header => { try { return JSON.parse(Buffer.from((header || '').replace('Bearer ', '').split('.')[1] || '', 'base64url').toString()).tag ?? ''; } catch { return ''; } };
const sessionOf = (user, token, expiresIn = 3600) => ({
  access_token: jwt(user, token, expiresIn), refresh_token: `refresh-${token}`, token_type: 'bearer', expires_in: expiresIn,
  expires_at: Math.floor(Date.now() / 1000) + expiresIn, user,
});

let browser;
try {
  for (let i = 0; i < 150 && !output.includes(String(port)); i++) {
    if (vite.exitCode !== null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  const mistakesGets = [];
  let refreshes = 0;
  await context.routeWebSocket(/supabase/, ws => ws.close());
  await context.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin === base) return route.continue();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
    const respond = (json, status = 200) => route.fulfill({ json, status, headers: { 'Access-Control-Allow-Origin': '*' } });
    const token = tagOf(req.headers().authorization);
    if (process.env.DEBUG_AUTH) console.log('[req]', req.method(), url.pathname.replace(/^.*\/(rest|auth)\/v1/, '$1'), token.slice(0, 12));
    if (url.pathname.endsWith('/auth/v1/token')) {
      refreshes++;
      // 갱신 토큰이 가리키는 계정 그대로(짧은 만료 → 자동 갱신이 다시 돈다).
      if (url.searchParams.get('grant_type') === 'password') return respond(sessionOf(B, 'token-b-0', 3600));
      const isB = String(req.postDataJSON()?.refresh_token || '').includes('token-b');
      return respond(isB ? sessionOf(B, `token-b-r${refreshes}`, 3600) : sessionOf(A, `token-a-${refreshes}`, 40));
    }
    if (url.pathname.endsWith('/auth/v1/user')) return respond(token.startsWith('token-b') ? B : A);
    if (url.pathname.endsWith('/auth/v1/logout')) return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (url.pathname.endsWith('/rest/v1/mistakes') && req.method() === 'GET') {
      mistakesGets.push(token);
      return respond([]);
    }
    if (url.pathname.includes('/rpc/')) return respond([]);
    return respond([]);
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (process.env.DEBUG_AUTH) page.on('console', msg => console.log('[page]', msg.type(), msg.text().slice(0, 200)));
  // 만료가 40초 남은 세션 → 첫 화면 뒤 supabase-js 자동 갱신이 TOKEN_REFRESHED를 보낸다.
  await page.addInitScript(([key, value]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('seeded', '1'); } },
    [storageKey, JSON.stringify(sessionOf(A, 'token-a-0', 40))]);
  await page.goto(`${base}/`);
  await page.waitForFunction(() => document.querySelector('#root')?.children.length > 0);
  await page.waitForTimeout(3000);
  assert.equal(mistakesGets.length, 1, `first load fetches once (${mistakesGets.join(',')})`);

  // 같은 계정: 탭을 숨겼다 보이기(supabase-js가 SIGNED_IN을 다시 보냄) → 다시 받지 않는다.
  const flipVisibility = async state => page.evaluate(value => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => value });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value === 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
  await flipVisibility('hidden'); await page.waitForTimeout(300); await flipVisibility('visible');
  await page.waitForTimeout(2000);
  assert.equal(mistakesGets.length, 1, 'same-user SIGNED_IN on tab return does not refetch');

  // 같은 계정의 토큰 갱신(TOKEN_REFRESHED)도 다시 받지 않는다.
  await page.waitForFunction(() => true);
  for (let i = 0; i < 40 && refreshes === 0; i++) await page.waitForTimeout(1000);
  assert.ok(refreshes >= 1, 'token refresh happened');
  await page.waitForTimeout(1500);
  assert.equal(mistakesGets.length, 1, 'TOKEN_REFRESHED does not refetch');

  // 로그아웃(앱 메뉴) → 로그인 화면에서 다른 계정 B로 로그인 → B 토큰으로 한 번 다시 받는다.
  page.on('dialog', dialog => dialog.accept());
  // 로그인 직후 뜨는 안내 창(새 소식·보상 알림 등)을 닫는다.
  for (let i = 0; i < 6; i++) {
    const overlay = page.locator('div.fixed.inset-0.z-50').first();
    if (!(await overlay.isVisible().catch(() => false))) break;
    const close = overlay.getByRole('button', { name: /닫기|확인|나중에|✕|알겠어요|좋아요/ }).first();
    if (await close.isVisible().catch(() => false)) await close.click(); else await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  await page.getByRole('button', { name: '내 계정 메뉴' }).click();
  await page.getByRole('button', { name: /로그아웃/ }).click();
  await page.getByPlaceholder('로그인 아이디 입력 (영어/숫자)').waitFor();
  await page.getByPlaceholder('로그인 아이디 입력 (영어/숫자)').fill('student-b');
  await page.getByPlaceholder('••••••••').first().fill('password-b');
  await page.getByRole('button', { name: '로그인', exact: true }).click();
  for (let i = 0; i < 40 && mistakesGets.length < 2; i++) await page.waitForTimeout(200);
  assert.equal(mistakesGets.length, 2, `sign out + sign in as another account refetches once (${mistakesGets.join(',')})`);
  assert.ok(mistakesGets[1].startsWith('token-b'), `refetch uses the new account token (${mistakesGets[1]})`);
  await page.waitForTimeout(1500);
  assert.equal(mistakesGets.length, 2, 'only once after the new sign-in');

  // 20분 넘게 화면을 떠났다 돌아오면 한 번 다시 받는다(놓친 실시간 변경 회복).
  await page.evaluate(() => {
    const realNow = Date.now.bind(Date);
    let offset = 0;
    window.__advance = ms => { offset += ms; };
    Date.now = () => realNow() + offset;
  });
  await flipVisibility('hidden');
  await page.evaluate(() => window.__advance(21 * 60 * 1000));
  await flipVisibility('visible');
  for (let i = 0; i < 30 && mistakesGets.length < 3; i++) await page.waitForTimeout(200);
  assert.equal(mistakesGets.length, 3, 'long absence triggers one resync');

  assert.deepEqual(errors, []);
  console.log(`PASS auth bootstrap: once per account (refreshes=${refreshes}), switch/sign-out refetch, long-absence resync`);
} finally {
  if (browser) await browser.close();
  if (vite.exitCode === null) { const stopped = new Promise(resolve => vite.once('exit', resolve)); vite.kill(); await stopped; }
}
