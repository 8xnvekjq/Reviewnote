import { useEffect, useMemo, useRef, useState } from 'react';

// PR1(입력 품질 + 문서 좌표계 기반) 전용 훅.
//
// react-sketch-canvas는 그대로 쓴다(AUGMENT CURRENT) — undo/redo, Bézier smoothing, mask 지우개,
// rAF 배칭이 이미 있고 이걸 다시 만들 이유가 없다. 다만 공개 props만으로는:
//   1) 브라우저가 합쳐버린 coalesced pointermove 중간 좌표를 라이브러리 내부에 주입할 수 없고,
//   2) pointerup의 마지막 실제 좌표가 path에 반영되지 않으며(라이브러리의 finishActivePointer가
//      pointerup 이벤트 자체의 좌표를 읽지 않음 — 조사서에서 확인된 근본 원인),
//   3) 2손가락 pinch/pan 자체가 라이브러리에 없다.
//
// 이 세 가지를 "라이브러리를 갈아엎지 않고" 해결하기 위해, 이 훅은 필기 영역을 감싸는 wrapper에
// CAPTURE 단계 핸들러를 붙여 실제 pointer 이벤트가 라이브러리(자신의 내부 리스너, bubble 단계)에
// 도달하기 "전에" 관찰한다. coalesced 샘플이나 pointerup 종료 좌표는, 같은 target에 synthetic
// PointerEvent(pointermove)를 dispatch해서 라이브러리 "자신의" 정상 pointermove 처리 경로(rAF 배칭
// 포함)를 그대로 태워 보낸다 — 새 입력 파이프라인을 만드는 게 아니라 기존 파이프라인에 빠진 샘플을
// 채워 넣는 방식.
//
// 문서 좌표계는 별도 좌표 변환 코드 없이, react-sketch-canvas 자신의 내부 좌표 변환 함수(설치본
// At())가 "레이아웃 크기(offsetWidth) ÷ 화면에 보이는 크기(getBoundingClientRect)" 비율로 이미
// CSS transform을 자동 보정한다는 점을 이용한다: 캔버스를 고정 픽셀 크기(문서 크기)로 두고, 그
// 바깥 wrapper에 CSS transform(translate+scale)만 "카메라"로 적용하면, 라이브러리가 리포트하는
// 로컬 좌표가 항상 고정 문서 좌표가 된다 — 창 크기 조절/핀치는 카메라만 바꾸고 문서는 안 바뀐다.

export interface DocumentSize {
  width: number;
  height: number;
}

export interface Camera {
  scale: number;
  x: number;
  y: number;
}

interface PointerSample {
  x: number;
  y: number;
  type: string;
}

type GestureState = 'idle' | 'drawing' | 'pinching' | 'awaiting-release';

interface PinchStart {
  distance: number;
  midX: number;
  midY: number;
  camera: Camera;
}

interface UseHandwritingInputOptions {
  /** 실제 캔버스가 보이는 뷰포트(overflow:hidden 컨테이너) — ResizeObserver로 크기를 추적한다. */
  viewportRef: React.RefObject<HTMLDivElement | null>;
  /** 고정 문서 크기. 아직 확정되지 않았으면 null(이 동안 입력은 훅 바깥에서 막아야 함). */
  documentSize: DocumentSize | null;
  /** false면(저장 중/확인창 등) 이번 augmentation을 건너뛰고 라이브러리 기본 동작만 통과시킨다. */
  enabled: boolean;
  /** DEV 콘솔 로그 태그 구분용(향후 여러 창이 동시에 열릴 때를 대비). */
  debugLabel: string;
}

interface CaptureHandlers {
  onPointerDownCapture: (e: React.PointerEvent) => void;
  onPointerMoveCapture: (e: React.PointerEvent) => void;
  onPointerUpCapture: (e: React.PointerEvent) => void;
  onPointerCancelCapture: (e: React.PointerEvent) => void;
  onLostPointerCaptureCapture: (e: React.PointerEvent) => void;
}

interface UseHandwritingInputResult {
  camera: Camera;
  captureHandlers: CaptureHandlers;
}

const IDENTITY_CAMERA: Camera = { scale: 1, x: 0, y: 0 };
const PINCH_MAX_MULTIPLIER = 4.5; // 기존 문제 이미지 확대창(1~4.5배)과 동일한 배율 참고
const PAN_SLACK_PX = 80; // 문서가 뷰포트 밖으로 완전히 사라지지 않도록 남겨두는 여유

