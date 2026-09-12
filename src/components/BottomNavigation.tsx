import React, { useState } from 'react';
import type { ActiveTab } from '../types';
import { AppIcon, type AppIconName } from './ui/AppIcon';
import { Sheet } from './ui/Sheet';
import { canViewOwnExamPrep } from '../utils/examPrepAccess';

interface BottomNavigationProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isAdmin?: boolean;
  currentUserId?: string;
  onlineUsers: { id: string; display_name: string; nickname?: string; username: string }[];
  onStartReviewSession?: () => void;
  onOpenSlideList?: () => void;
  dailyReviewCount?: number;
}
// "숨긴 카드" 행은 다른 메뉴 행과 같은 구조/스타일(AppIcon + 제목 + 설명)을 그대로 쓰고, 학생들이
// 익숙해하던 원숭이(🙈)만 제목 텍스트 옆에 덧붙인다 — 아이콘 슬롯 자체를 이모지로 바꾸지 않는다.
const menus: { tab: ActiveTab; label: string; description: string; icon: AppIconName; emoji?: string }[] = [
  { tab: 'stats', label: '나의 학습 현황', description: '복습 기록과 취약 단원', icon: 'chart' },
  { tab: 'completed', label: '복습완료 보관함', description: '세 번 익힌 문제와 인쇄', icon: 'check' },
  { tab: 'scaffolding', label: '선생님 풀이 힌트', description: '막힌 문제를 함께 풀어봐요', icon: 'book' },
  { tab: 'guide', label: '이용안내', description: '오답노트와 럭키상점 사용법', icon: 'help' },
  { tab: 'hidden', label: '숨긴 카드', description: '제외한 문제 확인과 다시 꺼내기', icon: 'eye', emoji: '🙈' },
];
// 관리자는 학생별 전체 리포트, 1차 허용 대상 학생은 본인 리포트만 — 같은 tab('examPrep')으로
// 들어가지만 라벨/설명만 역할에 따라 다르게 보여준다(둘 다 아니면 메뉴 자체가 없음).
const examPrepMenuAdmin: { tab: ActiveTab; label: string; description: string; icon: AppIconName } =
  { tab: 'examPrep', label: '시험대비 분석', description: '학생별 취약 단원과 수업 방향', icon: 'chart' };
const examPrepMenuStudent: { tab: ActiveTab; label: string; description: string; icon: AppIconName } =
  { tab: 'examPrep', label: '나의 시험대비 분석', description: '내 취약 단원과 시험 전 우선순위', icon: 'chart' };
export const BottomNavigation: React.FC<BottomNavigationProps> = ({ activeTab, setActiveTab, isAdmin, currentUserId, onOpenSlideList }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const select = (tab: ActiveTab) => { setActiveTab(tab); setMenuOpen(false); };
  const examPrepMenu = isAdmin ? examPrepMenuAdmin : canViewOwnExamPrep(currentUserId) ? examPrepMenuStudent : null;
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
        <button type="button" className="rn-nav-item" aria-expanded={menuOpen} aria-haspopup="dialog" aria-current={menus.some(m => m.tab === activeTab) ? 'page' : undefined} onClick={() => setMenuOpen(true)}><AppIcon name="menu" /><span>전체메뉴</span></button>
      </nav>
    </div>
    <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="나의 학습 공간">
      <div className="rn-menu-list">
        {currentUserId && <button type="button" className="rn-menu-row" aria-current={activeTab === 'pixelRoom' ? 'page' : undefined} onClick={() => select('pixelRoom')}><AppIcon name="user" /><span><strong>🎮 Pixel Room</strong><small>내 캐릭터와 작은 방 꾸미기</small></span><AppIcon name="arrow" width={16} /></button>}
        {examPrepMenu && <button type="button" key={examPrepMenu.tab} className="rn-menu-row" aria-current={activeTab === examPrepMenu.tab ? 'page' : undefined} onClick={() => select(examPrepMenu.tab)}><AppIcon name={examPrepMenu.icon} /><span><strong>{examPrepMenu.label}</strong><small>{examPrepMenu.description}</small></span><AppIcon name="arrow" width={16} /></button>}
        {menus.map(item => <button type="button" key={item.tab} className="rn-menu-row" aria-current={activeTab === item.tab ? 'page' : undefined} onClick={() => select(item.tab)}><AppIcon name={item.icon} /><span><strong>{item.label}{item.emoji ? ` ${item.emoji}` : ''}</strong><small>{item.description}</small></span><AppIcon name="arrow" width={16} /></button>)}
        {onOpenSlideList && <button type="button" className="rn-menu-row" onClick={() => { setMenuOpen(false); onOpenSlideList(); }}><AppIcon name="book" /><span><strong>수업자료</strong><small>선생님이 준비한 교안 슬라이드</small></span><AppIcon name="arrow" width={16} /></button>}
        {/* "함께 공부 중" 인원수는 오답노트 패널로 복귀했다(중복 노출 제거) — MistakeList.tsx 참고. */}
      </div>
    </Sheet>
  </div>;
};
