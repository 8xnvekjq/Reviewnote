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
  // 펜 감지 전 지우개 첫 터치를 다지 탭으로 취소해도 기존 redo는 보존한다.
  await page.getByRole('button', { name: '되돌리기' }).click();
  const beforeEraseTap = await strokes();
  assert.ok(await page.evaluate(() => window.__ink.handle().canRedo()));
  await page.getByRole('button', { name: '지우개' }).click();
  await page.evaluate(() => {
    const el = document.querySelector('.exam-ink-input');
    const r = el.getBoundingClientRect();
    const p = window.__ink.strokes()[0].points[0];
    for (const type of ['pointerdown', 'pointerup']) for (const i of [0, 1]) {
      el.dispatchEvent(new PointerEvent(type, { pointerId: 500 + i, pointerType: 'touch', bubbles: true, cancelable: true,
        clientX: r.left + p.x * r.width + i * 60, clientY: r.top + p.y * r.width }));
    }
  });
  assert.deepEqual(await strokes(), beforeEraseTap, 'cancelled erase restores the strokes');
  assert.ok(await page.evaluate(() => window.__ink.handle().canRedo()), 'cancelled erase preserves redo');
  await page.getByRole('button', { name: '다시 하기' }).click();
  await page.getByRole('button', { name: '펜', exact: true }).click();
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

  // ── 애플펜슬 흉내: 240Hz 가까이 들어오는 미세 떨림(±3~4px) 섞인 꾹 누름 ──
  await page.getByRole('button', { name: '모두 지우기' }).click();
  assert.equal((await strokes()).length, 0);
  /** 펜으로 path를 그은 뒤 끝점에서 amp px로 떨며 holdMs 동안 누르고, after 점들로 이어 간다(떼지는 않음). */
  const penHold = (pointerId, path, { holdMs, amp, after = [] }) => page.evaluate(async ({ pointerId, path, holdMs, amp, after }) => {
    const el = document.querySelector('.exam-ink-input');
    const r = el.getBoundingClientRect();
    const send = (type, [nx, ny], dx = 0, dy = 0) => el.dispatchEvent(new PointerEvent(type, {
      pointerId, pointerType: 'pen', isPrimary: true, bubbles: true, cancelable: true, buttons: 1, pressure: 0.6,
      clientX: r.left + nx * r.width + dx, clientY: r.top + ny * r.width + dy,
    }));
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    let seed = 11;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
    send('pointerdown', path[0]);
    for (const p of path.slice(1)) { send('pointermove', p); await sleep(4); }
    const end = path.at(-1);
    for (const until = performance.now() + holdMs; performance.now() < until;) {
      send('pointermove', end, rand() * 2 * amp, rand() * 2 * amp);
      await sleep(4);
    }
    for (const p of after) { send('pointermove', p); await sleep(8); }
  }, { pointerId, path, holdMs, amp, after });
  const penLift = (pointerId, at, type = 'pointerup') => fire(type, 'pen', pointerId, [at]);
  const lineSteps = (a, b, n = 30) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);

  // 떨림 섞인 꾹 누름 → 직선(예전 3px 기준은 이 떨림에서 타이머가 계속 리셋돼 아이패드에서 변환이 안 됐다)
  await penHold(41, lineSteps([0.15, 0.3], [0.6, 0.4]), { holdMs: 900, amp: 3.5 });
  await penLift(41, [0.6, 0.4]);
  list = await strokes();
  assert.equal(list.length, 1);
  assert.equal(list[0].shape?.kind, 'line', `jittery Pencil hold becomes a line: ${JSON.stringify(list[0].shape)}`);
  assert.ok(Math.abs(list[0].shape.from[0] - 0.15) < 0.015 && Math.abs(list[0].shape.from[1] - 0.3) < 0.015);
  assert.ok(Math.abs(list[0].shape.to[0] - 0.6) < 0.015 && Math.abs(list[0].shape.to[1] - 0.4) < 0.015, `end: ${list[0].shape.to}`);

  // 떨림 섞인 꾹 누름 → 원
  const penCircle = Array.from({ length: 61 }, (_, i) => { const a = (i / 60) * Math.PI * 2.04; return [0.75 + 0.1 * Math.cos(a), 0.3 + 0.1 * Math.sin(a)]; });
  await penHold(42, penCircle, { holdMs: 900, amp: 4 });
  await penLift(42, penCircle.at(-1));
  list = await strokes();
  assert.equal(list.at(-1).shape?.kind, 'ellipse', `jittery Pencil hold on a loop becomes a circle: ${JSON.stringify(list.at(-1).shape)}`);
  assert.ok(Math.abs(list.at(-1).shape.cx - 0.75) < 0.015 && Math.abs(list.at(-1).shape.rx - 0.1) < 0.015);

  // 글씨 쓰다 떨며 잠깐 멈춤(짧은 첫 획 + 0.8초) → 도형으로 안 바뀌고 한 획으로 이어진다
  await penHold(43, lineSteps([0.2, 0.62], [0.24, 0.62], 6), { holdMs: 800, amp: 3, after: Array.from({ length: 20 }, (_, i) => [0.24 + i * 0.015, 0.63 + Math.sin(i / 2) * 0.02]) });
  await penLift(43, [0.53, 0.63]);
  list = await strokes();
  assert.equal(list.length, 3, 'paused handwriting is one stroke');
  assert.ok(!list.at(-1).shape, 'a jittery mid-writing pause does not make a shape');
  assert.ok(Math.max(...list.at(-1).points.map(p => p.x)) > 0.5, 'writing after the pause is kept');

  // 뾰족하게 꺾인 긴 글씨 획(ㄹ 같은 지그재그)도 꾹 눌러 두면 그대로
  const zig = [[0.1, 0.75], [0.3, 0.75], [0.3, 0.8], [0.1, 0.8], [0.1, 0.85], [0.3, 0.85]].flatMap((p, i, a) => (i ? lineSteps(a[i - 1], p, 8).slice(1) : [p]));
  await penHold(44, zig, { holdMs: 900, amp: 3 });
  await penLift(44, zig.at(-1));
  assert.ok(!(await strokes()).at(-1).shape, 'zigzag handwriting is left alone');

  // 꾹 누르는 중 iPad가 pointercancel을 보내도 그리던 획·도형은 남는다
  await penHold(45, lineSteps([0.5, 0.75], [0.9, 0.75]), { holdMs: 900, amp: 2 });
  await penLift(45, [0.9, 0.75], 'pointercancel');
  list = await strokes();
  assert.equal(list.length, 5, 'a cancelled hold keeps the stroke');
  assert.equal(list.at(-1).shape?.kind, 'line', 'and the snapped shape');

  // ── 삼각형·사각형, 휜 획은 직선(마우스로 꾹) ──
  const loopOf = corners => [...corners, corners[0], corners[1]].flatMap((p, i, a) => (i ? lineSteps(a[i - 1], p, 10).slice(1) : [p])).slice(0, -8);
  await draw(loopOf([[0.2, 0.95], [0.35, 1.2], [0.05, 1.2]]), { holdMs: 800 });
  list = await strokes();
  assert.equal(list.at(-1).shape?.kind, 'polygon', `held triangle: ${JSON.stringify(list.at(-1).shape)}`);
  assert.equal(list.at(-1).shape.points.length, 3);
  assert.ok(await inkAt(0.275, 1.075), 'triangle side is painted');
  await draw(loopOf([[0.45, 0.95], [0.9, 0.96], [0.9, 1.2], [0.45, 1.19]]), { holdMs: 800 });
  list = await strokes();
  const rect = list.at(-1).shape;
  assert.equal(rect?.kind, 'polygon', `held rectangle: ${JSON.stringify(rect)}`);
  assert.equal(rect.points.length, 4);
  assert.equal(new Set(rect.points.map(p => p[0].toFixed(6))).size, 2, 'upright rectangle (two x values)');
  assert.equal(new Set(rect.points.map(p => p[1].toFixed(6))).size, 2, 'upright rectangle (two y values)');
  // 지우개로 사각형 한 변을 스치면 지워진다
  await page.getByRole('button', { name: '지우개' }).click();
  await draw([[0.675, 1.1], [0.675, 1.25]]);
  assert.ok(!(await strokes()).some(s => s.shape?.kind === 'polygon' && s.shape.points.length === 4), 'eraser removes the rectangle');
  await page.getByRole('button', { name: '되돌리기' }).click();
  await page.getByRole('button', { name: '펜', exact: true }).click();
  const arch = Array.from({ length: 40 }, (_, i) => { const x = 0.1 + i * 0.02; return [x, 1.55 - 0.6 * (x - 0.49) * (x - 0.49) + (i % 2 ? 0.003 : -0.003)]; });
  await draw(arch, { holdMs: 800 });
  list = await strokes();
  // 곡선 다듬기는 없앴다 — 살짝 휜 열린 획을 꾹 누르면 직선(시작점→끝점)
  assert.equal(list.at(-1).shape?.kind, 'line', `held gentle arc becomes a line: ${JSON.stringify(list.at(-1).shape)}`);
  assert.ok(await inkAt(0.49, 1.459), 'the line is painted between the ends');
  const shapeCount = list.length;

  // ── 레이저: 빛만 잠깐 남고 획·실행 취소 기록이 생기지 않는다 ──
  const laserLit = () => page.evaluate(() => {
    const canvas = document.querySelector('.exam-ink-laser');
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let red = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 40 && data[i] > 200) red++;
    return red;
  });
  const undoBefore = await page.evaluate(() => window.__ink.handle().canUndo());
  const redoBefore = await page.evaluate(() => window.__ink.handle().canRedo());
  await page.getByRole('button', { name: '레이저' }).click();
  await draw(lineSteps([0.1, 1.7], [0.8, 1.75], 20), { holdMs: 900 }); // 꾹 눌러도 도형 판정 없음
  assert.equal((await strokes()).length, shapeCount, 'laser never adds a stroke');
  assert.ok(await laserLit() > 100, 'laser glow is visible right after drawing');
  assert.ok(!(await inkAt(0.45, 1.725)), 'laser is not on the ink layer');
  await draw(lineSteps([0.1, 1.85], [0.8, 1.9], 20)); // 연달아 한 번 더
  const litAfterLift = await laserLit();
  await page.waitForTimeout(600);
  assert.ok(await laserLit() >= litAfterLift * 0.9, 'the whole stroke stays for about a second after lifting');
  await page.waitForTimeout(1400);
  assert.equal(await laserLit(), 0, 'then fades out completely');
  assert.equal((await strokes()).length, shapeCount);
  assert.equal(await page.evaluate(() => window.__ink.handle().canUndo()), undoBefore, 'laser leaves no undo history');
  assert.equal(await page.evaluate(() => window.__ink.handle().canRedo()), redoBefore);
  await page.getByRole('button', { name: '펜', exact: true }).click();

  // ── 올가미: 둘러서 고르기 → 옮기기 → 회전 → 확대 → 실행 취소(조작마다 1단계) ──
  const unitPx = async () => (await input.boundingBox()).width; // 정규화 1 = 이미지 너비(px)
  const selected = async () => Number(await page.locator('.exam-ink').getAttribute('data-selected'));
  const firstLine = (await strokes()).find(s => s.shape?.kind === 'line' && Math.abs(s.shape.from[1] - 0.3) < 0.02);
  assert.ok(firstLine, 'the jittery-hold line from (0.15,0.3) is there');
  const countBefore = (await strokes()).length;
  const inkLayers = () => page.evaluate(() => Array.from(document.querySelectorAll('.exam-ink canvas')).slice(0, 2).map(c => c.toDataURL()));
  const layersBeforeSelection = await inkLayers();
  await page.getByRole('button', { name: '올가미' }).click();
  await draw([[0.1, 0.24], [0.4, 0.22], [0.64, 0.25], [0.64, 0.46], [0.3, 0.47], [0.1, 0.45], [0.1, 0.26]]);
  assert.equal(await selected(), 1, 'the lasso picks the line only');
  assert.equal((await strokes()).length, countBefore, 'selecting changes nothing');
  assert.ok(await inkAt(0.375, 0.35), 'the selected line stays on its original ink layer');
  assert.deepEqual(await inkLayers(), layersBeforeSelection, 'selection preserves ink pixels, layer opacity and stroke order');
  // 선택 테두리(획 굵기 절반 + 여백 8px)
  const w0 = await unitPx();
  const [fx, fy] = [firstLine.shape.from, firstLine.shape.to];
  const half = 3 / 700 / 2, pad = 8 / w0, rot = 12 / w0;
  let frame = {
    cx: (fx[0] + fy[0]) / 2, cy: (fx[1] + fy[1]) / 2,
    hw: Math.abs(fy[0] - fx[0]) / 2 + half + pad, hh: Math.abs(fy[1] - fx[1]) / 2 + half + pad, angle: 0,
  };
  // 1) 안쪽을 끌어 옮기기
  await draw([[frame.cx, frame.cy], [frame.cx + 0.03, frame.cy + 0.2], [frame.cx + 0.05, frame.cy + 0.4]]);
  list = await strokes();
  assert.equal(list.length, countBefore, 'moving replaces, never duplicates');
  assert.ok(!list.some(s => s.id === firstLine.id), 'the moved stroke got a new id (remove old + add new)');
  const moved = list.find(s => s.shape?.kind === 'line' && Math.abs(s.shape.from[0] - (fx[0] + 0.05)) < 0.003);
  assert.ok(moved && Math.abs(moved.shape.from[1] - (fx[1] + 0.4)) < 0.003, `moved line: ${JSON.stringify(moved?.shape)}`);
  assert.ok(moved.points.every(p => Math.abs(p.x) <= 100 && Math.abs(p.y) <= 100));
  assert.equal(await selected(), 1, 'the selection follows the moved stroke');
  frame = { ...frame, cx: frame.cx + 0.05, cy: frame.cy + 0.4 };
  // 2) 오른쪽 가운데 회전 아이콘을 끌어 45° 회전(무게중심 기준)
  const R = frame.hw + rot;
  await draw([[frame.cx + R, frame.cy], [frame.cx + R * Math.cos(Math.PI / 8), frame.cy + R * Math.sin(Math.PI / 8)], [frame.cx + R * Math.cos(Math.PI / 4), frame.cy + R * Math.sin(Math.PI / 4)]]);
  list = await strokes();
  const turned = list.find(s => s.shape?.kind === 'line' && s.id !== moved.id && Math.abs((s.shape.from[0] + s.shape.to[0]) / 2 - frame.cx) < 0.003 && Math.abs((s.shape.from[1] + s.shape.to[1]) / 2 - frame.cy) < 0.003);
  assert.ok(turned, 'rotation keeps the centre');
  const angleOf = s => Math.atan2(s.shape.to[1] - s.shape.from[1], s.shape.to[0] - s.shape.from[0]);
  assert.ok(Math.abs(angleOf(turned) - angleOf(moved) - Math.PI / 4) < 0.02, `rotated by 45°: ${angleOf(turned) - angleOf(moved)}`);
  assert.equal(list.length, countBefore);
  frame = { ...frame, angle: Math.PI / 4 };
  // 3) 오른아래 모서리 손잡이를 대각선 바깥으로 1.5배(맞은편 모서리 고정, 비율 유지)
  const cornerOf = (f, sx, sy) => {
    const c = Math.cos(f.angle), s = Math.sin(f.angle), u = sx * f.hw, v = sy * f.hh;
    return [f.cx + u * c - v * s, f.cy + u * s + v * c];
  };
  const br = cornerOf(frame, 1, 1), tl = cornerOf(frame, -1, -1);
  const to = [tl[0] + (br[0] - tl[0]) * 1.5, tl[1] + (br[1] - tl[1]) * 1.5];
  await draw([br, [(br[0] + to[0]) / 2, (br[1] + to[1]) / 2], to]);
  list = await strokes();
  const lenOf = s => Math.hypot(s.shape.to[0] - s.shape.from[0], s.shape.to[1] - s.shape.from[1]);
  const grown = list.find(s => s.shape?.kind === 'line' && s.id !== turned.id && Math.abs(lenOf(s) - lenOf(turned) * 1.5) < 0.01);
  assert.ok(grown, `scaled 1.5×: ${JSON.stringify(list.filter(s => s.shape?.kind === 'line').map(s => [s.id.slice(0, 4), lenOf(s)]))}`);
  assert.ok(Math.abs(grown.size - 4.5) < 0.01, 'the width scales with it');
  assert.ok(Math.abs(angleOf(grown) - angleOf(turned)) < 0.01, 'scaling keeps the angle');
  // 4) 빈 곳 탭 → 선택 해제
  await draw([[0.05, 1.95]]);
  assert.equal(await selected(), 0, 'tapping outside clears the selection');

  // ── 두 손가락 두 번 탭 → 실행 취소, 세 손가락 두 번 탭 → 다시 실행 ──
  const multiTap = (n, base) => page.evaluate(async ({ n, base }) => {
    const el = document.querySelector('.exam-ink-input');
    const r = el.getBoundingClientRect();
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const send = (type, id, i) => el.dispatchEvent(new PointerEvent(type, {
      pointerId: id, pointerType: 'touch', isPrimary: i === 0, bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1,
      pressure: type === 'pointerup' ? 0 : 0.5, clientX: r.left + 40 + i * 70, clientY: r.top + r.width * 1.95,
    }));
    for (let k = 0; k < 2; k++) {
      for (let i = 0; i < n; i++) send('pointerdown', base + k * 10 + i, i);
      await sleep(60);
      for (let i = 0; i < n; i++) send('pointerup', base + k * 10 + i, i);
      await sleep(120);
    }
  }, { n, base });
  const scrollY = await page.evaluate(() => window.scrollY);
  await multiTap(2, 100);
  list = await strokes();
  assert.ok(list.some(s => s.id === turned.id) && !list.some(s => s.id === grown.id), 'two-finger double tap undid the scale (one step)');
  assert.equal(list.length, countBefore, 'and drew nothing');
  assert.equal(await page.evaluate(() => window.scrollY), scrollY, 'and did not scroll');
  await multiTap(2, 200);
  assert.ok((await strokes()).some(s => s.id === moved.id), 'again: the rotation is undone');
  await multiTap(3, 300);
  assert.ok((await strokes()).some(s => s.id === turned.id), 'three-finger double tap redoes');
  // 한 번만 탭하면 아무 일도 없다
  const single = JSON.stringify(await strokes());
  await page.evaluate(() => {
    const el = document.querySelector('.exam-ink-input');
    const r = el.getBoundingClientRect();
    for (const type of ['pointerdown', 'pointerup']) for (const i of [0, 1]) {
      el.dispatchEvent(new PointerEvent(type, { pointerId: 400 + i, pointerType: 'touch', isPrimary: i === 0, bubbles: true, cancelable: true, clientX: r.left + 40 + i * 70, clientY: r.top + r.width * 1.95 }));
    }
  });
  await page.waitForTimeout(450);
  assert.equal(JSON.stringify(await strokes()), single, 'a single two-finger tap does nothing');
  // 버튼 실행 취소로 원래 자리까지
  await page.getByRole('button', { name: '되돌리기' }).click();
  await page.getByRole('button', { name: '되돌리기' }).click();
  list = await strokes();
  assert.ok(list.some(s => s.id === firstLine.id), 'undo brings the original stroke back');
  assert.equal(list.length, countBefore);
  await page.screenshot({ path: 'node_modules/.cache/exam-ink/lasso.png' });
  await page.getByRole('button', { name: '펜', exact: true }).click();

  // ── 두 손가락 드래그 → 스크롤(다지 탭 도입 후 막혔던 회귀). 탭 허용치 안의 두 번 탭은 계속 실행 취소 ──
  /** 두 손가락을 함께 (dx, dy)만큼 민다. 손가락 위치는 화면 좌표 그대로(스크롤돼도 손가락은 화면에 있다). */
  const twoFingerDrag = (dx, dy, base) => page.evaluate(async ({ dx, dy, base }) => {
    const el = document.querySelector('.exam-ink-input');
    const r = el.getBoundingClientRect();
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const x0 = r.left + r.width * 0.3, y0 = Math.min(window.innerHeight - 40, r.top + r.width * 0.9);
    const send = (type, i, k) => el.dispatchEvent(new PointerEvent(type, {
      pointerId: base + i, pointerType: 'touch', isPrimary: i === 0, bubbles: true, cancelable: true, buttons: type === 'pointerup' ? 0 : 1,
      pressure: type === 'pointerup' ? 0 : 0.5, clientX: x0 + i * 80 + (dx * k) / 10, clientY: y0 + (dy * k) / 10,
    }));
    send('pointerdown', 0, 0); send('pointerdown', 1, 0);
    for (let k = 1; k <= 10; k++) { send('pointermove', 0, k); send('pointermove', 1, k); await sleep(16); }
    send('pointerup', 0, 10); send('pointerup', 1, 10);
    await sleep(50);
  }, { dx, dy, base });
  await page.evaluate(() => { document.body.style.paddingBottom = '2400px'; window.scrollTo(0, 0); });
  const beforeDrag = JSON.stringify(await strokes());
  await twoFingerDrag(0, -150, 700);
  assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - 150) <= 2, 'two-finger drag up scrolls the page down by the finger movement');
  assert.equal(JSON.stringify(await strokes()), beforeDrag, 'and neither draws nor undoes');
  await twoFingerDrag(0, 100, 710);
  assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - 50) <= 2, 'and back up');
  // 한능검 원본 페이지처럼 가로 스크롤 영역 안: 두 손가락 가로 드래그는 그 영역을 옆으로 민다.
  await page.evaluate(() => {
    const main = document.querySelector('main');
    main.style.width = '480px'; main.style.overflowX = 'auto';
    document.querySelector('[data-testid="paper"]').style.maxWidth = 'none';
  });
  await twoFingerDrag(-120, 0, 720);
  assert.ok(Math.abs(await page.evaluate(() => document.querySelector('main').scrollLeft) - 120) <= 2, 'two-finger drag sideways scrolls the horizontal scroller');
  await page.evaluate(() => {
    const main = document.querySelector('main');
    main.scrollLeft = 0; main.style.width = ''; main.style.overflowX = '';
    document.querySelector('[data-testid="paper"]').style.maxWidth = '100%';
  });
  // 한 손가락(펜 감지 후)은 예전처럼 스크롤
  const oneY = await page.evaluate(() => window.scrollY);
  await page.evaluate(async () => {
    const el = document.querySelector('.exam-ink-input');
    const r = el.getBoundingClientRect();
    const y0 = Math.min(window.innerHeight - 40, r.top + r.width * 0.9);
    for (let k = 0; k <= 10; k++) {
      el.dispatchEvent(new PointerEvent(k ? 'pointermove' : 'pointerdown', { pointerId: 730, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, buttons: 1, clientX: r.left + 100, clientY: y0 - k * 6 }));
    }
    el.dispatchEvent(new PointerEvent('pointerup', { pointerId: 730, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true, clientX: r.left + 100, clientY: y0 - 60 }));
  });
  assert.ok(Math.abs(await page.evaluate(() => window.scrollY) - oneY - 60) <= 2, 'a single finger still scrolls once a pen was seen');
  assert.equal(JSON.stringify(await strokes()), beforeDrag, 'and does not draw');
  await page.waitForTimeout(400);
  const scrolledY = await page.evaluate(() => window.scrollY);
  await multiTap(2, 800);
  assert.notEqual(JSON.stringify(await strokes()), beforeDrag, 'a still two-finger double tap still undoes after scrolling');
  assert.equal(await page.evaluate(() => window.scrollY), scrolledY, 'and the tap does not scroll');
  await page.getByRole('button', { name: '다시 하기' }).click();
  await page.evaluate(() => { document.body.style.paddingBottom = ''; window.scrollTo(0, 0); });

  assert.deepEqual(errors, []);
  console.log('PASS exam ink: pen, hold→line/circle with resize, stroke eraser, undo/redo/clear, resize keeps position, readOnly, palm rejection, jittery Pencil hold, triangle/rectangle, arc→line, laser, lasso move/rotate/scale/undo, multi-finger tap undo/redo, two-finger scroll');
  await page.close();
} finally { await browser.close(); }
