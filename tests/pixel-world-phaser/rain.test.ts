import test from 'node:test';
import assert from 'node:assert/strict';
import { RAIN_SLANT, rainMark } from '../../src/features/pixel-world-phaser/logic/rain.ts';

test('빗방울은 기울기대로 떨어지고, 바닥에서 튄 뒤 새 자리에서 다시 내린다', () => {
  const w = 320, h = 240;
  for (let i = 0; i < 56; i++) {
    const a = rainMark(i, 1000, w, h), b = rainMark(i, 1016, w, h);
    for (const m of [a, b]) { assert.ok(m.x >= 0 && m.x < w); assert.ok(m.alpha >= 0 && m.alpha <= 1); }
    if (a.kind === 'drop' && b.kind === 'drop' && b.y > a.y && Math.abs(b.x - a.x) < w / 2) {
      assert.ok(Math.abs((b.x - a.x) / (b.y - a.y) - RAIN_SLANT) < 1e-6, '움직임과 빗줄기 기울기가 같다');
    }
  }
  // 한 방울을 오래 따라가면 떨어짐 → 튐 → 다른 x에서 다시 시작이 반복된다.
  const kinds = new Set<string>(), starts = new Set<number>();
  let prev = rainMark(3, 0, w, h);
  for (let t = 16; t < 20000; t += 16) {
    const m = rainMark(3, t, w, h);
    kinds.add(m.kind);
    if (m.kind === 'drop' && prev.kind !== 'drop') starts.add(Math.round(m.x));
    prev = m;
  }
  assert.deepEqual([...kinds].sort(), ['drop', 'splash']);
  assert.ok(starts.size >= 5, '떨어질 때마다 시작 위치가 바뀐다');
});

test('같은 순간 방울들이 격자처럼 줄지어 서지 않는다', () => {
  const w = 320, h = 240;
  const drops = Array.from({ length: 56 }, (_, i) => rainMark(i, 5000, w, h)).filter(m => m.kind === 'drop');
  // 이웃한 번호끼리 x 간격이 모두 같으면(예전 i*43 격자) 일자로 보인다.
  const gaps = new Set(drops.slice(1).map((m, i) => Math.round((m.x - drops[i].x + w) % w)));
  assert.ok(gaps.size > drops.length / 2);
});
