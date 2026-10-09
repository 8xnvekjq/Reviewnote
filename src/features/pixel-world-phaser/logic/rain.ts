// 비 효과(화면 좌표). 방울마다 위치·속도·길이를 해시로 흩고, 떨어질 때마다 새 자리에서 다시 내린다 —
// 예전엔 같은 간격 격자라 방울이 일자로 줄지어 보였다. 바닥(화면 안 임의 높이)에 닿으면 잠깐 튀는 물방울을 남긴다.
export const RAIN_SLANT = -0.22; // 아래로 1px 내려갈 때 옆으로 움직이는 양(왼쪽으로 살짝 기운 비)
const SPLASH_MS = 140;

function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

export type RainMark =
  | { kind: 'drop'; x: number; y: number; length: number; alpha: number }
  | { kind: 'splash'; x: number; y: number; alpha: number };

/** i번째 방울의 지금 모습. w·h는 보이는 화면 크기(월드 px), elapsed는 ms. */
export function rainMark(i: number, elapsed: number, w: number, h: number): RainMark {
  const speed = 0.17 + hash(i, 1) * 0.07; // px/ms
  const length = 5 + Math.floor(hash(i, 2) * 4);
  const cycleMs = (h + length) / speed + SPLASH_MS;
  const t = elapsed + hash(i, 3) * cycleMs;
  const cycle = Math.floor(t / cycleMs), local = t - cycle * cycleMs;
  // 바닥 높이: 화면 아래쪽 절반 어딘가(앞뒤로 떨어지는 느낌).
  const land = h * (0.45 + hash(i, cycle * 7 + 4) * 0.55);
  const startX = hash(i, cycle * 7 + 5) * (w - RAIN_SLANT * h);
  const fallMs = land / speed;
  if (local < fallMs) {
    const y = local * speed - length;
    return { kind: 'drop', x: wrap(startX + RAIN_SLANT * y, w), y, length, alpha: 0.35 + hash(i, 6) * 0.3 };
  }
  if (local < fallMs + SPLASH_MS) {
    return { kind: 'splash', x: wrap(startX + RAIN_SLANT * land, w), y: land, alpha: 0.55 * (1 - (local - fallMs) / SPLASH_MS) };
  }
  return { kind: 'splash', x: 0, y: 0, alpha: 0 };
}
function wrap(x: number, w: number) { return ((x % w) + w) % w; }
