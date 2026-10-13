// 카드 가위바위보 화면(2026-10-13 픽셀 게임 화면): 크기별 배치 + 치즈와 한 경기 끝까지.
// 실행: dev 서버(5174) 띄운 뒤 node tests/pixel-world-phaser/card-rps.browser.mjs
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.PWP_BASE ?? 'http://127.0.0.1:5174';
const SIZES = [[390, 844], [844, 390], [820, 1180], [1180, 820], [1366, 768]];
const browser = await chromium.launch({ headless: true, ...(process.env.EXAM_BROWSER_CHANNEL ? { channel: process.env.EXAM_BROWSER_CHANNEL } : {}) });

const mode = page => page.locator('.pwp-rps').getAttribute('data-mode');
const waitMode = (page, modes, timeout = 30000) => page.waitForFunction(list => list.includes(document.querySelector('.pwp-rps')?.getAttribute('data-mode')), modes, { timeout });
const queueHands = page => page.locator('.pwp-rps-queue [data-queue-slot]').evaluateAll(els => els.map(el => el.getAttribute('data-hand')));

async function assertInside(page, selector, width, height, label) {
  const boxes = await page.locator(selector).evaluateAll(els => els.map(el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }));
  assert.ok(boxes.length, `${label}: ${selector} 없음`);
  for (const box of boxes) assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.w <= width + 1 && box.y + box.h <= height + 1, `${label}: ${selector} 화면 밖 ${JSON.stringify(box)}`);
}
async function assertNoScroll(page, width, height, label) {
  const size = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, tray: (() => { const t = document.querySelector('.pwp-rps-tray'); return t ? t.scrollHeight - t.clientHeight : 0; })() }));
  assert.ok(size.w <= width + 1, `${label}: 가로 스크롤 ${size.w}`);
  assert.ok(size.tray <= 1, `${label}: 쟁반 안 스크롤 ${size.tray}px`);
}
const tapCard = async (page, locator, touch) => touch ? locator.tap() : locator.click();

