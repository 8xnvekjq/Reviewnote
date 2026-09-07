import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ReactSketchCanvas, type ReactSketchCanvasRef } from 'react-sketch-canvas';
import { supabase } from '../services/supabase';

interface HandwritingOverlayProps {
  mistakeId: string;
  studentId: string;
  currentUserId: string;
  backgroundImageUrl?: string; // 있으면 이 이미지를 배경으로 깔고 그 위에 필기(예: 문제 이미지 위 재풀이)
  onClose: () => void;
  onSaved: () => void; // 저장 성공 시 부모(스캐폴딩 목록)에 새로고침을 알림
}

// 문제 이미지를 배경으로 보여주게 되면서(재풀이 흐름) 기존 흰 캔버스 전용 기본 크기(320x260)로는
// 문제를 읽기 어려워 조금 더 키움. 여전히 드래그/리사이즈로 자유롭게 조절 가능.
const DEFAULT_SIZE = { width: 360, height: 440 };
const MIN_SIZE = { width: 280, height: 200 };
type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

const RESIZE_HANDLES: Array<{
  corner: ResizeCorner;
  label: string;
  className: string;
  iconClassName: string;
}> = [
  {
    corner: 'nw',
    label: '왼쪽 위에서 필기창 크기 조절',
    className: 'left-0 top-0 cursor-nwse-resize items-start justify-start',
    iconClassName: 'border-l-2 border-t-2 rounded-tl-sm',
  },
  {
    corner: 'ne',
    label: '오른쪽 위에서 필기창 크기 조절',
    className: 'right-0 top-0 cursor-nesw-resize items-start justify-end',
    iconClassName: 'border-r-2 border-t-2 rounded-tr-sm',
  },
  {
    corner: 'sw',
    label: '왼쪽 아래에서 필기창 크기 조절',
    className: 'left-0 bottom-0 cursor-nesw-resize items-end justify-start',
    iconClassName: 'border-l-2 border-b-2 rounded-bl-sm',
  },
  {
    corner: 'se',
    label: '오른쪽 아래에서 필기창 크기 조절',
    className: 'right-0 bottom-0 cursor-nwse-resize items-end justify-end',
    iconClassName: 'border-r-2 border-b-2 rounded-br-sm',
  },
];

// 위치를 CSS transform 트릭(left:50%+translate) 대신 실제 픽셀 left/top으로 직접 관리한다.
// 예전엔 진입 애니메이션 클래스가 같은 transform 속성을 덮어써서 창이 화면 밖으로 밀려나는
// 버그가 있었는데(이미 한 번 고침), 크기 조절까지 추가되면 그 방식은 "우측 하단 꼭짓점을
// 끌면 왼쪽 위는 고정된 채 커진다"는 자연스러운 동작을 구현하기도 번거로워 픽셀 좌표로 바꿨다.
const getInitialPosition = () => ({
  left: Math.max(8, Math.round((window.innerWidth - DEFAULT_SIZE.width) / 2)),
  top: Math.max(8, Math.round((window.innerHeight - DEFAULT_SIZE.height) / 2)),
});

