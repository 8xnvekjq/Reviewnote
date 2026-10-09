import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { frameOf, frameCorners, trashTarget, rotateHandle, transformFrame, scaleTransform, rotateTransform } from '../../src/features/exam/ink/lasso.ts';

const base = process.env.EXAM_TEST_BASE_URL || 'http://127.0.0.1:5175';
const out = '.test-artifacts/lasso-trash';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1180]) for (const pointerType of ['mouse', 'touch', 'pen']) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, hasTouch: true });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/tests/exam/ink.html`);
    const input = page.locator('.exam-ink-input');
    await page.locator('.exam-ink[data-ready="true"]').waitFor();
    const box = await input.boundingBox(), w = box.width;
    const draw = async path => {
      await page.mouse.move(box.x + path[0].x * w, box.y + path[0].y * w);
      await page.mouse.down();
      for (const p of path.slice(1)) await page.mouse.move(box.x + p.x * w, box.y + p.y * w, { steps: 3 });
      await page.mouse.up();
      await page.waitForTimeout(40);
    };
    const send = async (type, p, kind = pointerType, id = 90) => {
      await page.evaluate(({ type, p, kind, id }) => {
        const el = document.querySelector('.exam-ink-input'), r = el.getBoundingClientRect();
        el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: kind,
          isPrimary: true, button: 0, buttons: type === 'pointerdown' || type === 'pointermove' ? 1 : 0,
          pressure: .6, clientX: r.left + p.x * r.width, clientY: r.top + p.y * r.width }));
      }, { type, p, kind, id });
    };
    const tap = async p => {
      if (pointerType === 'mouse') await page.mouse.click(box.x + p.x * w, box.y + p.y * w);
      else { await send('pointerdown', p); await send('pointerup', p); }
      await page.waitForTimeout(40);
    };
    const strokes = () => page.evaluate(() => window.__ink.strokes());
    const changes = () => page.evaluate(() => window.__ink.changes());
    const selected = async () => Number(await page.locator('.exam-ink').getAttribute('data-selected'));
    const lasso = async () => {
      await page.getByRole('button', { name: '올가미', exact: true }).click();
      await draw([{ x: .19, y: .22 }, { x: .66, y: .22 }, { x: .66, y: .52 }, { x: .19, y: .52 }, { x: .19, y: .22 }]);
      assert.equal(await selected(), 2);
    };
    const trash = f => trashTarget(f, 18 / w, { left: 0, top: 0, right: 1, bottom: box.height / w }, 18 / w, 12 / w).center;
    for (const y of [.3, .44, .72]) await draw([{ x: .25, y }, { x: .4, y: y + .02 }, { x: .6, y }]);
    const original = await strokes();
    assert.equal(original.length, 3);
    await lasso();
    let frame = frameOf(original.slice(0, 2), 8 / w);
    if (pointerType === 'mouse') await page.screenshot({ path: `${out}/selection-${width}.png` });
    let before = await changes();
    await tap(trash(frame));
    assert.deepEqual(await strokes(), original.slice(2));
    assert.equal(await selected(), 0);
    assert.equal(await changes(), before + 1);
    await page.evaluate(() => window.__ink.handle().undo());
    assert.deepEqual(await strokes(), original);
    await page.evaluate(() => window.__ink.handle().redo());
    assert.deepEqual(await strokes(), original.slice(2));
    await page.evaluate(() => window.__ink.handle().undo());
    await lasso();
    // 왼쪽 위 손잡이를 눌러도 삭제하지 않고 크기만 바뀐다.
    const corner = frameCorners(frame)[0], anchor = frameCorners(frame)[2];
    const to = { x: anchor.x + (corner.x - anchor.x) * 1.15, y: anchor.y + (corner.y - anchor.y) * 1.15 };
    await draw([corner, to]);
    frame = transformFrame(frame, scaleTransform(frame, 0, to, 10 / w));
    assert.equal((await strokes()).length, 3);
    assert.equal(await selected(), 2);
    assert.ok(Math.abs((await strokes())[0].size - original[0].size * 1.15) < .02);
    const r = rotateHandle(frame, 12 / w), distance = frame.hw + 12 / w;
    const turned = { x: frame.cx + distance * Math.cos(Math.PI / 4), y: frame.cy + distance * Math.sin(Math.PI / 4) };
    const beforeRotation = await changes();
    await draw([r, turned]);
    assert.equal(await changes(), beforeRotation + 1);
    frame = transformFrame(frame, rotateTransform(frame, r, turned));
    const rotated = await strokes();
    if (pointerType === 'mouse') await page.screenshot({ path: `${out}/rotated-${width}.png` });
    // 취소하거나 버튼 밖에서 떼면 삭제하지 않는다.
    const target = trash(frame);
    before = await changes();
    await send('pointerdown', target);
    await send('pointercancel', target);
    await send('pointerdown', target);
    await send('pointerup', { x: .9, y: .9 });
    assert.equal(await changes(), before);
    // 펜으로 조작 중인 손바닥은 삭제하지 않는다.
    await send('pointerdown', { x: frame.cx, y: frame.cy }, 'pen', 101);
    await send('pointerdown', target, 'touch', 102);
    await send('pointerup', target, 'touch', 102);
    await send('pointerup', { x: frame.cx, y: frame.cy }, 'pen', 101);
    assert.equal(await changes(), before);
    // 두 손가락 제스처로 전환하면 삭제 탭을 취소한다.
    await send('pointerdown', target, 'touch', 103);
    await send('pointerdown', { x: .9, y: .9 }, 'touch', 104);
    await send('pointerup', target, 'touch', 103);
    await send('pointerup', { x: .9, y: .9 }, 'touch', 104);
    await page.waitForTimeout(400);
    assert.equal(await changes(), before);
    await tap(target);
    assert.deepEqual(await strokes(), original.slice(2));
    assert.equal(await selected(), 0);
    assert.equal(await changes(), before + 1);
    await page.evaluate(() => window.__ink.handle().undo());
    assert.deepEqual(await strokes(), rotated);
    await lasso();
    await page.getByRole('button', { name: '보기 전용', exact: true }).click();
    await page.waitForTimeout(40);
    assert.equal(await selected(), 0);
    const redPixels = await page.locator('.exam-ink-selection').evaluate(canvas => {
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let red = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] === 229 && data[i + 1] === 72 && data[i + 2] === 77 && data[i + 3]) red++;
      return red;
    });
    assert.equal(redPixels, 0);
    assert.deepEqual(errors, []);
    console.log(`PASS lasso trash: ${width}px ${pointerType}`);
    await page.close();
  }
} finally { await browser.close(); }
