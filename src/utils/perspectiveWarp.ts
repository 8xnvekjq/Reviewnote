export interface QuadPoint {
  x: number;
  y: number;
}

export interface Quad {
  tl: QuadPoint;
  tr: QuadPoint;
  br: QuadPoint;
  bl: QuadPoint;
}

/**
 * 8x8 연립방정식을 가우스 소거법으로 풀어 [a,b,c,d,e,f,g,h] 8개 계수를 구한다.
 * (사영변환 3x3 행렬에서 마지막 성분은 1로 고정하고 나머지 8개만 미지수로 둔 표준 기법)
 */
function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // 부분 피벗팅: 절댓값이 가장 큰 행을 위로 올려 수치적 안정성 확보
    let pivotRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivotRow][col])) pivotRow = row;
    }
    [M[col], M[pivotRow]] = [M[pivotRow], M[col]];

    const pivot = M[col][col] || 1e-10;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col] / pivot;
      for (let k = col; k <= n; k++) {
        M[row][k] -= factor * M[col][k];
      }
    }
  }

  return M.map((row, i) => row[n] / (row[i] || 1e-10));
}

/**
 * 4개의 점 대응(from[i] -> to[i])을 만족하는 사영변환(호모그래피) 계수 8개를 구한다.
 * X = (a*x + b*y + c) / (g*x + h*y + 1), Y = (d*x + e*y + f) / (g*x + h*y + 1)
 */
function computeProjectiveCoeffs(from: QuadPoint[], to: QuadPoint[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];

  from.forEach((p, i) => {
    const { x, y } = p;
    const { x: X, y: Y } = to[i];
    A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]);
    b.push(X);
    A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]);
    b.push(Y);
  });

  return solveLinearSystem(A, b);
}

/**
 * 주어진 이미지에서 기울어진 사각형(quad, 소스 이미지의 실제 픽셀 좌표 기준)을
 * 반듯한 직사각형으로 펴서(원근 보정) data URL로 반환한다.
 * 목적지 크기는 quad의 위/아래 변, 좌/우 변 평균 길이로부터 자동 산출하되,
 * 큰 사진에서 렌더링이 오래 걸리지 않도록 최대 변 길이를 제한한다.
 */
export async function warpQuadToRect(
  sourceImage: HTMLImageElement,
  quad: Quad,
  maxDimension = 1400
): Promise<string> {
  const dist = (a: QuadPoint, b: QuadPoint) => Math.hypot(a.x - b.x, a.y - b.y);

  let destWidth = Math.round((dist(quad.tl, quad.tr) + dist(quad.bl, quad.br)) / 2);
  let destHeight = Math.round((dist(quad.tl, quad.bl) + dist(quad.tr, quad.br)) / 2);
  destWidth = Math.max(50, destWidth);
  destHeight = Math.max(50, destHeight);

  const scale = Math.min(1, maxDimension / Math.max(destWidth, destHeight));
  destWidth = Math.round(destWidth * scale);
  destHeight = Math.round(destHeight * scale);

  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = sourceImage.naturalWidth;
  sourceCanvas.height = sourceImage.naturalHeight;
  const sourceCtx = sourceCanvas.getContext('2d');
  if (!sourceCtx) throw new Error('캔버스 컨텍스트를 생성할 수 없습니다.');
  sourceCtx.drawImage(sourceImage, 0, 0);
  const sourceData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

  const destRectCorners: QuadPoint[] = [
    { x: 0, y: 0 },
    { x: destWidth, y: 0 },
    { x: destWidth, y: destHeight },
    { x: 0, y: destHeight },
  ];
  const sourceQuadCorners: QuadPoint[] = [quad.tl, quad.tr, quad.br, quad.bl];

  // 목적지(반듯한 직사각형) 좌표를 넣으면 소스 이미지 상의 좌표가 나오는 역방향 변환
  // (각 목적지 픽셀마다 원본에서 어디를 샘플링할지 알아야 하므로 이 방향이 필요함)
  const [a, bb, c, d, e, f, g, h] = computeProjectiveCoeffs(destRectCorners, sourceQuadCorners);

  const destCanvas = document.createElement('canvas');
  destCanvas.width = destWidth;
  destCanvas.height = destHeight;
  const destCtx = destCanvas.getContext('2d');
  if (!destCtx) throw new Error('캔버스 컨텍스트를 생성할 수 없습니다.');
  const destData = destCtx.createImageData(destWidth, destHeight);

  const { data: srcPixels, width: srcW, height: srcH } = sourceData;
  const dstPixels = destData.data;

  const sampleBilinear = (sx: number, sy: number): [number, number, number, number] => {
    const x0 = Math.floor(sx);
    const y0 = Math.floor(sy);
    const x1 = Math.min(x0 + 1, srcW - 1);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const fx = sx - x0;
    const fy = sy - y0;

    const idx = (xx: number, yy: number) => (yy * srcW + xx) * 4;
    const i00 = idx(Math.max(0, Math.min(x0, srcW - 1)), Math.max(0, Math.min(y0, srcH - 1)));
    const i10 = idx(x1, Math.max(0, Math.min(y0, srcH - 1)));
    const i01 = idx(Math.max(0, Math.min(x0, srcW - 1)), y1);
    const i11 = idx(x1, y1);

    const result: [number, number, number, number] = [0, 0, 0, 0];
    for (let ch = 0; ch < 4; ch++) {
      const top = srcPixels[i00 + ch] * (1 - fx) + srcPixels[i10 + ch] * fx;
      const bottom = srcPixels[i01 + ch] * (1 - fx) + srcPixels[i11 + ch] * fx;
      result[ch] = top * (1 - fy) + bottom * fy;
    }
    return result;
  };

  for (let dy = 0; dy < destHeight; dy++) {
    for (let dx = 0; dx < destWidth; dx++) {
      const denom = g * dx + h * dy + 1 || 1e-10;
      const sx = (a * dx + bb * dy + c) / denom;
      const sy = (d * dx + e * dy + f) / denom;

      const outIdx = (dy * destWidth + dx) * 4;
      if (sx < 0 || sy < 0 || sx > srcW - 1 || sy > srcH - 1) {
        dstPixels[outIdx + 3] = 0; // 원본 범위 밖이면 투명 처리
        continue;
      }
      const [r, gCh, bCh, aCh] = sampleBilinear(sx, sy);
      dstPixels[outIdx] = r;
      dstPixels[outIdx + 1] = gCh;
      dstPixels[outIdx + 2] = bCh;
      dstPixels[outIdx + 3] = aCh;
    }
  }

  destCtx.putImageData(destData, 0, 0);
  return destCanvas.toDataURL('image/jpeg', 0.9);
}
