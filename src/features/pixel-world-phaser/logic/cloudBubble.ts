// 광장 말풍선: 네모 상자가 아니라 위아래가 몽글몽글한 구름 + 아래 작은 꼬리. 월드 1px = 1칸 도트 그림.
// 0 빈칸, 1 바탕, 2 테두리, 3 바탕 아래쪽 그늘. 글은 (CLOUD_PAD_X, CLOUD_PAD_Y)부터 textW×textH 안에 들어간다.
export const CLOUD_PAD_X = 5;
export const CLOUD_PAD_Y = 5;
export const CLOUD_TAIL = 3;
export interface CloudMask { width: number; height: number; bodyHeight: number; cells: Uint8Array }

export function cloudMask(textW: number, textH: number): CloudMask {
  const w = Math.max(6, Math.ceil(textW)), h = Math.max(4, Math.ceil(textH));
  const width = w + CLOUD_PAD_X * 2, body = h + CLOUD_PAD_Y * 2, height = body + CLOUD_TAIL;
  // 위·아래 가장자리를 따라 반지름 4의 몽글이를 고르게 늘어놓는다(양 끝은 모서리를 둥글게 덮는다).
  const count = Math.max(2, Math.round((width - 10) / 9) + 1);
  const bumps: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < count; i++) {
    const x = 5 + i * (width - 10) / (count - 1);
    bumps.push({ x, y: 5, r: 4 }, { x, y: body - 5, r: 4 });
  }
  // 옆면이 길면(두 줄) 가운데에도 작은 몽글이.
  if (body - 10 > 6) bumps.push({ x: 4, y: body / 2, r: 3 }, { x: width - 4, y: body / 2, r: 3 });
  const c = Math.round(width / 2);
  const tail = (x: number, y: number) => (y === body - 1 && x >= c - 3 && x < c + 2) || (y === body && x >= c - 2 && x < c + 1) || (y === body + 1 && x >= c - 2 && x < c);
  const fill = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    if (x >= 2 && x < width - 2 && y >= 5 && y < body - 5) return true;
    if (x >= 5 && x < width - 5 && y >= 3 && y < body - 3) return true;
    if (tail(x, y)) return true;
    return bumps.some(b => (x + .5 - b.x) ** 2 + (y + .5 - b.y) ** 2 <= b.r * b.r);
  };
  const cells = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (fill(x, y)) cells[y * width + x] = fill(x, y + 1) ? 1 : 3;
    else if (fill(x - 1, y) || fill(x + 1, y) || fill(x, y - 1) || fill(x, y + 1)) cells[y * width + x] = 2;
  }
  // 그늘(3)은 바로 아래가 테두리인 바탕 칸 — 테두리 칸 자체는 위에서 따로 채웠으니 아래가 2인지 다시 확인한다.
  for (let i = 0; i < cells.length; i++) if (cells[i] === 3 && cells[i + width] !== 2) cells[i] = 1;
  return { width, height, bodyHeight: body, cells };
}
