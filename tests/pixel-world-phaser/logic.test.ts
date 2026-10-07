import { test } from 'node:test';
import assert from 'node:assert/strict';
import { facingFor, followOrigin, keyboardVector, knobOffset, stickVector, STICK_DEAD_ZONE, STICK_RADIUS } from '../../src/features/pixel-world-phaser/logic/joystick.ts';
import { cameraCenterAxis, cameraZoom, gameLayout, insideRect } from '../../src/features/pixel-world-phaser/logic/layout.ts';
import { AVATAR_POSES, avatarFrameIndex, avatarLayerPlan, avatarTextureKey } from '../../src/features/pixel-world-phaser/logic/avatarPlan.ts';
import { INTERACTABLES, SPAWN, TILE, WORLD_COLS, WORLD_ROWS, cellCenter, cellOf, facedInteractable, feetBlocked, moveFeet, planPath, worldSolid, toWorldCell } from '../../src/features/pixel-world-phaser/logic/yardWorld.ts';
import { PET_SHEETS, petFollowSpot } from '../../src/features/pixel-world-phaser/logic/petSheets.ts';
import { PIXEL_CATALOG } from '../../src/features/pixel-room/shop/catalog.ts';
import { SKIN_TONE_OPTIONS, EYE_COLOR_OPTIONS } from '../../src/features/pixel-room/shop/appearanceRows.ts';
import { yardWalkable, YARD_DOOR } from '../../src/features/pixel-room/yard/yardModel.ts';

const BASE = { top: null, bottom: null, shoes: null, hair: null, eyes: null, skin: null };
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// ── 조이스틱 ──
test('stick: dead zone gives no movement, full deflection gives magnitude 1', () => {
  const o = { x: 100, y: 100 };
  assert.equal(stickVector(o, { x: 100 + STICK_RADIUS * STICK_DEAD_ZONE - 1, y: 100 }).magnitude, 0);
  const full = stickVector(o, { x: 100 + STICK_RADIUS, y: 100 });
  assert.ok(close(full.magnitude, 1) && close(full.x, 1) && close(full.y, 0));
  const beyond = stickVector(o, { x: 100, y: 100 - STICK_RADIUS * 3 });
  assert.ok(close(beyond.magnitude, 1) && close(beyond.y, -1), 'clamped to 1 beyond the ring');
});
test('stick: analog — half deflection is slower, direction is preserved diagonally', () => {
  const o = { x: 0, y: 0 };
  const half = stickVector(o, { x: STICK_RADIUS * 0.58, y: 0 });
  assert.ok(half.magnitude > 0.3 && half.magnitude < 0.7);
  const diag = stickVector(o, { x: 100, y: 100 });
  assert.ok(close(diag.x, diag.y) && close(Math.hypot(diag.x, diag.y), 1));
});
test('stick: origin follows the thumb past the ring; knob stays inside it', () => {
  const o = { x: 0, y: 0 };
  assert.deepEqual(followOrigin(o, { x: 10, y: 0 }), o);
  const moved = followOrigin(o, { x: STICK_RADIUS + 30, y: 0 });
  assert.ok(close(moved.x, 30) && close(moved.y, 0));
  const knob = knobOffset(o, { x: 0, y: 500 });
  assert.ok(close(knob.y, STICK_RADIUS) && close(knob.x, 0));
});
test('facing: dominant axis with hysteresis near diagonals', () => {
  assert.equal(facingFor(1, 0.2, 'Front'), 'Right');
  assert.equal(facingFor(-0.2, -1, 'Right'), 'Back');
  assert.equal(facingFor(1, 1.1, 'Right'), 'Right', 'keeps current facing on near-diagonal');
  assert.equal(facingFor(1.1, 1, 'Front'), 'Front');
  assert.equal(facingFor(0, 0, 'Left'), 'Left');
});
test('keyboard vector is normalised', () => {
  const v = keyboardVector({ up: true, down: false, left: true, right: false });
  assert.ok(close(Math.hypot(v.x, v.y), 1) && v.x < 0 && v.y < 0);
  assert.equal(keyboardVector({ up: true, down: true, left: false, right: false }).magnitude, 0);
});

