// 잠자리채에 사람이 맞았는지(순수 모듈). 맞은 사람은 잠깐 x.x 눈 + 머리 위 별.
import type { Facing, Point } from './joystick';
import { facingDelta } from './world';

/** 어지러운 시간(ms). */
export const DIZZY_MS = 1600;
/** 채 그물이 닿는 곳: 발에서 바라보는 쪽으로 15px, 반지름 14px(휘두르기 그림과 같은 자리). */
export const NET_REACH = { forward: 15, radius: 14 };

/** 휘두른 사람(feet·facing) 앞 그물 안에 발이 들어온 사람 id. */
export function netHits(feet: Point, facing: Facing, people: ReadonlyMap<string, Point>): string[] {
  const d = facingDelta(facing), cx = feet.x + d.x * NET_REACH.forward, cy = feet.y + d.y * NET_REACH.forward;
  return [...people].filter(([, p]) => Math.hypot(p.x - cx, p.y - cy) <= NET_REACH.radius).map(([id]) => id);
}

/** x 눈을 그릴 자리(발 기준). 아바타 눈 시트의 눈 칸(32×32, 발 = 31행)에서 왔다. 뒤를 보면 눈이 없다. */
export function dizzyEyes(facing: Facing): Point[] {
  if (facing === 'Back') return [];
  if (facing === 'Left') return [{ x: -4, y: -18 }];
  if (facing === 'Right') return [{ x: 3, y: -18 }];
  return [{ x: -3, y: -18 }, { x: 2, y: -18 }];
}
