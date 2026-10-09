// Pixel World 배경음악 브라우저 테스트 — 실제 PixelRoom(StrictMode 프리뷰 셸) + 실제 Web Audio.
// AudioContext 생성자와 destination 연결을 가로채서, 엔진 내부를 테스트용으로 노출하지 않고도
// "언제 컨텍스트가 생기는지 / 마스터 게인이 얼마인지 / 언제 멈추고 닫히는지"를 관찰한다.
//
// 사전 준비: 1) 별도 터미널에서 `npx vite --port 5174 --strictPort`로 dev 서버를 띄워 둔다.
//           2) `npm run test:pixel-bgm` (단위 테스트 후 이 파일을 실행).
//           다른 워크트리와 포트가 겹치면 PIXEL_TEST_PORT=5180 처럼 dev 서버와 같은 포트를 넘긴다.
//
// 자동재생 정책 에뮬레이션: 헤드리스 Edge는 --autoplay-policy 플래그를 줘도 제스처 없이 AudioContext를
// 돌리고, CDP 터치의 pointerdown도 활성화로 쳐 준다 — 그대로 두면 폰(특히 iOS)에서만 나는 잠금 해제
// 버그를 못 잡는다. 그래서 init 스크립트가 HTML 표준의 규칙을 그대로 흉내 낸다: 활성화는
// keydown / mousedown / 마우스 pointerdown / 비마우스 pointerup / touchend에서만 생기고(터치의
// pointerdown은 아님), AudioContext는 그 활성화 창 안에서만 시작(resume)할 수 있으며, 한 번 시작된
// 컨텍스트는 이후 제스처 없이도 resume할 수 있다.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { emptyFarm } from './emptyFarm.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const MASTER_LIMIT = 0.06;
const PORT = process.env.PIXEL_TEST_PORT || '5174';
const URL = `http://127.0.0.1:${PORT}/tests/pixel-room/?tab=pixelRoom&user=bgm-user`;
const browser = await chromium.launch({ headless: true });

