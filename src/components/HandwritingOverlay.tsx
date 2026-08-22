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

// 화면 중앙에서 시작하는 기본 위치 (드래그로 자유롭게 옮길 수 있음)
const DEFAULT_SIZE = { width: 320, height: 260 };

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

  // 창 이동(드래그) — pointer event 하나로 마우스/터치/펜슬 전부 처리
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragStateRef = useRef<{ dragging: boolean; startX: number; startY: number; originX: number; originY: number }>({
    dragging: false, startX: 0, startY: 0, originX: 0, originY: 0,
  });

  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStateRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      originX: position.x,
      originY: position.y,
    };
    // 브라우저가 해당 pointerId를 활성 포인터로 추적하지 못하는 드문 경우(예: 포인터가 이미
    // 해제된 뒤 이벤트가 늦게 도착)에도 앱 전체가 깨지지 않도록 방어적으로 감싼다.
    try {
      (e.target as HTMLDivElement).setPointerCapture(e.pointerId);
    } catch (err) {
      console.warn('setPointerCapture failed:', err);
    }
  };

  const handleDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.dragging) return;
    const dx = e.clientX - dragStateRef.current.startX;
    const dy = e.clientY - dragStateRef.current.startY;
    setPosition({ x: dragStateRef.current.originX + dx, y: dragStateRef.current.originY + dy });
  };

  const handleDragEnd = () => {
    dragStateRef.current.dragging = false;
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
          width: DEFAULT_SIZE.width,
          height: DEFAULT_SIZE.height,
          left: '50%',
          top: '50%',
          transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
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
      </div>
    </div>,
    document.body
  );
};
