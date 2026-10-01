// 전체메뉴 시트(섹션 묶음 + 최근 사용 2개) 검증용 standalone 마운트 — 네트워크 없음.
// ?user= 로 로그인 사용자, ?admin=1 로 관리자, ?pixel=0 으로 Pixel World 접근 끔.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import '../../src/styles/design-system.css';
import { BottomNavigation } from '../../src/components/BottomNavigation';
import type { ActiveTab } from '../../src/types';

const params = new URLSearchParams(location.search);
const user = params.get('user') || undefined;

function Harness() {
  const [tab, setTab] = useState<ActiveTab>('notes');
  return <div style={{ minHeight: '100dvh', background: 'var(--rn-bg)' }}>
    <p data-testid="active-tab" style={{ color: 'var(--rn-text)', padding: 16 }}>{tab}</p>
    <BottomNavigation
      activeTab={tab}
      setActiveTab={setTab}
      isAdmin={params.get('admin') === '1'}
      canAccessPixelWorld={params.get('pixel') !== '0'}
      currentUserId={user}
      onlineUsers={[]}
      dailyReviewCount={0}
      onStartReviewSession={() => {}}
      onOpenSlideList={() => { document.body.dataset.slides = 'opened'; }}
    />
  </div>;
}

createRoot(document.getElementById('root')!).render(<Harness />);
