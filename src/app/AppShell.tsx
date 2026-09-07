import { useState, type ReactNode } from 'react';

// The whole diagnostic implementation is eliminated by Vite in production.
const BottomNavDiagnostic = import.meta.env.DEV ? function BottomNavDiagnostic() {
  const [report, setReport] = useState('');
  const measure = () => {
    const main = document.querySelector<HTMLElement>('main[data-bottom-nav-diagnostic]');
    const nav = document.querySelector<HTMLElement>('nav.bottom-nav-safe');
    if (!main || !nav) return;
    const rect = (element: Element) => element.getBoundingClientRect().toJSON();
    const box = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return {
        rect: rect(element), clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight, scrollTop: element.scrollTop,
        position: style.position, height: style.height, minHeight: style.minHeight,
        paddingTop: style.paddingTop, paddingBottom: style.paddingBottom,
        marginTop: style.marginTop, marginBottom: style.marginBottom,
        borderTop: style.borderTopWidth, borderBottom: style.borderBottomWidth,
        overflowY: style.overflowY, transform: style.transform,
      };
    };
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;width:0;height:0;padding:0;padding-bottom:env(safe-area-inset-bottom, 0px);border:0;';
    document.body.appendChild(probe);
    const safeAreaBottom = probe.getBoundingClientRect().height;
    probe.remove();
    const style = getComputedStyle(nav);
    const navRect = nav.getBoundingClientRect();
    const viewport = window.visualViewport;
    const ancestors = [];
    for (let element = main.parentElement; element; element = element.parentElement) {
      ancestors.push({ element: element.id || element.tagName, ...box(element) });
    }
    const data = {
      capturedAt: new Date().toISOString(), units: 'CSS px; rects include transforms',
      viewport: {
        innerHeight: window.innerHeight, innerWidth: window.innerWidth,
        visualHeight: viewport?.height ?? null, visualOffsetTop: viewport?.offsetTop ?? null,
        visualScale: viewport?.scale ?? null,
        innerMinusVisualHeight: viewport ? window.innerHeight - viewport.height : null,
        displayModes: Object.fromEntries(['browser', 'standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay']
          .map(mode => [mode, window.matchMedia(`(display-mode: ${mode})`).matches])),
        navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone ?? null,
      },
      safeAreaBottom,
      rootFontSize: getComputedStyle(document.documentElement).fontSize,
      main: box(main), ancestors,
      bottomNavigation: nav.parentElement ? box(nav.parentElement) : null,
      nav: box(nav),
      navContent: {
        heightWithoutSafeArea: navRect.height - safeAreaBottom,
        layoutContentHeight: navRect.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
          - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth),
        paddingBottomWithoutSafeArea: parseFloat(style.paddingBottom) - safeAreaBottom,
        // offsetHeight excludes scale/translate; rect shows the painted button bounds.
        buttons: Array.from(nav.children).filter((el): el is HTMLElement => el instanceof HTMLElement)
          .map((el, index) => ({ index, layoutHeight: el.offsetHeight, ...box(el),
            iconAndLabelRects: Array.from(el.children).map(rect) })),
      },
      gaps: {
        innerBottomMinusNavBottom: window.innerHeight - navRect.bottom,
        visualBottomMinusNavBottom: viewport ? viewport.offsetTop + viewport.height - navRect.bottom : null,
      },
      floating: nav.previousElementSibling instanceof HTMLElement ? {
        container: box(nav.previousElementSibling),
        badges: Array.from(nav.previousElementSibling.children)
          .filter((el): el is HTMLElement => el instanceof HTMLElement)
          .map((el, index) => ({ index, ...box(el), button: el.firstElementChild ? rect(el.firstElementChild) : null })),
      } : null,
    };
    setReport(JSON.stringify(data, null, 2));
    console.table({ innerHeight: window.innerHeight, visualHeight: viewport?.height,
      safeAreaBottom, navHeight: navRect.height, mainHeight: main.getBoundingClientRect().height,
      bodyHeight: document.body.getBoundingClientRect().height,
      rootHeight: document.getElementById('root')?.getBoundingClientRect().height,
      standalone: data.viewport.displayModes.standalone, navigatorStandalone: data.viewport.navigatorStandalone });
    console.info('[bottom-nav-diagnostic]', data);
  };
  return (
    <aside style={{ position: 'fixed', top: '30%', right: 8, zIndex: 10000, maxWidth: '90vw',
      background: '#fff', color: '#111', padding: 8, font: '12px monospace', border: '1px solid #555' }}>
      <button type="button" onPointerDown={event => event.preventDefault()} onClick={measure}>하단 진단 측정 / 갱신</button>
      {report && <>
        <button type="button" onClick={() => setReport('')} style={{ marginLeft: 12 }}>닫기</button>
        <p>회전·스크롤·키보드 변경 후 갱신. JSON 선택 후 복사.</p>
        <textarea aria-label="하단 네비게이션 진단 JSON" readOnly value={report}
          style={{ display: 'block', width: 'min(360px, 80vw)', height: '30vh', color: '#111', background: '#fff', userSelect: 'text' }} />
      </>}
    </aside>
  );
} : null;

interface AppShellProps {
  header: ReactNode;
  bottomNav: ReactNode;
  children: ReactNode;
}

// Header / 콘텐츠 스크롤 영역(<main>) / BottomNavigation을 하나로 묶어 렌더하는 얇은 레이아웃
// 껍데기. 자체 wrapper DOM(div 등)을 만들지 않고 Fragment로 그대로 흘려보낸다 — App.tsx의
// 최상위 div가 지금처럼 유일한 실제 컨테이너로 남아야, src/index.css의 인쇄 스타일이 의존하는
// `#root > div > *` 구조 셀렉터가 깨지지 않는다.
export function AppShell({ header, bottomNav, children }: AppShellProps) {
  return (
    <>
      {header}
      {/* pb-24는 기존 값을 유지한다. 실제 네비 높이와 여백 원인은 DEV 진단으로 확인한다. */}
      <main {...(import.meta.env.DEV ? { 'data-bottom-nav-diagnostic': '' } : {})}
        className="flex-1 overflow-y-auto px-4 py-6 pb-24">
        {children}
      </main>
      {bottomNav}
      {import.meta.env.DEV && BottomNavDiagnostic && <BottomNavDiagnostic />}
    </>
  );
}
