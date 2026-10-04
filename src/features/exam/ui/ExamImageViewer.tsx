// 풀이 화면 위에 띄우는 전체 화면 이미지 보기 창(예: 학습지 삼각비 표). 새 탭 대신 앱 안에서 연다.
// 탭(클릭) 한 번이면 닫히고, 두 손가락 핀치(1~5배)·확대 상태 드래그·휠/트랙패드로 확대한다.
// 제스처 판정(복습체크 ReviewCheckImageZoom의 "탭이면 닫고 핀치·드래그면 안 닫기" 방식)은 imageViewerGesture.ts에 순수 함수로 뺐다.
// 닫기는 click에서 처리한다 — pointerup에서 바로 닫으면 뒤따르는 합성 click이 아래 필기 캔버스/버튼에 떨어진다.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  IDENTITY, clampPan, dragView, isTap, pinchView, startGesture, trackMove, trackPointers, wheelScale, zoomAt,
  type GestureTrack, type PinchStart, type Point, type Size, type ViewState,
} from './imageViewerGesture';

interface Props {
  src: string;
  label: string;
  onClose: () => void;
}

function containSize(natural: Size, viewport: Size): Size {
  if (!(natural.w > 0 && natural.h > 0 && viewport.w > 0 && viewport.h > 0)) return { w: 0, h: 0 };
  const fit = Math.min(viewport.w / natural.w, viewport.h / natural.h);
  return { w: natural.w * fit, h: natural.h * fit };
}

