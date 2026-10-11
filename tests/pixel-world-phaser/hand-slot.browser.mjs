// 손 칸 브라우저 테스트: 가방에서 낚싯대·잠자리채를 들고 내려놓기, 캐릭터 손의 도구, 잠자리채일 때만 잠자리.
// 실행: Vite를 127.0.0.1:5174에서 띄운 뒤 `node tests/pixel-world-phaser/hand-slot.browser.mjs`.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.PWP_BASE ?? 'http://127.0.0.1:5174';
const SHOTS = '.pixel-world-test.local/hand-slot';
await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch({ headless: true });
const debug = page => page.evaluate(() => window.__pixelWorldPhaser.debug());
const until = (page, fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout, polling: 50 });
const aLabel = page => page.locator('.pwp-btn-a').getAttribute('aria-label');

// 잠자리를 따라 걸어가 가까워질 때까지(잠자리는 계속 날아다닌다).
async function approachBug(page, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const d = await debug(page);
    if (d.bugNearby) return true;
    // 별3 이상은 도망가므로 쉬운(별1~2) 잠자리로 다가간다.
    const easy = d.bugs?.find((_, i) => ['dragonfly_red', 'dragonfly_wheat'].includes(d.bugKinds?.[i]?.bugId));
    if (easy) await page.evaluate(({ x, y }) => window.__pixelWorldPhaser.walkToScreen(x, y), easy);
    await page.waitForTimeout(200);
  }
  return false;
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/tests/pixel-world-phaser/harness.html?petWander=0&pet=none&net=1&bugs=1`);
  await until(page, () => window.__pixelWorldPhaser && document.querySelector('.pwp-root')?.dataset.status === 'ready', null, 20000);
  await page.bringToFront();

  // 처음에는 기본 낚싯대를 손에 든다.
  await until(page, () => window.__pixelWorldPhaser.debug().heldTool === 'rod');
  await page.locator('.pwp-bag-chip').click();
  const bag = page.getByRole('dialog', { name: '가방', exact: true }); await bag.waitFor();
  const slot = bag.getByRole('region', { name: '손 칸' });
  assert.equal(await slot.locator('[data-hand]').textContent(), '기본 낚싯대');
  assert.deepEqual(await slot.locator('[data-tool]').evaluateAll(els => els.map(e => e.dataset.tool)), ['rod_basic', 'rod_gold', 'tool_net']);
  await page.screenshot({ path: `${SHOTS}/bag-rod.png` });

  // 잠자리채를 들면 캐릭터 손에 잠자리채, 다시 내려놓으면 맨손.
  await slot.getByRole('button', { name: '잠자리채 손에 들기' }).click();
  await slot.getByText('잠자리채를 손에 들었어요.').waitFor();
  assert.equal(await slot.locator('[data-hand]').textContent(), '잠자리채');
  await until(page, () => window.__pixelWorldPhaser.debug().heldTool === 'net');
  await slot.getByRole('button', { name: '잠자리채 내려놓기' }).click();
  await slot.getByText('맨손이 되었어요. 도구는 가방에 넣었어요.').waitFor();
  await until(page, () => window.__pixelWorldPhaser.debug().heldTool === null);
  assert.match(await slot.textContent(), /맨손 낚시는 더 어렵고\(난이도 \+0\.5\) 느려요\(속도 −20%\)/);
  await slot.getByRole('button', { name: '황금 낚싯대 손에 들기' }).click();
  await until(page, () => window.__pixelWorldPhaser.debug().heldTool === 'rod');
  assert.equal(await slot.locator('[data-hand]').textContent(), '황금 낚싯대');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${SHOTS}/walk-rod.png` });

  // 잠자리는 서버(모의)가 정한 종류로 난다.
  await until(page, () => window.__pixelWorldPhaser.debug().bugKinds?.some(b => b.bugId));
  // 낚싯대를 든 채로는 잠자리 가까이 가도 A가 잠자리채가 되지 않는다.
  const reached = await approachBug(page);
  assert.ok(reached, '잠자리 가까이 가기');
  assert.notEqual(await aLabel(page), 'A · 잠자리채');

  // 잠자리채를 들면 A가 잠자리채 — 누르면 별1~2는 바로 잡히고, 별3~5만 미니게임.
  await page.locator('.pwp-bag-chip').click(); await bag.waitFor();
  await slot.getByRole('button', { name: '잠자리채 손에 들기' }).click();
  await until(page, () => window.__pixelWorldPhaser.debug().heldTool === 'net');
  await page.keyboard.press('Escape');
  await page.screenshot({ path: `${SHOTS}/walk-net.png` });
  // 잠자리 근처가 아니어도 A로 허공에 휘두른다(손의 잠자리채는 그동안 감춘다).
  assert.equal(await aLabel(page), 'A · 잠자리채');
  await page.locator('.pwp-btn-a').tap();
  await until(page, () => window.__pixelWorldPhaser.debug().heldTool === 'net' && document.querySelector('[role=dialog]') === null);
  // 맞은 사람 표시(x.x 눈 + 별): 화면 모양만 확인한다(맞히기 판정은 단위 테스트).
  await page.evaluate(async () => { const m = await import('/src/features/pixel-world-phaser/game/dragonflies.ts'); m.dragonfliesFor('yard').makeDizzy('self'); });
  await until(page, () => window.__pixelWorldPhaser.debug().dizzy?.includes('self'));
  await page.screenshot({ path: `${SHOTS}/dizzy.png` });
  assert.ok(await approachBug(page)); await until(page, () => document.querySelector('.pwp-btn-a')?.getAttribute('aria-label') === 'A · 잠자리채');
  await page.locator('.pwp-btn-a').tap();
  const game = page.getByRole('dialog', { name: '잠자리 잡기', exact: true });
  const caught = page.getByRole('dialog', { name: '잠자리를 잡았어요!', exact: true });
  const first = await Promise.race([game.waitFor().then(() => 'game'), caught.waitFor().then(() => 'caught')]);
  if (first === 'caught') {
    const text = await caught.textContent();
    assert.match(text, /★/); assert.ok(!/★★★/.test(text), `바로 잡히는 건 별1~2: ${text}`);
    console.log('auto-catch:', text);
  } else {
    console.log('mini-game opened (★3 이상)');
    await page.keyboard.press('Escape');
  }
  await page.screenshot({ path: `${SHOTS}/catch.png` });
  assert.deepEqual(errors, []);
  console.log('PASS hand slot: equip/unequip, held tool, net-only bugs');
} finally { await browser.close(); }
