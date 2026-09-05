// Run directly with: node src/utils/guideBoxCrop.test.ts
// (Node 24 executes this .ts file's erasable-syntax types natively — no build step needed.)
// No Node built-in imports on purpose, so this file can also type-check under the
// app's browser-only tsconfig (lib: ES2023 + DOM, no @types/node).
import { computeInitialCropFromGuideBox, type CropPercent } from './guideBoxCrop.ts';

function assertPercentClose(actual: CropPercent, expected: CropPercent, tolerance = 0.05) {
  for (const key of ['left', 'right', 'top', 'bottom'] as const) {
    const value = actual[key];
    if (!Number.isFinite(value) || Math.abs(value - expected[key]) > tolerance) {
      throw new Error(`${key}: expected ${expected[key]} but got ${value}`);
    }
  }
}

function assertOk<T>(value: T, message: string): asserts value is NonNullable<T> {
  if (value === null || value === undefined) throw new Error(message);
}

let passed = 0;

function test(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

// Case 1: video display exactly matches the video's aspect ratio (no object-cover
// clipping), guide box centered and symmetric.
test('no cover clipping, centered guide box', () => {
  const result = computeInitialCropFromGuideBox(
    { left: 0, top: 0, width: 800, height: 600 },
    { left: 160, top: 120, width: 480, height: 360 },
    1600,
    1200
  );
  assertOk(result, 'expected a crop result');
  assertPercentClose(result, { left: 20, right: 20, top: 20, bottom: 20 });
});

// Case 2: portrait display showing a landscape video — object-cover clips the
// left/right edges. Numbers cross-checked against an independent manual
// derivation of the same scenario (1920x1080 video in a 400x700 box).
test('horizontal cover clipping (portrait container, landscape video)', () => {
  const result = computeInitialCropFromGuideBox(
    { left: 0, top: 0, width: 400, height: 700 },
    { left: 24, top: 218, width: 352, height: 264 },
    1920,
    1080
  );
  assertOk(result, 'expected a crop result');
  assertPercentClose(result, { left: 35.86, right: 35.86, top: 31.14, bottom: 31.14 }, 0.1);
});

// Case 3: landscape display showing a portrait video — object-cover clips the
// top/bottom edges. Transpose of case 2, so the percentages should also swap.
test('vertical cover clipping (landscape container, portrait video)', () => {
  const result = computeInitialCropFromGuideBox(
    { left: 0, top: 0, width: 700, height: 400 },
    { left: 218, top: 24, width: 264, height: 352 },
    1080,
    1920
  );
  assertOk(result, 'expected a crop result');
  assertPercentClose(result, { left: 31.14, right: 31.14, top: 35.86, bottom: 35.86 }, 0.1);
});

// Case 4: a guide box smaller than the minimum crop size must be clamped so the
// resulting selection never collapses below ImageCropper's 10% minimum width/height.
test('tiny guide box is clamped to exactly the minimum crop size', () => {
  const result = computeInitialCropFromGuideBox(
    { left: 0, top: 0, width: 1000, height: 1000 },
    { left: 475, top: 475, width: 50, height: 50 },
    1000,
    1000
  );
  assertOk(result, 'expected a crop result');
  assertPercentClose(result, { left: 45, right: 45, top: 45, bottom: 45 }, 0.01);
});

// Case 5: the video element itself is not positioned at the viewport origin, and
// the guide box is off-center — exercises the full offset math, not just the
// symmetric special cases above.
test('non-zero video offset with an asymmetric guide box', () => {
  const result = computeInitialCropFromGuideBox(
    { left: 50, top: 30, width: 800, height: 600 },
    { left: 150, top: 80, width: 400, height: 300 },
    1600,
    1200
  );
  assertOk(result, 'expected a crop result');
  assertPercentClose(result, { left: 12.5, right: 37.5, top: 8.33, bottom: 41.67 }, 0.05);
});

// Case 6: a guide box that hasn't laid out yet (zero size) must fall back to null,
// the same as a zero-size video rect — it must never silently produce a bogus
// top-left-corner crop.
test('zero-size guide box returns null instead of a bogus crop', () => {
  const result = computeInitialCropFromGuideBox(
    { left: 0, top: 0, width: 1000, height: 1000 },
    { left: 0, top: 0, width: 0, height: 0 },
    1000,
    1000
  );
  if (result !== null) throw new Error(`expected null for zero-size guide box, got ${JSON.stringify(result)}`);
});

// Case 7: degenerate input (zero-size video rect or native resolution) must not
// produce Infinity/NaN — callers fall back to ImageCropper's own default margins.
test('degenerate input returns null instead of NaN/Infinity', () => {
  const a = computeInitialCropFromGuideBox(
    { left: 0, top: 0, width: 0, height: 0 },
    { left: 0, top: 0, width: 10, height: 10 },
    1920,
    1080
  );
  if (a !== null) throw new Error(`expected null for zero-size video rect, got ${JSON.stringify(a)}`);

  const b = computeInitialCropFromGuideBox(
    { left: 0, top: 0, width: 400, height: 700 },
    { left: 0, top: 0, width: 10, height: 10 },
    0,
    0
  );
  if (b !== null) throw new Error(`expected null for zero native resolution, got ${JSON.stringify(b)}`);
});

console.log(`\n${passed}/7 tests passed`);
