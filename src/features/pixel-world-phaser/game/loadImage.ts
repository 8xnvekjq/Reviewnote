const images = new Map<string, Promise<HTMLImageElement>>();
/** 같은 URL은 한 번만 내려받아 디코드한다. 실패하면 캐시에서 빼서 다음에 다시 시도할 수 있게 한다. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  let pending = images.get(src);
  if (!pending) {
    pending = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`이미지를 불러오지 못했어요: ${src}`));
      image.src = src;
    });
    images.set(src, pending);
    pending.catch(() => images.delete(src));
  }
  return pending;
}

/** React로 그린 작은 SVG 그림(허수아비, 토마토 밭)을 같은 모양 그대로 이미지로 바꾼다. */
export function svgToImage(svg: SVGSVGElement, width: number, height: number): Promise<HTMLImageElement> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const markup = new XMLSerializer().serializeToString(clone);
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
}
