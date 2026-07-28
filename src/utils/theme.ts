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
 *
 * accentHex를 넘기면(UR 등급 "레전드" 테마 전용) 완전히 다른 배색 전략을 쓴다: 배경은 거의
 * 블랙에 가깝게 죽이고, 그 대신 테두리는 테마 고유색(예: 골드)을 눈부시게 밝혀서 살리고,
 * 액센트는 accentHex(예: 은하수 보라)로 대비되는 스파클 포인트를 준다 — 실제 가챠 게임들이
 * 레전더리 등급을 "화려한 배경색"이 아니라 "검은 캔버스 + 찬란한 금테 + 보조 스파클색"으로
 * 표현하는 것과 같은 원리. 배경을 통째로 물들이면 오히려 탁하고 저렴해 보인다는 피드백을 받고
 * 리워크함. accentHex가 없으면 기존처럼 테두리·액센트도 base hex를 그대로 쓴다.
 */
export function applyThemeColor(hex?: string, accentHex?: string): void {
  const root = document.documentElement;

  if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) {
    root.style.removeProperty('--theme-bg-main');
    root.style.removeProperty('--theme-bg-surface');
    root.style.removeProperty('--theme-bg-elevated');
    root.style.removeProperty('--theme-header');
    root.style.removeProperty('--theme-border');
    root.style.removeProperty('--theme-accent');
    root.style.removeProperty('--theme-glow-opacity');
    return;
  }

  const [h, s] = hexToHsl(hex);
  const isLegendary = !!(accentHex && accentHex.startsWith('#'));

  // 차콜 그레이, 클래식 모노 같은 무채색 테마는 원래 채도가 아주 낮다(슬레이트 계열이라 미세한
  // 파란기가 있는 정도). 아래에서 채도를 강제로 끌어올리면 그 미세한 색조가 도드라져서
  // "회색"이 아니라 선명한 파란/보라로 보이는 문제가 있었다. 원래 채도가 낮은 무채색 테마는
  // 그대로 저채도를 유지하고, 색이 뚜렷한 테마만 채도를 부스트한다.
  const isMonochrome = s < 35;

  // 배경 채도/명도: 일반 테마는 색감 있게(기존 70% 바닥이 너무 쨍해서 55%로 완화),
  // 레전드(UR) 테마는 반대로 배경을 거의 블랙으로 죽여서 "프리미엄 검은 캔버스" 느낌을 내고
  // 화려함은 전부 테두리·액센트로 몰아준다.
  const bgSat = isMonochrome ? s : (isLegendary ? Math.min(s, 25) : Math.max(s, 55));
  const bgLightMain = isLegendary ? 4 : 7;
  const bgLightSurface = isLegendary ? 8 : 12;
  const bgLightElevated = isLegendary ? 12 : 17;
  const bgLightHeader = isLegendary ? 10 : 15;

  // 1. 메인 앱 배경
  const [mR, mG, mB] = hslToRgb(h, bgSat, bgLightMain);

  // 2. 패널 서피스 & 하단 네비게이션
  const [sR, sG, sB] = hslToRgb(h, bgSat, bgLightSurface);

  // 3. 카드/엘리베이티드 서피스
  const [eR, eG, eB] = hslToRgb(h, bgSat, bgLightElevated);

  // 4. 상단 헤더
  const [hR, hG, hB] = hslToRgb(h, bgSat, bgLightHeader);

  // 5. 프레임 테두리 선: 테마 고유색(base hue) 그대로 — 레전드는 훨씬 밝고 쨍하게 살려서
  // 검은 배경 위에 눈부시게 빛나는 금테/핑크테 느낌을 낸다.
  const borderSat = isMonochrome ? s : Math.max(s, isLegendary ? 90 : 65);
  const [bR, bG, bB] = hslToRgb(h, borderSat, isLegendary ? 55 : 40);

  // 6. 테마 대표 액센트 색상: accentHex가 있으면(레전드 전용) 그 보조색(은하수 보라 등)으로
  // 대비되는 스파클 포인트를 주고, 없으면 기존처럼 base hue를 그대로 쓴다.
  const [ah, as] = isLegendary ? hexToHsl(accentHex!) : [h, s];
  const accentIsMonochrome = as < 35;
  const accentSat = accentIsMonochrome ? as : Math.max(as, isLegendary ? 90 : 70);
  const [aR, aG, aB] = hslToRgb(ah, accentSat, isLegendary ? 62 : 52);

  root.style.setProperty('--theme-bg-main', `${mR} ${mG} ${mB}`);
  root.style.setProperty('--theme-bg-surface', `${sR} ${sG} ${sB}`);
  root.style.setProperty('--theme-bg-elevated', `${eR} ${eG} ${eB}`);
  root.style.setProperty('--theme-header', `${hR} ${hG} ${hB}`);
  root.style.setProperty('--theme-border', `${bR} ${bG} ${bB}`);
  root.style.setProperty('--theme-accent', `${aR} ${aG} ${aB}`);

  // 레전드(UR) 테마만 글로우를 더 진하게 — 일반 테마는 예전에 "눈 아프다"는 피드백을 받았던
  // 값(0.18)을 그대로 유지한다.
  root.style.setProperty('--theme-glow-opacity', isLegendary ? '0.4' : '0.18');
}
