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
      <main className="flex-1 overflow-y-auto px-4 py-6 pb-28">
        {children}
      </main>
      {bottomNav}
    </>
  );
}
