// 코디네이터가 실행한다: HANDWRITING_TEST_URL=http://127.0.0.1:5174 node tests/handwriting/resolution-probe.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';

const base = process.env.HANDWRITING_TEST_URL || 'http://127.0.0.1:5174';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await context.route('**/*', r => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
  await context.routeWebSocket(/supabase/, ws => ws.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${base}/tests/ui/?detail`);
  await page.getByRole('button', { name: '풀이노트 열기' }).click();
  const win = page.locator('.rn-writing-window').last();
  await win.locator('.exam-ink[data-ready="true"]').waitFor();

  // 창을 아이패드 화면 크기로 늘려 작은 기본 창에서만 통과하는 것을 막는다.
  for (const [index, x, y] of [[0, 8, 8], [1, 812, 1172]]) {
    const handle = await win.locator('button.cursor-nwse-resize').nth(index).boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 10 });
    await page.mouse.up();
  }
  await page.waitForTimeout(150);
  const vp = await win.locator('.bg-white.relative.overflow-hidden').boundingBox();
  assert(vp.width > 750 && vp.height > 1000, 'test covers an iPad-sized ink viewport');
  const camera = () => win.locator('.bg-white.relative.overflow-hidden > div').first().evaluate(el => {
    const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(el.style.transform);
    return { x: Number(m[1]), y: Number(m[2]), scale: Number(m[3]) };
  });
  const fit = await camera();
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const cx = vp.x + vp.width / 2, cy = vp.y + vp.height / 2;
  async function pinch(factor) {
    await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
    for (let i = 1; i <= 12; i++) {
      const half = 30 * (1 + (factor - 1) * i / 12);
      await touch('touchMove', [[cx - half, cy], [cx + half, cy]]);
    }
    await touch('touchEnd', []);
    await page.waitForTimeout(100);
  }
  async function assertResolution(label) {
    const layers = await win.locator('.exam-ink canvas').evaluateAll(canvases => canvases.map(c => {
      const r = c.getBoundingClientRect();
      return { width: c.width, height: c.height, cssWidth: r.width, cssHeight: r.height, dpr: window.devicePixelRatio };
    }));
    assert.equal(layers.length, 6);
    for (const layer of layers) {
      assert(layer.width / layer.cssWidth >= .95 * layer.dpr, `${label}: horizontal device resolution`);
      assert(layer.height / layer.cssHeight >= .95 * layer.dpr, `${label}: vertical device resolution`);
      assert(layer.width * layer.height <= 16_000_000, `${label}: memory ceiling`);
      assert(layer.cssWidth <= vp.width + 1 && layer.cssHeight <= vp.height + 1, `${label}: canvases cover only the viewport`);
    }
    console.log(label, layers[1]);
  }
  const pixelAt = async (x, y) => win.locator('.exam-ink canvas').nth(1).evaluate((c, { x, y }) => {
    const r = c.getBoundingClientRect();
    const px = Math.round((x - r.left) * c.width / r.width), py = Math.round((y - r.top) * c.height / r.height);
    return [...c.getContext('2d').getImageData(px - 4, py - 4, 9, 9).data].some((a, i) => i % 4 === 3 && a > 0);
  }, { x, y });
  async function drawAndCheck() {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: cx - 40, y: cy, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: .5 });
    for (let i = 1; i <= 20; i++) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cx - 40 + i * 4, y: cy, button: 'left', buttons: 1, pointerType: 'pen', force: .5 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: cx + 40, y: cy, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
    await page.waitForTimeout(80);
    assert(await pixelAt(cx, cy), 'pen aligns with screen coordinates at current zoom');
  }

  await assertResolution('fit');
  await drawAndCheck();
  await pinch(2);
  assert(Math.abs((await camera()).scale / fit.scale - 2) < .02, 'pinch reaches 2x fit');
  await assertResolution('2x fit');
  assert(await pixelAt(cx, cy), 'committed ink survives zoom rerender');
  await drawAndCheck();
  await pinch(3);
  assert(Math.abs((await camera()).scale / fit.scale - 4.5) < .02, 'pinch reaches max zoom');
  await assertResolution('4.5x fit');
  assert(await pixelAt(cx, cy), 'committed ink survives max zoom rerender');
  await win.getByRole('button', { name: '필기 전체 지우기' }).click();
  await win.getByRole('button', { name: '모두 지우기', exact: true }).click();
  await drawAndCheck();

  // 백버퍼 크기가 그대로인 팬에서도 이전 위치를 지우고 획을 다시 배치해야 한다.
  const beforePan = await camera();
  await touch('touchStart', [[cx - 25, cy], [cx + 25, cy]]);
  for (let i = 1; i <= 8; i++) await touch('touchMove', [[cx - 25 + i * 8, cy], [cx + 25 + i * 8, cy]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(100);
  const afterPan = await camera();
  assert(Math.abs(afterPan.x - beforePan.x - 64) < 1, 'two-finger pan moves camera');
  assert(await pixelAt(cx + 64, cy), 'committed ink follows pan');
  assert(!(await pixelAt(cx - 35, cy)), 'pan clears the former ink position');
  await assertResolution('max zoom after pan');
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
