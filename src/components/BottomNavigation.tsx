import React, { useState } from 'react';
import type { ActiveTab } from '../types';
import { AppIcon, type AppIconName } from './ui/AppIcon';
import { Sheet } from './ui/Sheet';
import { canViewOwnExamPrep } from '../utils/examPrepAccess';
import { loadMenuRecent, pickVisibleMenuRecent, recordMenuRecent } from './menuRecent';

interface BottomNavigationProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isAdmin?: boolean;
  canAccessPixelWorld?: boolean;
  currentUserId?: string;
  onlineUsers: { id: string; display_name: string; nickname?: string; username: string }[];
  onStartReviewSession?: () => void;
  onOpenSlideList?: () => void;
  dailyReviewCount?: number;
}
// "숨긴 카드" 행은 다른 메뉴 행과 같은 구조/스타일(AppIcon + 제목 + 설명)을 그대로 쓰고, 학생들이
// 익숙해하던 원숭이(🙈)만 제목 텍스트 옆에 덧붙인다 — 아이콘 슬롯 자체를 이모지로 바꾸지 않는다.
type MenuEntry = { tab: ActiveTab; label: string; description: string; icon: AppIconName; emoji?: string };
const statsMenu: MenuEntry = { tab: 'stats', label: '나의 학습 현황', description: '복습 기록과 취약 단원', icon: 'chart' };
const completedMenu: MenuEntry = { tab: 'completed', label: '복습완료 보관함', description: '세 번 익힌 문제와 인쇄', icon: 'check' };
const scaffoldingMenu: MenuEntry = { tab: 'scaffolding', label: '선생님 풀이 힌트', description: '막힌 문제를 함께 풀어봐요', icon: 'book' };
const guideMenu: MenuEntry = { tab: 'guide', label: '이용안내', description: '오답노트와 럭키상점 사용법', icon: 'help' };
const hiddenMenu: MenuEntry = { tab: 'hidden', label: '숨긴 카드', description: '제외한 문제 확인과 다시 꺼내기', icon: 'eye', emoji: '🙈' };
const menus: MenuEntry[] = [statsMenu, completedMenu, scaffoldingMenu, guideMenu, hiddenMenu];
const examPracticeMenu: MenuEntry = { tab: 'examPractice', label: '📝 기출문제 풀이', description: '평가원 모의고사를 실전처럼 풀고 OMR 결과 보기', icon: 'book' };
const pixelRoomMenu: MenuEntry = { tab: 'pixelRoom', label: '🎮 Pixel Room', description: '내 캐릭터와 작은 방 꾸미기', icon: 'user' };
// 시트 안의 한 행. key는 "최근 사용" 기록용 고유 키(탭이 아닌 수업자료는 'slides').
type SheetItem = { key: string; label: string; description: string; icon: AppIconName; current: boolean; onSelect: () => void };
type SheetSection = { title: string; items: SheetItem[] };
const MenuRow: React.FC<{ item: SheetItem }> = ({ item }) => <button type="button" className="rn-menu-row" aria-current={item.current ? 'page' : undefined} onClick={item.onSelect}><AppIcon name={item.icon} /><span><strong>{item.label}</strong><small>{item.description}</small></span><AppIcon name="arrow" width={16} /></button>;
const RecentCard: React.FC<{ item: SheetItem }> = ({ item }) => <button type="button" className="rn-menu-recent-card" aria-current={item.current ? 'page' : undefined} onClick={item.onSelect}><AppIcon name={item.icon} /><strong>{item.label}</strong></button>;
// 관리자는 학생별 전체 리포트, 그 외 로그인한 모든 학생은 본인 리포트만 — 같은 tab('examPrep')
// 으로 들어가지만 라벨/설명만 역할에 따라 다르게 보여준다(로그아웃 상태면 메뉴 자체가 없음).
const examPrepMenuAdmin: MenuEntry =
  { tab: 'examPrep', label: '시험대비 분석', description: '학생별 취약 단원과 수업 방향', icon: 'chart' };
const examPrepMenuStudent: MenuEntry =
  { tab: 'examPrep', label: '나의 시험대비 분석', description: '내 취약 단원과 시험 전 우선순위', icon: 'chart' };
// 복습체크도 examPrep과 같은 패턴: 같은 tab('reviewCheck')으로 들어가지만 어드민은 채점/학생별
// 시험 관리 화면(ReviewCheckAdminScreen)으로, 학생은 본인 셀프 테스트 화면(ReviewCheckScreen)으로
// 라우팅된다(App.tsx). primary nav가 아니라 전체메뉴 안에만 넣는다(요청 사항).
const reviewCheckMenuAdmin: MenuEntry =
  { tab: 'reviewCheck', label: '복습체크 관리', description: '채점하기 · 학생별 시험 관리', icon: 'check' };
const reviewCheckMenuStudent: MenuEntry =
  { tab: 'reviewCheck', label: '복습체크', description: '복습 완료 문제 다시 풀어보고 채점받기', icon: 'check' };
