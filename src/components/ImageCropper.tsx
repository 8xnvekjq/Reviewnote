import React, { useState, useRef } from 'react';

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedImageSrc: string) => void;
  onCancel: () => void;
}

export const ImageCropper: React.FC<ImageCropperProps> = ({ imageSrc, onCropComplete, onCancel }) => {
  const [left, setLeft] = useState(10);
  const [right, setRight] = useState(10);
  const [top, setTop] = useState(15);
  const [bottom, setBottom] = useState(15);
  const [isProcessing, setIsProcessing] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  // Safety checks to ensure crops don't collide or collapse to zero width/height
  const handleLeftChange = (val: number) => {
    if (100 - val - right > 10) {
      setLeft(val);
    }
  };

  const handleRightChange = (val: number) => {
    if (100 - left - val > 10) {
      setRight(val);
    }
  };

  const handleTopChange = (val: number) => {
    if (100 - val - bottom > 10) {
      setTop(val);
    }
  };

  const handleBottomChange = (val: number) => {
    if (100 - top - val > 10) {
      setBottom(val);
    }
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
      <div className="flex-1 relative flex items-center justify-center p-6 bg-slate-950 max-h-[60vh]">
        <div className="relative max-w-full max-h-full overflow-hidden border border-slate-900 rounded-lg">
          {/* Base Image */}
          <img
            ref={imageRef}
            src={imageSrc}
            alt="크롭 대상 문제"
            className="max-h-[50vh] w-auto object-contain opacity-70"
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
            className="absolute border-2 border-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.4)] pointer-events-none"
            style={{
              left: `${left}%`,
              right: `${right}%`,
              top: `${top}%`,
              bottom: `${bottom}%`,
            }}
          >
            {/* Corner Indicators */}
            <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-emerald-400"></div>
            <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-emerald-400"></div>
            <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-emerald-400"></div>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-emerald-400"></div>
          </div>
        </div>
      </div>

      {/* Spacing adjustments using sliders */}
      <div className="p-6 bg-slate-900/60 border-t border-slate-900 space-y-4 pb-8">
        <p className="text-[11px] text-slate-500 font-semibold text-center mb-1">
          💡 슬라이더를 조절하여 테두리 선을 문제 크기에 맞게 설정해 주세요.
        </p>

        {/* Top/Bottom Margin sliders */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-bold text-slate-400">
              <span>상단 테두리</span>
              <span>{top}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="80"
              value={top}
              onChange={(e) => handleTopChange(parseInt(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-bold text-slate-400">
              <span>하단 테두리</span>
              <span>{bottom}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="80"
              value={bottom}
              onChange={(e) => handleBottomChange(parseInt(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
            />
          </div>
        </div>

        {/* Left/Right Margin sliders */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-bold text-slate-400">
              <span>좌측 테두리</span>
              <span>{left}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="80"
              value={left}
              onChange={(e) => handleLeftChange(parseInt(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between text-[10px] font-bold text-slate-400">
              <span>우측 테두리</span>
              <span>{right}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="80"
              value={right}
              onChange={(e) => handleRightChange(parseInt(e.target.value))}
              className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
            />
          </div>
        </div>
      </div>

    </div>
  );
};