// ── 레이아웃 / 안전영역 ──
test('layout: phone portrait vs tablet landscape, integer zoom', () => {
  const phone = gameLayout(390, 844, { top: 47, right: 0, bottom: 34, left: 0 });
  assert.equal(phone.device, 'phone'); assert.equal(phone.orientation, 'portrait'); assert.equal(phone.zoom, 3);
  const tab = gameLayout(1280, 800);
  assert.equal(tab.device, 'tablet'); assert.equal(tab.orientation, 'landscape');
  for (const zoom of [phone.zoom, tab.zoom, cameraZoom(320, 480), cameraZoom(2560, 1440)]) assert.ok(Number.isInteger(zoom) && zoom >= 2 && zoom <= 8);
});
test('layout: A/B are ≥56px, inside the safe area, on the right half, not overlapping', () => {
  for (const [w, h, insets] of [[390, 844, { top: 47, right: 0, bottom: 34, left: 0 }], [320, 568, { top: 20, right: 0, bottom: 0, left: 0 }], [844, 390, { top: 0, right: 47, bottom: 21, left: 47 }], [1180, 820, { top: 24, right: 0, bottom: 20, left: 0 }], [800, 1280, { top: 24, right: 0, bottom: 0, left: 0 }]] as const) {
    const l = gameLayout(w, h, insets);
    for (const btn of [l.a, l.b]) {
      assert.ok(btn.size >= 56, 'big enough thumb target');
      assert.ok(btn.x + btn.size / 2 <= w - insets.right, `${w}x${h}: right safe edge`);
      assert.ok(btn.y + btn.size / 2 <= h - insets.bottom, `${w}x${h}: bottom safe edge`);
      assert.ok(btn.x - btn.size / 2 >= w / 2, `${w}x${h}: buttons stay out of the joystick half`);
    }
    assert.ok(Math.hypot(l.a.x - l.b.x, l.a.y - l.b.y) >= (l.a.size + l.b.size) / 2, `${w}x${h}: A and B do not overlap`);
    assert.ok(l.stickZone.y >= insets.top + 40, 'joystick zone starts below the HUD');
    assert.ok(l.dialogue.y + l.dialogue.height <= Math.min(l.a.y, l.b.y) - l.a.size / 2, 'dialogue sits above the buttons');
    assert.ok(l.dialogue.x >= insets.left && l.dialogue.x + l.dialogue.width <= w - insets.right);
    assert.ok(insideRect({ x: 20, y: h - 80 }, l.stickZone));
    assert.ok(!insideRect({ x: w - 20, y: h - 80 }, l.stickZone));
  }
});
test('camera center clamps to the world, or centres a world smaller than the view', () => {
  assert.equal(cameraCenterAxis(10, 100, 400), 50);
  assert.equal(cameraCenterAxis(390, 100, 400), 350);
  assert.equal(cameraCenterAxis(200, 100, 400), 200);
  assert.equal(cameraCenterAxis(10, 500, 400), 200);
});

// ── 아바타 외형 → 텍스처 키/레이어 ──
test('avatar texture key: same look → same key; defaults fold together; any change → new key', () => {
  assert.equal(avatarTextureKey(BASE), avatarTextureKey({ ...BASE, skin: 'tan', eyes: 'navy', top: 'default' }));
  assert.equal(avatarTextureKey({ ...BASE, hair: 'not-a-real-key' }), avatarTextureKey(BASE));
  const keys = new Set<string>([avatarTextureKey(BASE)]);
  for (const item of PIXEL_CATALOG.filter(entry => entry.category === 'avatar')) keys.add(avatarTextureKey({ ...BASE, [item.slot]: item.assetKey }));
  for (const option of SKIN_TONE_OPTIONS.slice(1)) keys.add(avatarTextureKey({ ...BASE, skin: option.key }));
  for (const option of EYE_COLOR_OPTIONS.slice(1)) keys.add(avatarTextureKey({ ...BASE, eyes: option.key }));
  const expected = 1 + PIXEL_CATALOG.filter(entry => entry.category === 'avatar').length + SKIN_TONE_OPTIONS.length - 1 + EYE_COLOR_OPTIONS.length - 1;
  assert.equal(keys.size, expected, 'every sold item / base option gets its own texture');
});
test('every sold avatar item resolves to a real atlas row or a fashion vector, in AvatarSprite layer order', () => {
  const heights = { body: 160, eyes: 128, bottoms: 448, shoes: 320, tops: 928, hair: 928 } as const;
  for (const item of PIXEL_CATALOG.filter(entry => entry.category === 'avatar')) {
    const plan = avatarLayerPlan({ ...BASE, [item.slot]: item.assetKey });
    assert.deepEqual(plan.map(step => step.layer), ['body', 'eyes', 'bottoms', 'shoes', 'tops', 'hair']);
    const layer = { top: 'tops', bottom: 'bottoms', shoes: 'shoes', hair: 'hair', eyes: 'eyes' }[item.slot as string];
    const step = plan.find(entry => entry.layer === layer)!;
    if (step.kind === 'fashion') assert.equal(step.colors.length, 4, item.itemId);
    else assert.ok(step.row > 0 && (step.row + 1) * 32 <= heights[step.layer], `${item.itemId} row ${step.row} inside its sheet`);
  }
});
test('avatar frame index covers 8 poses × 4 frames', () => {
  assert.equal(AVATAR_POSES.length, 8);
  assert.equal(avatarFrameIndex(false, 'Front', 0), 0);
  assert.equal(avatarFrameIndex(true, 'Right', 3), 31);
  assert.equal(avatarFrameIndex(true, 'Front', 5), 17);
});

