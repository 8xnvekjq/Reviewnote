import type { DocumentSize } from './useHandwritingInput';

// PR2(저장 합성) 전용 유틸 — HandwritingOverlay의 저장 버튼에서만 쓰인다.
//
// 배경: react-sketch-canvas의 내장 exportImage()에 맡기면, PNG+배경이미지 조합에서 canvasColor
// fill이 생략되는 라이브러리 자체 동작 때문에 "meet"(letterbox)의 여백이 완전 투명으로 남는다 —
// 이게 검은 배경 버그의 근본 원인이었다(직전 PR들의 감사로 확인). 반대로 "slice"(cover)로 바꾸면
// 여백은 없어지지만 원본 사진이 실제로 잘려나간다. 둘 다 받아들일 수 없어서, 최종 저장은
// react-sketch-canvas의 SVG 결과(exportSvg — undo/지우개 mask가 이미 반영된 상태)만 재사용하고,
// 배경 이미지 합성은 우리가 직접 offscreen canvas에서 한다:
//   불투명 흰 배경 → 원본 이미지 전체(contain, 자르지 않음) → 필기 SVG 오버레이 → PNG.
//
// PR1의 문서 좌표계(고정 documentSize)를 그대로 source of truth로 쓴다 — 카메라(창 크기/핀치)는
// 저장 결과에 전혀 관여하지 않는다.

export type FlattenStage = 'decode-background' | 'decode-svg' | 'compose' | 'encode';

export class FlattenError extends Error {
  stage: FlattenStage;
  constructor(stage: FlattenStage, message: string, cause?: unknown) {
    super(message);
    this.name = 'FlattenError';
    this.stage = stage;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

export interface FlattenHandwritingInput {
  /** PR1의 고정 문서 크기(카메라와 무관) — 좌표계의 source of truth. */
  documentSize: DocumentSize;
  /** 문제 위 필기일 때만 존재. 없으면(새 필기장) 흰 배경 위에 필기만 저장된다. */
  backgroundImageUrl?: string;
  /** canvasRef.current.exportSvg()의 결과 — undo/지우개 mask가 이미 반영된 최종 상태. */
  svgMarkup: string;
  /** 출력 최대 변 길이(모바일 메모리 보호). 기본 2048px. */
  maxOutputLongSide?: number;
}

const DEFAULT_MAX_OUTPUT_LONG_SIDE = 2048;

function logDev(event: string, data?: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  console.log('[handwriting-save]', event, data ?? {});
}

// 원본 문서 크기가 상한보다 크면 비율을 유지한 채 균일 축소한다. PR1의 documentSize는 이미
// 1600px 기준으로 정규화돼 있어 평소엔 이 상한 아래지만, 방어적으로 항상 적용한다(예: 새
// 필기장은 초기 뷰포트 크기를 그대로 쓰므로 이론상 큰 값이 들어올 수 있음).
export function computeOutputSize(documentSize: DocumentSize, maxLongSide: number): { width: number; height: number; scale: number } {
  const longSide = Math.max(documentSize.width, documentSize.height);
  const scale = longSide > maxLongSide ? maxLongSide / longSide : 1;
  return {
    width: Math.max(1, Math.round(documentSize.width * scale)),
    height: Math.max(1, Math.round(documentSize.height * scale)),
    scale,
  };
}

// 원본을 자르지 않고 목표 사각형 안에 중앙 정렬(contain)한다.
export function containRect(srcW: number, srcH: number, dstW: number, dstH: number): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const width = srcW * scale;
  const height = srcH * scale;
  return { x: (dstW - width) / 2, y: (dstH - height) / 2, width, height };
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (event) => reject(event instanceof ErrorEvent ? event.error : new Error('image load failed'));
    img.src = src;
  });
}

// Supabase Storage 등 원격 URL은 fetch→blob→object URL로 받는다 — <img crossOrigin> 방식보다
// 실패를 명시적인 예외로 잡기 쉽고(응답 status 확인 가능), tainted canvas 위험도 fetch 단계에서
// CORS가 거부되면 그 자리에서 바로 실패하므로 더 이르게 드러난다.
async function loadBackgroundImage(url: string): Promise<HTMLImageElement> {
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) throw new Error(`배경 이미지 응답 오류: ${res.status}`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await loadImageElement(objectUrl);
    if (typeof img.decode === 'function') {
      await img.decode();
    }
    return img;
  } finally {
    // drawImage에 쓸 데이터는 이미 디코드돼 이미지 엘리먼트가 들고 있으므로 즉시 revoke해도 안전.
    URL.revokeObjectURL(objectUrl);
  }
}

