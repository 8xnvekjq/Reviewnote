import type { ReactNode } from 'react';

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
      {/* pb-24(96px): 실기기 실측 결과 실제 하단 네비 높이(≈58px + safe-area-inset-bottom)보다
          여유가 컸던 기존 pb-28(112px)을 축소. safe-area 자체는 BottomNavigation의
          .bottom-nav-safe가 별도로 보장하므로 터치 안전성에는 영향 없음. */}
      <main className="flex-1 overflow-y-auto px-4 py-6 pb-24">
        {children}
      </main>
      {bottomNav}
    </>
  );
}
