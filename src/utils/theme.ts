// 럭키상점에서 장착한 테마(단일 hex 색상)를 앱 전체 메인 배경, 상/하단 바, 패널 프레임 테두리에 파격적으로 반영하는 유틸리티

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
 * 장착한 테마 색상(hex, 예: '#06B6D4' 오로라, '#10B981' 네온 에메랄드, '#166534' 포레스트, '#DC2626' 크림슨 등)을
 * 앱 전체 메인 배경, 상단 헤더, 하단 네비게이션 바, 각 패널 프레임 테두리 선에 깊이감 있게 반영한다.
 */
export function applyThemeColor(hex?: string): void {
  const root = document.documentElement;

  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) {
    root.style.removeProperty('--theme-bg-main');
    root.style.removeProperty('--theme-bg-surface');
    root.style.removeProperty('--theme-bg-elevated');
    root.style.removeProperty('--theme-header');
    root.style.removeProperty('--theme-border');
    root.style.removeProperty('--theme-accent');
    return;
  }

  const [h, s] = hexToHsl(hex);

  // 차콜 그레이, 클래식 모노 같은 무채색 테마는 원래 채도가 아주 낮다(슬레이트 계열이라 미세한
  // 파란기가 있는 정도). 아래에서 채도를 강제로 끌어올리면 그 미세한 색조가 도드라져서
  // "회색"이 아니라 선명한 파란/보라로 보이는 문제가 있었다. 원래 채도가 낮은 무채색 테마는
  // 그대로 저채도를 유지하고, 색이 뚜렷한 테마만 채도를 부스트한다.
  const isMonochrome = s < 35;

  // 높은 채도를 확보하여 테마 고유 색상 톤이 또렷하게 살아나도록 함
  // (기존 70/85/90% 바닥값이 특히 테두리·액센트에서 너무 쨍하고 눈이 아프다는 피드백을 받아 완화함)
  const bgSat = isMonochrome ? s : Math.max(s, 55);

  // 1. 메인 앱 배경: 딥 톤 (7% 명도)
  const [mR, mG, mB] = hslToRgb(h, bgSat, 7);

  // 2. 패널 서피스 & 하단 네비게이션: 풍부한 테마 딥 톤 (12% 명도)
  const [sR, sG, sB] = hslToRgb(h, bgSat, 12);

  // 3. 카드/엘리베이티드 서피스: (17% 명도)
  const [eR, eG, eB] = hslToRgb(h, bgSat, 17);

  // 4. 상단 헤더: 진하고 그윽한 헤더 톤 (15% 명도)
  const [hR, hG, hB] = hslToRgb(h, bgSat, 15);

  // 5. 프레임 테두리 선: 테마 포인트 색상 (40% 명도)
  const [bR, bG, bB] = hslToRgb(h, isMonochrome ? s : Math.max(s, 65), 40);

  // 6. 테마 대표 액센트 색상 (52% 명도)
  const [aR, aG, aB] = hslToRgb(h, isMonochrome ? s : Math.max(s, 70), 52);

  root.style.setProperty('--theme-bg-main', `${mR} ${mG} ${mB}`);
  root.style.setProperty('--theme-bg-surface', `${sR} ${sG} ${sB}`);
  root.style.setProperty('--theme-bg-elevated', `${eR} ${eG} ${eB}`);
  root.style.setProperty('--theme-header', `${hR} ${hG} ${hB}`);
  root.style.setProperty('--theme-border', `${bR} ${bG} ${bB}`);
  root.style.setProperty('--theme-accent', `${aR} ${aG} ${aB}`);
}
