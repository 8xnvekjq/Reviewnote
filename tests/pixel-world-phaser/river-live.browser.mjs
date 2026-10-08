// 강가 실시간: 두 페이지가 가짜 realtime(fakeRealtime.mjs)으로 같은 강가에 들어간다.
// A는 B를 보고, B가 던지면 찌를, 입질이면 "!"를, 잡으면 "붕어 23.4cm!" 같은 구름을 본다. B가 떠나면 A에서 사라진다. 광장은 그대로 된다.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const BASE = process.env.PWP_BASE ?? 'http://127.0.0.1:5174';
const SHOTS = '.pixel-world-test.local';
const browser = await chromium.launch({ headless: true });
const debug = page => page.evaluate(() => window.__pixelWorldPhaser.debug());
const ready = (page, scene) => page.waitForFunction(scene => window.__pixelWorldPhaser?.debug().scene === scene && !window.__pixelWorldPhaser.debug().transitioning, scene, { timeout: 20000 });
const exit = async (page, pattern) => { await page.bringToFront(); return page.evaluate(pattern => { const h = window.__pixelWorldPhaser, exits = h.debug().exits, key = Object.keys(exits).find(k => new RegExp(pattern).test(k)); h.walkToScreen(exits[key].x, exits[key].y); }, pattern); };
const walkTo = async (page, cell) => {
  await page.bringToFront();
  await page.evaluate(([x, y]) => { const h = window.__pixelWorldPhaser, d = h.debug(); h.walkToScreen((x * 16 + 8 - d.camera.x) * d.cssZoom, (y * 16 + 8 - d.camera.y) * d.cssZoom); }, cell);
  await page.waitForFunction(x => { const d = window.__pixelWorldPhaser.debug(); return !d.moving && d.pathLength === 0 && d.x > x * 16; }, cell[0], { timeout: 20000 });
};
const liveReady = page => page.waitForFunction(() => document.querySelector('.pwp-plaza-reactions')?.dataset.ready === 'true', null, { timeout: 20000 });
const topics = page => page.evaluate(() => window.plazaTransport.audit().topics);
try {
  await mkdir(SHOTS, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const errors = [];
  await context.route('**/src/services/supabase.ts', route => route.fulfill({ contentType: 'application/javascript', body: "export { supabase } from '/tests/pixel-world-phaser/fakeRealtime.mjs';" }));
  const a = await context.newPage(), b = await context.newPage();
  for (const [page, query, cell] of [[a, '&pet=pet_dog&top=stripe', [11, 11]], [b, '&pet=pet_duck&top=blouse_rose', [3, 14]]]) {
    page.on('pageerror', e => errors.push(e.message));
    await page.bringToFront();
    await page.goto(BASE + '/tests/pixel-world-phaser/harness.html?fishing=1' + query);
    await page.waitForFunction(() => document.querySelector('.pwp-root')?.dataset.status === 'ready');
    await ready(page, 'yard');
    assert.deepEqual(await topics(page), [], 'yard has no subscription');
    await exit(page, 'river|east'); await ready(page, 'river');
    await liveReady(page);
    assert.deepEqual(await topics(page), ['pixel-world-river'], 'river joins its own channel, not the plaza one');
    await walkTo(page, cell);
  }
  // 서로 아바타와 펫이 보인다.
  for (const page of [a, b]) { await page.bringToFront(); await page.waitForFunction(() => { const c = window.__pixelWorldPhaser.debug().classmates; return c?.length === 1 && c[0].rendered && c[0].pet; }, null, { timeout: 20000 }); }
  // 위치는 강가 좌표 그대로(광장 16×12 범위를 넘어도 — B는 안쪽 풀밭 y=14) 전달된다.
  await a.bringToFront();
  await a.waitForFunction(() => { const c = window.__pixelWorldPhaser.debug().classmates[0]; return c && Math.abs(c.x - 3) < .1 && Math.abs(c.y - 14) < .1 && !c.fishing; });
  const payload = await b.evaluate(() => window.plazaTransport.last());
  assert.ok(!('name' in payload) && !('userId' in payload) && !('email' in payload), 'anonymous presence');

  // B가 그림자를 톡 → A 화면에 B의 줄·찌.
  await b.bringToFront();
  await b.waitForFunction(() => window.__pixelWorldPhaser.debug().targets['shadow:0']);
  // B는 물가에서 멀고(안쪽 풀밭), 그림자 0은 화면 위쪽 밖일 수 있어 화면 좌표로 바로 누른다 → 가까운 물가 자리로 걸어간 뒤 던진다.
  await b.evaluate(() => { const h = window.__pixelWorldPhaser, t = h.debug().targets['shadow:0']; h.walkToScreen(t.x, t.y); });
  await b.waitForFunction(() => !!window.__pixelWorldPhaser.debug().pendingCast, null, { timeout: 3000 });
  await b.waitForFunction(() => ['casting', 'waiting'].includes(document.querySelector('.pwp-root')?.dataset.fishingPhase));
  await a.bringToFront();
  await a.waitForFunction(() => { const f = window.__pixelWorldPhaser.debug().classmates[0]?.fishing; return f && ['casting', 'waiting'].includes(f.phase) && !f.bang; }, null, { timeout: 5000 });
  const cast = (await b.evaluate(() => window.plazaTransport.sent('fish'))).find(s => s.payload.phase === 'casting');
  assert.equal(cast.topic, 'pixel-world-river'); assert.ok(cast.payload.target.x > 0 && cast.payload.target.y > 0);
  // B는 그림자 0에서 멀어서 가까운 물가 자리로 걸어간 뒤 던졌다. A가 보는 B는 그 물가 자리에 있고, 찌는 물 위 그림자 근처다.
  const bView = await debug(b);
  const spot = bView.bankSpots.find(s => Math.hypot(s.x - bView.x, s.y - bView.y) < 2);
  assert.ok(spot, `B cast from a bank spot (${bView.x},${bView.y})`);
  await a.waitForFunction(spot => { const c = window.__pixelWorldPhaser.debug().classmates[0]; return c && Math.hypot(c.x - (spot.x / 16 - .5), c.y - (spot.y / 16 - .5)) < .15; }, spot, { timeout: 5000 });
  assert.ok(Math.hypot(cast.payload.target.x - bView.castFrom.x, cast.payload.target.y - bView.castFrom.y) < 4 * 16, 'bobber lands within reach of the bank spot');
  await a.screenshot({ path: SHOTS + '/river-live-cast.png' });
  // 입질 → A에 "!".
  await b.bringToFront();
  await b.waitForFunction(() => document.querySelector('.pwp-root')?.dataset.fishingPhase === 'bite', null, { timeout: 10000 });
  // 입질 창은 1초 남짓이라 페이지를 바꾸지 않고 A를 바로 확인한 뒤 B가 챈다.
  await a.waitForFunction(() => window.__pixelWorldPhaser.debug().classmates[0]?.fishing?.bang === true, null, { polling: 50, timeout: 1500 });
  await b.locator('.pwp-btn-a').tap();
  // 챔 → 릴 미니게임이 시작되는 순간 'reeling'을 보낸다(아직 잡은 게 아니다).
  await b.getByTestId('reel-bar').waitFor();
  assert.deepEqual((await b.evaluate(() => window.plazaTransport.sent('fish'))).map(s => s.payload.phase), ['casting', 'waiting', 'bite', 'reeling'], 'reeling is sent when the reel starts, landed only after it');
  await a.waitForFunction(() => window.__pixelWorldPhaser.debug().classmates[0]?.fishing?.phase === 'reeling', null, { polling: 50, timeout: 3000 });
  await a.screenshot({ path: SHOTS + '/river-live-reeling.png' });
  // 릴을 끝까지 감아야 잡힌다. 잡으면 B 머리 위 구름 "이름 00.0cm!"가 A에도.
  // 물고기와 칸의 위치·속도를 읽고 추적해서 탭한다(꾹 누르기는 처음 한 번만 올린다).
  await b.bringToFront();
  const card = b.getByTestId('catch-card');
  let lastTap = -1000;
  for (let i = 0; i < 1200 && !(await card.isVisible()); i++) {
    const state = await b.getByTestId('reel-bar').evaluate(el => ({ zone: +el.dataset.zone, fish: +el.dataset.fish, velocity: +el.dataset.velocity, time: +el.dataset.elapsed * 1000 }));
    if (state.time - lastTap >= 150 && state.zone < state.fish - .06 && state.velocity < .1) {
      lastTap = state.time; await b.keyboard.press('Space');
    }
    if (i === 3) await b.screenshot({ path: SHOTS + '/river-live-reelbar.png' });
    await b.waitForTimeout(40);
  }
  await card.waitFor({ timeout: 5000 });
  const landed = (await b.evaluate(() => window.plazaTransport.sent('fish'))).find(s => s.payload.phase === 'landed');
  assert.ok(landed, 'landed event was sent');
  const ending = landed.payload.lengthCm.toFixed(1) + 'cm!';
  const phases = (await b.evaluate(() => window.plazaTransport.sent('fish'))).map(s => s.payload.phase);
  assert.deepEqual(phases, ['casting', 'waiting', 'bite', 'reeling', 'landed'], 'B reports each phase once in order');
  await b.waitForFunction(ending => window.__pixelWorldPhaser.debug().bubbles.some(v => v.text.endsWith(ending)), ending);
  await a.bringToFront();
  await a.waitForFunction(ending => window.__pixelWorldPhaser.debug().bubbles.some(v => v.text.endsWith(ending) && v.alpha === 1), ending, { timeout: 5000 });
  const bubble = (await debug(a)).bubbles.find(v => v.text.endsWith(ending));
  assert.match(bubble.text, /^\S.* \d+\.\dcm!$/);
  await a.screenshot({ path: SHOTS + '/river-live-catch.png' });
  await a.waitForFunction(() => !window.__pixelWorldPhaser.debug().classmates[0].fishing, null, { timeout: 5000 });

  // 희귀/전설은 반짝임 — B가 보낸 것처럼 꾸민 정상 전설 payload. 이상한 payload(도감 밖·길이 범위 밖·HTML)는 무시.
  const bId = await b.evaluate(() => window.plazaTransport.last().sessionId);
  await b.evaluate(id => {
    const bus = new BroadcastChannel('phaser-plaza-test');
    const send = payload => bus.postMessage({ topic: 'pixel-world-river', kind: 'broadcast', event: 'fish', payload });
    send({ sessionId: id, seq: 9001, phase: 'landed', speciesId: 'shark', lengthCm: 30 });
    send({ sessionId: id, seq: 9002, phase: 'landed', speciesId: 'buri', lengthCm: 999 });
    send({ sessionId: id, seq: 9003, phase: 'landed', speciesId: '<img src=x onerror=alert(1)>', lengthCm: 12 });
    send({ sessionId: id, seq: 9004, phase: 'casting', target: { x: 1e9, y: 3 } });
    setTimeout(() => send({ sessionId: id, seq: 9010, phase: 'landed', speciesId: 'moonfish', lengthCm: 11.2 }), 400);
  }, bId);
  await a.bringToFront();
  await a.waitForFunction(() => window.__pixelWorldPhaser.debug().bubbles.some(v => v.text === '달빛 피라미 11.2cm!'), null, { timeout: 5000 });
  assert.equal((await debug(a)).bubbles.some(v => /shark|999|img/.test(v.text)), false, 'invalid catches are dropped');
  assert.equal(await a.locator('img[src=x]').count(), 0);
  await a.waitForFunction(() => window.__pixelWorldPhaser.debug().sparkles.length === 1);
  await a.screenshot({ path: SHOTS + '/river-live-sparkle.png' });

  // 강가 한마디·인사도 광장과 같은 구름으로.
  await b.bringToFront();
  await b.waitForTimeout(1600);
  await b.getByRole('button', { name: '한마디 하기' }).click();
  await b.getByRole('textbox', { name: '한마디' }).fill('여기 붕어 많아!');
  await b.getByRole('textbox', { name: '한마디' }).press('Enter');
  await b.getByRole('button', { name: '한마디 닫기' }).click();
  await a.bringToFront();
  await a.waitForFunction(() => window.__pixelWorldPhaser.debug().bubbles.some(v => v.text === '여기 붕어 많아!'));
  await a.getByRole('button', { name: '안녕!', exact: true }).click();
  await b.bringToFront();
  await b.waitForFunction(() => window.__pixelWorldPhaser.debug().bubbles.some(v => v.text === '안녕!'));

  // B가 강가를 떠나면 A에서 사라지고 B는 구독을 정리한다.
  await exit(b, 'river→yard'); await ready(b, 'yard');
  await b.waitForFunction(() => window.plazaTransport.audit().active.length === 0);
  await a.bringToFront();
  await a.waitForFunction(() => window.__pixelWorldPhaser.debug().classmates.length === 0 && window.__pixelWorldPhaser.debug().bubbles.length === 0, null, { timeout: 5000 });
  // 다시 들어오면 다시 보인다.
  await exit(b, 'river|east'); await ready(b, 'river'); await liveReady(b);
  await a.bringToFront();
  await a.waitForFunction(() => window.__pixelWorldPhaser.debug().classmates.length === 1, null, { timeout: 10000 });
  assert.equal((await debug(a)).classmates[0].fishing, null, 'rejoined classmate has no stale line');

  // 광장은 그대로: A가 광장으로 가면 강가 구독은 끝나고 광장 채널만. 강가의 B와는 서로 안 보인다.
  await exit(a, 'river→yard'); await ready(a, 'yard');
  await a.waitForFunction(() => window.plazaTransport.audit().active.length === 0);
  await exit(a, 'gate'); await ready(a, 'plaza'); await liveReady(a);
  assert.deepEqual(await topics(a), ['pixel-world-plaza']);
  await a.waitForTimeout(500);
  assert.equal((await debug(a)).classmates.length, 0, 'river player is not in the plaza');
  await b.bringToFront();
  await b.waitForFunction(() => window.__pixelWorldPhaser.debug().classmates.length === 0);
  await exit(b, 'river→yard'); await ready(b, 'yard');
  await exit(b, 'gate'); await ready(b, 'plaza'); await liveReady(b);
  for (const page of [a, b]) { await page.bringToFront(); await page.waitForFunction(() => { const c = window.__pixelWorldPhaser.debug().classmates; return c?.length === 1 && c[0].rendered; }, null, { timeout: 20000 }); }
  await b.getByRole('button', { name: '한마디 하기' }).click();
  await b.getByRole('textbox', { name: '한마디' }).fill('광장도 잘 돼');
  await b.getByRole('textbox', { name: '한마디' }).press('Enter');
  await a.bringToFront();
  await a.waitForFunction(() => window.__pixelWorldPhaser.debug().bubbles?.some(v => v.text === '광장도 잘 돼'));
  for (const page of [a, b]) { await page.bringToFront(); await page.locator('.pwp-exit').click(); await page.getByTestId('exited').waitFor(); await page.waitForFunction(() => window.plazaTransport.audit().active.length === 0); }
  assert.deepEqual(errors, []);
  await context.close();
  console.log('PASS river live: own channel, two-page avatars/pets, cast bobber, bite, catch bubble, legendary sparkle, invalid payloads dropped, chat/greeting, leave/rejoin cleanup, plaza unaffected');
} finally { await browser.close(); }