try {
  await mkdir('.test-artifacts', { recursive: true });
  // 1) 크기별 배치: 손패·"내기" 버튼이 스크롤 없이 화면 안에 있다(카드를 6장, 9장 올린 가장 긴 경우까지).
  for (const [width, height] of SIZES) {
    const touch = width < 900;
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: touch, isMobile: touch && width < height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${base}/tests/pixel-world-phaser/card-rps.harness.html`);
    await waitMode(page, ['choosing']);
    const label = `${width}x${height}`;
    await assertInside(page, '.pwp-rps-submit', width, height, label);
    await assertInside(page, '.pwp-rps-handcard', width, height, label);
    assert.equal(await page.locator('.pwp-rps-handcard').count(), 9, `${label}: 손패 9장을 한 장씩 보여 준다`);
    await page.screenshot({ path: `.test-artifacts/card-rps-${label}.png` });
    for (let i = 0; i < 6; i++) await tapCard(page, page.locator('.pwp-rps-handcard').first(), touch);
    assert.equal((await queueHands(page)).length, 6);
    await assertInside(page, '.pwp-rps-submit', width, height, `${label} 6장`);
    await assertInside(page, '.pwp-rps-queue [data-queue-slot]', width, height, `${label} 6장`);
    await assertInside(page, '.pwp-rps-handcard', width, height, `${label} 6장`);
    await assertNoScroll(page, width, height, `${label} 6장`);
    for (let i = 0; i < 3; i++) await tapCard(page, page.locator('.pwp-rps-handcard').first(), touch);
    assert.equal((await queueHands(page)).length, 9, `${label}: 9장 모두 낼 수 있다`);
    assert.match(await page.locator('.pwp-rps-submit').innerText(), /9장/);
    await assertInside(page, '.pwp-rps-submit', width, height, `${label} 9장`);
    await assertNoScroll(page, width, height, `${label} 9장`);
    await page.screenshot({ path: `.test-artifacts/card-rps-${label}-9.png` });
    await page.close();
  }

  // 2) 치즈와 한 경기: 손패 누르기 → 줄에서 끌어 순서 바꾸기(포인터) → 내기 → 자동 공개 → (승부차기) → 결과.
  {
    const [width, height] = [820, 1180];
    const page = await browser.newPage({ viewport: { width, height }, hasTouch: true });
    await page.goto(`${base}/tests/pixel-world-phaser/card-rps.harness.html`);
    await waitMode(page, ['choosing']);
    assert.equal(await page.locator('.pwp-rps-playback, button:has-text("한 단계"), button:has-text("자동 재생")').count(), 0, '단계 버튼은 없다');
    let round = 0, revealShot = false, shootoutShot = false;
    for (let guard = 0; guard < 20; guard++) {
      const now = await mode(page);
      if (now === 'result') break;
      if (now === 'shootout') {
        if (!shootoutShot) { await page.screenshot({ path: '.test-artifacts/card-rps-shootout.png' }); shootoutShot = true; }
        await page.locator('.pwp-rps-shoot-card:enabled').first().click();
        // 둘이 동시에 뒤집는 연출이 끝나야 다음 화면(한 번 더 / 결과).
        await waitMode(page, ['reveal']);
        await waitMode(page, ['shootout', 'result']);
        continue;
      }
      assert.equal(now, 'choosing', `예상 밖 화면 ${now}`);
      round += 1;
      const hand = page.locator('.pwp-rps-handcard');
      if (round === 1) {
        // 바위 한 장, 보 두 장 → [바위, 보, 보]. 첫 카드를 끝으로 끌면 [보, 보, 바위].
        await hand.first().tap();
        await hand.last().tap();
        await hand.last().tap();
        assert.deepEqual(await queueHands(page), ['rock', 'paper', 'paper']);
        const from = await page.locator('.pwp-rps-queue [data-queue-slot]').first().boundingBox();
        const to = await page.locator('.pwp-rps-queue [data-queue-slot]').last().boundingBox();
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        for (let step = 1; step <= 8; step++) await page.mouse.move(from.x + from.width / 2 + (to.x + to.width - from.x) * step / 8, from.y + from.height / 2);
        assert.equal(await page.locator('.pwp-rps-handtray[data-dragging="true"]').count(), 1, '끄는 중 표시');
        await page.screenshot({ path: '.test-artifacts/card-rps-drag.png' });
        await page.mouse.up();
        assert.deepEqual(await queueHands(page), ['paper', 'paper', 'rock'], '끌어서 순서를 바꾼다');
        // 누르면(끌지 않고) 손으로 돌아간다.
        await page.locator('.pwp-rps-queue [data-queue-slot]').last().tap();
        assert.deepEqual(await queueHands(page), ['paper', 'paper']);
      } else {
        const count = await hand.count();
        const take = round >= 3 ? count : Math.min(count, 2);
        for (let i = 0; i < take; i++) await hand.first().tap();
      }
      await assertInside(page, '.pwp-rps-submit', width, height, `${round}판`);
      await page.locator('.pwp-rps-submit:enabled').click();
      await waitMode(page, ['reveal']);
      // 공개 중: 뒤집힌 줄이 먼저(양쪽 장수), 끝나기 전엔 상대 표정이 없다.
      await page.waitForSelector('.pwp-rps[data-beat="facedown"]', { timeout: 5000 });
      assert.ok(await page.locator('.pwp-rps-tcard.mine.down').count() > 0);
      assert.ok(await page.locator('.pwp-rps-tcard.theirs.down').count() > 0);
      assert.equal(await page.locator('.pwp-rps-face').count(), 0, '공개 전 표정 스포일러 없음');
      if (!revealShot) {
        await page.waitForSelector('.pwp-rps[data-beat="hit"]', { timeout: 8000 });
        assert.equal(await page.locator('.pwp-rps-face').count(), 0, '맞붙는 중에도 표정 없음');
        await page.screenshot({ path: '.test-artifacts/card-rps-reveal.png' });
        revealShot = true;
      }
      await page.waitForSelector('.pwp-rps[data-beat="banner"]', { timeout: 30000 });
      await page.locator('.pwp-rps-banner').waitFor();
      await waitMode(page, ['choosing', 'shootout', 'result']);
    }
    await page.locator('.pwp-rps-result').waitFor({ timeout: 30000 });
    await page.locator('.pwp-rps-banner.big').waitFor();
    assert.match(await page.locator('.pwp-rps-delta').innerText(), /P/);
    assert.equal(await page.locator('.pwp-rps-result button:has-text("다시 하기")').count(), 1);
    await page.waitForTimeout(700); // 결과 판이 튀어나오는 연출이 끝난 모습으로 찍는다.
    await page.screenshot({ path: '.test-artifacts/card-rps-result.png' });
    await page.getByTestId('rules').evaluate(button => button.click());
    await page.locator('.pwp-rps-rules').waitFor();
    await page.locator('.pwp-rps-rules nav button').last().click();
    await page.screenshot({ path: '.test-artifacts/card-rps-rules-2.png' });
    await page.close();
  }
  // 3) 승부차기(seed 25 + 위와 같은 고르기): 같은 탁자 가운데에 한 장씩 던져 동시에 뒤집는다.
  {
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
    await page.goto(`${base}/tests/pixel-world-phaser/card-rps.harness.html?seed=25`);
    const picks = [async () => { await page.locator('.pwp-rps-handcard[data-hand="paper"]').first().click(); await page.locator('.pwp-rps-handcard[data-hand="paper"]').first().click(); },
      async () => { for (let i = 0; i < 2; i++) await page.locator('.pwp-rps-handcard').first().click(); },
      async () => { while (await page.locator('.pwp-rps-handcard').count()) await page.locator('.pwp-rps-handcard').first().click(); }];
    for (const pick of picks) {
      await waitMode(page, ['choosing', 'shootout', 'result']);
      if (await mode(page) !== 'choosing') break;
      await pick();
      await page.locator('.pwp-rps-submit:enabled').click();
      await waitMode(page, ['reveal']);
    }
    await waitMode(page, ['shootout'], 40000);
    await page.screenshot({ path: '.test-artifacts/card-rps-shootout.png' });
    await page.locator('.pwp-rps-shoot-card:enabled').first().click();
    await page.waitForSelector('.pwp-rps[data-beat="hit"]', { timeout: 8000 });
    assert.equal(await page.locator('.pwp-rps-tcard.spot-arena').count(), 2, '승부차기: 두 장이 가운데에서 맞붙는다');
    await page.screenshot({ path: '.test-artifacts/card-rps-shootout-hit.png' });
    await waitMode(page, ['shootout', 'result'], 20000);
    await page.close();
  }
  console.log(`PASS card RPS: layout ${SIZES.map(s => s.join('x')).join(', ')}; NPC match with tap/drag/autoplay reveal/result; rules page 2; shootout`);
} finally {
  await browser.close();
}
