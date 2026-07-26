// 럭키상점에서 장착한 테마(단일 hex 색상)를 앱 전체 메인 배경 및 각 패널 프레임에 반영하는 유틸리티

function hexToHsl(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16) / 255;
  const g = parseInt(normalized.slice(2, 4), 16) / 255;
  const b = parseInt(normalized.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return [h * 360, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = h / 360;
  const sat = s / 100;
  const light = l / 100;

  if (sat === 0) {
    const v = Math.round(light * 255);
    return [v, v, v];
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
  const p = 2 * light - q;
  const r = hue2rgb(p, q, hue + 1 / 3);
  const g = hue2rgb(p, q, hue);
  const b = hue2rgb(p, q, hue - 1 / 3);

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * 장착한 테마 색상(hex, 예: '#8B5CF6')을 앱 전체 메인 배경, 패널 배경, 프레임 테두리 선에 즉시 반영한다.
 * 패널 내부의 아이콘이나 텍스트 색상은 건드리지 않고 오직 배경과 프레임 선만 테마와 연동된다.
 */
export function applyThemeColor(hex?: string): void {
  const root = document.documentElement;

  if (!hex) {
    root.style.removeProperty('--theme-bg-main');
    root.style.removeProperty('--theme-bg-surface');
    root.style.removeProperty('--theme-bg-elevated');
    root.style.removeProperty('--theme-border');
    return;
  }

  const [h, s] = hexToHsl(hex);
  const bgSat = Math.min(s, 60);

  // 메인 배경(4.5%), 패널 배경(8.5%), 카드 배경(13%), 프레임 테두리 선(22%)
  const [mR, mG, mB] = hslToRgb(h, bgSat, 4.5);
  const [sR, sG, sB] = hslToRgb(h, bgSat, 8.5);
  const [eR, eG, eB] = hslToRgb(h, bgSat, 13);
  const [bR, bG, bB] = hslToRgb(h, bgSat, 22);

  root.style.setProperty('--theme-bg-main', `${mR} ${mG} ${mB}`);
  root.style.setProperty('--theme-bg-surface', `${sR} ${sG} ${sB}`);
  root.style.setProperty('--theme-bg-elevated', `${eR} ${eG} ${eB}`);
  root.style.setProperty('--theme-border', `${bR} ${bG} ${bB}`);
}
