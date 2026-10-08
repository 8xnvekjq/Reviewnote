import { memo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';

export const ReelJoystick = memo(function ReelJoystick({ onAxis }: { onAxis(x: number): void }) {
  const pointer = useRef<number | null>(null);
  const [x, setX] = useState(0);
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const axis = Math.max(-1, Math.min(1, (event.clientX - rect.left - rect.width / 2) / 38));
    setX(axis); onAxis(axis);
  };
  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null; setX(0); onAxis(0);
  };
  return <div className="pwp-reel-stick" role="group" aria-label="릴 조이스틱: 좌우 이동"
    onPointerDown={event => {
      if (pointer.current !== null || event.button !== 0) return;
      event.preventDefault(); event.stopPropagation(); pointer.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId); move(event);
    }}
    onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
    <span aria-hidden="true">◀　　　▶</span>
    <i style={{ transform: `translateX(${x * 32}px)` }} />
    <small>좌우 이동</small>
  </div>;
});