export function ExamImageViewer({ src, label, onClose }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<ViewState>(IDENTITY);
  const [base, setBase] = useState<Size>({ w: 0, h: 0 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const baseRef = useRef(base);
  baseRef.current = base;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<GestureTrack | null>(null);
  const gestureOrigin = useRef<Point>({ x: 0, y: 0 });
  const dragStart = useRef<{ view: ViewState; at: Point } | null>(null);
  const pinchStart = useRef<PinchStart | null>(null);
  const lastWasTap = useRef(false);

  const viewport = (): Size => ({ w: stageRef.current?.clientWidth ?? 0, h: stageRef.current?.clientHeight ?? 0 });
  const local = (clientX: number, clientY: number): Point => {
    const rect = stageRef.current?.getBoundingClientRect();
    return rect ? { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 } : { x: 0, y: 0 };
  };

  const measure = useCallback(() => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    const next = containSize({ w: img.naturalWidth, h: img.naturalHeight }, viewport());
    setBase(next);
    setView(prev => clampPan(prev, next, viewport()));
  }, []);

  useLayoutEffect(() => {
    if (imgRef.current?.complete) measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  // Esc · 안드로이드 뒤로가기로 닫기. 열 때 history 항목을 하나 쌓고, 다른 방법으로 닫히면 그 항목을 되돌린다.
  // StrictMode의 즉시 재실행에서도 항목이 하나만 남도록 되돌리기는 microtask로 미룬다(AdminLiveView와 같은 방식).
  const life = useRef({ active: false, token: '' });
  useEffect(() => {
    const state = life.current;
    state.active = true;
    if (!state.token || history.state?.examImageViewer !== state.token) {
      state.token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      history.pushState({ ...(history.state ?? {}), examImageViewer: state.token }, '');
    }
    const token = state.token;
    const pop = () => { if (history.state?.examImageViewer !== token) onCloseRef.current(); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onCloseRef.current(); } };
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus({ preventScroll: true });
    window.addEventListener('popstate', pop);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('popstate', pop);
      window.removeEventListener('keydown', key);
      state.active = false;
      previousFocus?.focus({ preventScroll: true });
      queueMicrotask(() => {
        if (!state.active && history.state?.examImageViewer === token) history.back();
      });
    };
  }, []);

  // 데스크톱 휠/트랙패드 확대, iOS Safari 페이지 확대 막기 — React 이벤트는 passive라 preventDefault가 안 되어 직접 붙인다.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const current = viewRef.current;
      setView(zoomAt(current, wheelScale(current.scale, event.deltaY, event.ctrlKey), local(event.clientX, event.clientY), baseRef.current, viewport()));
    };
    const block = (event: Event) => event.preventDefault();
    stage.addEventListener('wheel', wheel, { passive: false });
    stage.addEventListener('touchmove', block, { passive: false });
    stage.addEventListener('gesturestart', block);
    stage.addEventListener('gesturechange', block);
    return () => {
      stage.removeEventListener('wheel', wheel);
      stage.removeEventListener('touchmove', block);
      stage.removeEventListener('gesturestart', block);
      stage.removeEventListener('gesturechange', block);
    };
  }, []);

  const beginPinch = () => {
    const [a, b] = [...pointers.current.values()];
    pinchStart.current = { view: viewRef.current, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.hypot(a.x - b.x, a.y - b.y) };
    dragStart.current = null;
  };
  const beginDrag = () => {
    const [p] = [...pointers.current.values()];
    dragStart.current = p ? { view: viewRef.current, at: p } : null;
    pinchStart.current = null;
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    stageRef.current?.setPointerCapture?.(event.pointerId);
    const p = local(event.clientX, event.clientY);
    if (pointers.current.size === 0) {
      gesture.current = startGesture(event.timeStamp);
      gestureOrigin.current = p;
      lastWasTap.current = false;
    }
    pointers.current.set(event.pointerId, p);
    if (gesture.current) gesture.current = trackPointers(gesture.current, pointers.current.size);
    if (pointers.current.size === 2) beginPinch();
    else if (pointers.current.size === 1) beginDrag();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    const p = local(event.clientX, event.clientY);
    pointers.current.set(event.pointerId, p);
    if (gesture.current) gesture.current = trackMove(gesture.current, gestureOrigin.current, p);
    if (pointers.current.size >= 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      setView(pinchView(pinchStart.current, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, Math.hypot(a.x - b.x, a.y - b.y), baseRef.current, viewport()));
    } else if (pointers.current.size === 1 && dragStart.current) {
      const start = dragStart.current;
      setView(dragView(start.view, { x: p.x - start.at.x, y: p.y - start.at.y }, baseRef.current, viewport()));
    }
  };

  const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(event.pointerId)) return;
    if (pointers.current.size === 1) beginDrag(); // 핀치 중 한 손가락만 뗌 — 남은 손가락으로 이어서 이동
    else if (pointers.current.size >= 2) beginPinch();
    if (pointers.current.size > 0) return;
    lastWasTap.current = event.type === 'pointerup' && gesture.current != null && isTap(gesture.current, event.timeStamp);
    gesture.current = null;
    dragStart.current = null;
    pinchStart.current = null;
  };

  // click은 pointerup 다음에 온다. 방금 끝난 제스처가 탭일 때만 닫는다(핀치·드래그 뒤에 오는 click은 무시).
  const onStageClick = () => {
    if (lastWasTap.current) onClose();
    lastWasTap.current = false;
  };

  return createPortal(
    <div className="exam-overlay exam-viewer-overlay exam-image-viewer" role="dialog" aria-modal="true" aria-label={`${label} 크게 보기`} data-testid="exam-image-viewer">
      <div
        ref={stageRef}
        className="exam-image-viewer-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClick={onStageClick}
        data-scale={view.scale.toFixed(2)}
      >
        <img
          ref={imgRef}
          src={src}
          alt={label}
          draggable={false}
          onLoad={measure}
          style={{
            ...(base.w > 0 ? { width: base.w, height: base.h } : { visibility: 'hidden' as const }),
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
          }}
        />
      </div>
      <button ref={closeRef} type="button" className="exam-image-viewer-close" onClick={onClose} aria-label={`${label} 닫기`}>✕</button>
      <span className="exam-image-viewer-tip" aria-hidden="true">톡 누르면 닫혀요 · 두 손가락으로 확대</span>
    </div>,
    document.body,
  );
}
