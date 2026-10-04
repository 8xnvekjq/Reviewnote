// 두 손가락(이상) 스크롤 판정(순수). 다지 탭(multiTap.ts)과 같은 묶음(손가락 0개 → 다시 0개)을 보고,
//   · 손가락이 2개 이상 닿은 뒤 어느 손가락이든 MULTI_TAP_MOVE_PX(탭 허용치)를 넘게 움직이면 스크롤을 시작하고,
//   · 그때부터 닿아 있는 손가락들의 평균(무게중심) 이동만큼 스크롤 양을 돌려준다(넘기 전 이동도 몰아서 한 번에).
// 핀치(간격만 바뀜)는 무게중심이 거의 그대로라 스크롤도 거의 없다 — 브라우저 확대는 하지 않는다.
// 손가락이 붙거나 떨어져도 무게중심이 튀지 않게, 움직인 손가락의 변화량 / 닿은 손가락 수를 더해 간다.
// 펜·마우스 획 중에 닿은 손(손바닥)이면 block()으로 이번 묶음은 스크롤하지 않는다.
import { MULTI_TAP_MOVE_PX } from './multiTap.ts';

interface Finger { x: number; y: number; ox: number; oy: number }

export class MultiFingerPan {
  private fingers = new Map<number, Finger>();
  private pendingX = 0;
  private pendingY = 0;
  private engagedFlag = false;
  private blockedFlag = false;

  /** 스크롤 중인지(탭 허용치를 넘게 움직였다). */
  get engaged(): boolean { return this.engagedFlag && !this.blockedFlag; }

  down(id: number, x: number, y: number): void {
    this.fingers.set(id, { x, y, ox: x, oy: y });
    if (!this.engagedFlag && this.fingers.size >= 2) {
      // 다지 묶음의 시작: 한 손가락일 때의 이동(필기·한 손가락 스크롤)은 세지 않고, 여기서부터 잰다.
      this.pendingX = 0; this.pendingY = 0;
      for (const f of this.fingers.values()) { f.ox = f.x; f.oy = f.y; }
    }
  }

  /** 손가락이 움직였다. 스크롤할 양(손가락 이동 방향, CSS px)이 있으면 돌려준다. */
  move(id: number, x: number, y: number): { dx: number; dy: number } | null {
    const f = this.fingers.get(id);
    if (!f) return null;
    const n = this.fingers.size;
    this.pendingX += (x - f.x) / n;
    this.pendingY += (y - f.y) / n;
    f.x = x; f.y = y;
    if (!this.engagedFlag && n >= 2 && Math.hypot(x - f.ox, y - f.oy) > MULTI_TAP_MOVE_PX) this.engagedFlag = true;
    if (!this.engaged) return null;
    const dx = this.pendingX, dy = this.pendingY;
    this.pendingX = 0; this.pendingY = 0;
    return dx || dy ? { dx, dy } : null;
  }

  /** 손가락이 떨어짐(pointercancel 포함). 모두 떨어지면 묶음을 끝낸다. */
  up(id: number): void {
    if (!this.fingers.delete(id) || this.fingers.size) return;
    this.pendingX = 0; this.pendingY = 0;
    this.engagedFlag = false;
    this.blockedFlag = false;
  }

  /** 펜·마우스 입력과 겹친 묶음 — 다 뗄 때까지 스크롤하지 않는다. */
  block(): void {
    if (this.fingers.size) this.blockedFlag = true;
  }
}