function logDev(label: string, event: string, data?: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  console.log('[handwriting-input]', label, event, data ?? {});
}

function clampAxis(pos: number, viewportSize: number, contentSize: number): number {
  if (contentSize <= viewportSize) {
    const min = 0;
    const max = viewportSize - contentSize;
    return Math.min(max, Math.max(min, pos));
  }
  const min = viewportSize - contentSize - PAN_SLACK_PX;
  const max = PAN_SLACK_PX;
  return Math.min(max, Math.max(min, pos));
}

function fitCamera(viewportW: number, viewportH: number, docW: number, docH: number): { camera: Camera; fitScale: number } {
  if (viewportW <= 0 || viewportH <= 0 || docW <= 0 || docH <= 0) {
    return { camera: IDENTITY_CAMERA, fitScale: 1 };
  }
  const scale = Math.min(viewportW / docW, viewportH / docH);
  const x = (viewportW - scale * docW) / 2;
  const y = (viewportH - scale * docH) / 2;
  return { camera: { scale, x, y }, fitScale: scale };
}

// 두 번째 pointer의 coalesced sub-event는 pointerId/target이 비어 있을 수 있다는 사례가 있어
// (iOS Safari 18.2+ 일부 보고) 항상 "진짜" 이벤트의 pointerId/pointerType을 쓰고, 좌표만 각
// 샘플에서 가져온다 — UA 하드코딩 대신 각 샘플의 좌표가 유효한 숫자인지만 검증하는 방식으로
// "보수적 처리"를 구현한다.
function isFiniteCoord(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function dispatchSyntheticMove(
  target: EventTarget,
  clientX: number,
  clientY: number,
  pointerId: number,
  pointerType: string,
  pressure: number,
) {
  const evt = new PointerEvent('pointermove', {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId,
    pointerType,
    clientX,
    clientY,
    pressure: Number.isFinite(pressure) && pressure > 0 ? pressure : 0.5,
    isPrimary: true,
    buttons: 1,
  });
  // 우리가 만든 synthetic 이벤트가 같은 capture 핸들러를 다시 타고 들어와 무한 루프에 빠지지
  // 않도록 표시해둔다(재진입 시 handlePointerMoveCapture가 이 값을 보고 즉시 return).
  (evt as unknown as { __rnSynthetic?: boolean }).__rnSynthetic = true;
  target.dispatchEvent(evt);
}

export function useHandwritingInput({
  viewportRef,
  documentSize,
  enabled,
  debugLabel,
}: UseHandwritingInputOptions): UseHandwritingInputResult {
  const [camera, setCamera] = useState<Camera>(IDENTITY_CAMERA);
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  const pointersRef = useRef<Map<number, PointerSample>>(new Map());
  const gestureStateRef = useRef<GestureState>('idle');
  const drawingPointerIdRef = useRef<number | null>(null);
  const pinchStartRef = useRef<PinchStart | null>(null);
  const fitScaleRef = useRef(1);
  const cameraRef = useRef<Camera>(IDENTITY_CAMERA);
  const viewportRectRef = useRef<{ left: number; top: number } | null>(null);
  cameraRef.current = camera;

  // 뷰포트 실측 — 헤더/툴바 높이 변화, 창 리사이즈 전부 여기로 반영된다(컴포넌트가 직접
  // "창 크기 - 크롬 높이"를 계산할 필요 없음).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      viewportRectRef.current = { left: rect.left, top: rect.top };
      setViewportSize(prev => (prev.width === rect.width && prev.height === rect.height ? prev : { width: rect.width, height: rect.height }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // 창 자체가 드래그로만 움직이는 경우(크기는 그대로)도 뷰포트의 화면상 절대 위치(left/top)가
    // 바뀌므로 핀치 앵커 계산을 위해 위치도 갱신해줘야 한다 — 매 프레임 재계산은 과하므로
    // pointerdown 시점에 다시 한 번 최신화한다(아래 handlePointerDownCapture).
    return () => ro.disconnect();
  }, [viewportRef]);

  // 문서 크기 또는 뷰포트 크기가 바뀔 때마다 카메라를 새로 "맞춤"(contain-fit)한다 — 창 리사이즈나
  // 배경 전환(문제 이미지 ↔ 새 필기장) 직후 항상 문서 전체가 다시 꽉 차게 보이도록. 이미 그려둔
  // stroke는 문서 좌표에 저장돼 있으므로 이 재계산으로 위치가 흔들리지 않는다 — 카메라만 바뀐다.
  useEffect(() => {
    if (!documentSize || viewportSize.width <= 0 || viewportSize.height <= 0) return;
    const { camera: next, fitScale } = fitCamera(viewportSize.width, viewportSize.height, documentSize.width, documentSize.height);
    fitScaleRef.current = fitScale;
    setCamera(next);
    logDev(debugLabel, 'camera-refit', { viewport: viewportSize, document: documentSize, camera: next });
  }, [documentSize, viewportSize, debugLabel]);

  // 언마운트 시 소유권/제스처 상태 정리(한 창의 정리가 다른 창에 영향을 주지 않도록 전부 이
  // 훅 인스턴스 내부의 ref/state에만 있다 — 전역 singleton 없음).
  useEffect(() => {
    const pointers = pointersRef.current;
    return () => {
      pointers.clear();
      gestureStateRef.current = 'idle';
      drawingPointerIdRef.current = null;
      pinchStartRef.current = null;
      logDev(debugLabel, 'unmount-cleanup', {});
    };
  }, [debugLabel]);

  const releaseToIdleOrAwait = (remaining: number) => {
    if (remaining === 0) {
      gestureStateRef.current = 'idle';
      drawingPointerIdRef.current = null;
      pinchStartRef.current = null;
    } else if (gestureStateRef.current === 'pinching') {
      // 손가락 하나가 남아도 자동으로 drawing을 재개하지 않는다 — 전부 뗄 때까지 대기.
      gestureStateRef.current = 'awaiting-release';
      pinchStartRef.current = null;
    }
  };

  const captureHandlers = useMemo<CaptureHandlers>(() => {
    const handlePointerDownCapture = (e: React.PointerEvent) => {
      if (!enabled) return;
      const pointers = pointersRef.current;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      logDev(debugLabel, 'pointerdown', { pointerId: e.pointerId, pointerType: e.pointerType, count: pointers.size, state: gestureStateRef.current });

      if (pointers.size === 1) {
        if (gestureStateRef.current === 'idle') {
          drawingPointerIdRef.current = e.pointerId;
          gestureStateRef.current = 'drawing';
        }
        return;
      }

      if (pointers.size === 2) {
        // 두 번째 pointer 진입 — 이 실제 이벤트는 그대로 흘려보내(preventDefault/stopPropagation
        // 안 함) react-sketch-canvas 자신의 핸들러도 같은 이벤트를 받는다. 라이브러리는 이미
        // "두 번째 pointerdown이 오면 현재 stroke를 그 자리에서 확정(버리지 않음)"하는 동작을
        // 갖고 있다(조사서에서 소스로 확인) — 여기서는 우리 쪽 제스처 상태만 pinch로 전환한다.
        const el = viewportRef.current;
        if (el) {
          const rect = el.getBoundingClientRect();
          viewportRectRef.current = { left: rect.left, top: rect.top };
        }
        gestureStateRef.current = 'pinching';
        drawingPointerIdRef.current = null;
        const ids = Array.from(pointers.keys());
        const p1 = pointers.get(ids[0])!;
        const p2 = pointers.get(ids[1])!;
        const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        pinchStartRef.current = { distance, midX, midY, camera: cameraRef.current };
        logDev(debugLabel, 'pinch-start', { distance, midX, midY });
      }
      // 3번째 이상의 pointer는 무시 — 진행 중인 pinch 기준점을 흔들지 않는다.
    };

    const handlePointerMoveCapture = (e: React.PointerEvent) => {
      if (!enabled) return;
      const native = e.nativeEvent as PointerEvent & { __rnSynthetic?: boolean; getCoalescedEvents?: () => PointerEvent[] };
      if (native.__rnSynthetic) return; // 우리가 만든 synthetic 이벤트 재진입 방지

      const pointers = pointersRef.current;
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });

      if (gestureStateRef.current === 'pinching') {
        if (pointers.size < 2) return;
        const start = pinchStartRef.current;
        const rect = viewportRectRef.current;
        if (!start || !rect || !documentSize) return;
        const ids = Array.from(pointers.keys()).slice(0, 2);
        const p1 = pointers.get(ids[0])!;
        const p2 = pointers.get(ids[1])!;
        const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;

        const docAnchorX = (start.midX - rect.left - start.camera.x) / start.camera.scale;
        const docAnchorY = (start.midY - rect.top - start.camera.y) / start.camera.scale;
        const minScale = fitScaleRef.current;
        let nextScale = start.camera.scale * (distance / start.distance);
        nextScale = Math.min(minScale * PINCH_MAX_MULTIPLIER, Math.max(minScale, nextScale));

        let nextX = midX - rect.left - docAnchorX * nextScale;
        let nextY = midY - rect.top - docAnchorY * nextScale;
        nextX = clampAxis(nextX, viewportSize.width, documentSize.width * nextScale);
        nextY = clampAxis(nextY, viewportSize.height, documentSize.height * nextScale);

        setCamera({ scale: nextScale, x: nextX, y: nextY });
        return;
      }

      if (gestureStateRef.current !== 'drawing' || drawingPointerIdRef.current !== e.pointerId) return;

      const target = e.target;
      if (!target) return;

      let samples: PointerEvent[] = [];
      if (typeof native.getCoalescedEvents === 'function') {
        try {
          const coalesced = native.getCoalescedEvents();
          if (coalesced && coalesced.length > 0) samples = coalesced;
        } catch {
          samples = [];
        }
      }
      if (samples.length === 0) samples = [native];

      // 마지막 샘플은 실제 이벤트 자신과 같은 좌표이므로(스펙상 대표 이벤트가 곧 마지막
      // coalesced 샘플) 굳이 다시 보내지 않는다 — 실제 이벤트가 자연스럽게 라이브러리에
      // 도달하도록 그대로 둔다. 그 앞의 "유실됐을" 중간 샘플만 synthetic move로 채운다.
      let injected = 0;
      for (let i = 0; i < samples.length - 1; i++) {
        const s = samples[i];
        if (!isFiniteCoord(s.clientX) || !isFiniteCoord(s.clientY)) continue; // 좌표 유효성 검증(보수적 처리)
        dispatchSyntheticMove(target, s.clientX, s.clientY, e.pointerId, e.pointerType, s.pressure);
        injected += 1;
      }
      if (injected > 0) {
        logDev(debugLabel, 'coalesced-inject', { pointerId: e.pointerId, sampleCount: samples.length, injected });
      }
    };

    const handlePointerUpCapture = (e: React.PointerEvent) => {
      if (!enabled) return;
      const native = e.nativeEvent as PointerEvent & { __rnSynthetic?: boolean };
      if (native.__rnSynthetic) return;

      const pointers = pointersRef.current;
      const wasDrawingPointer = gestureStateRef.current === 'drawing' && drawingPointerIdRef.current === e.pointerId;

      if (wasDrawingPointer && e.target) {
        // pointerup 자신의 좌표는 react-sketch-canvas의 finishActivePointer가 읽지 않는다(조사서
        // 확인 원인) — 정상 pointermove 경로로 한 번 더 태워서 마지막 실제 좌표를 path에 반영한
        // 뒤에 실제 pointerup이 이어서 도착하도록 둔다(여기서 stopPropagation 하지 않음).
        dispatchSyntheticMove(e.target, e.clientX, e.clientY, e.pointerId, e.pointerType, e.pressure);
        logDev(debugLabel, 'pointerup-endpoint', { pointerId: e.pointerId, x: e.clientX, y: e.clientY });
      }

      pointers.delete(e.pointerId);
      logDev(debugLabel, 'pointerup', { pointerId: e.pointerId, remaining: pointers.size });
      releaseToIdleOrAwait(pointers.size);
    };

    const handlePointerCancelCapture = (e: React.PointerEvent) => {
      if (!enabled) return;
      const native = e.nativeEvent as PointerEvent & { __rnSynthetic?: boolean };
      if (native.__rnSynthetic) return;
      const pointers = pointersRef.current;
      pointers.delete(e.pointerId);
      // cancel/lostpointercapture는 "예상 밖" 종료이므로 pointerup과 달리 마지막 좌표를 억지로
      // 만들어 추가하지 않는다 — 이미 확보한 실제 좌표만 보존하고 상태만 정리한다(조사서 원칙).
      logDev(debugLabel, 'pointercancel', { pointerId: e.pointerId, remaining: pointers.size });
      releaseToIdleOrAwait(pointers.size);
    };

    return {
      onPointerDownCapture: handlePointerDownCapture,
      onPointerMoveCapture: handlePointerMoveCapture,
      onPointerUpCapture: handlePointerUpCapture,
      onPointerCancelCapture: handlePointerCancelCapture,
      onLostPointerCaptureCapture: handlePointerCancelCapture,
    };
  }, [enabled, documentSize, viewportSize, viewportRef, debugLabel]);

  return { camera, captureHandlers };
}
