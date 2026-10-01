// 필기 엔진 브라우저 테스트: node tests/exam/ink.browser.mjs (vite dev 서버 http://127.0.0.1:5174 필요)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const URL = 'http://127.0.0.1:5174/tests/exam/ink.html';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
await mkdir('node_modules/.cache/exam-ink', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1600 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(URL);
  await page.locator('.exam-ink[data-ready="true"]').waitFor();

  const strokes = () => page.evaluate(() => window.__ink.strokes());
  const input = page.locator('.exam-ink-input');
  const toPage = async (nx, ny) => {
    const box = await input.boundingBox();
    return { x: box.x + nx * box.width, y: box.y + ny * box.width };
  };
  /** 정규화 좌표 경로를 마우스로 그린다. holdMs면 떼기 전에 그만큼 멈춘다. after: 멈춘 뒤 이어서 움직일 점들. */
  const draw = async (path, { holdMs = 0, after = [] } = {}) => {
    const first = await toPage(...path[0]);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    for (const [nx, ny] of path.slice(1)) {
      const p = await toPage(nx, ny);
      await page.mouse.move(p.x, p.y, { steps: 2 });
    }
    if (holdMs) await page.waitForTimeout(holdMs);
    for (const [nx, ny] of after) {
      const p = await toPage(nx, ny);
      await page.mouse.move(p.x, p.y, { steps: 3 });
    }
    await page.mouse.up();
    await page.waitForTimeout(50);
  };
  /** 확정 펜 레이어에서 (nx, ny) 근처에 잉크가 있는지. */
  const inkAt = (nx, ny, layer = 1) => page.evaluate(({ nx, ny, layer }) => {
    const canvas = document.querySelectorAll('.exam-ink canvas')[layer];
    const ctx = canvas.getContext('2d');
    const x = Math.round(nx * canvas.width), y = Math.round(ny * canvas.width);
    const data = ctx.getImageData(x - 3, y - 3, 7, 7).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
    return false;
  }, { nx, ny, layer });
  const wave = Array.from({ length: 30 }, (_, i) => [0.1 + i * 0.01, 0.2 + Math.sin(i / 2.5) * 0.03]);

  // 1) 펜 그리기
  await draw(wave);
  let list = await strokes();
  assert.equal(list.length, 1);
  assert.equal(list[0].tool, 'pen');
  assert.equal(list[0].shape, undefined, 'a quick wavy stroke stays freehand');
  assert.ok(list[0].points.length >= 20, `points: ${list[0].points.length}`);
  assert.ok(list[0].points.every(p => p.x >= 0 && p.x <= 1 && p.y >= 0), 'normalized coordinates');
  assert.ok(Math.abs(list[0].points[0].x - 0.1) < 0.01 && Math.abs(list[0].points[0].y - 0.2) < 0.01);
  assert.ok(await inkAt(0.1 + 10 * 0.01, 0.2 + Math.sin(10 / 2.5) * 0.03), 'stroke is painted where it was drawn');

  // 2) 꾹 눌러 직선 → 펜을 떼기 전 끝점을 더 끌면 길이가 따라간다
  const shaky = Array.from({ length: 21 }, (_, i) => [0.15 + i * 0.02, 0.45 + (i % 2 ? 0.002 : -0.002) + i * 0.005]);
  await draw(shaky, { holdMs: 800, after: [[0.7, 0.62]] });
  list = await strokes();
  const line = list.at(-1);
  assert.equal(line.shape?.kind, 'line', `held stroke becomes a line: ${JSON.stringify(line.shape)}`);
  assert.ok(Math.abs(line.shape.from[0] - 0.15) < 0.01 && Math.abs(line.shape.from[1] - 0.448) < 0.01);
  assert.ok(Math.abs(line.shape.to[0] - 0.7) < 0.01 && Math.abs(line.shape.to[1] - 0.62) < 0.01, 'endpoint follows the pen after snapping');
  assert.ok(await inkAt(0.5, 0.448 + (0.62 - 0.448) * (0.35 / 0.55)), 'line is painted along its path');

  // 3) 꾹 눌러 원
  const circle = Array.from({ length: 41 }, (_, i) => {
    const a = (i / 40) * Math.PI * 2.05;
    return [0.5 + 0.12 * Math.cos(a), 0.9 + 0.12 * Math.sin(a)];
  });
  await draw(circle, { holdMs: 800 });
  list = await strokes();
  const ring = list.at(-1);
  assert.equal(ring.shape?.kind, 'ellipse', `held loop becomes a circle: ${JSON.stringify(ring.shape)}`);
  assert.ok(Math.abs(ring.shape.cx - 0.5) < 0.01 && Math.abs(ring.shape.cy - 0.9) < 0.01);
  assert.ok(Math.abs(ring.shape.rx - 0.12) < 0.01 && ring.shape.rx === ring.shape.ry);
  // 원도 떼기 전 움직이면 반지름이 커진다
  await draw(circle.map(([x, y]) => [x + 0.0, y + 0.45]), { holdMs: 800, after: [[0.5 + 0.18, 1.35]] });
  list = await strokes();
  assert.equal(list.at(-1).shape?.kind, 'ellipse');
  assert.ok(list.at(-1).shape.rx > 0.16, `radius grows: ${list.at(-1).shape.rx}`);

  // 4) 멈추지 않고 그린 원·글씨는 그대로
  await draw(circle.map(([x, y]) => [x + 0.25, y]));
  list = await strokes();
  assert.equal(list.at(-1).shape, undefined, 'no hold → no conversion');
  assert.equal(list.length, 5);

  // 5) 지우개: 스치면 그 획만 통째로
  await page.getByRole('button', { name: '지우개' }).click();
  await draw([[0.2, 0.12], [0.2, 0.3]]);
  list = await strokes();
  assert.equal(list.length, 4, 'only the wavy stroke is erased');
  assert.ok(list.every(s => s.points.length && s.id !== undefined));
  assert.ok(!(await inkAt(0.2, 0.2 + Math.sin(10 / 2.5) * 0.03)), 'erased stroke is gone from the canvas');

  // 6) 실행 취소 / 다시 실행
  await page.getByRole('button', { name: '되돌리기' }).click();
  assert.equal((await strokes()).length, 5);
  await page.getByRole('button', { name: '다시 하기' }).click();
  assert.equal((await strokes()).length, 4);
  await page.getByRole('button', { name: '되돌리기' }).click();
  assert.equal((await strokes()).length, 5);

  // 7) 모두 지우기 → 되돌리기
  await page.getByRole('button', { name: '모두 지우기' }).click();
  assert.equal((await strokes()).length, 0);
  assert.ok(!(await inkAt(0.5, 0.78)));
  await page.getByRole('button', { name: '되돌리기' }).click();
  assert.equal((await strokes()).length, 5);
  await page.screenshot({ path: 'node_modules/.cache/exam-ink/wide.png' });

  // 8) 리사이즈(폭 변경·화면 회전) 후에도 같은 자리
  const before = JSON.stringify(await strokes());
  const sample = (await strokes())[0].points[12];
  await page.getByRole('button', { name: '좁게' }).click();
  await page.waitForFunction(() => document.querySelector('.exam-ink').clientWidth === 420);
  await page.waitForTimeout(100);
  assert.equal(JSON.stringify(await strokes()), before, 'resizing never rewrites strokes');
  assert.ok(await inkAt(sample.x, sample.y), 'stroke stays on the same spot of the image after resize');
  assert.ok(await inkAt(0.62, 0.9), 'circle stays put after resize');
  const box = await input.boundingBox();
  const img = await page.locator('.exam-ink img').boundingBox();
  assert.ok(Math.abs(box.width - img.width) < 1 && Math.abs(box.x - img.x) < 1 && Math.abs(box.y - img.y) < 1, 'canvas covers the image exactly');
  assert.ok(Math.abs(box.height - (img.height + Math.max(img.height, img.width * 1.4))) < 2, 'canvas adds writing room below the image: as tall as the image, at least 1.4 widths');
  await page.setViewportSize({ width: 390, height: 844 }); // 세로 폰
  await page.waitForTimeout(150);
  assert.ok(await inkAt(sample.x, sample.y), 'still in place on a narrow phone');
  await page.screenshot({ path: 'node_modules/.cache/exam-ink/phone.png' });
  await page.setViewportSize({ width: 1024, height: 1600 });
  await page.getByRole('button', { name: '넓게' }).click();
  await page.waitForTimeout(150);
  assert.ok(await inkAt(sample.x, sample.y));

  // 9) 보기 전용: 그려지지 않음
  await page.getByRole('button', { name: '보기 전용' }).click();
  await page.getByRole('button', { name: '펜', exact: true }).click();
  await draw(wave.map(([x, y]) => [x, y + 0.2]));
  assert.equal((await strokes()).length, 5, 'readOnly ignores input');
  await page.getByRole('button', { name: '쓰기', exact: true }).click();

  // 10) 손바닥 무시: 펜이 한 번 감지되면 손가락 터치는 그리지 않는다
  const fire = (type, pointerType, pointerId, points) => page.evaluate(({ type, pointerType, pointerId, points }) => {
    const el = document.querySelector('.exam-ink-input');
    const r = el.getBoundingClientRect();
    for (const [nx, ny] of points) {
      el.dispatchEvent(new PointerEvent(type, { pointerId, pointerType, isPrimary: true, bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1, pressure: type === 'pointerup' ? 0 : 0.6, clientX: r.left + nx * r.width, clientY: r.top + ny * r.width }));
    }
  }, { type, pointerType, pointerId, points });
  const touchBefore = (await strokes()).length;
  await fire('pointerdown', 'touch', 31, [[0.3, 1.2]]);
  await fire('pointermove', 'touch', 31, [[0.35, 1.22], [0.4, 1.25]]);
  await fire('pointerup', 'touch', 31, [[0.4, 1.25]]);
  assert.equal((await strokes()).length, touchBefore + 1, 'without a pen, fingers draw');
  await fire('pointerdown', 'pen', 32, [[0.3, 1.3]]);
  await fire('pointermove', 'pen', 32, [[0.35, 1.32], [0.4, 1.35]]);
  await fire('pointerup', 'pen', 32, [[0.4, 1.35]]);
  list = await strokes();
  assert.equal(list.length, touchBefore + 2, 'pen draws');
  assert.ok(list.at(-1).points.some(p => p.pressure !== 0.5), 'pen pressure is stored');
  assert.equal(await page.locator('.exam-ink').getAttribute('data-pen-detected'), 'true');
  await fire('pointerdown', 'touch', 33, [[0.3, 1.4]]);
  await fire('pointermove', 'touch', 33, [[0.4, 1.45]]);
  await fire('pointerup', 'touch', 33, [[0.4, 1.45]]);
  assert.equal((await strokes()).length, touchBefore + 2, 'palm/finger touches are ignored once a pen was seen');
  // 손가락은 캔버스가 직접 스크롤로 처리한다(touch-action pan은 iPad에서 펜 획까지 끊었다) — 펜 입력은 늘 캔버스가 받는다.
  assert.equal(await input.evaluate(el => getComputedStyle(el).touchAction), 'none', 'the pen is never handed to native scrolling');

  // 실기기 버그 회귀: 펜으로 쓰다 잠깐 멈춰도(짧은 획 + 0.7초 정지) 획이 도형으로 바뀌거나 끊기지 않고 이어진다.
  const beforePause = (await strokes()).length;
  await fire('pointerdown', 'pen', 34, [[0.2, 1.6]]);
  await fire('pointermove', 'pen', 34, [[0.21, 1.6], [0.22, 1.6], [0.23, 1.6], [0.24, 1.6]]); // 짧고 곧은 첫 획(약 30px) — 예전 18px 기준이면 직선으로 바뀌었다
  await page.waitForTimeout(750);
  await fire('pointermove', 'pen', 34, Array.from({ length: 20 }, (_, i) => [0.22 + i * 0.02, 1.62 + Math.sin(i / 2) * 0.03]));
  await fire('pointerup', 'pen', 34, [[0.6, 1.62]]);
  list = await strokes();
  assert.equal(list.length, beforePause + 1, 'the paused stroke is committed as one stroke');
  assert.ok(!list.at(-1).shape, 'a mid-writing pause does not turn handwriting into a shape');
  assert.ok(Math.max(...list.at(-1).points.map(p => p.x)) > 0.55, 'writing after the pause is kept (the stroke did not stop at the pause)');

  assert.deepEqual(errors, []);
  console.log('PASS exam ink: pen, hold→line/circle with resize, stroke eraser, undo/redo/clear, resize keeps position, readOnly, palm rejection');
  await page.close();
} finally { await browser.close(); }