// ── 마당 월드 / 충돌 / 길찾기 ──
test('world solidity matches the original yard (plus forest margin and an open door)', () => {
  for (let y = 0; y < 12; y++) for (let x = 0; x < 16; x++) {
    const w = toWorldCell({ x, y });
    const expected = !yardWalkable({ x, y });
    assert.equal(worldSolid(w), expected, `${x},${y}`);
  }
  assert.ok(worldSolid({ x: 0, y: 0 }) && worldSolid({ x: WORLD_COLS - 1, y: WORLD_ROWS - 1 }));
  assert.ok(!feetBlocked(SPAWN));
});
test('movement slides along walls and never enters a solid cell', () => {
  const door = cellCenter(toWorldCell(YARD_DOOR));
  // 문 앞에서 위로 계속 밀면 집 벽에서 멈춘다.
  let p = cellCenter(toWorldCell({ x: 5, y: 7 }));
  for (let i = 0; i < 60; i++) p = moveFeet(p, 0, -2);
  assert.ok(p.y > door.y + TILE / 2, 'stopped below the house');
  assert.ok(!feetBlocked(p));
  // 대각선으로 벽에 밀면 옆으로는 계속 미끄러진다.
  const before = p.x;
  for (let i = 0; i < 10; i++) p = moveFeet(p, 1.5, -1.5);
  assert.ok(p.x > before + 10, 'slid sideways along the wall');
  // 아무리 멀리 밀어도 어떤 칸에도 들어가지 않는다.
  for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, -2]]) {
    let q = { ...SPAWN };
    for (let i = 0; i < 400; i++) { q = moveFeet(q, dx, dy); assert.ok(!feetBlocked(q)); }
  }
});
test('tap-to-walk path reaches open cells and stops beside solid targets (scarecrow)', () => {
  const start = cellOf(SPAWN);
  const scarecrow = INTERACTABLES.find(item => item.id === 'scarecrow')!;
  const path = planPath(start, scarecrow.cell);
  assert.ok(path.length > 0);
  const last = path.at(-1)!;
  assert.equal(Math.abs(last.x - scarecrow.cell.x) + Math.abs(last.y - scarecrow.cell.y), 1, 'ends next to the scarecrow');
  assert.ok(path.every(cell => !worldSolid(cell)));
  assert.deepEqual(planPath(start, start), []);
  // 집 한가운데를 찍으면 집 앞(가장 가까운 열린 칸)까지 간다.
  const house = planPath(start, toWorldCell({ x: 5, y: 3 }));
  assert.ok(house.length === 0 || house.every(cell => !worldSolid(cell)));
  const far = planPath(cellOf({ x: 90, y: 200 }), toWorldCell({ x: 5, y: 3 }));
  assert.ok(far.length > 0, 'walks toward an unreachable (solid) target instead of ignoring the tap');
});
test('A-button target: facing the scarecrow from the cell below finds it; facing away does not', () => {
  const scarecrow = INTERACTABLES.find(item => item.id === 'scarecrow')!;
  const below = cellCenter({ x: scarecrow.cell.x, y: scarecrow.cell.y + 1 });
  assert.equal(facedInteractable(below, 'Back', [scarecrow])?.id, 'scarecrow');
  assert.equal(facedInteractable(below, 'Front')?.id, 'farm:0');
  assert.equal(facedInteractable(SPAWN, 'Back')?.id, 'door');
});
test('pet follow spot trails behind the player for each facing', () => {
  const feet = { x: 100, y: 100 };
  assert.ok(petFollowSpot(feet, 'Right').x < feet.x);
  assert.ok(petFollowSpot(feet, 'Left').x > feet.x);
  assert.ok(petFollowSpot(feet, 'Front').y < feet.y);
  assert.ok(petFollowSpot(feet, 'Back').y > feet.y);
  for (const sheet of Object.values(PET_SHEETS)) {
    for (const anim of [sheet.walk, sheet.idle]) assert.ok(anim.row < sheet.rows && anim.frames.every(frame => frame < sheet.columns));
  }
});
