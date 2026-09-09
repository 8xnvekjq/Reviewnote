import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

// Use an existing Playwright installation; no production dependency is added.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const output = path.resolve(process.env.UI_OUTPUT || 'node_modules/.cache/ui-renewal');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const sizes = [[320,568], [375,667], [390,844], [430,932], [360,800], [800,1280], [844,390]];
const results = [];
const errors = [];
try {
  for (const [width, height] of sizes) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, serviceWorkers: 'block' });
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await context.routeWebSocket(/supabase/, ws => ws.close());
    const page = await context.newPage();
    await page.clock.install();
    page.on('pageerror', e => errors.push(e.message));
    const url = 'http://127.0.0.1:5173/tests/ui/';
    await page.goto(url);
    await page.getByRole('heading', { name: '나의 오답노트' }).waitFor();
    const layout = await page.evaluate(() => {
      const main = document.querySelector('main').getBoundingClientRect();
      const dock = document.querySelector('.rn-dock').getBoundingClientRect();
      return { mainBottom: main.bottom, dockTop: dock.top, dockBottom: dock.bottom, overflow: document.documentElement.scrollWidth > innerWidth, navTargets: [...document.querySelectorAll('.rn-nav-item')].map(e => ({ width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height })) };
    });
    assert(!layout.overflow, `${width}: horizontal overflow`);
    assert(layout.mainBottom <= layout.dockTop + 1, `${width}: dock overlaps content`);
    assert(layout.dockBottom <= height + 1, `${width}: dock outside viewport`);
    assert(layout.navTargets.every(e => e.width >= 44 && e.height >= 44), `${width}: small nav target`);
    await page.screenshot({ animations: 'disabled', path: path.join(output, `notes-${width}x${height}.png`) });
    await page.getByRole('button', { name: '전체메뉴', exact: true }).click();
    await page.getByRole('dialog', { name: '나의 학습 공간' }).waitFor();
    await page.screenshot({ animations: 'disabled', path: path.join(output, `menu-${width}x${height}.png`) });
    await page.keyboard.press('Escape');
    await page.clock.fastForward(150);
    await page.getByRole('dialog', { name: '나의 학습 공간' }).waitFor({ state: 'hidden' });
    assert(await page.getByRole('button', { name: '전체메뉴', exact: true }).evaluate(e => e === document.activeElement), 'menu focus restoration');
    await page.getByRole('button', { name: /두 근의 관계.*문제 열기/ }).first().click();
    await page.getByRole('button', { name: '문제 상세 닫기' }).waitFor();
    assert(await page.locator('.rn-main').evaluate(e => e.inert), 'detail background inert');
    await page.screenshot({ animations: 'disabled', path: path.join(output, `detail-${width}x${height}.png`) });
    const detailOverflow = await page.locator('.rn-detail-body').evaluate(e => e.scrollWidth > e.clientWidth + 1);
    assert(!detailOverflow, `${width}: detail horizontal overflow`);
    const choice = page.getByRole('button', { name: '맞았어요 · 1차 복습', exact: true });
    const box = await choice.boundingBox();
    assert(box.width >= 44 && box.height >= 44, 'review touch target');
    await choice.click();
    await page.getByRole('button', { name: '틀렸어요 · 2차 복습', exact: true }).waitFor();
    await page.clock.fastForward(61000);
    await page.getByRole('button', { name: '틀렸어요 · 2차 복습', exact: true }).click();
    await page.clock.fastForward(61000);
    await page.getByRole('button', { name: '보류할게요 · 3차 복습', exact: true }).click();
    // Checklist unlock order uses the actual component and local callbacks.
    const done = page.getByRole('button', { name: '✅ 했어요', exact: true });
    assert(await done.nth(1).isDisabled(), 'second checklist item begins locked');
    await done.first().click();
    await page.getByRole('button', { name: '🙋 막혔어요', exact: true }).nth(1).click();
    await page.getByRole('button', { name: '풀이노트 열기' }).click();
    await page.locator('.rn-writing-window').waitFor();
    await page.screenshot({ animations: 'disabled', path: path.join(output, `writing-${width}x${height}.png`) });
    const writing = await page.locator('.rn-writing-window').evaluate(e => {
      const canvas = e.querySelector('.bg-white.relative.overflow-hidden');
      return { right: e.getBoundingClientRect().right, bottom: e.getBoundingClientRect().bottom, width: e.clientWidth, height: e.clientHeight, canvasHeight: canvas?.clientHeight ?? 0, overflow: e.scrollWidth > e.clientWidth + 1 };
    });
    assert(writing.right <= width + 1 && writing.bottom <= height + 1, 'writing outside viewport');
    assert(!writing.overflow, 'writing controls overflow');
    assert(writing.canvasHeight >= 70, `${width}x${height}: canvas too small ${JSON.stringify(writing)}`);
    await page.getByRole('button', { name: '필기창 닫기', exact: true }).click();
    await page.getByRole('button', { name: '문제 상세 닫기' }).click();
    await page.getByRole('button', { name: '럭키상점', exact: true }).click();
    await page.getByRole('heading', { name: '럭키 상점', exact: true }).waitFor();
    await page.screenshot({ animations: 'disabled', path: path.join(output, `store-${width}x${height}.png`) });
    const storeOverflow = await page.locator('.rn-store').evaluate(e => e.scrollWidth > e.clientWidth + 1);
    assert(!storeOverflow, `${width}: store overflow`);
    await page.goto(url + '?empty');
    await page.screenshot({ animations: 'disabled', path: path.join(output, `empty-${width}x${height}.png`) });
    await page.goto(url + '?loading');
    await page.getByRole('status').waitFor();
    await page.screenshot({ animations: 'disabled', path: path.join(output, `loading-${width}x${height}.png`) });
    results.push({ viewport: `${width}x${height}`, layout, writing, pass: true });
    console.log(`PASS ${width}x${height}`);
    await context.close();
  }
  assert.equal(errors.length, 0, errors.join('\n'));
} finally {
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
