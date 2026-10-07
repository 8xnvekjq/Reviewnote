// 플로팅 가상 조이스틱의 순수 계산. DOM/Phaser를 모르는 함수만 둔다(단위 테스트 대상).
// 좌표는 모두 게임 프레임 기준 CSS px.
export type Point = { x: number; y: number };
export type Facing = 'Front' | 'Back' | 'Left' | 'Right';
/** x/y는 -1..1(크기 반영된 방향), magnitude는 0..1. 화면 아래가 +y. */
export type StickVector = { x: number; y: number; magnitude: number };

export const STICK_RADIUS = 56;
/** 반지름 대비 비율 — 손가락 떨림으로 캐릭터가 꿈틀대지 않게 하는 중앙 무반응 구간. */
export const STICK_DEAD_ZONE = 0.16;
export const ZERO_STICK: StickVector = { x: 0, y: 0, magnitude: 0 };

/** 손가락 위치 → 아날로그 방향. 무반응 구간을 뺀 나머지를 0..1로 다시 펴서 작은 기울기도 천천히 걷게 한다. */
export function stickVector(origin: Point, point: Point, radius = STICK_RADIUS, deadZone = STICK_DEAD_ZONE): StickVector {
  const dx = point.x - origin.x, dy = point.y - origin.y;
  const distance = Math.hypot(dx, dy);
  const dead = radius * deadZone;
  if (!(distance > dead) || !(radius > dead)) return ZERO_STICK;
  const magnitude = Math.min(1, (distance - dead) / (radius - dead));
  return { x: dx / distance * magnitude, y: dy / distance * magnitude, magnitude };
}

/** 손가락이 링 밖으로 나가면 링(원점)이 손가락을 따라 끌려온다 — 엄지를 멀리 밀어도 방향 전환이 바로 된다. */
export function followOrigin(origin: Point, point: Point, radius = STICK_RADIUS): Point {
  const dx = point.x - origin.x, dy = point.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= radius) return origin;
  const pull = (distance - radius) / distance;
  return { x: origin.x + dx * pull, y: origin.y + dy * pull };
}

/** 노브(작은 원)를 그릴 위치 — 원점에서 반지름 안으로 자른 손가락 위치. */
export function knobOffset(origin: Point, point: Point, radius = STICK_RADIUS): Point {
  const dx = point.x - origin.x, dy = point.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= radius || distance === 0) return { x: dx, y: dy };
  return { x: dx / distance * radius, y: dy / distance * radius };
}

/** 대각선 근처에서 앞/옆 모습이 매 프레임 뒤집히지 않도록, 현재 방향을 조금 더 우대한다(히스테리시스). */
export function facingFor(x: number, y: number, previous: Facing, bias = 1.2): Facing {
  if (x === 0 && y === 0) return previous;
  const horizontal: Facing = x < 0 ? 'Left' : 'Right';
  const vertical: Facing = y < 0 ? 'Back' : 'Front';
  const ax = Math.abs(x), ay = Math.abs(y);
  if (previous === horizontal && ax * bias >= ay) return horizontal;
  if (previous === vertical && ay * bias >= ax) return vertical;
  return ax >= ay ? horizontal : vertical;
}

/** 키보드(WASD/화살표) 입력 → 스틱과 같은 모양의 벡터. 대각선은 1로 정규화. */
export function keyboardVector(keys: { up: boolean; down: boolean; left: boolean; right: boolean }): StickVector {
  const x = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const y = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  if (!x && !y) return ZERO_STICK;
  const length = Math.hypot(x, y);
  return { x: x / length, y: y / length, magnitude: 1 };
}