export const BottomNavigation: React.FC<BottomNavigationProps> = ({ activeTab, setActiveTab, isAdmin, canAccessPixelWorld, currentUserId, onOpenSlideList }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const select = (tab: ActiveTab) => { setActiveTab(tab); setMenuOpen(false); };
  const openMenu = () => { setRecent(loadMenuRecent(currentUserId)); setMenuOpen(true); };
  // 전체메뉴 시트 안에서 고른 항목만 "최근 사용"에 기록한다(하단 탭바 4개는 기록하지 않음).
  const remember = (key: string) => { setRecent(recordMenuRecent(currentUserId, key)); };
  const examPrepMenu = isAdmin ? examPrepMenuAdmin : canViewOwnExamPrep(currentUserId) ? examPrepMenuStudent : null;
  const reviewCheckMenu = isAdmin ? reviewCheckMenuAdmin : currentUserId ? reviewCheckMenuStudent : null;
  const tabItem = (entry: MenuEntry): SheetItem => ({ key: entry.tab, label: entry.emoji ? `${entry.label} ${entry.emoji}` : entry.label, description: entry.description, icon: entry.icon, current: activeTab === entry.tab, onSelect: () => { remember(entry.tab); select(entry.tab); } });
  const slidesItem: SheetItem | null = onOpenSlideList ? { key: 'slides', label: '수업자료', description: '선생님이 준비한 교안 슬라이드', icon: 'book', current: false, onSelect: () => { remember('slides'); setMenuOpen(false); onOpenSlideList(); } } : null;
  // 표시 조건은 기존 그대로: 기출문제 풀이는 로그인 시, Pixel Room은 로그인 + Pixel World 접근 시(전체 공개).
  const sections: SheetSection[] = [
    { title: '공부하기', items: [currentUserId ? tabItem(examPracticeMenu) : null, reviewCheckMenu && tabItem(reviewCheckMenu), tabItem(scaffoldingMenu)].filter((item): item is SheetItem => !!item) },
    { title: '내 기록', items: [tabItem(statsMenu), examPrepMenu && tabItem(examPrepMenu), tabItem(completedMenu), tabItem(hiddenMenu)].filter((item): item is SheetItem => !!item) },
    { title: '기타', items: [slidesItem, currentUserId && canAccessPixelWorld ? tabItem(pixelRoomMenu) : null, tabItem(guideMenu)].filter((item): item is SheetItem => !!item) },
  ].filter(section => section.items.length > 0);
  const visibleItems = sections.flatMap(section => section.items);
  const recentItems = currentUserId ? pickVisibleMenuRecent(recent, visibleItems.map(item => item.key)).map(key => visibleItems.find(item => item.key === key)).filter((item): item is SheetItem => !!item) : [];
  const tabs: { tab: ActiveTab; label: string; icon: AppIconName }[] = [
    { tab: isAdmin ? 'admin' : 'activity', label: isAdmin ? '관리자' : '최근활동', icon: isAdmin ? 'chart' : 'activity' },
    { tab: 'notes', label: '오답노트', icon: 'notes' },
    { tab: 'camera', label: '문제 등록', icon: 'camera' },
    { tab: 'store', label: '럭키상점', icon: 'gift' },
  ];
  // 일일복습 진입 UI(오늘의 복습/N of 5 pill)는 이번 라운드에서 하단바에서 완전히 제거한다 —
  // review 기능/데이터/로직 자체는 그대로(onStartReviewSession/dailyReviewCount prop도
  // 인터페이스에 남겨둠, 다른 진입점에서 재사용 가능). Review는 여전히 primary nav로 올리지 않음.
  return <div className="rn-dock select-none">
    <div className="rn-dock-inner">
      <nav className="rn-bottom-nav bottom-nav-safe" aria-label="주요 메뉴">
        {tabs.map(item => <button type="button" key={item.tab} className={`rn-nav-item ${item.tab === 'camera' ? 'rn-nav-camera' : ''}`} aria-current={activeTab === item.tab ? 'page' : undefined} onClick={() => select(item.tab)}><AppIcon name={item.icon} /><span>{item.label}</span></button>)}
        <button type="button" className="rn-nav-item" aria-expanded={menuOpen} aria-haspopup="dialog" aria-current={menus.some(m => m.tab === activeTab) ? 'page' : undefined} onClick={openMenu}><AppIcon name="menu" /><span>전체메뉴</span></button>
      </nav>
    </div>
    <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="나의 학습 공간">
      {recentItems.length > 0 && <section className="rn-menu-recent" aria-label="최근 사용">
        <h3 className="rn-menu-section-title">최근 사용</h3>
        <div className="rn-menu-recent-grid">{recentItems.map(item => <RecentCard key={item.key} item={item} />)}</div>
      </section>}
      {sections.map(section => <section key={section.title} className="rn-menu-section" aria-label={section.title}>
        <h3 className="rn-menu-section-title">{section.title}</h3>
        <div className="rn-menu-list">{section.items.map(item => <MenuRow key={item.key} item={item} />)}</div>
      </section>)}
      {/* "함께 공부 중" 인원수는 오답노트 패널로 복귀했다(중복 노출 제거) — MistakeList.tsx 참고. */}
    </Sheet>
  </div>;
};
