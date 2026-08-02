import React, { useState, useRef, useEffect } from 'react';
import { detectProblemCornersWithGemini, prepareGeminiImage } from '../services/gemini';
import { warpQuadToRect, type Quad, type QuadPoint } from '../utils/perspectiveWarp';

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedImageSrc: string) => void;
  onCancel: () => void;
}

type CornerKey = keyof Quad;

// 자동 인식 실패/대기 중에 쓰는 기본 사각형 (기존 수동 크롭의 기본 여백과 동일한 형태)
const DEFAULT_QUAD: Quad = {
  tl: { x: 12, y: 35 },
  tr: { x: 88, y: 35 },
  br: { x: 88, y: 65 },
  bl: { x: 12, y: 65 },
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export const ImageCropper: React.FC<ImageCropperProps> = ({ imageSrc, onCropComplete, onCancel }) => {
  const [quad, setQuad] = useState<Quad>(DEFAULT_QUAD);
  const [isDetecting, setIsDetecting] = useState(true);
  const [detectFailed, setDetectFailed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // 사용자가 한 번이라도 직접 꼭짓점을 조절했다면, Gemini 응답이 늦게 와도 덮어쓰지 않는다.
  const userAdjustedRef = useRef(false);

  // 촬영/선택된 사진에서 문제 영역 네 꼭짓점을 자동으로 인식 (실패해도 기본 사각형으로 계속 진행)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const image = await prepareGeminiImage(imageSrc);
        const corners = await detectProblemCornersWithGemini(image);
        if (!cancelled) {
          if (corners && !userAdjustedRef.current) {
            setQuad(corners);
          } else if (!corners) {
            setDetectFailed(true);
          }
        }
      } catch (err) {
        console.error('문제 영역 자동 인식 실패:', err);
        if (!cancelled) setDetectFailed(true);
      } finally {
        if (!cancelled) setIsDetecting(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc]);

  // 꼭짓점 하나를 독립적으로 드래그 (다른 꼭짓점과 연동되지 않아 실제 원근 사각형을 만들 수 있음)
  const handleCornerDrag = (e: React.MouseEvent | React.TouchEvent, corner: CornerKey) => {
    e.preventDefault();
    if (!containerRef.current) return;
    userAdjustedRef.current = true;

    const rect = containerRef.current.getBoundingClientRect();

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (moveEvent.cancelable) moveEvent.preventDefault();
      const clientX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const clientY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;

      const xPct = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
      const yPct = clamp(((clientY - rect.top) / rect.height) * 100, 0, 100);

      setQuad(prev => ({ ...prev, [corner]: { x: xPct, y: yPct } }));
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

  const executeCrop = async () => {
    if (!imageRef.current) return;
    setIsProcessing(true);

    try {
      const img = imageRef.current;
      const toPixel = (p: QuadPoint): QuadPoint => ({
        x: (p.x / 100) * img.naturalWidth,
        y: (p.y / 100) * img.naturalHeight,
      });
      const pixelQuad: Quad = {
        tl: toPixel(quad.tl),
        tr: toPixel(quad.tr),
        br: toPixel(quad.br),
        bl: toPixel(quad.bl),
      };

      const warped = await warpQuadToRect(img, pixelQuad);
      onCropComplete(warped);
    } catch (err) {
      console.error(err);
      alert('이미지 보정 처리 중 오류가 발생했습니다.');
      setIsProcessing(false);
    }
  };

  const quadPointsAttr = `${quad.tl.x},${quad.tl.y} ${quad.tr.x},${quad.tr.y} ${quad.br.x},${quad.br.y} ${quad.bl.x},${quad.bl.y}`;
  const maskPath = `M0,0 L100,0 L100,100 L0,100 Z M${quad.tl.x},${quad.tl.y} L${quad.bl.x},${quad.bl.y} L${quad.br.x},${quad.br.y} L${quad.tr.x},${quad.tr.y} Z`;

  const corners: { key: CornerKey; cursor: string }[] = [
    { key: 'tl', cursor: 'cursor-nwse-resize' },
    { key: 'tr', cursor: 'cursor-nesw-resize' },
    { key: 'br', cursor: 'cursor-nwse-resize' },
    { key: 'bl', cursor: 'cursor-nesw-resize' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col justify-between overflow-hidden text-slate-100 select-none safe-top safe-bottom">

      {/* Top Header */}
      <div className="p-4 border-b border-slate-900 bg-slate-900/50 flex items-center justify-between">
        <h2 className="text-sm font-bold text-white tracking-wider">선택 영역 자르기</h2>
        <button
          onClick={onCancel}
          disabled={isProcessing}
          className="w-8 h-8 rounded-full bg-slate-900 border border-slate-800 hover:bg-slate-800 flex items-center justify-center text-slate-400 font-bold active:scale-90 transition-transform"
        >
          ✕
        </button>
      </div>

      {/* Interactive Quad Viewfinder (원근 보정용 자유 사각형) */}
      <div className="flex-1 relative flex items-center justify-center p-6 bg-slate-950 max-h-[70vh]">
        <div
          ref={containerRef}
          className="relative max-w-full max-h-full overflow-hidden border border-slate-900 rounded-lg"
        >
          <img
            ref={imageRef}
            src={imageSrc}
            alt="사진"
            onLoad={() => setImageLoaded(true)}
            className="max-h-[55vh] w-auto object-contain opacity-70 pointer-events-none"
          />

          {!imageLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
              <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* 자동 인식 중 배지 */}
          {isDetecting && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-slate-950/80 border border-indigo-500/40 rounded-full px-3 py-1.5 flex items-center space-x-1.5">
              <div className="w-3 h-3 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-[10px] font-bold text-indigo-300">문제 영역 자동 인식 중...</span>
            </div>
          )}
          {!isDetecting && detectFailed && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-slate-950/80 border border-amber-500/40 rounded-full px-3 py-1.5">
              <span className="text-[10px] font-bold text-amber-300">자동 인식 실패 — 꼭짓점을 직접 조절해 주세요</span>
            </div>
          )}

          {/* 사각형 바깥 어둡게 마스킹 + 테두리 (SVG, 자유 사각형 지원) */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <path d={maskPath} fillRule="evenodd" fill="rgba(0,0,0,0.6)" />
            <polygon
              points={quadPointsAttr}
              fill="none"
              stroke="#34d399"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              style={{ filter: 'drop-shadow(0 0 4px rgba(52,211,153,0.5))' }}
            />
          </svg>

          {/* 꼭짓점 드래그 핸들 (각각 독립적으로 이동 — 진짜 원근 사각형을 만들 수 있음) */}
          {corners.map(({ key, cursor }) => (
            <div
              key={key}
              onMouseDown={(e) => handleCornerDrag(e, key)}
              onTouchStart={(e) => handleCornerDrag(e, key)}
              className={`absolute w-10 h-10 flex items-center justify-center ${cursor} z-20`}
              style={{
                left: `${quad[key].x}%`,
                top: `${quad[key].y}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div className="w-5 h-5 rounded-full bg-emerald-400 border-2 border-white shadow-md" />
            </div>
          ))}
        </div>
      </div>

      {/* Control Area */}
      <div className="p-5 bg-slate-900/60 border-t border-slate-900 flex flex-col items-center space-y-3 pb-8">
        <p className="text-[10px] text-slate-500 font-semibold text-center leading-relaxed mb-1">
          💡 초록색 꼭짓점을 조절해 문제 영역을 지정하고 촬영 완료를 누르세요. 기울어진 사진도 자동으로 반듯하게 펴집니다.
        </p>

        <div className="flex items-center space-x-3 w-full max-w-xs justify-center">
          <button
            onClick={onCancel}
            disabled={isProcessing}
            title="다시 촬영하기"
            className="w-12 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 border border-slate-700/60 flex items-center justify-center transition-all flex-none shadow-lg"
          >
            <span className="text-lg">🔄</span>
          </button>

          <button
            onClick={executeCrop}
            disabled={isProcessing}
            className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 active:scale-95 text-slate-950 font-black text-sm flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-500/10"
          >
            <span>📸</span>
            <span>{isProcessing ? '보정 처리 중...' : '촬영 완료'}</span>
          </button>
        </div>
      </div>

    </div>
  );
};
