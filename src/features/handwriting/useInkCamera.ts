import { useEffect, useRef, useState } from 'react';
import type { Camera, DocumentSize } from './useHandwritingInput';
import type { DocRect } from './drawingWorld';

/** 획 입력은 시험 캔버스에 맡기고 두 손가락 카메라만 관찰한다. 탭 이벤트는 막지 않는다. */
export function useInkCamera(viewportRef: React.RefObject<HTMLDivElement | null>, doc: DocumentSize | null, world: DocRect | null, enabled: boolean) {
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const current = useRef(camera);
  const fit = useRef(1);
  const fingers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; x: number; y: number; camera: Camera } | null>(null);
  const pen = useRef<number | null>(null);
  current.current = camera;
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !doc) return;
    const measure = () => {
      const scale = Math.min(el.clientWidth / doc.width, el.clientHeight / doc.height);
      fit.current = scale;
      setCamera({ scale, x: (el.clientWidth - doc.width * scale) / 2, y: (el.clientHeight - doc.height * scale) / 2 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [viewportRef, doc]);
  const update = (next: Camera) => {
    const el = viewportRef.current;
    if (!world || !el) return;
    const clamp = (p: number, origin: number, length: number, view: number) => Math.max(view - (origin + length) * next.scale - 80, Math.min(80 - origin * next.scale, p));
    current.current = { ...next, x: clamp(next.x, world.x, world.width, el.clientWidth), y: clamp(next.y, world.y, world.height, el.clientHeight) };
    setCamera(current.current);
  };
  const pair = () => {
    const [a, b] = [...fingers.current.values()];
    const rect = viewportRef.current!.getBoundingClientRect();
    return { distance: Math.hypot(b.x - a.x, b.y - a.y) || 1, x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
  };
  const down = (e: React.PointerEvent) => {
    if (!enabled) return;
    if (e.pointerType === 'pen') { pen.current = e.pointerId; pinch.current = null; }
    if (e.pointerType !== 'touch') return;
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.current.size === 2 && pen.current === null) pinch.current = { ...pair(), camera: current.current };
  };
  const move = (e: React.PointerEvent) => {
    if (!enabled || !fingers.current.has(e.pointerId)) return;
    fingers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const start = pinch.current;
    if (!start || fingers.current.size !== 2 || pen.current !== null) return;
    const p = pair();
    const scale = Math.max(fit.current * 0.5, Math.min(fit.current * 4.5, start.camera.scale * p.distance / start.distance));
    const ratio = scale / start.camera.scale;
    update({ scale, x: p.x - (start.x - start.camera.x) * ratio, y: p.y - (start.y - start.camera.y) * ratio });
  };
  const up = (e: React.PointerEvent) => {
    if (e.pointerId === pen.current) pen.current = null;
    fingers.current.delete(e.pointerId);
    if (fingers.current.size < 2) pinch.current = null;
  };
  return {
    camera,
    captureHandlers: { onPointerDownCapture: down, onPointerMoveCapture: move, onPointerUpCapture: up, onPointerCancelCapture: up },
    onPan: (dx: number, dy: number) => {
      if (enabled && fingers.current.size < 2 && pen.current === null) update({ ...current.current, x: current.current.x + dx, y: current.current.y + dy });
    },
  };
}
