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
  // 한 번의 터치 제스처(첫 손가락 ~ 마지막 손가락이 떨어질 때까지)가 "그냥 탭"이었는지 추적한다.
  // 오답카드처럼 화면을 한 번 톡 치면 닫히되, 끌어서 이동하거나 두 손가락으로 확대한 제스처는
  // 닫지 않는다. 닫기 버튼이 화면 맨 위라 태블릿에서 손이 잘 닿지 않던 문제의 주 해결책이다.
  const tapRef = useRef({ x: 0, y: 0, cancelled: false });

  const updateScale = (next: number) => {
    const bounded = Math.max(1, Math.min(4.5, next));
    setScale(bounded);
    if (bounded === 1) setPosition({ x: 0, y: 0 });
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      tapRef.current = { x: touch.clientX, y: touch.clientY, cancelled: false };
      isDraggingRef.current = scale > 1;
      touchStartRef.current = { x: touch.clientX - position.x, y: touch.clientY - position.y };
    } else if (e.touches.length === 2) {
      tapRef.current.cancelled = true;
      isDraggingRef.current = false;
      const [t1, t2] = [e.touches[0], e.touches[1]];
      initialDistanceRef.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      initialScaleRef.current = scale;
    } else {
      tapRef.current.cancelled = true;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      if (Math.hypot(touch.clientX - tapRef.current.x, touch.clientY - tapRef.current.y) > 10) tapRef.current.cancelled = true;
    }
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

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    isDraggingRef.current = false;
    if (scale <= 1) setPosition({ x: 0, y: 0 });
    if (e.touches.length > 0) return; // 핀치 중 한 손가락만 뗀 경우 — 제스처가 아직 안 끝났다
    // 탭으로 닫을 때는 뒤따르는 합성 click을 막는다. 안 그러면 오버레이가 사라진 자리의 문제
    // 이미지 버튼이 그 click을 받아 확대창이 곧바로 다시 열린다.
    if (e.type === 'touchend' && !tapRef.current.cancelled) {
      e.preventDefault();
      onClose();
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // 마우스(데스크톱)는 화면 아무 곳이나 클릭하면 닫힌다. 터치는 위 handleTouchEnd가 처리한다.
  return createPortal(
    <div className="rn-reviewcheck-zoom-overlay" role="dialog" aria-modal="true" aria-label="문제 이미지 확대" onClick={onClose}>
      <div
        className="rn-reviewcheck-zoom-stage"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onWheel={e => updateScale(scale + (e.deltaY < 0 ? 0.2 : -0.2))}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{ transform: `translate(${position.x}px, ${position.y}px) scale(${scale})` }}
        />
      </div>
      <button type="button" className="rn-reviewcheck-zoom-close" onClick={onClose} aria-label="확대 닫기">✕</button>
      <span className="rn-reviewcheck-zoom-tip" aria-hidden="true">화면을 톡 누르면 닫혀요 · 두 손가락으로 확대</span>
    </div>,
    document.body,
  );
}
