// 다지(多指) 탭 판정(순수): 두 손가락 탭 두 번 → 실행 취소, 세 손가락 탭 두 번 → 다시 실행.
// 한 "탭"은 손가락이 0개가 됐다가 다시 0개가 될 때까지의 묶음이다. 묶음이 탭으로 인정되려면
//   · 동시에 닿은 손가락이 최대 2개 또는 3개,
//   · 첫 손가락이 닿고 마지막 손가락이 닿기까지 SPREAD_MS 이내(거의 동시),
//   · 첫 손가락이 닿고 모두 떨어지기까지 TAP_MS 이내,
//   · 어느 손가락도 MOVE_PX 넘게 움직이지 않음(핀치·두 손가락 스크롤이 아님),
//   · 도중에 pointercancel·펜 입력이 없음.
// 같은 손가락 수의 탭이 앞 탭이 끝난 뒤 GAP_MS 안에 다시 시작되면 발동한다. 그 밖의 묶음(한 손가락 터치 포함)은 연속을 끊는다.

export const MULTI_TAP_MS = 250;
export const MULTI_TAP_SPREAD_MS = 150;
export const MULTI_TAP_MOVE_PX = 12;
export const MULTI_TAP_GAP_MS = 350;

export type MultiTapAction = 'undo' | 'redo';

interface TapGroup {
  start: number;
  lastDown: number;
  origin: Map<number, { x: number; y: number }>;
  active: Set<number>;
  peak: number;
  valid: boolean;
}

export class MultiFingerTap {
  private group: TapGroup | null = null;
  private last: { fingers: number; endedAt: number } | null = null;

  /** 지금 닿아 있는 손가락 수. */
  get active(): number { return this.group?.active.size ?? 0; }
  /** 이번 묶음에서 손가락이 2개 이상 동시에 닿은 적이 있는지(필기·스크롤을 멈출 근거). */
  get multi(): boolean { return (this.group?.peak ?? 0) >= 2; }

  down(id: number, x: number, y: number, t: number): number {
    if (!this.group) this.group = { start: t, lastDown: t, origin: new Map(), active: new Set(), peak: 0, valid: true };
    const g = this.group;
    g.origin.set(id, { x, y });
    g.active.add(id);
    g.lastDown = t;
    g.peak = Math.max(g.peak, g.active.size);
    if (g.peak > 3 || t - g.start > MULTI_TAP_SPREAD_MS) g.valid = false;
    return g.active.size;
  }

  move(id: number, x: number, y: number): void {
    const g = this.group;
    const o = g?.origin.get(id);
    if (!g || !o || !g.active.has(id)) return;
    if (Math.hypot(x - o.x, y - o.y) > MULTI_TAP_MOVE_PX) g.valid = false;
  }

  /** 손가락이 떨어짐. 묶음이 끝나 두 번째 탭이 완성되면 실행할 동작을 돌려준다. */
  up(id: number, t: number): MultiTapAction | null {
    const g = this.group;
    if (!g || !g.active.has(id)) return null;
    g.active.delete(id);
    if (g.active.size) return null;
    this.group = null;
    const isTap = g.valid && (g.peak === 2 || g.peak === 3) && t - g.start <= MULTI_TAP_MS && g.lastDown - g.start <= MULTI_TAP_SPREAD_MS;
    if (!isTap) { this.last = null; return null; }
    const prev = this.last;
    if (prev && prev.fingers === g.peak && g.start - prev.endedAt <= MULTI_TAP_GAP_MS) {
      this.last = null;
      return g.peak === 2 ? 'undo' : 'redo';
    }
    this.last = { fingers: g.peak, endedAt: t };
    return null;
  }

  /** pointercancel: 이 묶음은 탭이 아니다. */
  cancel(id: number): void {
    const g = this.group;
    if (!g || !g.active.has(id)) return;
    g.valid = false;
    g.active.delete(id);
    if (!g.active.size) { this.group = null; this.last = null; }
  }

  /** 펜 획 중 등 — 이번 묶음은 탭으로 치지 않는다. */
  invalidate(): void {
    if (this.group) this.group.valid = false;
    this.last = null;
  }
}
