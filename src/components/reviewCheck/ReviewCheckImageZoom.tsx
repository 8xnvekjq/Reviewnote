import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  src: string;
  alt: string;
  onClose: () => void;
}

// 시험(복습체크) 중 문제 이미지를 크게 보기 위한 단순 풀스크린 라이트박스. MistakeDetailModal의
// 이동/크기조절 가능한 참고창(핸드라이팅 오버레이와 동시 조작용, 데스크톱 지향)은 이 화면엔
// 과한 기능이라 그대로 재사용하지 않고, 제스처 계산 로직만 참고해 훨씬 단순한 탭-확대/닫기
// 전용 컴포넌트로 새로 만들었다. 상위(퀴즈/기록상세)는 이 컴포넌트를 열고 닫기만 할 뿐 자신의
// 상태(입력 중인 답 등)를 전혀 건드리지 않는다.
export function ReviewCheckImageZoom({ src, alt, onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const touchStartRef = useRef({ x: 0, y: 0 });
  const initialDistanceRef = useRef(0);
  const initialScaleRef = useRef(1);
  const isDraggingRef = useRef(false);
  const lastTapRef = useRef(0);

  const reset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const updateScale = (next: number) => {
    const bounded = Math.max(1, Math.min(4.5, next));
    setScale(bounded);
    if (bounded === 1) setPosition({ x: 0, y: 0 });
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        // 더블탭 — 확대 상태면 원위치, 아니면 2.5배로 토글
        if (scale > 1) reset(); else updateScale(2.5);
      }
      lastTapRef.current = now;

      isDraggingRef.current = scale > 1;
      const touch = e.touches[0];
      touchStartRef.current = { x: touch.clientX - position.x, y: touch.clientY - position.y };
    } else if (e.touches.length === 2) {
      isDraggingRef.current = false;
      const [t1, t2] = [e.touches[0], e.touches[1]];
      initialDistanceRef.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      initialScaleRef.current = scale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1 && isDraggingRef.current) {
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;
      const maxDrag = (scale - 1) * 200;
      setPosition({
        x: Math.max(-maxDrag, Math.min(maxDrag, dx)),
        y: Math.max(-maxDrag, Math.min(maxDrag, dy)),
      });
    } else if (e.touches.length === 2 && initialDistanceRef.current > 0) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const distance = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const newScale = Math.max(1, Math.min(4.5, initialScaleRef.current * (distance / initialDistanceRef.current)));
      setScale(newScale);
      if (newScale === 1) setPosition({ x: 0, y: 0 });
    }
  };

  const handleTouchEnd = () => {
    isDraggingRef.current = false;
    if (scale <= 1) reset();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="rn-reviewcheck-zoom-overlay" role="dialog" aria-modal="true" aria-label="문제 이미지 확대" onClick={onClose}>
      <button type="button" className="rn-reviewcheck-zoom-close" onClick={onClose} aria-label="확대 닫기">✕</button>
      <div
        className="rn-reviewcheck-zoom-stage"
        onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onDoubleClick={reset}
        onWheel={e => { e.preventDefault(); updateScale(scale + (e.deltaY < 0 ? 0.2 : -0.2)); }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}
        />
      </div>
    </div>,
    document.body,
  );
}