export const HandwritingOverlay: React.FC<HandwritingOverlayProps> = ({
  mistakeId,
  studentId,
  currentUserId,
  backgroundImageUrl,
  onClose,
  onSaved,
}) => {
  const canvasRef = useRef<ReactSketchCanvasRef>(null);
  const [isErasing, setIsErasing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const [pos, setPos] = useState(getInitialPosition);
  const [size, setSize] = useState(DEFAULT_SIZE);

  // 창 이동(드래그) — pointer event 하나로 마우스/터치/펜슬 전부 처리
  const dragStateRef = useRef<{ dragging: boolean; startX: number; startY: number; originLeft: number; originTop: number }>({
    dragging: false, startX: 0, startY: 0, originLeft: 0, originTop: 0,
  });

  // 네 꼭짓점 크기 조절 — 저장 버튼과 먼 모서리에서도 잡을 수 있도록 한다.
  const resizeStateRef = useRef<{
    resizing: boolean;
    corner: ResizeCorner;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
    originW: number;
    originH: number;
  }>({
    resizing: false,
    corner: 'se',
    startX: 0,
    startY: 0,
    originLeft: 0,
    originTop: 0,
    originW: 0,
    originH: 0,
  });

  // 브라우저가 해당 pointerId를 활성 포인터로 추적하지 못하는 드문 경우(예: 포인터가 이미
  // 해제된 뒤 이벤트가 늦게 도착)에도 앱 전체가 깨지지 않도록 방어적으로 감싼다.
  const safeSetPointerCapture = (el: Element, pointerId: number) => {
    try {
      (el as HTMLElement).setPointerCapture(pointerId);
    } catch (err) {
      console.warn('setPointerCapture failed:', err);
    }
  };

  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStateRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, originLeft: pos.left, originTop: pos.top };
    safeSetPointerCapture(e.target as HTMLElement, e.pointerId);
  };

  const handleDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.dragging) return;
    const dx = e.clientX - dragStateRef.current.startX;
    const dy = e.clientY - dragStateRef.current.startY;
    // 헤더(닫기 버튼 포함)가 화면 밖으로 완전히 나가면 창을 되찾을 방법이 없어지므로,
    // 최소한 헤더 일부는 항상 화면 안에 남도록 좌표를 clamp한다.
    const HEADER_MARGIN = 40;
    const nextLeft = Math.min(window.innerWidth - HEADER_MARGIN, Math.max(HEADER_MARGIN - size.width, dragStateRef.current.originLeft + dx));
    const nextTop = Math.min(window.innerHeight - HEADER_MARGIN, Math.max(0, dragStateRef.current.originTop + dy));
    setPos({ left: nextLeft, top: nextTop });
  };

  const handleDragEnd = () => {
    dragStateRef.current.dragging = false;
  };

  const handleResizeStart = (e: React.PointerEvent<HTMLButtonElement>, corner: ResizeCorner) => {
    e.stopPropagation();
    resizeStateRef.current = {
      resizing: true,
      corner,
      startX: e.clientX,
      startY: e.clientY,
      originLeft: pos.left,
      originTop: pos.top,
      originW: size.width,
      originH: size.height,
    };
    safeSetPointerCapture(e.target as HTMLElement, e.pointerId);
  };

  const handleResizeMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!resizeStateRef.current.resizing) return;
    const state = resizeStateRef.current;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const margin = 8;
    const usesWest = state.corner.includes('w');
    const usesNorth = state.corner.includes('n');

    let nextLeft = state.originLeft;
    let nextTop = state.originTop;
    let nextWidth = state.originW;
    let nextHeight = state.originH;

    if (usesWest) {
      nextLeft = Math.max(
        margin,
        Math.min(state.originLeft + state.originW - MIN_SIZE.width, state.originLeft + dx),
      );
      nextWidth = state.originW + state.originLeft - nextLeft;
    } else {
      nextWidth = Math.max(
        MIN_SIZE.width,
        Math.min(window.innerWidth - state.originLeft - margin, state.originW + dx),
      );
    }

    if (usesNorth) {
      nextTop = Math.max(
        margin,
        Math.min(state.originTop + state.originH - MIN_SIZE.height, state.originTop + dy),
      );
      nextHeight = state.originH + state.originTop - nextTop;
    } else {
      nextHeight = Math.max(
        MIN_SIZE.height,
        Math.min(window.innerHeight - state.originTop - margin, state.originH + dy),
      );
    }

    setPos({ left: nextLeft, top: nextTop });
    setSize({ width: nextWidth, height: nextHeight });
  };

  const handleResizeEnd = () => {
    resizeStateRef.current.resizing = false;
  };

  const toggleEraser = () => {
    const next = !isErasing;
    setIsErasing(next);
    canvasRef.current?.eraseMode(next);
  };

  const handleClear = () => {
    canvasRef.current?.clearCanvas();
  };

  // 저장하기: 캔버스를 PNG로 내보내 스캐폴딩(본인 풀이)으로 등록
  const handleSave = async () => {
    if (isSaving || !canvasRef.current) return;
    setIsSaving(true);
    try {
      const dataUrl = await canvasRef.current.exportImage('png');
      const { error } = await supabase
        .from('mistake_scaffoldings')
        .insert([{
          mistake_id: mistakeId,
          student_id: studentId,
          teacher_id: currentUserId,
          image_url: dataUrl,
          caption: '✏️ 직접 손으로 쓴 풀이',
        }]);
      if (error) throw error;

      onSaved();
      setSavedFlash(true);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      console.error('Failed to save handwriting:', err);
      alert('저장에 실패했습니다: ' + (err.message || '알 수 없는 오류'));
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9998] pointer-events-none">
      <div
        role="dialog"
        aria-label="손 필기 풀이창"
        className="absolute rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl flex flex-col overflow-hidden pointer-events-auto"
        style={{
          width: size.width,
          height: size.height,
          left: pos.left,
          top: pos.top,
        }}
      >
        {/* 드래그 손잡이 헤더 */}
        <div
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          className="flex-none flex items-center justify-between px-10 py-2 bg-slate-950 border-b border-slate-800 cursor-move select-none touch-none"
        >
          <span className="text-[11px] font-black text-slate-300 flex items-center space-x-1.5">
            <span>✏️</span><span>손 필기 / 펜슬 풀이</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="필기창 닫기"
            className="w-6 h-6 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-[10px] font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 그리기 캔버스 */}
        <div className="flex-1 min-h-0 bg-white relative">
          <ReactSketchCanvas
            ref={canvasRef}
            strokeWidth={3}
            eraserWidth={16}
            strokeColor="#dc2626"
            canvasColor="white"
            backgroundImage={backgroundImageUrl || ''}
            exportWithBackgroundImage={!!backgroundImageUrl}
            preserveBackgroundImageAspectRatio="xMidYMid meet"
            width="100%"
            height="100%"
            style={{ border: 'none' }}
          />
          {savedFlash && (
            <div className="absolute inset-0 bg-emerald-500/90 flex items-center justify-center text-white font-black text-sm animate-fade-in">
              ✅ 저장했습니다!
            </div>
          )}
        </div>

        {/* 하단 툴바 */}
        <div className="flex-none flex items-center justify-between gap-1.5 px-9 py-2 bg-slate-950 border-t border-slate-800">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleEraser}
              title={isErasing ? '펜으로 전환' : '지우개로 전환'}
              aria-label={isErasing ? '펜으로 전환' : '지우개로 전환'}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm border transition-all active:scale-90 ${
                isErasing
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {isErasing ? '🧽' : '✏️'}
            </button>
            <button
              type="button"
              onClick={handleClear}
              title="전체 지우기"
              aria-label="필기 전체 지우기"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-all active:scale-90"
            >
              🗑️
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-all active:scale-95 disabled:opacity-40"
            >
              저장하지 않기
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 transition-all active:scale-95 disabled:opacity-50"
            >
              {isSaving ? '저장 중...' : '💾 저장하기'}
            </button>
          </div>
        </div>

        {/* 네 꼭짓점 모두 넓은 터치 영역을 제공한다. 하단 툴바는 좌우 여백으로 손잡이와 분리. */}
        {RESIZE_HANDLES.map((handle) => (
          <button
            key={handle.corner}
            type="button"
            aria-label={handle.label}
            title={handle.label}
            onPointerDown={(e) => handleResizeStart(e, handle.corner)}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
            className={`absolute z-20 w-9 h-9 touch-none flex p-1.5 text-slate-500 hover:text-amber-300 focus-visible:text-amber-300 focus-visible:outline-none transition-colors ${handle.className}`}
          >
            <span className={`block w-3.5 h-3.5 border-current ${handle.iconClassName}`} />
          </button>
        ))}
      </div>
    </div>,
    document.body
  );
};
