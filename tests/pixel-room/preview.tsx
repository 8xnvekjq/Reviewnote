// Local fixture using real menu, shell and lazy room; no network/account writes.
import { lazy, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import '../../src/styles/design-system.css';
import { AppShell } from '../../src/app/AppShell';
import { Screen } from '../../src/app/ScreenRouter';
import { LazyScreenBoundary } from '../../src/app/LazyScreenBoundary';
import { BottomNavigation } from '../../src/components/BottomNavigation';
import type { ActiveTab } from '../../src/types';
import { GACHA_ITEMS, getTitleBadgeStyle } from '../../src/utils/gachaCatalog';
import { getRandomCheer } from '../../src/utils/aiVoiceCheers';
const PixelRoom = lazy(() => import('../../src/features/pixel-room/PixelRoom'));

const TITLE_OPTIONS = GACHA_ITEMS.filter(g => g.category === 'TITLE').map(g => g.effectValue!).filter(Boolean);
const THEME_OPTIONS = GACHA_ITEMS.filter(g => g.category === 'THEME');
const VOICE_OPTIONS = GACHA_ITEMS.filter(g => g.category === 'AI_VOICE').map(g => g.effectValue!).filter(Boolean);

function Preview() {
  const params = new URLSearchParams(location.search);
  const [user, setUser] = useState(params.get('user') || 'student-A');
  const [tab, setTab] = useState<ActiveTab>((params.get('tab') as ActiveTab) || 'notes');
  // 장착 칭호/테마/말투 — 실 계정 데이터 대신, 프로덕션과 동일하게 App.tsx가 계산해 넘기는
  // prop 계약(title/titleBadgeStyle/titleBadgeIcon/themePrimary/themeAccent/onSpeak)을 그대로
  // 검증하기 위한 로컬 선택기. 이 fixture는 프로덕션 번들에 포함되지 않으므로 gachaCatalog를
  // 자유롭게 import해도 된다.
  const [title, setTitle] = useState(params.get('title') || '');
  const [theme, setTheme] = useState(params.get('theme') || '');
  const [voice, setVoice] = useState(params.get('voice') || '');
  const titleBadge = useMemo(() => (title ? getTitleBadgeStyle(title) : null), [title]);
  const themeItem = useMemo(() => THEME_OPTIONS.find(t => t.effectValue === theme), [theme]);
  return <div className="rn-app h-full flex flex-col bg-app-main text-slate-100"><AppShell
    header={<header style={{ padding: '12px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <strong>Reviewnote</strong>
      <select aria-label="검증 계정" value={user} onChange={e => setUser(e.target.value)} style={{ maxWidth: 120, background: '#283246' }}>{['student-A', 'student-B', 'admin', 'test', ''].map(id => <option key={id} value={id}>{id || '로그아웃'}</option>)}</select>
      <select aria-label="장착 칭호" value={title} onChange={e => setTitle(e.target.value)} style={{ maxWidth: 130, background: '#283246' }}><option value="">칭호 없음</option>{TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}</select>
      <select aria-label="장착 테마" value={theme} onChange={e => setTheme(e.target.value)} style={{ maxWidth: 110, background: '#283246' }}><option value="">테마 없음</option>{THEME_OPTIONS.map(t => <option key={t.id} value={t.effectValue}>{t.name}</option>)}</select>
      <select aria-label="장착 말투" value={voice} onChange={e => setVoice(e.target.value)} style={{ maxWidth: 110, background: '#283246' }}><option value="">기본 말투</option>{VOICE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}</select>
    </header>}
    bottomNav={<BottomNavigation activeTab={tab} setActiveTab={setTab} currentUserId={user} isAdmin={user === 'admin'} onlineUsers={[]} />}>
    <Screen when={tab === 'pixelRoom'} className="pr-screen-fill"><LazyScreenBoundary><PixelRoom
      userId={user} displayName={user} onExit={() => setTab('notes')}
      title={title || undefined}
      titleBadgeStyle={titleBadge?.style}
      titleBadgeIcon={titleBadge?.icon}
      themePrimary={themeItem?.effectValue}
      themeAccent={themeItem?.themeAccentValue || themeItem?.effectValue}
      onSpeak={() => getRandomCheer(voice || undefined)}
    /></LazyScreenBoundary></Screen>
    <Screen when={tab !== 'pixelRoom'}><h1 className="rn-title">오답노트</h1><p>전체메뉴에서 Pixel Room에 들어오세요.</p></Screen>
  </AppShell></div>;
}
createRoot(document.getElementById('root')!).render(<Preview />);
