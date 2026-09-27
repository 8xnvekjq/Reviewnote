// 필기 월드(문서 밖 흰 여백 필기) 회귀 검사 — 실제 Chromium(Edge)에서 두 손가락 핀치/팬, 펜, 터치,
// 마우스 입력을 CDP로 주입해 확인한다. node --test가 아니라 별도 실행:
//   npm run dev -- --host 127.0.0.1   (다른 터미널)
//   npm run test:handwriting-world
// tests/ui 픽스처를 쓰며, 외부 요청은 전부 차단되고 저장(insert)은 페이지 안에서 가로채 PNG만 검사한다.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const log = (...a) => console.log('  ', ...a);
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await context.routeWebSocket(/supabase/, ws => ws.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const cdp = await context.newCDPSession(page);
  await page.goto('http://127.0.0.1:5173/tests/ui/?detail');
  // 저장 요청 본문(image_url PNG)을 가로챈다 — 픽스처의 fetch 가로채기 위에 한 겹 더.
  await page.evaluate(() => {
    const inner = window.fetch;
    window.__saved = [];
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('mistake_scaffoldings') && init?.method === 'POST') window.__saved.push(JSON.parse(init.body));
      return inner(input, init);
    };
  });

  // ── 입력 헬퍼 ──
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  async function twoFinger(from, to, steps = 12) {
    await touch('touchStart', from);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await touch('touchMove', from.map(([x, y], k) => [x + (to[k][0] - x) * t, y + (to[k][1] - y) * t]));
    }
    await touch('touchEnd', []);
  }
  async function pinch(cx, cy, fromHalf, toHalf) {
    await twoFinger([[cx - fromHalf, cy], [cx + fromHalf, cy]], [[cx - toHalf, cy], [cx + toHalf, cy]]);
  }
  async function pan(cx, cy, dx, dy) {
    await twoFinger([[cx - 30, cy], [cx + 30, cy]], [[cx - 30 + dx, cy + dy], [cx + 30 + dx, cy + dy]]);
  }
  async function stroke(kind, pts) {
    if (kind === 'touch') {
      await touch('touchStart', [pts[0]]);
      for (const p of pts.slice(1)) await touch('touchMove', [p]);
      await touch('touchEnd', []);
      return;
    }
    const pointerType = kind; // 'pen' | 'mouse'
    const [x0, y0] = pts[0];
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', buttons: 1, clickCount: 1, pointerType, force: 0.5 });
    for (const [x, y] of pts.slice(1)) await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1, pointerType, force: 0.5 });
    const [x1, y1] = pts[pts.length - 1];
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x1, y: y1, button: 'left', buttons: 0, clickCount: 1, pointerType });
  }
  const line = ([x0, y0], [x1, y1], n = 10) => Array.from({ length: n + 1 }, (_, i) => [x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n]);

  // ── 창 상태 읽기: 카메라 / 월드 / 획 ──
  async function state(win) {
    return win.evaluate(w => {
      const vp = w.querySelector('.bg-white.relative.overflow-hidden');
      const docBox = vp.firstElementChild;
      const m = /translate\(([-\d.e]+)px, ([-\d.e]+)px\) scale\(([-\d.e]+)\)/.exec(docBox.style.transform);
      const worldBox = docBox.lastElementChild;
      const vr = vp.getBoundingClientRect();
      const svg = worldBox.querySelector('svg');
      // 지우개 획은 react-sketch-canvas가 `…__eraser-stroke-group` 안에 따로 그리고 mask로 참조한다
      const isEraser = p => !!p.closest('[id$="__eraser-stroke-group"]');
      const paths = [...svg.querySelectorAll('path')].filter(p => !isEraser(p) && p.getAttribute('d'));
      return {
        vp: { left: vr.left, top: vr.top, width: vr.width, height: vr.height },
        cam: { x: +m[1], y: +m[2], scale: +m[3] },
        doc: { width: docBox.offsetWidth, height: docBox.offsetHeight },
        world: { x: worldBox.offsetLeft, y: worldBox.offsetTop, width: worldBox.offsetWidth, height: worldBox.offsetHeight },
        paths: paths.map(p => { const b = p.getBBox(); const r = p.getBoundingClientRect(); const nums = (p.getAttribute('d').match(/-?[\d.]+(?:e-?\d+)?/g) || []).map(Number); return { start: [nums[0], nums[1]], end: [nums[nums.length - 2], nums[nums.length - 1]], bbox: { x: b.x, y: b.y, width: b.width, height: b.height }, rect: { x: r.x, y: r.y, width: r.width, height: r.height }, sw: +p.getAttribute('stroke-width'), stroke: p.getAttribute('stroke') }; }),
        eraserPaths: [...svg.querySelectorAll('path')].filter(isEraser).length,
        // 한 점짜리 획은 <circle>로 그려진다 — 두 손가락 제스처가 남기는 점 검사용
        dots: [...svg.querySelectorAll('circle')].filter(c => !isEraser(c)).length,
        img: (() => { const i = docBox.querySelector('img'); if (!i) return null; const r = i.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })(),
      };
    });
  }
  const toScreen = (s, dx, dy) => [s.vp.left + s.cam.x + dx * s.cam.scale, s.vp.top + s.cam.y + dy * s.cam.scale];
  const toDoc = (s, sx, sy) => [(sx - s.vp.left - s.cam.x) / s.cam.scale, (sy - s.vp.top - s.cam.y) / s.cam.scale];
  const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, `${msg}: ${a.toFixed(2)} vs ${b.toFixed(2)} (tol ${tol})`);

  // 새 획 1개를 그리고, 그 획이 (a) 화면상 입력 위치와 (b) 기대 문서 좌표에 정확히 있는지 검사한다.
  async function drawAndCheck(win, kind, screenPts, label) {
    const before = await state(win);
    await stroke(kind, screenPts);
    await page.waitForTimeout(60);
    const after = await state(win);
    assert.equal(after.paths.length, before.paths.length + 1, `${label}: exactly one new stroke`);
    const p = after.paths[after.paths.length - 1];
    const xs = screenPts.map(q => q[0]), ys = screenPts.map(q => q[1]);
    // 화면 좌표 정확도: 획의 화면 bbox(중심선) ≈ 입력한 포인터 범위
    near(p.rect.x + p.rect.width / 2, (Math.min(...xs) + Math.max(...xs)) / 2, 3, `${label} screen center x`);
    near(p.rect.y + p.rect.height / 2, (Math.min(...ys) + Math.max(...ys)) / 2, 3, `${label} screen center y`);
    // 문서 좌표 정확도: 획의 시작/끝 점(라이브러리 내부 = 월드 좌표) + world 오프셋 == 카메라 역변환한
    // 포인터 좌표. bbox는 Bézier 스무딩이 살짝 넘칠 수 있어 끝점을 직접 비교한다(허용 오차 0.5 화면 px).
    const [d0x, d0y] = toDoc(after, ...screenPts[0]);
    const [d1x, d1y] = toDoc(after, ...screenPts[screenPts.length - 1]);
    const tolDoc = 0.5 / after.cam.scale;
    near(p.start[0] + after.world.x, d0x, tolDoc, `${label} doc start x`);
    near(p.start[1] + after.world.y, d0y, tolDoc, `${label} doc start y`);
    near(p.end[0] + after.world.x, d1x, tolDoc, `${label} doc end x`);
    near(p.end[1] + after.world.y, d1y, tolDoc, `${label} doc end y`);
    // 선 굵기: 화면에서 항상 3px
    near(p.sw * after.cam.scale, 3, 0.01, `${label} on-screen stroke width`);
    const docBox = { x: p.bbox.x + after.world.x, y: p.bbox.y + after.world.y, width: p.bbox.width, height: p.bbox.height };
    log(`${label}: doc bbox (${docBox.x.toFixed(1)}, ${docBox.y.toFixed(1)}) ${docBox.width.toFixed(1)}×${docBox.height.toFixed(1)} @ scale ${(after.cam.scale).toFixed(3)}`);
    return { index: after.paths.length - 1, docBox };
  }

  // 핀치/팬으로 문서 좌표 (dx, dy)를 뷰포트 가운데로 가져온다.
  async function bringToCenter(win, dx, dy) {
    for (let i = 0; i < 60; i++) {
      const s = await state(win);
      const cx = s.vp.left + s.vp.width / 2, cy = s.vp.top + s.vp.height / 2;
      const [sx, sy] = toScreen(s, dx, dy);
      const mx = cx - sx, my = cy - sy;
      if (Math.abs(mx) < 4 && Math.abs(my) < 4) return;
      const lim = Math.min(s.vp.width, s.vp.height) / 2 - 50;
      await pan(cx, cy, Math.max(-lim, Math.min(lim, mx)), Math.max(-lim, Math.min(lim, my)));
    }
    throw new Error(`could not pan doc point (${dx}, ${dy}) into view`);
  }

  async function exerciseWindow(win, label, { hasImage }) {
    const s0 = await state(win);
    const drawn = []; // 이 창에서 그린 펜 획들의 문서 bbox — 저장 영역 기대값 계산용
    log(`${label}: viewport ${s0.vp.width.toFixed(0)}×${s0.vp.height.toFixed(0)}, doc ${s0.doc.width}×${s0.doc.height}, world (${s0.world.x}, ${s0.world.y}) ${s0.world.width}×${s0.world.height}, fit scale ${s0.cam.scale.toFixed(3)}`);
    const fit = s0.cam.scale;
    assert.deepEqual(s0.world, { x: -s0.doc.width, y: -s0.doc.height, width: s0.doc.width * 3, height: s0.doc.height * 3 }, 'world = doc + one doc size on each side');
    if (hasImage) {
      // 배경 이미지가 정확히 문서 사각형에 깔리는지(예전 meet 배경과 동일한 위치)
      const [ix, iy] = toScreen(s0, 0, 0);
      near(s0.img.x, ix, 0.5, 'image left'); near(s0.img.y, iy, 0.5, 'image top');
      near(s0.img.width, s0.doc.width * fit, 0.5, 'image width'); near(s0.img.height, s0.doc.height * fit, 0.5, 'image height');
    } else {
      assert.equal(s0.img, null, 'blank notebook has no background image');
    }

    // 1) 확대 전에도 문서 밖(레터박스 / 문서 테두리 바깥) 흰 공간에 터치로 필기
    const below = hasImage ? [s0.doc.width * 0.3, s0.doc.height + 40 / fit] : [s0.doc.width * 0.3, s0.doc.height * 0.5];
    if (hasImage) {
      const [bx, by] = toScreen(s0, below[0], below[1]);
      assert(by < s0.vp.top + s0.vp.height - 10, 'letterbox below the image is visible at fit');
      const touchStroke = await drawAndCheck(win, 'touch', line([bx, by], [bx + 60, by + 12]), `${label} touch @fit below image`);
      assert(touchStroke.docBox.y > s0.doc.height, 'touch stroke lies outside the document');
      drawn.push(touchStroke.docBox);
    }

    // 2) 400% 근처까지 핀치 확대
    const c = [s0.vp.left + s0.vp.width / 2, s0.vp.top + s0.vp.height / 2];
    await pinch(c[0], c[1], 30, 150);
    await page.waitForTimeout(50);
    const zoomed = await state(win);
    assert.equal(zoomed.paths.length + zoomed.dots, s0.paths.length + s0.dots + (hasImage ? 1 : 0), 'pinch leaves no stray dot/stroke');
    log(`${label}: pinch zoom → ${(zoomed.cam.scale / fit * 100).toFixed(0)}% of fit`);
    assert(zoomed.cam.scale / fit > 3.5, 'zoomed in to ~400%');

    // 3) 문서 오른쪽 바깥 흰 공간으로 팬 → 펜 필기
    const outside = [s0.doc.width + s0.doc.width * 0.25, s0.doc.height * 0.5];
    await bringToCenter(win, ...outside);
    const s1 = await state(win);
    assert.equal(s1.dots, 0, 'two-finger pans leave no stray dots');
    assert.equal(s1.paths.length, zoomed.paths.length, 'two-finger pans leave no stray strokes');
    const [px, py] = toScreen(s1, ...outside);
    const penStroke = await drawAndCheck(win, 'pen', line([px - 40, py - 20], [px + 40, py + 20], 16), `${label} pen @zoom right of doc`);
    assert(penStroke.docBox.x > s0.doc.width, 'pen stroke lies outside the document (right)');
    drawn.push(penStroke.docBox);

    // 4) 문서 왼쪽 위 바깥으로 팬 → 마우스 필기
    const outsideTL = [-s0.doc.width * 0.3, -s0.doc.height * 0.3];
    await bringToCenter(win, ...outsideTL);
    const s2 = await state(win);
    const [qx, qy] = toScreen(s2, ...outsideTL);
    const mouseStroke = await drawAndCheck(win, 'mouse', line([qx - 30, qy], [qx + 30, qy + 30]), `${label} mouse @zoom top-left of doc`);
    assert(mouseStroke.docBox.x + mouseStroke.docBox.width < 0 && mouseStroke.docBox.y + mouseStroke.docBox.height < 0, 'mouse stroke lies outside the document (top-left)');
    drawn.push(mouseStroke.docBox);

    // 5) 지우개도 같은 좌표계: 방금 마우스 획 위를 지우개로 문지른다
    await win.getByRole('button', { name: '지우개 도구 선택' }).click();
    const beforeErase = await state(win);
    await stroke('pen', line([qx - 30, qy], [qx + 30, qy + 30]));
    const afterErase = await state(win);
    assert.equal(afterErase.eraserPaths, beforeErase.eraserPaths + 1, 'eraser stroke registered outside the document');
    await win.getByRole('button', { name: '펜 도구 선택' }).click();

    // 5-2) 펜으로 짧게 찍는 도중 손가락(손바닥)이 닿아도 펜 획은 지우지 않는다(핀치 점 정리는 손가락끼리만)
    {
      const sPen = await state(win);
      const [ax, ay] = [sPen.vp.left + sPen.vp.width * 0.3, sPen.vp.top + sPen.vp.height * 0.3];
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: ax, y: ay, button: 'left', buttons: 1, clickCount: 1, pointerType: 'pen' });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ax + 3, y: ay + 3, button: 'left', buttons: 1, pointerType: 'pen' });
      await touch('touchStart', [[sPen.vp.left + sPen.vp.width * 0.8, sPen.vp.top + sPen.vp.height * 0.8]]);
      await touch('touchEnd', []);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: ax + 3, y: ay + 3, button: 'left', buttons: 0, clickCount: 1, pointerType: 'pen' });
      await page.waitForTimeout(60);
      const sAfter = await state(win);
      assert.equal(sAfter.paths.length + sAfter.dots, sPen.paths.length + sPen.dots + 1, 'short pen stroke survives a palm touch');
      // 뒷정리: 이 테스트 획은 저장 검사 대상이 아니므로 되돌린다
      await win.getByRole('button', { name: '직전 필기 실행 취소' }).click();
      await page.waitForTimeout(30);
      const sUndo = await state(win);
      assert.equal(sUndo.paths.length + sUndo.dots, sPen.paths.length + sPen.dots, 'undo removes the palm-test stroke');
    }

    // 6) 축소(맞춤의 0.5배까지) — 획의 문서 좌표는 그대로, 화면 위치만 카메라를 따라감
    const sBeforeOut = await state(win);
    const cc = [sBeforeOut.vp.left + sBeforeOut.vp.width / 2, sBeforeOut.vp.top + sBeforeOut.vp.height / 2];
    await pinch(cc[0], cc[1], 150, 12);
    await page.waitForTimeout(50);
    const out = await state(win);
    assert.equal(out.dots, 0, 'pinch-out leaves no stray dots');
    log(`${label}: pinch out → ${(out.cam.scale / fit * 100).toFixed(0)}% of fit`);
    near(out.cam.scale, fit * 0.5, 1e-6, 'zoom-out floor is half of fit');
    const p = out.paths[penStroke.index];
    near(p.bbox.x + out.world.x, penStroke.docBox.x, 1e-6, 'pen stroke doc x unchanged after zoom-out');
    near(p.bbox.y + out.world.y, penStroke.docBox.y, 1e-6, 'pen stroke doc y unchanged after zoom-out');
    const [ex, ey] = toScreen(out, penStroke.docBox.x, penStroke.docBox.y);
    near(p.rect.x, ex - (p.sw * out.cam.scale) / 2, 2, 'pen stroke screen x follows camera');
    near(p.rect.y, ey - (p.sw * out.cam.scale) / 2, 2, 'pen stroke screen y follows camera');

    // 7) 저장 → PNG에 문서 밖 필기가 제 위치로 들어가는지
    const savedBefore = await page.evaluate(() => window.__saved.length);
    await win.getByRole('button', { name: '💾 저장하기' }).click();
    await page.waitForFunction(n => window.__saved.length > n, savedBefore, { timeout: 10000 });
    const final = out;
    const pngCheck = await page.evaluate(async ({ penDoc, mouseDoc, drawn, doc, world, hasImage }) => {
      const body = window.__saved[window.__saved.length - 1];
      const row = Array.isArray(body) ? body[0] : body;
      const img = new Image();
      img.src = row.image_url;
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const px = (x, y) => Array.from(ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data);
      // 저장 영역: 문서 ∪ 펜 획(± 굵기/2 + 24), 월드로 제한 — 대략값으로 역산해 샘플 위치를 잡는다
      const minX = Math.max(world.x, Math.min(0, ...drawn.map(b => b.x - 30)));
      const minY = Math.max(world.y, Math.min(0, ...drawn.map(b => b.y - 30)));
      const maxX = Math.min(world.x + world.width, Math.max(doc.width, ...drawn.map(b => b.x + b.width + 30)));
      const maxY = Math.min(world.y + world.height, Math.max(doc.height, ...drawn.map(b => b.y + b.height + 30)));
      const s = Math.min(1, 2048 / Math.max(maxX - minX, maxY - minY));
      const at = (dx, dy) => [(dx - minX) * s, (dy - minY) * s];
      // 획 중심 근처에서 빨간 픽셀을 찾는다(반경 6px)
      const findRed = (dx, dy) => {
        const [cx, cy] = at(dx, dy);
        for (let oy = -6; oy <= 6; oy++) for (let ox = -6; ox <= 6; ox++) {
          const [r, g, b, a] = px(cx + ox, cy + oy);
          if (a === 255 && r - g > 30 && r - b > 30) return true; // 확대 중 그린 가는 획은 안티앨리어싱으로 분홍빛
        }
        return false;
      };
      return {
        size: [cv.width, cv.height],
        expectedSize: [Math.round((maxX - minX) * s), Math.round((maxY - minY) * s)],
        scale: s,
        penFound: findRed(penDoc.x + penDoc.width / 2, penDoc.y + penDoc.height / 2),
        mouseErased: !findRed(mouseDoc.x + mouseDoc.width / 2, mouseDoc.y + mouseDoc.height / 2),
        docCenter: px(...at(doc.width / 2, doc.height * 0.95)),
        justOutsideDoc: px(...at(-12, doc.height / 2)),
        justInsideDoc: px(...at(12, doc.height / 2)),
        hasImage,
      };
    }, { penDoc: penStroke.docBox, mouseDoc: mouseStroke.docBox, drawn, doc: final.doc, world: final.world, hasImage });
    log(`${label}: saved PNG ${pngCheck.size.join('×')} (doc alone would be ${final.doc.width}×${final.doc.height}; output scale ${pngCheck.scale.toFixed(3)})`);
    near(pngCheck.size[0], pngCheck.expectedSize[0], 40 * pngCheck.scale + 2, 'PNG width covers document + outside strokes');
    near(pngCheck.size[1], pngCheck.expectedSize[1], 40 * pngCheck.scale + 2, 'PNG height covers document + outside strokes');
    assert(pngCheck.penFound, 'outside pen stroke is at the expected spot in the saved PNG');
    assert(pngCheck.mouseErased, 'eraser removed the outside mouse stroke in the saved PNG');
    assert.deepEqual(pngCheck.justOutsideDoc, [255, 255, 255, 255], 'white margin left of the document');
    if (hasImage) {
      assert.deepEqual(pngCheck.justInsideDoc.slice(0, 3), [250, 249, 245], 'problem image starts exactly at the document edge');
    }
    return pngCheck;
  }

  await page.getByRole('button', { name: '풀이노트 열기' }).click();
  const problem = page.locator('.rn-writing-window').first();
  await problem.locator('svg').waitFor();
  await page.waitForTimeout(100);

  // 새 필기장은 문제 창 저장(=창 닫힘) 전에 연다
  await problem.getByRole('button', { name: '＋ 새 필기장', exact: true }).click();
  const extra = page.locator('.rn-writing-window').nth(1);
  await extra.locator('svg').waitFor();
  // 두 창이 겹치므로 새 필기장은 잠시 닫고, 문제 창 검사 후 다시 연다
  await extra.getByRole('button', { name: '필기창 닫기' }).click();

  console.log('problem-image notebook');
  await exerciseWindow(problem, 'problem', { hasImage: true });
  await page.locator('.rn-writing-window').first().waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});

  console.log('extra blank notebook');
  await page.getByRole('button', { name: '풀이노트 열기' }).click();
  const problem2 = page.locator('.rn-writing-window').first();
  await problem2.locator('svg').waitFor();
  await problem2.getByRole('button', { name: '＋ 새 필기장', exact: true }).click();
  const extra2 = page.locator('.rn-writing-window').nth(1);
  await extra2.locator('svg').waitFor();
  await problem2.getByRole('button', { name: '필기창 닫기' }).click();
  const extraOnly = page.locator('.rn-writing-window').first();
  await page.waitForTimeout(100);
  await exerciseWindow(extraOnly, 'extra', { hasImage: false });

  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS outside-document writing (touch/pen/mouse/eraser), zoom/pan coordinate round-trip, stroke width, saved PNG placement — both notebooks');
} finally {
  await browser.close();
}
