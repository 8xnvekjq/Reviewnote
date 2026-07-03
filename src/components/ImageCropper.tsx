import React, { useState, useRef } from 'react';

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedImageSrc: string) => void;
  onCancel: () => void;
}

export const ImageCropper: React.FC<ImageCropperProps> = ({ imageSrc, onCropComplete, onCancel }) => {
  const [left, setLeft] = useState(15);
  const [right, setRight] = useState(15);
  const [top, setTop] = useState(20);
  const [bottom, setBottom] = useState(20);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Direct touch/mouse dragging of crop box edges
  const handleStartDrag = (
    e: React.MouseEvent | React.TouchEvent,
    edge: 'top' | 'bottom' | 'left' | 'right'
  ) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const containerWidth = rect.width;
    const containerHeight = rect.height;

    const startX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const startLeft = left;
    const startRight = right;
    const startTop = top;
    const startBottom = bottom;

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      // Prevent browser default scroll/pinch behavior while dragging handles
      if (moveEvent.cancelable) {
        moveEvent.preventDefault();
      }

      const currentX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const currentY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const dx = currentX - startX;
      const dy = currentY - startY;

      if (edge === 'top') {
        const dyPercent = (dy / containerHeight) * 100;
        const newVal = Math.max(0, Math.min(100 - startBottom - 10, startTop + dyPercent));
        setTop(newVal);
      } else if (edge === 'bottom') {
        const dyPercent = (dy / containerHeight) * 100;
        const newVal = Math.max(0, Math.min(100 - startTop - 10, startBottom - dyPercent));
        setBottom(newVal);
      } else if (edge === 'left') {
        const dxPercent = (dx / containerWidth) * 100;
        const newVal = Math.max(0, Math.min(100 - startRight - 10, startLeft + dxPercent));
        setLeft(newVal);
      } else if (edge === 'right') {
        const dxPercent = (dx / containerWidth) * 100;
        const newVal = Math.max(0, Math.min(100 - startLeft - 10, startRight - dxPercent));
        setRight(newVal);
      }
    };

    const onEnd = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };

    window.addEventListener('mousemove', onMove, { passive: false });
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  };

  const executeCrop = () => {
    if (!imageRef.current) return;
    setIsProcessing(true);

    const img = imageRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      alert('크롭 처리에 실패했습니다.');
      setIsProcessing(false);
      return;
    }

    // Load original image dimensions
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;

    // Calculate crop dimensions based on percentage margins
    const sourceX = imgWidth * (left / 100);
    const sourceY = imgHeight * (top / 100);
    const sourceWidth = imgWidth * ((100 - left - right) / 100);
    const sourceHeight = imgHeight * ((100 - top - bottom) / 100);

    canvas.width = sourceWidth;
    canvas.height = sourceHeight;

    // Draw the cropped portion on canvas
    ctx.drawImage(
      img,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      sourceWidth,
      sourceHeight
    );

    // Convert to base64 jpeg
    try {
      const croppedBase64 = canvas.toDataURL('image/jpeg', 0.9);
      onCropComplete(croppedBase64);
    } catch (err) {
      console.error(err);
      alert('캔버스 이미지 데이터 변환 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col justify-between overflow-hidden text-slate-100 select-none safe-top safe-bottom">
      
      {/* Top Header */}
      <div className="p-4 border-b border-slate-900 bg-slate-900/50 flex items-center justify-between">
        <button
          onClick={onCancel}
          disabled={isProcessing}
          className="text-xs font-bold text-slate-400 hover:text-white px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800"
        >
          취소
        </button>
        <h2 className="text-sm font-bold text-white tracking-wider">선택 영역 자르기</h2>
        <button
          onClick={executeCrop}
          disabled={isProcessing}
          className="text-xs font-bold text-emerald-400 hover:text-emerald-300 px-4 py-1.5 rounded-full bg-emerald-950/20 border border-emerald-900/30"
        >
          {isProcessing ? '처리 중...' : '자르기 완료'}
        </button>
      </div>

      {/* Interactive Bounding Box Viewfinder */}
      <div className="flex-1 relative flex items-center justify-center p-6 bg-slate-950 max-h-[70vh]">
        <div 
          ref={containerRef}
          className="relative max-w-full max-h-full overflow-hidden border border-slate-900 rounded-lg"
        >
          {/* Base Image (disabled pointer events to prevent interference with handle drags) */}
          <img
            ref={imageRef}
            src={imageSrc}
            alt="크롭 대상 문제"
            className="max-h-[55vh] w-auto object-contain opacity-70 pointer-events-none"
          />

          {/* Semi-transparent dark overlay around selection */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Top mask */}
            <div className="absolute top-0 inset-x-0 bg-black/60" style={{ height: `${top}%` }} />
            {/* Bottom mask */}
            <div className="absolute bottom-0 inset-x-0 bg-black/60" style={{ height: `${bottom}%` }} />
            {/* Left mask */}
            <div 
              className="absolute bg-black/60" 
              style={{ top: `${top}%`, bottom: `${bottom}%`, left: 0, width: `${left}%` }} 
            />
            {/* Right mask */}
            <div 
              className="absolute bg-black/60" 
              style={{ top: `${top}%`, bottom: `${bottom}%`, right: 0, width: `${right}%` }} 
            />
          </div>

          {/* Active selection crop box with bright green outline */}
          <div
            className="absolute border-2 border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.4)]"
            style={{
              left: `${left}%`,
              right: `${right}%`,
              top: `${top}%`,
              bottom: `${bottom}%`,
              pointerEvents: 'none', // children handles will explicitly enable auto pointerEvents
            }}
          >
            {/* Corner Indicators */}
            <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-emerald-400"></div>
            <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-emerald-400"></div>
            <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-emerald-400"></div>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-emerald-400"></div>

            {/* Top border touch handle */}
            <div
              onMouseDown={(e) => handleStartDrag(e, 'top')}
              onTouchStart={(e) => handleStartDrag(e, 'top')}
              className="absolute -top-4 left-1/2 -translate-x-1/2 w-16 h-8 flex items-center justify-center cursor-ns-resize pointer-events-auto group"
            >
              <div className="w-10 h-1.5 bg-emerald-400 rounded-full border border-emerald-500 shadow-md group-hover:bg-emerald-300 transition-colors" />
            </div>

            {/* Bottom border touch handle */}
            <div
              onMouseDown={(e) => handleStartDrag(e, 'bottom')}
              onTouchStart={(e) => handleStartDrag(e, 'bottom')}
              className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-16 h-8 flex items-center justify-center cursor-ns-resize pointer-events-auto group"
            >
              <div className="w-10 h-1.5 bg-emerald-400 rounded-full border border-emerald-500 shadow-md group-hover:bg-emerald-300 transition-colors" />
            </div>

            {/* Left border touch handle */}
            <div
              onMouseDown={(e) => handleStartDrag(e, 'left')}
              onTouchStart={(e) => handleStartDrag(e, 'left')}
              className="absolute top-1/2 -translate-y-1/2 -left-4 w-8 h-16 flex items-center justify-center cursor-ew-resize pointer-events-auto group"
            >
              <div className="w-1.5 h-10 bg-emerald-400 rounded-full border border-emerald-500 shadow-md group-hover:bg-emerald-300 transition-colors" />
            </div>

            {/* Right border touch handle */}
            <div
              onMouseDown={(e) => handleStartDrag(e, 'right')}
              onTouchStart={(e) => handleStartDrag(e, 'right')}
              className="absolute top-1/2 -translate-y-1/2 -right-4 w-8 h-16 flex items-center justify-center cursor-ew-resize pointer-events-auto group"
            >
              <div className="w-1.5 h-10 bg-emerald-400 rounded-full border border-emerald-500 shadow-md group-hover:bg-emerald-300 transition-colors" />
            </div>

          </div>
        </div>
      </div>

      {/* Control Area (Sliders removed, Replaced with 'Retake' Button) */}
      <div className="p-6 bg-slate-900/60 border-t border-slate-900 flex flex-col items-center space-y-4 pb-8">
        <p className="text-[11px] text-slate-500 font-semibold text-center leading-relaxed">
          💡 가이드라인의 초록색 타원형 핸들을 직접 드래그하여 문제 영역을 맞춘 후, 우측 상단의 '자르기 완료'를 누르세요.
        </p>

        <button
          onClick={onCancel}
          disabled={isProcessing}
          className="w-full max-w-xs py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-white font-bold text-xs border border-slate-700 flex items-center justify-center space-x-2 transition-all shadow-lg"
        >
          <span className="text-sm">📷</span>
          <span>다시 촬영하기</span>
        </button>
      </div>

    </div>
  );
};
