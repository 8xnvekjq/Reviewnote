import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ReactSketchCanvas, type ReactSketchCanvasRef, type CanvasPath } from 'react-sketch-canvas';
import { supabase } from '../services/supabase';
import { useHandwritingInput, type DocumentSize } from '../features/handwriting/useHandwritingInput';
import { flattenHandwriting, blobToDataUrl } from '../features/handwriting/flattenHandwriting';

// 문서(캔버스) 좌표계의 "기준 해상도" — 문제 사진의 실제 카메라 해상도(수천 px일 수 있음)를 그대로
// 쓰지 않고 화면비만 유지한 채 이 값으로 정규화한다. PR1은 "라이브 편집 중 좌표계"만 다루고,
// 저장용 실제 출력 해상도/용량 상한은 PR2(저장 합성) 범위 — 여기서는 그 둘을 분리해서, 큰 사진이
// react-sketch-canvas의 SVG 박스 자체를 불필요하게 거대하게 만들지 않도록 한다.
const DOC_REFERENCE_LONG_SIDE = 1600;

interface HandwritingOverlayProps {
  mistakeId: string;
  studentId: string;
  currentUserId: string;
  backgroundImageUrl?: string; // 있으면 이 이미지를 배경으로 깔고 그 위에 필기(예: 문제 이미지 위 재풀이)
  onClose: () => void;
  onSaved: () => void; // 저장 성공 시 부모(스캐폴딩 목록)에 새로고침을 알림
}

// 문제 이미지를 배경으로 보여주게 되면서(재풀이 흐름) 기존 흰 캔버스 전용 기본 크기(320x260)로는
// 문제를 읽기 어려워 조금 더 키움. 여전히 드래그/리사이즈로 자유롭게 조절 가능. 펜/지우개/undo/색상/
// 새 필기장 버튼이 하단 2줄 툴바로 늘어나면서 최소 높이도 함께 소폭 키웠다.
const DEFAULT_SIZE = { width: 360, height: 480 };
const MIN_SIZE = { width: 280, height: 240 };
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

// 펜 색상 1차 버전: 검정/빨강/초록 3개만. 컬러피커나 팔레트는 이번 범위 밖.
const PEN_COLORS: Array<{ value: string; label: string }> = [
  { value: '#000000', label: '검정' },
  { value: '#dc2626', label: '빨강' },
  { value: '#16a34a', label: '초록' },
];