// react-sketch-canvas 자신이 내부 rasterize에 쓰는 것과 동일한 패턴(base64 SVG data URI +
// Image())을 재사용한다 — 이 앱에서 이미 검증된 방식이라 Safari 포함 호환성 위험이 낮고,
// createImageBitmap의 SVG 처리(Safari 일부 버전에서 불안정했던 이력)를 피할 수 있다.
function svgMarkupToDataUri(svgMarkup: string): string {
  const bytes = new TextEncoder().encode(svgMarkup);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

async function loadSvgOverlay(svgMarkup: string): Promise<HTMLImageElement> {
  const img = await loadImageElement(svgMarkupToDataUri(svgMarkup));
  if (typeof img.decode === 'function') {
    await img.decode();
  }
  return img;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('blob to dataURL 변환 실패'));
    reader.readAsDataURL(blob);
  });
}

/**
 * 문제 이미지(있다면) + 필기를 "불투명 흰 배경 → 원본 전체(contain) → 필기 SVG" 순서로 하나의
 * PNG로 합성한다. 카메라(창 크기/핀치)는 전혀 관여하지 않는다 — documentSize와 svgMarkup(둘 다
 * PR1의 고정 문서 좌표계 기준)만 입력으로 받는다.
 */
export async function flattenHandwriting({
  documentSize,
  backgroundImageUrl,
  svgMarkup,
  maxOutputLongSide = DEFAULT_MAX_OUTPUT_LONG_SIDE,
}: FlattenHandwritingInput): Promise<Blob> {
  const startedAt = performance.now();
  const output = computeOutputSize(documentSize, maxOutputLongSide);
  logDev('start', { documentSize, output });

  let backgroundImg: HTMLImageElement | null = null;
  let backgroundDecodedAt = startedAt;
  if (backgroundImageUrl) {
    try {
      backgroundImg = await loadBackgroundImage(backgroundImageUrl);
    } catch (err) {
      throw new FlattenError('decode-background', '문제 이미지를 불러오지 못했습니다.', err);
    }
    backgroundDecodedAt = performance.now();
  }

  let svgImg: HTMLImageElement;
  try {
    svgImg = await loadSvgOverlay(svgMarkup);
  } catch (err) {
    throw new FlattenError('decode-svg', '필기 내용을 불러오지 못했습니다.', err);
  }
  const svgDecodedAt = performance.now();

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  try {
    canvas = document.createElement('canvas');
    canvas.width = output.width;
    canvas.height = output.height;
    const maybeCtx = canvas.getContext('2d');
    if (!maybeCtx) throw new Error('2D canvas context를 만들 수 없습니다.');
    ctx = maybeCtx;

    // 1) 불투명 흰 배경 — 반드시 원본/필기보다 먼저 채운다. 여백이 투명으로 남는 것(검은 배경
    // 버그의 원인)과 사진이 잘리는 것(slice의 부작용) 둘 다 여기서 원천적으로 막힌다.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, output.width, output.height);

    // 2) 원본 이미지 전체를 contain으로 배치 — 절대 자르지 않는다.
    if (backgroundImg) {
      const rect = containRect(
        backgroundImg.naturalWidth || backgroundImg.width,
        backgroundImg.naturalHeight || backgroundImg.height,
        output.width,
        output.height,
      );
      ctx.drawImage(backgroundImg, rect.x, rect.y, rect.width, rect.height);
    }

    // 3) 필기(지우개 mask 반영된 SVG)를 같은 문서 좌표계로 겹친다. svgImg의 실제 크기는
    // documentSize와 정확히 같으므로(react-sketch-canvas의 exportSvg가 자기 DOM 노드의
    // offsetWidth/offsetHeight로 viewBox를 잡음), 캔버스 전체(output.width×height)에 맞춰
    // 그리면 배경과 정확히 같은 배율로 스케일된다 — 별도 좌표 보정이 필요 없다.
    ctx.drawImage(svgImg, 0, 0, output.width, output.height);
  } catch (err) {
    if (err instanceof FlattenError) throw err;
    throw new FlattenError('compose', '이미지 합성 중 오류가 발생했습니다.', err);
  }
  const composedAt = performance.now();

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) {
    throw new FlattenError('encode', 'PNG 생성에 실패했습니다.');
  }
  const encodedAt = performance.now();

  logDev('done', {
    documentSize,
    output,
    hasBackground: !!backgroundImg,
    decodeBackgroundMs: backgroundImg ? Math.round(backgroundDecodedAt - startedAt) : 0,
    decodeSvgMs: Math.round(svgDecodedAt - backgroundDecodedAt),
    composeMs: Math.round(composedAt - svgDecodedAt),
    encodeMs: Math.round(encodedAt - composedAt),
    totalMs: Math.round(encodedAt - startedAt),
    blobBytes: blob.size,
  });

  return blob;
}
