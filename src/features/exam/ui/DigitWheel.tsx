// 단답 자릿수 휠(0~9). 위아래로 끌거나(관성 스냅) 마우스 휠/트랙패드, 위·아래 숫자 탭, 방향키로 돌린다.
// 키보드 입력 칸은 일부러 두지 않는다(펜·손가락만으로 답 입력).
import { useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { clampDigit, snapWheel, wheelSteps } from './examLogic';

const ITEM_H = 34;
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

interface DragState { pointerId: number; startY: number; startValue: number; lastY: number; lastT: number; velocity: number; moved: boolean }

export function DigitWheel({ value, label, dim, disabled, onChange }: { value: number; label: string; dim?: boolean; disabled?: boolean; onChange: (next: number) => void }) {
  const [dragPx, setDragPx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<DragState | null>(null);
  const wheelAcc = useRef(0);

  const set = (next: number) => {
    if (disabled) return; // 채점해 본 문항은 잠김
    const v = clampDigit(next);
    if (v !== value) onChange(v);
    else if (dim) onChange(v); // 아직 비어 있던 칸을 같은 값으로 "확정"
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { pointerId: e.pointerId, startY: e.clientY, startValue: value, lastY: e.clientY, lastT: e.timeStamp, velocity: 0, moved: false };
    setDragging(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.velocity = 0.7 * ((e.clientY - d.lastY) / dt) + 0.3 * d.velocity;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) > 4) d.moved = true;
    // 끝(0, 9)을 넘어 끌면 고무줄처럼 덜 움직이게
    const min = -(9 - d.startValue) * ITEM_H;
    const max = d.startValue * ITEM_H;
    const over = dy > max ? (dy - max) * 0.3 + max : dy < min ? (dy - min) * 0.3 + min : dy;
    setDragPx(over);
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    setDragging(false);
    setDragPx(0);
    if (!d.moved) {
      // 탭: 가운데 위쪽을 누르면 -1, 아래쪽이면 +1, 가운데면 그 값으로 확정
      const rect = e.currentTarget.getBoundingClientRect();
      const rel = e.clientY - (rect.top + rect.height / 2);
      if (rel < -ITEM_H / 2) set(value - 1);
      else if (rel > ITEM_H / 2) set(value + 1);
      else set(value);
      return;
    }
    set(snapWheel(d.startValue, e.clientY - d.startY, d.velocity, ITEM_H));
  };
  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    wheelAcc.current += e.deltaY;
    const { steps, rest } = wheelSteps(wheelAcc.current);
    wheelAcc.current = rest;
    if (steps !== 0) set(value + steps);
  };

  const offset = -value * ITEM_H + dragPx;
  return (
    <div
      className={`exam-wheel${dim ? ' is-dim' : ''}${dragging ? ' is-dragging' : ''}${disabled ? ' is-locked' : ''}`}
      role="spinbutton"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={9}
      aria-valuenow={value}
      data-value={value}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onKeyDown={e => {
        if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); set(value - 1); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); set(value + 1); }
      }}
    >
      <div className="exam-wheel-track" style={{ transform: `translateY(${offset + ITEM_H}px)` }} aria-hidden="true">
        {DIGITS.map(d => <span key={d} className={d === value ? 'is-current' : undefined} style={{ height: ITEM_H }}>{d}</span>)}
      </div>
      <span className="exam-wheel-label">{label}</span>
    </div>
  );
}
