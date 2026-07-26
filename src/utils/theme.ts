// 럭키상점에서 장착한 테마(단일 hex 색상)를 앱 전체의 indigo 계열 Tailwind 클래스에
// 실시간으로 반영하기 위한 유틸리티.
//
// 앱 전체에서 "브랜드 강조색"으로 Tailwind 기본 indigo-* 클래스를 광범위하게 사용하고 있어서
// (bg-indigo-600, text-indigo-400, border-indigo-500/20 등, 14개 파일 142곳),
// tailwind.config.js에서 indigo 팔레트를 CSS 커스텀 프로퍼티 기반으로 재정의해두면
// 컴포넌트 코드를 전혀 건드리지 않고도 이 함수 하나로 전체 앱 배색을 즉시 바꿀 수 있다.

// Tailwind 기본 indigo 팔레트의 실제 밝기(Lightness, %) — 테마 색상이 바뀌어도
// 이 밝기 단계는 그대로 유지해서 명도 대비(가독성)가 항상 원본과 동일하게 보장되도록 한다.
const LIGHTNESS_RAMP: Record<string, number> = {
  '50': 96.7,
  '100': 93.9,
  '200': 88.8,
  '300': 81.8,
  '400': 73.9,
  '500': 66.7,
  '600': 58.6,
  '700': 50.6,
  '800': 41.4,
  '900': 34.3,
  '950': 20
};

const SHADE_KEYS = Object.keys(LIGHTNESS_RAMP);

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
 * 장착한 테마 색상(hex, 예: '#8B5CF6')을 앱 전체 indigo 팔레트 및 메인 배경/상하단 네비바에 즉시 반영한다.
 * hex가 없으면(장착 해제) 커스텀 프로퍼티를 제거해서 index.css의 기본(남색) 값으로 되돌아간다.
 */
export function applyThemeColor(hex?: string): void {
  const root = document.documentElement;

  if (!hex) {
    SHADE_KEYS.forEach(key => root.style.removeProperty(`--color-indigo-${key}`));
    root.style.removeProperty('--theme-bg-main');
    root.style.removeProperty('--theme-bg-surface');
    root.style.removeProperty('--theme-bg-elevated');
    root.style.removeProperty('--theme-border');
    return;
  }

  const [h, s] = hexToHsl(hex);
  
  // 1) Indigo 팔레트 (강조색) 반영
  SHADE_KEYS.forEach(key => {
    const [r, g, b] = hslToRgb(h, s, LIGHTNESS_RAMP[key]);
    root.style.setProperty(`--color-indigo-${key}`, `${r} ${g} ${b}`);
  });

  // 2) 앱 전체 메인 프레임, 상하단 네비게이션 바 딥 틴트 배경색 반영
  const bgSat = Math.min(s, 60);
  const [mR, mG, mB] = hslToRgb(h, bgSat, 4.5);
  const [sR, sG, sB] = hslToRgb(h, bgSat, 8.5);
  const [eR, eG, eB] = hslToRgb(h, bgSat, 13);
  const [bR, bG, bB] = hslToRgb(h, bgSat, 18);

  root.style.setProperty('--theme-bg-main', `${mR} ${mG} ${mB}`);
  root.style.setProperty('--theme-bg-surface', `${sR} ${sG} ${sB}`);
  root.style.setProperty('--theme-bg-elevated', `${eR} ${eG} ${eB}`);
  root.style.setProperty('--theme-border', `${bR} ${bG} ${bB}`);
}
