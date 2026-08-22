import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ReactSketchCanvas, type ReactSketchCanvasRef } from 'react-sketch-canvas';
import { supabase } from '../services/supabase';

interface HandwritingOverlayProps {
  mistakeId: string;
  studentId: string;
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void; // 저장 성공 시 부모(스캐폴딩 목록)에 새로고침을 알림
}

const DEFAULT_SIZE = { width: 320, height: 260 };
const MIN_SIZE = { width: 220, height: 180 };

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

  // 우측 하단 꼭짓점 크기 조절
  const resizeStateRef = useRef<{ resizing: boolean; startX: number; startY: number; originW: number; originH: number }>({
    resizing: false, startX: 0, startY: 0, originW: 0, originH: 0,
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

  const handleResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    resizeStateRef.current = { resizing: true, startX: e.clientX, startY: e.clientY, originW: size.width, originH: size.height };
    safeSetPointerCapture(e.target as HTMLElement, e.pointerId);
  };

  const handleResizeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStateRef.current.resizing) return;
    const dx = e.clientX - resizeStateRef.current.startX;
    const dy = e.clientY - resizeStateRef.current.startY;
    // 왼쪽 위 꼭짓점(pos)은 고정한 채 오른쪽 아래로만 커지도록, 화면을 벗어나지 않는 선까지만 허용
    const maxW = window.innerWidth - pos.left - 8;
    const maxH = window.innerHeight - pos.top - 8;
    setSize({
      width: Math.max(MIN_SIZE.width, Math.min(maxW, resizeStateRef.current.originW + dx)),
      height: Math.max(MIN_SIZE.height, Math.min(maxH, resizeStateRef.current.originH + dy)),
    });
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
          className="flex-none flex items-center justify-between px-3 py-2 bg-slate-950 border-b border-slate-800 cursor-move select-none touch-none"
        >
          <span className="text-[11px] font-black text-slate-300 flex items-center space-x-1.5">
            <span>✏️</span><span>손 필기 / 펜슬 풀이</span>
          </span>
          <button
            onClick={onClose}
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
            strokeColor="#1e1b4b"
            canvasColor="white"
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
        <div className="flex-none flex items-center justify-between gap-1.5 px-2.5 py-2 bg-slate-950 border-t border-slate-800">
          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleEraser}
              title={isErasing ? '펜으로 전환' : '지우개로 전환'}
              className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm border transition-all active:scale-90 ${
                isErasing
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {isErasing ? '🧽' : '✏️'}
            </button>
            <button
              onClick={handleClear}
              title="전체 지우기"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-all active:scale-90"
            >
              🗑️
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-all active:scale-95 disabled:opacity-40"
            >
              저장하지 않기
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 transition-all active:scale-95 disabled:opacity-50"
            >
              {isSaving ? '저장 중...' : '💾 저장하기'}
            </button>
          </div>
        </div>

        {/* 우측 하단 꼭짓점 — 드래그로 창 크기 조절 */}
        <div
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          onPointerCancel={handleResizeEnd}
          title="드래그해서 크기 조절"
          className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize touch-none flex items-end justify-end p-1 text-slate-600 hover:text-slate-300 transition-colors"
        >
          <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 2 L2 14 M14 8 L8 14 M14 14 L14 14" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>,
    document.body
  );
};
