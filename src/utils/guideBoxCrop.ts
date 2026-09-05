export interface DisplayRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CropPercent {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const MIN_SIZE_PERCENT = 10;

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

// Two opposing margins (e.g. left/right) must leave at least MIN_SIZE_PERCENT
// of width remaining, matching ImageCropper's own drag-resize constraint.
function capOpposingMargins(a: number, b: number): [number, number] {
  const sum = a + b;
  const maxSum = 100 - MIN_SIZE_PERCENT;
  if (sum <= maxSum || sum <= 0) return [a, b];
  const factor = maxSum / sum;
  return [a * factor, b * factor];
}

/**
 * Converts the on-screen guide box (reticle) rect into the crop margin
 * percentages ImageCropper expects, relative to the video's native
 * (captured) resolution.
 *
 * The video element is rendered with `object-fit: cover`, so the CSS box
 * the user sees is a center-cropped view of the native frame — the guide
 * box position must be corrected for that clipping before it can be
 * expressed as a percentage of the full captured image. Simply scaling by
 * (native size / displayed size) ignores this clipping and produces the
 * wrong region whenever the video's aspect ratio differs from its
 * container's.
 */
export function computeInitialCropFromGuideBox(
  videoRect: DisplayRect,
  guideRect: DisplayRect,
  videoWidth: number,
  videoHeight: number
): CropPercent | null {
  if (
    videoWidth <= 0 ||
    videoHeight <= 0 ||
    videoRect.width <= 0 ||
    videoRect.height <= 0 ||
    guideRect.width <= 0 ||
    guideRect.height <= 0
  ) {
    return null;
  }

  const coverScale = Math.max(
    videoRect.width / videoWidth,
    videoRect.height / videoHeight
  );
  const clippedX = (coverScale * videoWidth - videoRect.width) / 2;
  const clippedY = (coverScale * videoHeight - videoRect.height) / 2;

  const guideXInVideo = guideRect.left - videoRect.left;
  const guideYInVideo = guideRect.top - videoRect.top;

  const sourceX = (guideXInVideo + clippedX) / coverScale;
  const sourceY = (guideYInVideo + clippedY) / coverScale;
  const sourceWidth = guideRect.width / coverScale;
  const sourceHeight = guideRect.height / coverScale;

  const [left, right] = capOpposingMargins(
    clampPercent((100 * sourceX) / videoWidth),
    clampPercent((100 * (videoWidth - sourceX - sourceWidth)) / videoWidth)
  );
  const [top, bottom] = capOpposingMargins(
    clampPercent((100 * sourceY) / videoHeight),
    clampPercent((100 * (videoHeight - sourceY - sourceHeight)) / videoHeight)
  );

  return { left, right, top, bottom };
}
