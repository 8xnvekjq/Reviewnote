// 읽기·검토 화면과 오답노트 스캐폴딩 합성에서 "필기 전체"를 담는 범위 계산(순수 함수).
// 좌표 단위는 필기와 같다: 문항 이미지 너비 = 1. 풀이 화면에서는 이미지 오른쪽 여백(최대 980/480 ≈ 2.04)과
// 이미지 아래 여백에도 쓸 수 있으므로, 이미지 크기만 보고 그리면 필기 오른쪽·아래가 잘린다.
import type { InkReplayData, InkStroke } from '../contract.ts';
import { inkExtraBelow, strokeBounds, strokeWidth } from './inkModel.ts';

/** 필기가 닿은 가장 오른쪽·아래 끝(획 굵기 절반 포함). 필기가 없으면 0. */
export interface InkExtent { maxX: number; maxY: number }

/** 필기 끝에 남기는 여유(이미지 너비 기준). */
export const INK_FIT_PAD = 0.02;

export function inkExtent(...lists: ReadonlyArray<readonly InkStroke[] | null | undefined>): InkExtent {
  let maxX = 0, maxY = 0;
  for (const list of lists) {
    for (const stroke of list ?? []) {
      const b = strokeBounds(stroke);
      if (!Number.isFinite(b.maxX) || !Number.isFinite(b.maxY)) continue;
      const half = strokeWidth(stroke) / 2;
      maxX = Math.max(maxX, b.maxX + half);
      maxY = Math.max(maxY, b.maxY + half);
    }
  }
  return { maxX, maxY };
}

/** 재생 기록에 한 번이라도 나온 모든 획(나중에 지운 획 포함) — 재생 중에 화면 배율이 바뀌지 않게 미리 범위를 잡는다. */
export function replayStrokeLists(data: InkReplayData | null | undefined): InkStroke[][] {
  if (!data) return [];
  const lists: InkStroke[][] = [data.strokes];
  for (const batch of data.batches) {
    if (batch.baseline) lists.push(batch.baseline);
    for (const event of batch.events) lists.push(event.added.map(row => row.stroke));
  }
  return lists;
}

/**
 * 읽기용 캔버스의 이미지 표시 너비(CSS px). 필기 오른쪽 끝까지 컨테이너 안에 들어오도록 필요한 만큼만 줄인다.
 * 이미지 안쪽에만 쓴 필기면 기존과 똑같다(min(imageMaxWidth, cssWidth)).
 */
export function fitImageWidth(cssWidth: number, imageMaxWidth: number | undefined, extent?: InkExtent | null): number {
  const cap = imageMaxWidth ? Math.min(imageMaxWidth, cssWidth) : cssWidth;
  if (!extent || extent.maxX <= 0) return cap;
  return Math.min(cap, cssWidth / Math.max(1, extent.maxX + INK_FIT_PAD));
}

/** 이미지 아래 여백 높이(이미지 너비 단위). 풀이 화면 여백보다 아래까지 쓴 필기가 있으면 거기까지 늘린다. */
export function fitExtraBelow(aspect: number, extent?: InkExtent | null): number {
  const base = inkExtraBelow(aspect);
  if (!extent || aspect <= 0 || extent.maxY <= 0) return base;
  return Math.max(base, extent.maxY + INK_FIT_PAD - aspect);
}

/** 문항 이미지 + 필기 한 장 합성 범위(이미지 너비 단위). 이미지 전체는 늘 담고, 필기가 오른쪽·아래로 나가면 넓힌다. */
export function compositeBounds(aspect: number, extent: InkExtent): { width: number; height: number } {
  return {
    width: Math.max(1, extent.maxX > 0 ? extent.maxX + INK_FIT_PAD : 0),
    height: Math.max(aspect, extent.maxY > 0 ? extent.maxY + INK_FIT_PAD : 0),
  };
}

/** 합성 PNG의 "이미지 너비 1"당 픽셀 수. 원본보다 키우지 않고, 너무 큰 그림(데이터 URL로 저장)은 줄인다. */
export function compositeScale(naturalWidth: number, bounds: { width: number; height: number },
  limits: { unitPx?: number; maxSidePx?: number; maxPixels?: number } = {}): number {
  const { unitPx = 900, maxSidePx = 2400, maxPixels = 4_000_000 } = limits;
  let scale = Math.max(1, Math.min(naturalWidth || unitPx, unitPx));
  scale = Math.min(scale, maxSidePx / bounds.width, maxSidePx / bounds.height);
  const area = bounds.width * bounds.height * scale * scale;
  if (area > maxPixels) scale *= Math.sqrt(maxPixels / area);
  return scale;
}
