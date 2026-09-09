import React, { useState } from 'react';
import type { ActiveTab } from '../types';
import { AppIcon, type AppIconName } from './ui/AppIcon';
import { Sheet } from './ui/Sheet';

interface BottomNavigationProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isAdmin?: boolean;
  onlineUsers: { id: string; display_name: string; nickname?: string; username: string }[];
  onStartReviewSession?: () => void;
  onOpenSlideList?: () => void;
  dailyReviewCount?: number;
}
// emoji가 있으면 AppIcon 대신 그 이모지를 그대로 쓴다 — "숨긴 카드"는 학생들이 이미 익숙해하던
// 기존 원숭이(🙈) 아이콘을 새 아이콘 세트로 대체하지 않고 그대로 복원하기 위함.
const menus: { tab: ActiveTab; label: string; description: string; icon: AppIconName; emoji?: string }[] = [
  { tab: 'stats', label: '나의 학습 현황', description: '복습 기록과 취약 단원', icon: 'chart' },
  { tab: 'completed', label: '복습완료 보관함', description: '세 번 익힌 문제와 인쇄', icon: 'check' },
  { tab: 'scaffolding', label: '선생님 풀이 힌트', description: '막힌 문제를 함께 풀어봐요', icon: 'book' },
  { tab: 'guide', label: '이용안내', description: '오답노트와 럭키상점 사용법', icon: 'help' },
  { tab: 'hidden', label: '숨긴 카드', description: '제외한 문제 확인과 다시 꺼내기', icon: 'eye', emoji: '🙈' },
];
export const BottomNavigation: React.FC<BottomNavigationProps> = ({ activeTab, setActiveTab, isAdmin, onlineUsers = [], onStartReviewSession, onOpenSlideList, dailyReviewCount = 0 }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const questDone = dailyReviewCount >= 5;
  const select = (tab: ActiveTab) => { setActiveTab(tab); setMenuOpen(false); };
  const tabs: { tab: ActiveTab; label: string; icon: AppIconName }[] = [
    { tab: isAdmin ? 'admin' : 'activity', label: isAdmin ? '관리자' : '최근활동', icon: isAdmin ? 'chart' : 'activity' },
    { tab: 'notes', label: '오답노트', icon: 'notes' },
    { tab: 'camera', label: '문제 등록', icon: 'camera' },
    { tab: 'store', label: '럭키상점', icon: 'gift' },
  ];
  return <div className="rn-dock select-none">
    <div className="rn-dock-inner">
      {/* 오늘의 복습 — 이전엔 전체폭 배너였다. bottom nav를 가리지 않도록 우측 상단의 작은 pill로
          압축: primary nav로 승격하지 않고(§ 기존 진입 동작 그대로 onStartReviewSession 호출),
          진행도(dailyReviewCount/5)만 보이는 compact control. */}
      {onStartReviewSession && <div className="rn-review-pill-row">
        <button type="button" className="rn-review-pill" onClick={onStartReviewSession} aria-label={questDone ? '오늘의 목표 달성, 한 문제 더 복습하기' : '오늘의 복습 시작하기'}>
          <AppIcon name={questDone ? 'check' : 'notes'} width={15} height={15} />
          <span>복습 {Math.min(dailyReviewCount, 5)}/5</span>
        </button>
      </div>}
      <nav className="rn-bottom-nav bottom-nav-safe" aria-label="주요 메뉴">
        {tabs.map(item => <button type="button" key={item.tab} className={`rn-nav-item ${item.tab === 'camera' ? 'rn-nav-camera' : ''}`} aria-current={activeTab === item.tab ? 'page' : undefined} onClick={() => select(item.tab)}><AppIcon name={item.icon} /><span>{item.label}</span></button>)}
        <button type="button" className="rn-nav-item" aria-expanded={menuOpen} aria-haspopup="dialog" aria-current={menus.some(m => m.tab === activeTab) ? 'page' : undefined} onClick={() => setMenuOpen(true)}><AppIcon name="menu" /><span>전체메뉴</span></button>
      </nav>
    </div>
    <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="나의 학습 공간">
      <div className="rn-menu-list">
        {menus.map(item => <button type="button" key={item.tab} className="rn-menu-row" aria-current={activeTab === item.tab ? 'page' : undefined} onClick={() => select(item.tab)}>{item.emoji ? <span className="rn-menu-row-emoji" aria-hidden="true">{item.emoji}</span> : <AppIcon name={item.icon} />}<span><strong>{item.label}</strong><small>{item.description}</small></span><AppIcon name="arrow" width={16} /></button>)}
        {onOpenSlideList && <button type="button" className="rn-menu-row" onClick={() => { setMenuOpen(false); onOpenSlideList(); }}><AppIcon name="book" /><span><strong>수업자료</strong><small>선생님이 준비한 교안 슬라이드</small></span><AppIcon name="arrow" width={16} /></button>}
        <button type="button" className="rn-menu-row" onClick={() => { setMenuOpen(false); setOnlineOpen(true); }}><AppIcon name="user" /><span><strong>함께 공부 중 · {onlineUsers.length}명</strong><small>지금 접속한 친구들</small></span><AppIcon name="arrow" width={16} /></button>
      </div>
    </Sheet>
    <Sheet open={onlineOpen} onClose={() => setOnlineOpen(false)} title="함께 공부 중">
      {onlineUsers.length ? <ul className="rn-menu-list">{onlineUsers.map(user => <li key={user.id} className="rn-menu-row"><AppIcon name="user" /><span>{user.nickname || user.display_name || user.username}</span></li>)}</ul> : <p className="rn-caption">지금은 나만의 집중 시간이에요.</p>}
    </Sheet>
  </div>;
};