async function openPage({ blockStorage = false, storedOn = false, touch = false, denyFirstStart = false } = {}) {
  const page = await browser.newPage(touch ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (storedOn) await page.addInitScript(() => { if (!sessionStorage.getItem('bgm-seeded')) { sessionStorage.setItem('bgm-seeded', '1'); localStorage.setItem('pixelWorld:bgm:v1', 'on'); } });
  await page.addInitScript(({ blockStorage, denyFirstStart }) => {
    const probe = window.__bgm = { contexts: [], masters: [], peak: new WeakMap() };
    let activeUntil = 0;
    const activate = () => { activeUntil = performance.now() + 1000; };
    // denyFirstStart: 첫 시작 시도 한 번은 활성화 중이어도 거절한다(정책이 막은 경우 재현용).
    let deny = denyFirstStart;
    const isActive = () => performance.now() < activeUntil;
    window.addEventListener('keydown', event => { if (event.key !== 'Escape') activate(); }, true);
    window.addEventListener('mousedown', activate, true);
    window.addEventListener('pointerdown', event => { if (event.pointerType === 'mouse') activate(); }, true);
    window.addEventListener('pointerup', event => { if (event.pointerType !== 'mouse') activate(); }, true);
    window.addEventListener('touchend', activate, true);
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      constructor(...args) {
        super(...args);
        probe.contexts.push(this);
        this.allowed = isActive() && !deny;
        if (!this.allowed) void super.suspend();
      }
      resume() {
        if (deny) { deny = false; return Promise.resolve(); }
        if (!this.allowed && !isActive()) return Promise.resolve(); // 막힌 resume: 조용히 suspended 유지
        this.allowed = true;
        return super.resume();
      }
    };
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (target, ...rest) {
      if (target instanceof AudioDestinationNode && this instanceof GainNode) probe.masters.push(this);
      return connect.call(this, target, ...rest);
    };
    // 어떤 자동화 경로로든 파라미터가 가려고 한 최댓값을 기억한다(램프 도중 샘플링만으로는 놓칠 수 있음).
    for (const method of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime']) {
      const original = AudioParam.prototype[method];
      AudioParam.prototype[method] = function (value, ...rest) { probe.peak.set(this, Math.max(probe.peak.get(this) ?? 0, value)); return original.call(this, value, ...rest); };
    }
    window.bgmState = () => {
      const ctx = probe.contexts.at(-1), master = probe.masters.at(-1);
      return { contexts: probe.contexts.length, masters: probe.masters.length, state: ctx?.state ?? null, time: ctx?.currentTime ?? 0,
        gain: master?.gain.value ?? null, peak: master ? Math.max(master.gain.value, probe.peak.get(master.gain) ?? 0) : null };
    };
    window.setHidden = hidden => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    if (blockStorage) Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
  }, { blockStorage, denyFirstStart });
  await page.route('**/src/utils/pixelFarm.ts', route => route.fulfill({ contentType: 'application/javascript', body: `export const fetchPixelFarm=async()=>(${JSON.stringify(emptyFarm())}); export const actPixelFarm=async()=>{throw new Error('no farm actions in bgm test');}; export const fetchHarvestedCrops=async()=>[]; export const submitFarmCrop=async()=>({ok:false}); export const fetchWeeklyCropContest=async()=>({weekStart:'2026-09-21',top:[],mine:{rank:null,sizeScore:null,participantCount:0}});` }));
  await page.route('**/src/services/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: "export { supabase } from '/tests/plaza/fakeRealtime.mjs';" }));
  await page.route('**/src/utils/pixelShop.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    export const buyPixelBait = async () => ({ok:false});
    export const fetchPixelBaitCharges = async () => 0;
    export const equipPixelRod = async () => ({ok:false});
    export const fetchEquippedRod = async () => null;
    export const fetchEquippedAppearance = async () => ({top:null,bottom:null,shoes:null,hair:null,eyes:null,skin:null});
    export const fetchOwnedPixelItemIds = async () => [];
    export const fetchPixelCatalog = async () => [];
    export const fetchPixelFurniturePlacement = async () => [];
    export const savePixelRoomLayout = async () => ({ok:true});
    export const purchasePixelItem = async () => ({ok:false});
    export const equipPixelItem = async () => ({ok:false});
    export const setPixelBaseAppearance = async () => ({ok:false});
  ` }));
  await page.goto(URL);
  await page.locator('.pr-actor').waitFor();
  return { page, errors };
}
const state = page => page.evaluate(() => window.bgmState());
const waitState = (page, expected) => page.waitForFunction(expected => window.bgmState().state === expected, expected, { timeout: 5000 });
const settled = page => page.waitForFunction(() => !document.querySelector('.pr-transition-active'));
const floor = (page, x, y) => page.locator('.pr-grid button').nth(y * 10 + x);

try {
  // 1) 기본값 꺼짐: 들어와서 돌아다녀도 AudioContext 자체가 만들어지지 않는다.
  {
    const { page, errors } = await openPage();
    const toggle = page.getByRole('button', { name: '배경음악' });
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    await floor(page, 2, 3).click();
    await page.waitForTimeout(600);
    assert.equal((await state(page)).contexts, 0, 'no AudioContext on first entry while music is off');

    // 2) 버튼 → 재생. 페이드인이 끝나도 마스터 게인은 상한 이하.
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    await waitState(page, 'running');
    await page.waitForTimeout(1900);
    let s = await state(page);
    assert.equal(s.contexts, 1); assert.equal(s.masters, 1);
    assert.ok(s.gain > 0.03 && s.gain <= MASTER_LIMIT, `master gain after fade-in ${s.gain}`);
    assert.ok(s.peak <= MASTER_LIMIT, `master gain never targeted above ${MASTER_LIMIT} (peak ${s.peak})`);
    assert.equal(await page.evaluate(() => localStorage.getItem('pixelWorld:bgm:v1')), 'on');

    // 3) 방 → 마당 → 광장 → 마당: 같은 컨텍스트가 계속 돌고 있다.
    const before = s.time;
    await floor(page, 4, 7).click();
    await page.locator('.pr-yard-board').waitFor(); await settled(page);
    s = await state(page);
    assert.equal(s.contexts, 1, 'scene change must not create a new AudioContext');
    assert.equal(s.state, 'running'); assert.ok(s.time > before, 'audio clock keeps advancing in the yard');
    assert.ok(Math.abs(s.gain - 0.05) < 0.005, `no dip or restart during the scene change (gain ${s.gain})`);
    await page.getByRole('button', { name: '길을 따라 광장으로 걸어가기' }).click();
    await page.locator('.pr-self-target').waitFor(); await settled(page);
    s = await state(page);
    assert.equal(s.contexts, 1); assert.equal(s.state, 'running');
    await page.getByRole('button', { name: '↓ 집 앞으로 가는 길' }).click();
    await page.locator('.pr-yard-board').waitFor(); await settled(page);

    // 4) 탭이 숨겨지면 일시정지, 돌아오면 같은 컨텍스트로 이어서.
    await page.evaluate(() => window.setHidden(true));
    await waitState(page, 'suspended');
    const pausedAt = (await state(page)).time;
    await page.waitForTimeout(400);
    assert.equal((await state(page)).time, pausedAt, 'clock is frozen while hidden');
    await page.evaluate(() => window.setHidden(false));
    await waitState(page, 'running');
    assert.equal((await state(page)).contexts, 1);

    // 5) 끄기: 페이드아웃 후 멈춤. 다시 켜면 같은 컨텍스트로 재개.
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    await page.waitForTimeout(700);
    s = await state(page);
    assert.equal(s.state, 'running', 'still fading out, not cut off');
    assert.ok(s.gain > 0 && s.gain < 0.05, `fading (gain ${s.gain})`);
    await waitState(page, 'suspended');
    assert.equal(await page.evaluate(() => localStorage.getItem('pixelWorld:bgm:v1')), 'off');
    await toggle.click();
    await waitState(page, 'running');
    assert.equal((await state(page)).contexts, 1);

    // 6) Pixel World를 나가면(언마운트) 정지하고 컨텍스트를 닫는다.
    await page.getByRole('button', { name: '← Reviewnote' }).click();
    await page.locator('.pr-shell').waitFor({ state: 'detached' });
    await waitState(page, 'closed');
    assert.deepEqual(errors, []);
    await page.close();
    console.log('PASS off by default, toggle plays under the gain cap, survives room→yard→plaza, pauses when hidden, fades off, closes on exit');
  }

  // 7) 켜짐으로 저장돼 있어도 첫 입력 전에는 컨텍스트가 없고, Pixel World 안의 첫 입력에서 시작한다.
  {
    const { page, errors } = await openPage({ storedOn: true });
    assert.equal(await page.getByRole('button', { name: '배경음악' }).getAttribute('aria-pressed'), 'true');
    await page.waitForTimeout(600);
    assert.equal((await state(page)).contexts, 0, 'no AudioContext before the first input even when saved as on');
    await floor(page, 2, 3).click();
    await waitState(page, 'running');
    assert.equal((await state(page)).contexts, 1);
    assert.deepEqual(errors, []);
    await page.close();
    console.log('PASS saved "on" waits for the first input inside Pixel World');
  }

  // 8) 폰: 켜짐 저장 + 첫 터치 탭 → 재생. 터치의 pointerdown은 사용자 활성화가 아니라서(표준상
  //    touchend/pointerup부터 인정) pointerdown에서 시작하면 컨텍스트가 suspended로 남는다.
  {
    const { page, errors } = await openPage({ storedOn: true, touch: true });
    assert.equal((await state(page)).contexts, 0);
    const cdp = await page.context().newCDPSession(page);
    const box = await floor(page, 2, 3).boundingBox();
    const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await page.waitForTimeout(120);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await waitState(page, 'running');
    await page.waitForTimeout(1900);
    const s = await state(page);
    assert.equal(s.contexts, 1);
    assert.ok(s.gain > 0.03 && s.gain <= MASTER_LIMIT, `touch-started master gain ${s.gain}`);
    assert.deepEqual(errors, []);
    await page.close();
    console.log('PASS touch: saved "on" + first tap (CDP touch) starts playback');
  }

  // 8b) 첫 시작이 정책에 막혀 suspended로 남아도, 다음 입력(탭)에서 다시 resume해서 재생된다.
  {
    const { page, errors } = await openPage({ storedOn: true, touch: true, denyFirstStart: true });
    await floor(page, 2, 3).tap();
    await page.waitForTimeout(500);
    let s = await state(page);
    assert.equal(s.contexts, 1); assert.equal(s.state, 'suspended', 'first start was refused');
    await floor(page, 3, 3).tap();
    await waitState(page, 'running');
    s = await state(page);
    assert.equal(s.contexts, 1, 'retry resumes the same context instead of making a new one');
    await page.waitForTimeout(1900);
    assert.ok((await state(page)).gain > 0.03, 'fade-in completes after the retry');
    assert.deepEqual(errors, []);
    await page.close();
    console.log('PASS refused first start is retried on the next input');
  }

  // 9) 켜짐 저장 + 첫 입력이 🎵 클릭(마우스·터치 모두): 그 입력으로 재생이 시작되고 켜짐이 유지된다.
  for (const touch of [false, true]) {
    const { page, errors } = await openPage({ storedOn: true, touch });
    const toggle = page.getByRole('button', { name: '배경음악' });
    if (touch) await toggle.tap(); else await toggle.click();
    await waitState(page, 'running');
    await page.waitForTimeout(300);
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true', 'the unlocking click starts music instead of turning it off');
    assert.equal(await page.evaluate(() => localStorage.getItem('pixelWorld:bgm:v1')), 'on');
    assert.equal((await state(page)).state, 'running');
    // 그다음 클릭은 평소처럼 끈다.
    if (touch) await toggle.tap(); else await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    await waitState(page, 'suspended');
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`PASS ${touch ? 'touch' : 'mouse'}: first input on 🎵 while saved "on" starts music; the next one turns it off`);
  }

  // 10) localStorage 접근이 막혀도 앱과 토글은 동작한다.
  {
    const { page, errors } = await openPage({ blockStorage: true });
    const toggle = page.getByRole('button', { name: '배경음악' });
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
    await waitState(page, 'running');
    assert.deepEqual(errors, []);
    await page.close();
    console.log('PASS blocked localStorage: toggle still works');
  }
} finally { await browser.close(); }
