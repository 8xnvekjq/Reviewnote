// 실제 오답 상세 픽스처에서 펜 포인터로 검사한다. 실행은 코디네이터가 담당한다.
// HANDWRITING_TEST_URL=http://127.0.0.1:5173 node tests/handwriting/mistake-ink.browser.mjs
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.HANDWRITING_TEST_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  for (const width of [390, 820]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 2, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' });
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await context.routeWebSocket(/supabase/, ws => ws.close());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/tests/ui/?detail`);
    await page.evaluate(() => {
      const original = window.fetch;
      window.__savedInk = [];
      window.fetch = async (input, init) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.includes('mistake_scaffoldings') && init?.method === 'POST') window.__savedInk.push(JSON.parse(init.body));
        return original(input, init);
      };
    });
    const cdp = await context.newCDPSession(page);
    async function draw(points, hold = 0) {
      const [x, y] = points[0];
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen', force: .5 });
      for (const [x, y] of points.slice(1)) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1, pointerType: 'pen', force: .5 });
      if (hold) await page.waitForTimeout(hold);
      const last = points.at(-1);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: last[0], y: last[1], button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
      await page.waitForTimeout(80);
    }
    const line = (x, y, dx = 90, dy = 0) => Array.from({ length: 21 }, (_, i) => [x + dx * i / 20, y + dy * i / 20]);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
    const win = () => page.locator('.rn-writing-window').last();
    const count = () => win().locator('.exam-ink').getAttribute('data-stroke-count').then(Number);
    const tool = name => win().getByRole('button', { name: `${name} 도구 선택`, exact: true }).click();
    const viewport = async () => win().locator('.bg-white.relative.overflow-hidden').boundingBox();
    const camera = () => win().locator('.bg-white.relative.overflow-hidden > div').first().evaluate(el => el.style.transform);
    const assertResolution = async () => {
      const layers = await win().locator('.exam-ink canvas').evaluateAll(canvases => canvases.map(c => {
        const r = c.getBoundingClientRect();
        return { x: c.width / r.width, y: c.height / r.height, pixels: c.width * c.height, dpr: window.devicePixelRatio };
      }));
      for (const layer of layers) {
        assert(layer.x >= .95 * layer.dpr && layer.y >= .95 * layer.dpr, 'all ink layers render at device resolution');
        assert(layer.pixels <= 16_000_000, 'each ink layer stays below 16M pixels');
      }
    };
    const layerAt = async (x, y, index) => win().locator('.exam-ink canvas').nth(index).evaluate((canvas, { x, y }) => {
      const rect = canvas.getBoundingClientRect();
      const px = Math.round((x - rect.left) / rect.width * canvas.width), py = Math.round((y - rect.top) / rect.height * canvas.height);
      const data = canvas.getContext('2d').getImageData(px - 3, py - 3, 7, 7).data;
      return Array.from(data).filter((_, i) => i % 4 === 3).some(a => a > 0);
    }, { x, y });

    await page.getByRole('button', { name: '풀이노트 열기' }).click();
    // 문제 위 필기와 추가 흰 필기장 모두 같은 입력 경로를 검사한다.
    for (const extra of [false, true]) {
      if (extra) await page.getByRole('button', { name: '풀이노트 열기' }).click();
      if (extra) await win().getByRole('button', { name: '＋ 새 필기장', exact: true }).click();
      await win().locator('.exam-ink[data-ready="true"]').waitFor();
      await page.waitForTimeout(80);
      await assertResolution();
      const toolbar = win().getByRole('toolbar');
      const geometry = await toolbar.evaluate(el => ({ height: el.getBoundingClientRect().height, buttons: [...el.querySelectorAll('button')].map(b => ({ y: b.getBoundingClientRect().y, width: b.getBoundingClientRect().width, height: b.getBoundingClientRect().height })) }));
      assert(geometry.height <= 48, 'compact toolbar');
      assert(geometry.buttons.every(b => b.width >= 32 && b.height >= 32), '32px tool targets');
      assert.equal(new Set(geometry.buttons.map(b => b.y)).size, 1, 'one toolbar row');
      const v = await viewport();
      const x = v.x + 65, y = v.y + v.height / 2;
      await draw(line(x, y));
      assert.equal(await count(), 1);
      assert(await layerAt(x + 45, y, 1), 'pen is drawn at pointer coordinates');
      assert.equal(await win().locator('.exam-ink').getAttribute('data-pen-detected'), 'true');
      await draw(line(x, y + 45).map(([x, y], i) => [x, y + Math.sin(i) * 1.2]), 950);
      assert.equal(await win().locator('.exam-ink').getAttribute('data-shape-count'), '1', 'hold snaps a line');
      await tool('형광펜');
      await draw(line(x, y + 85));
      assert(await layerAt(x + 45, y + 85, 0), 'highlighter uses its own layer');
      await tool('지우개');
      await draw(line(x + 40, y + 75, 0, 20));
      assert.equal(await count(), 2, 'stroke eraser removes highlighter');
      await win().getByRole('button', { name: '직전 필기 실행 취소' }).click();
      assert.equal(await count(), 3);
      await win().getByRole('button', { name: '필기 다시 실행' }).click();
      assert.equal(await count(), 2);
      await tool('올가미');
      await draw([[x - 15, y - 15], [x + 110, y - 15], [x + 110, y + 15], [x - 15, y + 15], [x - 15, y - 15]]);
      assert.equal(await win().locator('.exam-ink').getAttribute('data-selected'), '1');
      await draw(line(x + 45, y, 0, -55));
      assert(await layerAt(x + 45, y - 55, 1), 'lasso moves ink');
      assert(!(await layerAt(x + 45, y, 1)), 'original location clears');
      await tool('펜');
      const before = await count();
      await touch('touchStart', [[x, y + 110]]);
      await touch('touchMove', [[x + 30, y + 110]]);
      await touch('touchEnd', []);
      assert.equal(await count(), before, 'finger does not draw after pen');
      // 다지 탭: 두 번 탭의 두·세 손가락은 각각 실행 취소·다시 실행이다.
      for (const n of [2, 3]) {
        const points = Array.from({ length: n }, (_, i) => [x + i * 25, y + 110]);
        for (let i = 0; i < 2; i++) {
          await touch('touchStart', points);
          await touch('touchEnd', []);
          await page.waitForTimeout(60);
        }
        await page.waitForTimeout(100);
        assert(await page.getByRole('status').count(), 'multi-finger history notice');
      }
      const camBefore = await camera();
      await touch('touchStart', [[x, y], [x + 50, y]]);
      for (let i = 1; i <= 10; i++) await touch('touchMove', [[x - i * 2, y], [x + 50 + i * 2, y]]);
      await touch('touchEnd', []);
      await page.waitForTimeout(80);
      assert.notEqual(await camera(), camBefore, 'two fingers zoom');
      await assertResolution();
      assert.equal(await count(), before, 'pinch does not add ink');
      await draw(line(x, y + 130));
      assert(await layerAt(x + 45, y + 130, 1), 'pen coordinates still align after pinch');
      await tool('레이저');
      const laserBefore = await count();
      await draw(line(x, y + 170));
      assert.equal(await count(), laserBefore, 'laser is transient');
      await win().getByRole('button', { name: '필기 전체 지우기' }).click();
      await win().getByRole('button', { name: '모두 지우기', exact: true }).click();
      assert.equal(await count(), 0);
      await win().getByRole('button', { name: '직전 필기 실행 취소' }).click();
      assert.equal(await count(), laserBefore, 'clear is undoable');
      // 문서 오른쪽 바깥의 흰 월드를 가운데로 팬한 뒤 필기하고 PNG 범위 확대를 확인한다.
      const doc = await win().locator('.bg-white.relative.overflow-hidden > div').first().evaluate(el => ({ width: el.offsetWidth, height: el.offsetHeight }));
      const cx = v.x + v.width / 2, cy = v.y + v.height / 2;
      for (let i = 0; i < 30; i++) {
        const transform = await camera();
        const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(transform);
        const targetX = v.x + Number(m[1]) + (doc.width + 80) * Number(m[3]);
        const delta = Math.max(-70, Math.min(70, cx - targetX));
        if (Math.abs(delta) < 3) break;
        await touch('touchStart', [[cx - 25, cy], [cx + 25, cy]]);
        for (let j = 1; j <= 8; j++) await touch('touchMove', [[cx - 25 + delta * j / 8, cy], [cx + 25 + delta * j / 8, cy]]);
        await touch('touchEnd', []);
        await page.waitForTimeout(30);
      }
      await tool('펜');
      await draw(line(cx - 20, cy, 40));
      await assertResolution();
      assert.equal(await count(), laserBefore + 1, 'outside document still accepts pen');
      assert(await layerAt(cx, cy, 1), 'outside ink aligns with pen');
      await win().getByRole('button', { name: '저장하기', exact: true }).click();
      await page.waitForFunction(n => window.__savedInk.length >= n, extra ? 2 : 1);
      const png = await page.evaluate(async () => {
        const url = window.__savedInk.at(-1)[0].image_url;
        const image = new Image(); image.src = url; await image.decode();
        const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
        const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0);
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        let opaque = true, red = 0;
        for (let i = 0; i < data.length; i += 4) { if (data[i + 3] !== 255) opaque = false; if (data[i] > 130 && data[i + 1] < 110 && data[i + 2] < 110) red++; }
        return { png: url.startsWith('data:image/png;base64,'), width: image.width, height: image.height, opaque, red };
      });
      assert(png.png && png.opaque && png.red > 20 && Math.max(png.width, png.height) <= 2048, 'save creates opaque PNG containing ink');
      assert(png.width / png.height > doc.width / doc.height, 'outside ink expands saved PNG horizontally');
      await page.waitForTimeout(850);
      if (extra) await win().getByRole('button', { name: '필기창 닫기' }).click();
    }
    assert.deepEqual(errors, []);
    await page.goto(`${base}/tests/handwriting/practice.html`);
    await page.getByRole('button', { name: '풀이노트 열기' }).click();
    await win().locator('.exam-ink[data-ready="true"]').waitFor();
    assert.equal(await win().getByRole('button', { name: '저장하기', exact: true }).count(), 0, 'practice has no save');
    for (const name of ['펜', '형광펜', '지우개', '레이저', '올가미']) assert.equal(await win().getByRole('button', { name: `${name} 도구 선택`, exact: true }).count(), 1);
    const practiceViewport = await viewport();
    await draw(line(practiceViewport.x + 60, practiceViewport.y + practiceViewport.height / 2));
    assert.equal(await count(), 1, 'review-check accepts pen');
    await win().getByRole('button', { name: '＋ 새 필기장', exact: true }).click();
    await win().locator('.exam-ink[data-ready="true"]').waitFor();
    assert.equal(await count(), 0, 'practice extra notebook is independent');
    assert.deepEqual(errors, []);
    await context.close();
  }
} finally { await browser.close(); }