// 확인 없이 바로 실행되면 위험한 동작(전체 지우기 / 필기장 전환)에 대한 대기 상태.
// targetUrl은 전환 대상 배경(undefined = 새 빈 필기장, 문자열 = 문제 이미지로 복귀)을 의미한다.
type PendingConfirm = { type: 'clear' } | { type: 'switchMode'; targetUrl: string | undefined };

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
  const [strokeColor, setStrokeColor] = useState(PEN_COLORS[1].value); // 기존 사용자 학습된 기본값(빨강) 유지
  const [hasStrokes, setHasStrokes] = useState(false); // undo/전체지우기 disabled 판단용 — 라이브러리 자체 history 상태를 새로 베끼지 않고 onChange로만 추적
  const [isSaving, setIsSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  // 기본값 = 문제 이미지 위 필기. "＋ 새 필기장"을 누르면 이 값이 undefined로 바뀌어 빈 캔버스가 된다.
  // 문제 이미지가 애초에 없는 호출부(향후 확장 대비)에서는 전환 버튼 자체를 숨긴다.
  const hasOriginalBackground = !!backgroundImageUrl;
  const [activeBackgroundUrl, setActiveBackgroundUrl] = useState<string | undefined>(backgroundImageUrl);
  const isBlankMode = !activeBackgroundUrl;

  const [pos, setPos] = useState(getInitialPosition);
  const [size, setSize] = useState(DEFAULT_SIZE);

  // ── 문서 좌표계: 창 크기(=화면에 보이는 뷰포트)와 완전히 분리된 "고정 문서" 크기 ──────────
  // 문제 위 필기 = 사진의 실제 가로세로 비율 기준, 새 필기장(빈 캔버스) = 그 모드에 처음 진입한
  // 순간의 캔버스 영역 크기로 잠금. 창을 리사이즈하거나 핀치를 해도 이 값 자체는 바뀌지 않는다 —
  // useHandwritingInput의 카메라(scale/x/y)만 바뀐다. 이미 그려둔 획은 문서 좌표에 저장되므로
  // 창을 늘리거나 줄여도 위치가 어긋나지 않는다.
  const viewportRef = useRef<HTMLDivElement>(null);
  const [imageIntrinsicSize, setImageIntrinsicSize] = useState<{ width: number; height: number } | null>(null);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [blankDocSize, setBlankDocSize] = useState<DocumentSize | null>(null);

  // 문제 이미지의 실제 원본 비율은 canvas 배경 prop만으로는 알 수 없어(react-sketch-canvas가
  // 크기를 다시 알려주지 않음) 가볍게 한 번 더 미리 불러와 naturalWidth/Height만 확인한다 —
  // 이 로드는 좌표계 기준 확보용이고 export/CORS 처리는 PR2(저장 합성)의 몫이라 여기서는 하지 않는다.
  useEffect(() => {
    if (!activeBackgroundUrl) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setImageIntrinsicSize({ width: img.naturalWidth, height: img.naturalHeight });
      } else {
        setImageLoadFailed(true);
      }
    };
    img.onerror = () => {
      if (!cancelled) setImageLoadFailed(true);
    };
    img.src = activeBackgroundUrl;
    return () => { cancelled = true; };
  }, [activeBackgroundUrl]);

  // 모드가 바뀔 때마다(문제 위 필기 ↔ 새 필기장) "새 문서"로 취급한다 — 기존 모드 전환 확인창이
  // 이미 캔버스를 비워주므로, 여기서 예전 측정값을 버리고 다음에 다시 정확히 재는 것이 안전하다.
  useEffect(() => {
    setBlankDocSize(null);
    setImageLoadFailed(false);
  }, [activeBackgroundUrl]);

  // 새 필기장(빈 캔버스) 또는 문제 이미지 로드 실패 시: "지금 보이는 캔버스 영역 크기"를 그대로
  // 문서 크기로 한 번 잠근다. 이미지 로드가 실패해도 예전처럼(배경 없이 빈 캔버스로 조용히
  // 대체) 필기 자체는 계속할 수 있게 한다.
  useLayoutEffect(() => {
    const needsViewportSizing = !activeBackgroundUrl || imageLoadFailed;
    if (!needsViewportSizing || blankDocSize) return;
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setBlankDocSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    }
  }, [activeBackgroundUrl, imageLoadFailed, blankDocSize]);

  const referenceImageDocSize = useMemo<DocumentSize | null>(() => {
    if (!imageIntrinsicSize) return null;
    const longSide = Math.max(imageIntrinsicSize.width, imageIntrinsicSize.height);
    const scale = DOC_REFERENCE_LONG_SIDE / longSide;
    return {
      width: Math.round(imageIntrinsicSize.width * scale),
      height: Math.round(imageIntrinsicSize.height * scale),
    };
  }, [imageIntrinsicSize]);

  const documentSize: DocumentSize | null = (activeBackgroundUrl && !imageLoadFailed)
    ? referenceImageDocSize
    : blankDocSize;

  const { camera, captureHandlers } = useHandwritingInput({
    viewportRef,
    documentSize,
    enabled: !isSaving && !pendingConfirm,
    debugLabel: isBlankMode ? 'blank' : 'problem',
  });

  // documentSize가 null → 값으로 바뀔 때마다(모드 전환/문서 재측정) 아래 JSX가 <ReactSketchCanvas>를
  // 새로 마운트한다 — 그러면 canvasRef가 새 인스턴스를 가리키고, 라이브러리 내부 eraseMode는 항상
  // 기본값(펜)으로 초기화된다. 이때 우리 쪽 isErasing 상태만 "지우개 선택됨"으로 남아있으면 툴바
  // 표시와 실제 동작이 어긋난다(리뷰에서 확인된 회귀) — 마운트/재마운트될 때마다 다시 동기화한다.
  useEffect(() => {
    if (!documentSize) return;
    canvasRef.current?.eraseMode(isErasing);
  }, [documentSize, isErasing]);

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

  // 펜 ↔ 지우개는 하나의 아이콘을 재사용해 토글하던 방식(모드가 뭔지 알아보기 어려움)을 버리고,
  // 각 버튼이 자기 모드로 "명시적으로" 설정만 한다 — 두 버튼 다 라이브러리의 eraseMode(boolean)를 그대로 씀.
  const handleSelectPen = () => {
    if (isSaving) return;
    setIsErasing(false);
    canvasRef.current?.eraseMode(false);
  };

  const handleSelectEraser = () => {
    if (isSaving) return;
    setIsErasing(true);
    canvasRef.current?.eraseMode(true);
  };

  const handleSelectColor = (color: string) => {
    if (isSaving) return;
    setStrokeColor(color);
    // 지우개 상태에서 색을 고르면 자연스럽게 펜으로 돌아온다 — 지우개용 색상 선택은 의미가 없으므로.
    if (isErasing) {
      setIsErasing(false);
      canvasRef.current?.eraseMode(false);
    }
  };

  // 라이브러리 자체 undo/redo 히스토리를 그대로 사용 — 별도 undo 스택을 만들지 않는다.
  const handleUndo = () => {
    if (isSaving || !hasStrokes) return;
    canvasRef.current?.undo();
  };

  // 전체 지우기는 바로 실행하지 않고 확인 대기 상태로만 전환한다. 지울 필기가 없으면 버튼 자체가 비활성.
  const requestClear = () => {
    if (isSaving || !hasStrokes) return;
    setPendingConfirm({ type: 'clear' });
  };

  // "＋ 새 필기장" ↔ "문제 이미지로 돌아가기" 전환. 자동으로 열리지 않고 항상 학생이 직접 눌러야 한다.
  // 아직 그려둔 게 없으면 확인 없이 바로 전환, 그려둔 게 있으면 잃을 수 있다고 먼저 확인받는다.
  const requestModeSwitch = (targetUrl: string | undefined) => {
    if (isSaving) return;
    if (!hasStrokes) {
      setActiveBackgroundUrl(targetUrl);
      return;
    }
    setPendingConfirm({ type: 'switchMode', targetUrl });
  };

  const handleConfirmCancel = () => setPendingConfirm(null);

  const handleConfirmAccept = () => {
    if (!pendingConfirm) return;
    if (pendingConfirm.type === 'clear') {
      canvasRef.current?.clearCanvas();
    } else {
      canvasRef.current?.clearCanvas();
      setActiveBackgroundUrl(pendingConfirm.targetUrl);
    }
    setPendingConfirm(null);
  };

  // 저장하기: 문제 이미지 전체(자르지 않음) + 흰 배경 + 필기를 직접 합성해 PNG로 만든 뒤
  // 스캐폴딩(본인 풀이)으로 등록한다. react-sketch-canvas의 내장 exportImage()는 더 이상 쓰지
  // 않는다 — exportSvg()(undo/지우개 mask가 반영된 최종 상태)만 재사용하고, 배경 합성은
  // flattenHandwriting이 직접 offscreen canvas에서 한다(PR2, 검은 배경/crop 버그의 근본 수정).
  const handleSave = async () => {
    if (isSaving || !canvasRef.current || !documentSize) return;
    setIsSaving(true);
    try {
      // 입력 동결: setIsSaving(true) 자체는 다음 렌더에서야 readOnly prop을 캔버스에 반영한다.
      // 두 번의 rAF로 그 렌더가 실제로 커밋(paint)될 때까지 기다린 뒤에야 snapshot을 뜬다 —
      // 그래야 저장 시작 직후에도 진행 중이던 stroke의 다음 pointermove가 반영되지 않는다.
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      if (!canvasRef.current) throw new Error('캔버스를 찾을 수 없습니다.');

      const svgMarkup = await canvasRef.current.exportSvg();

      // snapshot — 이 시점 이후 state/ref가 바뀌어도(예: 모달이 닫히거나 문제가 전환돼도) 아래
      // 값들만 사용한다.
      const snapshotDocumentSize = documentSize;
      const snapshotBackgroundUrl = activeBackgroundUrl;
      const snapshotCaption = isBlankMode ? '📝 새 필기장' : '✏️ 직접 손으로 쓴 풀이';
      const snapshotMistakeId = mistakeId;
      const snapshotStudentId = studentId;
      const snapshotTeacherId = currentUserId;

      const blob = await flattenHandwriting({
        documentSize: snapshotDocumentSize,
        backgroundImageUrl: snapshotBackgroundUrl,
        svgMarkup,
      });
      const dataUrl = await blobToDataUrl(blob);

      const { error } = await supabase
        .from('mistake_scaffoldings')
        .insert([{
          mistake_id: snapshotMistakeId,
          student_id: snapshotStudentId,
          teacher_id: snapshotTeacherId,
          image_url: dataUrl,
          caption: snapshotCaption,
        }]);
      if (error) throw error;

      onSaved();
      setSavedFlash(true);
      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err: any) {
      console.error('Failed to save handwriting:', err);
      if (import.meta.env.DEV) {
        console.log('[handwriting-save]', 'failure', { stage: err?.stage, message: err?.message });
      }
      // 실패해도 필기는 그대로 남는다 — 창을 닫지 않고 isSaving만 복구해 다시 저장을 시도할 수 있게 한다.
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
            <span>✏️</span>
            <span>손 필기 / 펜슬 풀이{isBlankMode && hasOriginalBackground ? ' · 새 필기장' : ''}</span>
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

        {/* 그리기 캔버스 뷰포트 — 실제 보이는 영역. 안쪽 문서 박스는 고정 크기이고, 이 박스는
            그 문서를 어떻게 비추는지(카메라: scale/x/y)만 담당한다. touch-action:none은 이 영역
            안에서만 적용해 헤더/툴바의 스크롤·탭 동작에는 영향을 주지 않는다. */}
        <div
          ref={viewportRef}
          className="flex-1 min-h-0 bg-white relative overflow-hidden"
          style={{ touchAction: 'none' }}
          onPointerDownCapture={captureHandlers.onPointerDownCapture}
          onPointerMoveCapture={captureHandlers.onPointerMoveCapture}
          onPointerUpCapture={captureHandlers.onPointerUpCapture}
          onPointerCancelCapture={captureHandlers.onPointerCancelCapture}
          onLostPointerCaptureCapture={captureHandlers.onLostPointerCaptureCapture}
        >
          {documentSize ? (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: documentSize.width,
                height: documentSize.height,
                transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
                transformOrigin: '0 0',
              }}
            >
              <ReactSketchCanvas
                ref={canvasRef}
                // 획 굵기는 문서(=react-sketch-canvas 내부) 좌표 단위라, 카메라 배율을 그대로 두면
                // 기본 축소 상태(예: 1600 단위 문서를 360px 창에 맞춤, scale≈0.22)에서 화면에는
                // 3px가 아니라 1px도 안 되게 그려진다(리뷰에서 확인된 회귀). 배율의 역수를 곱해
                // "지금 화면에 보이는 굵기"가 항상 기존과 같은 3px/16px가 되도록 보정한다.
                strokeWidth={3 / camera.scale}
                eraserWidth={16 / camera.scale}
                strokeColor={strokeColor}
                // 화면 배경(bg-white)이 이미 흰색이라 캔버스 자체는 투명해도 빈 필기장은 그대로
                // 흰 종이처럼 보인다 — 대신 exportSvg()가 내보내는 배경 rect도 투명해진다(canvasColor
                // 값 그대로 채워지던 걸 없앰). exportWithBackgroundImage=false와 맞물려 exportSvg()
                // 결과가 "필기 획만 있는, 원격 이미지 참조도 없는" 순수 벡터가 되어(설치본 K() 함수
                // 기준 확인) flattenHandwriting이 그 위에 흰 배경 + 원본 사진을 안전하게 겹칠 수 있다.
                canvasColor="transparent"
                backgroundImage={activeBackgroundUrl || ''}
                // 항상 false — 저장(export)에서는 라이브러리의 배경 합성을 쓰지 않는다. 실시간
                // 화면에는 영향 없음(backgroundImage prop만으로 표시됨, 이 값은 export 전용).
                // flattenHandwriting(PR2)이 문제 이미지 전체를 직접 그려 넣는다.
                exportWithBackgroundImage={false}
                // slice(cover, 잘라냄)를 meet(contain, 안 잘림)으로 되돌린다 — 검은 배경 버그의
                // 본질은 meet가 아니라 meet가 남기는 여백이 투명이었던 것. 저장은 이제
                // flattenHandwriting이 흰 배경을 먼저 채우므로, 화면도 다시 원본을 자르지 않는
                // meet로 복귀해도 안전하다. documentSize가 사진 비율과 이미 일치해 실제로는
                // 여백 자체가 거의 생기지 않는다.
                preserveBackgroundImageAspectRatio="xMidYMid meet"
                onChange={(paths: CanvasPath[]) => setHasStrokes(paths.length > 0)}
                // 저장 중에는 새 입력을 받지 않는다(기존 획/undo/export API는 계속 정상 동작) —
                // useHandwritingInput의 enabled=false는 우리 augmentation만 멈추지, 라이브러리 자체
                // pointer 리스너는 막지 못하므로 이 prop이 실제 "입력 동결"을 담당한다.
                readOnly={isSaving}
                width="100%"
                height="100%"
                style={{ border: 'none' }}
              />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-400 font-bold">
              문서를 준비하는 중…
            </div>
          )}
          {savedFlash && (
            <div className="absolute inset-0 bg-emerald-500/90 flex items-center justify-center text-white font-black text-sm animate-fade-in">
              ✅ 저장했습니다!
            </div>
          )}
        </div>

        {/* 하단 툴바 — 1줄: 펜/지우개/색상/undo, 2줄: 전체지우기/새 필기장/저장 */}
        <div className="flex-none flex items-center justify-between gap-1.5 px-2.5 py-1.5 bg-slate-950 border-t border-slate-800">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleSelectPen}
              disabled={isSaving}
              title="펜"
              aria-label="펜 도구 선택"
              aria-pressed={!isErasing}
              className={`w-7 h-7 rounded-lg flex items-center justify-center text-[13px] border transition-all active:scale-90 disabled:opacity-40 ${
                !isErasing
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              ✏️
            </button>
            <button
              type="button"
              onClick={handleSelectEraser}
              disabled={isSaving}
              title="지우개"
              aria-label="지우개 도구 선택"
              aria-pressed={isErasing}
              className={`w-7 h-7 rounded-lg flex items-center justify-center text-[13px] border transition-all active:scale-90 disabled:opacity-40 ${
                isErasing
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              🧽
            </button>
            <span className="w-px h-5 bg-slate-800 mx-0.5" aria-hidden="true" />
            {PEN_COLORS.map((color) => (
              <button
                key={color.value}
                type="button"
                onClick={() => handleSelectColor(color.value)}
                disabled={isSaving}
                title={`${color.label} 펜`}
                aria-label={`${color.label} 펜 선택`}
                aria-pressed={!isErasing && strokeColor === color.value}
                className={`w-6 h-6 rounded-full border-2 transition-all active:scale-90 disabled:opacity-40 ${
                  !isErasing && strokeColor === color.value
                    ? 'border-amber-400 ring-2 ring-amber-400/50 scale-110'
                    : 'border-slate-700'
                }`}
                style={{ backgroundColor: color.value }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={handleUndo}
            disabled={isSaving || !hasStrokes}
            title="실행 취소"
            aria-label="직전 필기 실행 취소"
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black bg-slate-900 border border-slate-800 text-slate-300 hover:text-slate-100 transition-all active:scale-90 disabled:opacity-30 disabled:active:scale-100"
          >
            ↶
          </button>
        </div>

        <div className="flex-none flex items-center justify-between gap-1.5 px-2.5 py-1.5 bg-slate-950 border-t border-slate-800">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={requestClear}
              disabled={isSaving || !hasStrokes}
              title="전체 지우기"
              aria-label="필기 전체 지우기"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-xs bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200 transition-all active:scale-90 disabled:opacity-30"
            >
              🗑️
            </button>
            {hasOriginalBackground && (
              <button
                type="button"
                onClick={() => requestModeSwitch(isBlankMode ? backgroundImageUrl : undefined)}
                disabled={isSaving}
                title={isBlankMode ? '문제 이미지로 돌아가기' : '새 빈 필기장 열기'}
                className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-slate-900 border border-slate-800 text-slate-300 hover:text-slate-100 transition-all active:scale-95 disabled:opacity-40 whitespace-nowrap"
              >
                {isBlankMode ? '🖼 문제 이미지로' : '＋ 새 필기장'}
              </button>
            )}
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
              disabled={isSaving || !documentSize}
              className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 transition-all active:scale-95 disabled:opacity-50"
            >
              {isSaving ? '저장 중...' : '💾 저장하기'}
            </button>
          </div>
        </div>

        {/* 전체 지우기 / 필기장 전환 확인창 — 실수 터치로 필기가 통째로 날아가지 않도록 창 전체를 덮는다 */}
        {pendingConfirm && (
          <div className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 w-full max-w-[240px] shadow-2xl space-y-3">
              <p className="text-xs font-black text-white leading-relaxed">
                {pendingConfirm.type === 'clear'
                  ? '작성한 필기를 모두 지울까요?'
                  : pendingConfirm.targetUrl
                    ? '문제 이미지로 돌아갈까요?'
                    : '새 필기장을 시작할까요?'}
              </p>
              <p className="text-[10.5px] text-slate-400 leading-relaxed">
                {pendingConfirm.type === 'clear' ? '되돌릴 수 없어요.' : '지금 작성한 필기가 사라져요.'}
              </p>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  className="flex-1 py-2 rounded-xl text-[10.5px] font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all active:scale-95"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAccept}
                  className="flex-1 py-2 rounded-xl text-[10.5px] font-black bg-rose-600 hover:bg-rose-500 text-white transition-all active:scale-95"
                >
                  {pendingConfirm.type === 'clear'
                    ? '모두 지우기'
                    : pendingConfirm.targetUrl
                      ? '돌아가기'
                      : '새 필기장 시작'}
                </button>
              </div>
            </div>
          </div>
        )}

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
