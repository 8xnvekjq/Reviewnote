import React, { useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../styles/detail.css';
import { ExamInkCanvas } from '../features/exam/ink/ExamInkCanvas';
import type { ExamInkCanvasHandle, InkStroke, InkTool } from '../features/exam/contract';
import { INK_REFERENCE_WIDTH } from '../features/exam/ink/inkModel';
import { examInkExportRect, paintExamInk } from '../features/handwriting/examInkExport';
import { useInkCamera } from '../features/handwriting/useInkCamera';
import { supabase } from '../services/supabase';
import { type DocumentSize } from '../features/handwriting/useHandwritingInput';
import { flattenHandwriting, blobToDataUrl } from '../features/handwriting/flattenHandwriting';
import { getDrawingWorld, type DocRect } from '../features/handwriting/drawingWorld';

const DOC_REFERENCE_LONG_SIDE = 1600;

// 헤더(닫기 버튼 포함)가 화면 밖으로 완전히 나가면 창을 되찾을 방법이 없어지므로, 최소한 헤더
// 일부는 항상 화면 안에 남도록 clamp한다 — 드래그 중(handleDragMove)과 최초 배치(getInitialPosition,
// 추가 필기장이 문제 위 필기창 기준으로 대각선 오프셋될 때) 둘 다에서 같은 기준을 쓴다.
const HEADER_MARGIN = 40;

export interface HandwritingOverlayBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface HandwritingOverlayHandle {
  /** 지금 이 창의 화면상 위치/크기. 추가 필기장을 열 때 "이 창 기준 대각선 오프셋"을 계산하는
   * 용도로만 부모(MistakeDetailModal)가 한 번 읽어간다 — 위치 상태 자체는 계속 이 컴포넌트
   * 내부에만 있고(완전히 독립), 부모가 구독하거나 제어하지 않는다. */
  getBounds: () => HandwritingOverlayBounds;
}

interface HandwritingOverlayProps {
  mistakeId: string;
  studentId: string;
  currentUserId: string;
  backgroundImageUrl?: string; // 있으면 이 이미지를 배경으로 깔고 그 위에 필기(문제 위 필기). 없으면 흰 캔버스(추가 필기장) — 이 창의 평생 고정값, 내부에서 바꾸지 않는다.
  onClose: () => void;
  onSaved?: () => void; // 저장 성공 시 부모(스캐폴딩 목록)에 새로고침을 알림
  onFocus?: () => void; // 이 창을 앞으로 가져와 달라는 요청(클릭/드래그 등 상호작용 시)
  isFront: boolean; // 두 창이 동시에 열려 있을 때 어느 쪽이 위에 그려질지
  onRequestExtraNotebook?: () => void; // 있으면 "＋ 새 필기장" 버튼 노출 — 문제 위 필기창에서만 전달됨
  initialPositionHint?: HandwritingOverlayBounds; // 있으면 이 사각형 기준 대각선 오프셋으로 초기 위치를 잡음(추가 필기장 전용)
  // 두 창의 raster export/저장이 겹치지 않게 하는 공유 락. 없으면 저장 없는 연습용 필기창(복습체크)으로
  // 동작한다 — 저장 버튼을 숨기고 그 외 도구는 그대로 쓴다.
  runExclusiveSave?: (task: () => Promise<void>) => Promise<void>;
}

// 문제 이미지를 배경으로 보여주게 되면서(재풀이 흐름) 기존 흰 캔버스 전용 기본 크기(320x260)로는
// 문제를 읽기 어려워 조금 더 키움. 여전히 드래그/리사이즈로 자유롭게 조절 가능. 펜/지우개/undo/색상/
// 새 필기장 버튼이 하단 2줄 툴바로 늘어나면서 최소 높이도 함께 소폭 키웠다.
const DEFAULT_SIZE = { width: 360, height: 480 };
const MIN_SIZE = { width: 280, height: 340 };
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

const PEN_COLORS = [
  { value: '#1f2937', label: '검정' },
  { value: '#2563eb', label: '파랑' },
  { value: '#dc2626', label: '빨강' },
  { value: '#16a34a', label: '초록' },
];
const INK_TOOLS: Array<{ tool: InkTool; label: string; icon: string }> = [
  { tool: 'pen', label: '펜', icon: '✏️' },
  { tool: 'highlighter', label: '형광펜', icon: '🖍️' },
  { tool: 'eraser', label: '지우개', icon: '🧽' },
  { tool: 'laser', label: '레이저', icon: '🔴' },
  { tool: 'lasso', label: '올가미', icon: '➰' },
];

// 전체 지우기(파괴적 동작)에 대한 확인 대기 상태. 예전엔 "필기장 전환" 확인도 같은 상태로
// 처리했지만, PR3에서 "새 필기장"이 더 이상 이 창 내부의 배경 전환이 아니라 부모에게 완전히
// 독립된 창을 요청하는 것으로 바뀌면서(요청 자체는 파괴적이지 않음) 더는 필요 없어졌다.
const DIAGONAL_OFFSET = 44; // 추가 필기장을 열 때 문제 위 필기창 기준으로 대각선으로 밀어내는 거리

// 위치를 CSS transform 트릭(left:50%+translate) 대신 실제 픽셀 left/top으로 직접 관리한다.
// 예전엔 진입 애니메이션 클래스가 같은 transform 속성을 덮어써서 창이 화면 밖으로 밀려나는
// 버그가 있었는데(이미 한 번 고침), 크기 조절까지 추가되면 그 방식은 "우측 하단 꼭짓점을
// 끌면 왼쪽 위는 고정된 채 커진다"는 자연스러운 동작을 구현하기도 번거로워 픽셀 좌표로 바꿨다.
//
// hint가 있으면(추가 필기장) 그 사각형에서 대각선으로 조금 떨어진 위치에서 시작한다 — 화면
// 중앙 기준이 아니라 "지금 실제로 문제 위 필기창이 있는 자리" 기준. 좁은 화면에서도 헤더가
// 화면 밖으로 나가지 않게 handleDragMove와 같은 규칙으로 clamp한다.
const getInitialSize = () => ({ width: Math.min(DEFAULT_SIZE.width, window.innerWidth - 16), height: Math.min(DEFAULT_SIZE.height, window.innerHeight - 16) });
const getInitialPosition = (hint?: HandwritingOverlayBounds) => {
  const initialSize = getInitialSize();
  if (hint) {
    const rawLeft = hint.left + DIAGONAL_OFFSET;
    const rawTop = hint.top + DIAGONAL_OFFSET;
    return {
      left: Math.max(8, Math.min(window.innerWidth - initialSize.width - 8, rawLeft)),
      top: Math.max(8, Math.min(window.innerHeight - initialSize.height - 8, rawTop)),
    };
  }
  return {
    left: Math.max(8, Math.round((window.innerWidth - initialSize.width) / 2)),
    top: Math.max(8, Math.round((window.innerHeight - initialSize.height) / 2)),
  };
};

export const HandwritingOverlay = React.forwardRef<HandwritingOverlayHandle, HandwritingOverlayProps>(({
  mistakeId,
  studentId,
  currentUserId,
  backgroundImageUrl,
  onClose,
  onSaved,
  onFocus,
  isFront,
  onRequestExtraNotebook,
  initialPositionHint,
  runExclusiveSave,
}, ref) => {
  const canvasRef = useRef<ExamInkCanvasHandle>(null);
  const [tool, setTool] = useState<InkTool>('pen');
  const [strokes, setStrokes] = useState<InkStroke[]>([]);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const [strokeColor, setStrokeColor] = useState(PEN_COLORS[2].value); // 기본 빨강 유지
  const hasStrokes = strokes.length > 0;
  const [isSaving, setIsSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const [pos, setPos] = useState(() => getInitialPosition(initialPositionHint));
  const [size, setSize] = useState(getInitialSize);

  // 문제 전환 시 부모가 이 인스턴스를 언마운트해도, 이미 시작된 handleSave의 await 체인(특히
  // runExclusiveSave 대기)은 그대로 계속 실행된다. 그 완료 시점에 캡처해뒀던 onSaved/onClose를
  // 그대로 호출하면, 같은 "extra" 슬롯에 새로 열린 다음 문제의 창을 엉뚱하게 닫아버릴 수 있다
  // (부모 상태는 문제 전환에도 살아있는 단일 슬롯이므로). 언마운트 이후에는 그 콜백들을 걸러낸다.
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    getBounds: () => ({ left: pos.left, top: pos.top, width: size.width, height: size.height }),
  }), [pos, size]);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [imageIntrinsicSize, setImageIntrinsicSize] = useState<{ width: number; height: number } | null>(null);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [blankDocSize, setBlankDocSize] = useState<DocumentSize | null>(null);

  useEffect(() => {
    if (!backgroundImageUrl) return;
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
    img.src = backgroundImageUrl;
    return () => { cancelled = true; };
  }, [backgroundImageUrl]);

  // 새 필기장(빈 캔버스) 또는 문제 이미지 로드 실패 시: "지금 보이는 캔버스 영역 크기"를 그대로
  // 문서 크기로 한 번 잠근다. backgroundImageUrl이 이 창 안에서 다시 바뀌는 일이 없으므로(PR3),
  // blankDocSize는 마운트 중 한 번만 정해지면 충분 — 재측정 트리거는 필요 없다. 이미지 로드가
  // 실패해도 예전처럼(배경 없이 빈 캔버스로 조용히 대체) 필기 자체는 계속할 수 있게 한다.
  useLayoutEffect(() => {
    const needsViewportSizing = !backgroundImageUrl || imageLoadFailed;
    if (!needsViewportSizing || blankDocSize) return;
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setBlankDocSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    }
  }, [backgroundImageUrl, imageLoadFailed, blankDocSize]);

  const referenceImageDocSize = useMemo<DocumentSize | null>(() => {
    if (!imageIntrinsicSize) return null;
    const longSide = Math.max(imageIntrinsicSize.width, imageIntrinsicSize.height);
    const scale = DOC_REFERENCE_LONG_SIDE / longSide;
    return {
      width: Math.round(imageIntrinsicSize.width * scale),
      height: Math.round(imageIntrinsicSize.height * scale),
    };
  }, [imageIntrinsicSize]);

  const documentSize: DocumentSize | null = (backgroundImageUrl && !imageLoadFailed)
    ? referenceImageDocSize
    : blankDocSize;

  // 실제 필기 가능 영역 — 문서 바깥 흰 여백까지. documentSize는 useMemo/state 값이라 참조가 안정적이다.
  const drawingWorld = useMemo<DocRect | null>(() => (documentSize ? getDrawingWorld(documentSize) : null), [documentSize]);

  const { camera, captureHandlers, onPan } = useInkCamera(viewportRef, documentSize, drawingWorld, !isSaving && !showClearConfirm);

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

  const handleSelectColor = (color: string) => {
    if (isSaving) return;
    setStrokeColor(color);
    if (tool !== 'pen' && tool !== 'highlighter') setTool('pen');
  };
  const handleUndo = () => canvasRef.current?.undo();

  // 전체 지우기는 바로 실행하지 않고 확인 대기 상태로만 전환한다. 지울 필기가 없으면 버튼 자체가 비활성.
  const requestClear = () => {
    if (isSaving || !hasStrokes) return;
    setShowClearConfirm(true);
  };

  const handleConfirmCancel = () => setShowClearConfirm(false);

  const handleConfirmAccept = () => {
    canvasRef.current?.clear();
    setShowClearConfirm(false);
  };

  const handleSave = async () => {
    if (!runExclusiveSave || isSaving || !canvasRef.current || !documentSize || !drawingWorld) return;
    canvasRef.current.finish();
    setIsSaving(true);
    try {
      // 입력 동결: setIsSaving(true) 자체는 다음 렌더에서야 readOnly prop을 캔버스에 반영한다.
      // 두 번의 rAF로 그 렌더가 실제로 커밋(paint)될 때까지 기다린 뒤에야 snapshot을 뜬다 —
      // 그래야 저장 시작 직후에도 진행 중이던 stroke의 다음 pointermove가 반영되지 않는다.
      await new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      if (!canvasRef.current) throw new Error('캔버스를 찾을 수 없습니다.');

      const snapshotStrokes = strokesRef.current;
      // 문서 밖에 쓴 필기가 저장 이미지에서 잘리지 않도록 저장 범위를 필기까지 넓힌다(없으면 문서 그대로).
      const exportRect = examInkExportRect(documentSize, drawingWorld, snapshotStrokes);

      // snapshot — "저장 시작 시점"(=이 시점)의 값만 이후 계속 쓴다. 두 창이 동시에 열려 있을 때
      // 아래 runExclusiveSave가 이 창의 실제 합성/업로드를 뒤로 미루더라도(다른 창이 먼저 저장
      // 중이면), 그 사이 모달이 닫히거나 문제가 전환돼 selectedEntry/props가 바뀌어도 이 저장
      // 작업의 대상(mistakeId 등)은 절대 바뀌지 않는다.
      const snapshotDocumentSize = documentSize;
      const snapshotDrawingWorld = drawingWorld;
      const snapshotBackgroundUrl = backgroundImageUrl;
      const snapshotCaption = backgroundImageUrl ? '✏️ 직접 손으로 쓴 풀이' : '📝 추가 필기장';
      const snapshotMistakeId = mistakeId;
      const snapshotStudentId = studentId;
      const snapshotTeacherId = currentUserId;

      // 두 필기창이 동시에 열려 있을 수 있으므로, 실제 raster export + 업로드는 공유 락으로
      // 직렬화한다(최대 2개 창뿐이라 범용 큐 대신 promise 체인 하나로 충분 — useSharedSaveLock).
      // 이 창이 대기하는 동안에도 위에서 이미 isSaving=true가 됐으므로 "저장 중…" 표시는
      // 끊기지 않는다 — 버튼이 죽은 것처럼 보이지 않는다.
      await runExclusiveSave(async () => {
        const blob = await flattenHandwriting({
          documentSize: snapshotDocumentSize,
          backgroundImageUrl: snapshotBackgroundUrl,
          paintInk: ctx => paintExamInk(ctx, snapshotStrokes, snapshotDrawingWorld),
          svgRect: snapshotDrawingWorld,
          outputRect: exportRect,
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
      });

      // 이 인스턴스가 대기하는 사이 문제가 전환되어 이미 언마운트됐다면, 여기서 멈춘다 — 저장 자체는
      // (스냅샷된 mistakeId로) 정상적으로 끝났지만, onSaved/onClose는 지금 살아있는 다른 세션의
      // 슬롯을 잘못 건드리게 되므로 절대 호출하지 않는다.
      if (!isMountedRef.current) return;

      onSaved?.();
      setSavedFlash(true);
      setTimeout(() => {
        if (!isMountedRef.current) return;
        onClose();
      }, 700);
    } catch (err: any) {
      console.error('Failed to save handwriting:', err);
      if (import.meta.env.DEV) {
        console.log('[handwriting-save]', 'failure', { stage: err?.stage, message: err?.message });
      }
      if (!isMountedRef.current) return;
      // 실패해도 필기는 그대로 남는다 — 창을 닫지 않고 isSaving만 복구해 다시 저장을 시도할 수
      // 있게 한다. 공유 락은 runExclusiveSave 내부 task가 실패해도(reject) 다음 작업으로 정상
      // 넘어가도록 구성돼 있어(useSharedSaveLock) 다른 창이 대기 중이었다면 그대로 진행된다.
      alert('저장에 실패했습니다: ' + (err.message || '알 수 없는 오류'));
      setIsSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 pointer-events-none" style={{ zIndex: isFront ? 9999 : 9998 }}>
      <div
        role="dialog"
        aria-label="손 필기 풀이창"
        onPointerDownCapture={() => onFocus?.()}
        className="rn-writing-window absolute rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl flex flex-col overflow-hidden pointer-events-auto"
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
            <span>풀이노트{!backgroundImageUrl ? ' · 추가 필기장' : ''}</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            // 저장 도중(특히 배경 이미지를 fetch하는 동안) 창을 닫아 언마운트시키면, 이후 저장이
            // 실패해도 "필기가 그대로 남는다"는 보장이 무의미해진다(언마운트된 캔버스는 복구 불가 —
            // 리뷰에서 확인된 문제) — 다른 저장 관련 버튼들과 동일하게 저장 중에는 비활성화한다.
            disabled={isSaving}
            aria-label="필기창 닫기"
            className="w-6 h-6 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center text-[10px] font-bold transition-colors disabled:opacity-40"
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
        >
          {documentSize && drawingWorld ? (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: documentSize.width,
                height: documentSize.height,
                transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
                transformOrigin: '0 0',
                // 카메라는 손가락을 즉시 따라가야 한다. 동작 줄이기 설정의 `.rn-writing-window *
                // { transition-duration: .01ms }`(detail.css)는 property 기본값 all 때문에 transform도
                // 한 프레임 늦게 따라가게 만들어, 팬 직후 첫 획의 시작점이 이전 카메라로 계산됐다.
                transition: 'none',
              }}
            >
              {/* 배경은 문서에만 깔고 필기는 확장 월드 전체에 그린다. */}
              {backgroundImageUrl && !imageLoadFailed && (
                <img
                  src={backgroundImageUrl}
                  alt=""
                  draggable={false}
                  className="absolute inset-0 w-full h-full object-contain select-none pointer-events-none"
                />
              )}
              {/* 필기 캔버스 = 월드. 문서 좌표 (world.x, world.y)에서 시작해 문서 밖 여백까지 덮는다
                  — 확대/팬으로 이동한 흰 공간에서도 실제로 필기가 된다(drawingWorld.ts). */}
              <div
                style={{
                  position: 'absolute',
                  left: drawingWorld.x,
                  top: drawingWorld.y,
                  width: drawingWorld.width,
                  height: drawingWorld.height,
                }}
              >
                <ExamInkCanvas
                  ref={canvasRef}
                  imageUrl=""
                  surface={{ height: drawingWorld.height, transparent: true, scale: camera.scale }}
                  strokes={strokes}
                  onChange={next => { strokesRef.current = next; setStrokes(next); }}
                  tool={tool}
                  color={strokeColor}
                  size={(tool === 'highlighter' ? 6 : 3) * INK_REFERENCE_WIDTH / (drawingWorld.width * camera.scale)}
                  onPan={onPan}
                  readOnly={isSaving || showClearConfirm}
                />
              </div>
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

        {/* 한 줄 툴바: 좁은 창에서는 가로로 스크롤한다. */}
        <div className="rn-writing-toolbar rn-writing-ink-toolbar" role="toolbar" aria-label="필기 도구">
          {INK_TOOLS.map(item => (
            <button key={item.tool} type="button" title={item.label} aria-label={`${item.label} 도구 선택`}
              aria-pressed={tool === item.tool} disabled={isSaving} onClick={() => setTool(item.tool)}>
              {item.icon}
            </button>
          ))}
          {PEN_COLORS.map(color => (
            <button key={color.value} type="button" className="rn-pen-color" title={`${color.label} 펜`}
              aria-label={`${color.label} 펜 선택`} aria-pressed={strokeColor === color.value}
              style={{ backgroundColor: color.value }} disabled={isSaving} onClick={() => handleSelectColor(color.value)} />
          ))}
          <button type="button" aria-label="직전 필기 실행 취소" title="실행 취소" disabled={isSaving || !canvasRef.current?.canUndo()} onClick={handleUndo}>↶</button>
          <button type="button" aria-label="필기 다시 실행" title="다시 실행" disabled={isSaving || !canvasRef.current?.canRedo()} onClick={() => canvasRef.current?.redo()}>↷</button>
          <button type="button" aria-label="필기 전체 지우기" title="전체 지우기" disabled={isSaving || !hasStrokes} onClick={requestClear}>🗑️</button>
          {onRequestExtraNotebook && <button type="button" disabled={isSaving} onClick={onRequestExtraNotebook}>＋ 새 필기장</button>}
          {runExclusiveSave && <button type="button" className="rn-button rn-button-primary" disabled={isSaving || !documentSize} onClick={handleSave}>{isSaving ? '저장 중...' : '💾 저장하기'}</button>}
        </div>

        {/* 전체 지우기 확인창 — 실수 터치로 필기가 통째로 날아가지 않도록 창 전체를 덮는다 */}
        {showClearConfirm && (
          <div className="absolute inset-0 z-30 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 w-full max-w-[240px] shadow-2xl space-y-3">
              <p className="text-xs font-black text-white leading-relaxed">
                작성한 필기를 모두 지울까요?
              </p>
              <p className="text-[10.5px] text-slate-400 leading-relaxed">
                실행 취소로 되돌릴 수 있어요.
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
                  모두 지우기
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
});

HandwritingOverlay.displayName = 'HandwritingOverlay';
