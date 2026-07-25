import React, { useState } from 'react';
import type { ActiveTab } from '../types';

interface BottomNavigationProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isAdmin?: boolean;
  onlineUsers: { id: string; display_name: string; username: string }[];
  onStartReviewSession?: () => void;
  onOpenSlideList?: () => void;
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({
  activeTab,
  setActiveTab,
  isAdmin,
  onlineUsers = [],
  onStartReviewSession,
  onOpenSlideList
}) => {
  const [showOnlinePopup, setShowOnlinePopup] = useState(false);
  const [showMenuDrawer, setShowMenuDrawer] = useState(false);

  // 더보기 메뉴에서 탭 클릭 시 드로어 자동 닫기
  const handleSelectDrawerTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    setShowMenuDrawer(false);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 select-none">

      {/* ── 1. 플로팅 상단 배지 (온라인 N명 / 수업자료 / 복습하기) ───────────────── */}
      <div className="relative w-full max-w-lg mx-auto px-4">

        {/* Online 인원수 배지 (좌측 상단 플로팅) */}
        <div className="absolute -top-4 left-4 z-50">
          <button
            onClick={() => setShowOnlinePopup(!showOnlinePopup)}
            className="px-2.5 py-0.5 rounded-full bg-slate-955/90 border border-slate-800 text-[8.5px] font-black text-slate-300 hover:text-white flex items-center space-x-1 shadow-md hover:scale-105 active:scale-95 transition-all backdrop-blur-md"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live {onlineUsers.length}명</span>
          </button>

          {/* 온라인 사용자 목록 팝업 */}
          {showOnlinePopup && (
            <div className="absolute bottom-7 left-0 w-44 bg-slate-955/95 border border-slate-800/80 rounded-xl p-3 shadow-2xl backdrop-blur-md space-y-1.5 animate-fade-in z-50">
              <div className="flex items-center justify-between border-b border-slate-850 pb-1 text-[8.5px] text-slate-500 font-extrabold select-none">
                <span>공부 중인 친구들</span>
                <span className="text-[7.5px] text-emerald-400">● Live</span>
              </div>
              {onlineUsers.length === 0 ? (
                <p className="text-[8px] text-slate-600 italic py-1 text-center select-none">지금은 나 혼자 공부 중.. 🐱</p>
              ) : (
                <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                  {onlineUsers.map(u => (
                    <div key={u.id} className="text-[9.5px] text-slate-300 font-black flex items-center space-x-1 py-0.5 select-none">
                      <span className="w-1 h-1 rounded-full bg-emerald-500 flex-none" />
                      <span className="truncate flex-1">{u.display_name || u.username}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 수업자료 배지 버튼 (우측 중간 플로팅) */}
        {onOpenSlideList && (
          <div className="absolute -top-4 right-[92px] z-50">
            <button
              onClick={onOpenSlideList}
              className="px-3 py-0.5 rounded-full bg-emerald-700 hover:bg-emerald-650 border-2 border-emerald-400 text-[8.5px] font-black text-white flex items-center space-x-1 shadow-[0_0_12px_rgba(16,185,129,0.65)] hover:shadow-[0_0_18px_rgba(16,185,129,0.85)] hover:scale-105 active:scale-95 transition-all backdrop-blur-md"
            >
              <span>🖥️ 수업자료</span>
            </button>
          </div>
        )}

        {/* 복습하기 배지 버튼 (우측 상단 플로팅 + 황금 글로우) */}
        {onStartReviewSession && (
          <div className="absolute -top-4 right-4 z-50">
            <button
              onClick={onStartReviewSession}
              className="px-3 py-0.5 rounded-full bg-indigo-600 hover:bg-indigo-550 border-2 border-amber-400 text-[8.5px] font-black text-white flex items-center space-x-1 shadow-[0_0_12px_rgba(251,191,36,0.65)] hover:shadow-[0_0_18px_rgba(251,191,36,0.85)] hover:scale-105 active:scale-95 transition-all backdrop-blur-md"
            >
              <span>📝 복습하기</span>
            </button>
          </div>
        )}
      </div>

      {/* ── 2. 스마트폰 하단 밀착형 5대 탭 네비게이션 바 ───────────────────────── */}
      <nav className="w-full bg-slate-900/95 border-t border-slate-800/80 backdrop-blur-xl flex items-center justify-around px-2 py-1.5 shadow-2xl pb-safe">

        {/* Tab 1: 📓 오답노트 (메인) */}
        <button
          onClick={() => {
            setActiveTab('notes');
            setShowMenuDrawer(false);
          }}
          className={`flex flex-col items-center justify-center w-14 h-11 rounded-xl transition-all ${
            activeTab === 'notes' ? 'text-indigo-400 scale-105 font-black' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <span className="text-lg">📓</span>
          <span className="text-[9.5px] mt-0.5">오답노트</span>
        </button>

        {/* Tab 2: 📊 분석통계 */}
        <button
          onClick={() => {
            setActiveTab('stats');
            setShowMenuDrawer(false);
          }}
          className={`flex flex-col items-center justify-center w-14 h-11 rounded-xl transition-all ${
            activeTab === 'stats' ? 'text-emerald-400 scale-105 font-black' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <span className="text-lg">📊</span>
          <span className="text-[9.5px] mt-0.5">분석통계</span>
        </button>

        {/* Tab 3: 📷 중앙 카메라스캐너 (시그니처 입체 셔터) */}
        <button
          onClick={() => {
            setActiveTab('camera');
            setShowMenuDrawer(false);
          }}
          className={`flex items-center justify-center w-13 h-13 rounded-full transition-all -translate-y-3.5 shadow-lg ${
            activeTab === 'camera'
              ? 'bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white scale-110 shadow-indigo-600/50 ring-4 ring-slate-950'
              : 'bg-slate-800 text-slate-200 hover:bg-slate-750 shadow-black/60 ring-4 ring-slate-950 hover:scale-105'
          }`}
        >
          <span className="text-xl">📷</span>
        </button>

        {/* Tab 4: 🎁 럭키상점 */}
        <button
          onClick={() => {
            setActiveTab('store');
            setShowMenuDrawer(false);
          }}
          className={`flex flex-col items-center justify-center w-14 h-11 rounded-xl transition-all relative ${
            activeTab === 'store' ? 'text-amber-400 scale-105 font-black' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <span className="text-lg animate-pulse">🎁</span>
          <span className="text-[9.5px] mt-0.5">럭키상점</span>
        </button>

        {/* Tab 5: ☰ 전체메뉴 (더보기 바텀시트 팝업) */}
        <button
          onClick={() => setShowMenuDrawer(!showMenuDrawer)}
          className={`flex flex-col items-center justify-center w-14 h-11 rounded-xl transition-all ${
            showMenuDrawer || ['guide', 'admin', 'completed'].includes(activeTab)
              ? 'text-purple-400 scale-105 font-black'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <span className="text-lg">☰</span>
          <span className="text-[9.5px] mt-0.5">전체메뉴</span>
        </button>
      </nav>

      {/* ── 3. ☰ 전체메뉴 슬라이드 바텀시트 (Bottom Drawer) ───────────────────── */}
      {showMenuDrawer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-955/80 backdrop-blur-sm animate-fade-in">
          {/* 배경 오버레이 클릭 시 닫기 */}
          <div className="absolute inset-0" onClick={() => setShowMenuDrawer(false)} />

          <div className="relative w-full max-w-lg bg-slate-900 border-t border-slate-800 rounded-t-3xl p-5 shadow-2xl space-y-4 animate-scale-up z-10 pb-safe">
            {/* 드로어 상단 손잡이 & 타이틀 */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <span className="text-lg">☰</span>
                <h3 className="text-sm font-black text-white">전체 메뉴 & 학습 도구</h3>
              </div>
              <button
                onClick={() => setShowMenuDrawer(false)}
                className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* 메뉴 그리드 카드 */}
            <div className="grid grid-cols-2 gap-2.5">
              {/* 3차 복습완료 보관함 */}
              <button
                onClick={() => handleSelectDrawerTab('completed')}
                className={`p-3.5 rounded-2xl border flex items-center space-x-3 transition-all ${
                  activeTab === 'completed'
                    ? 'bg-teal-500/10 border-teal-500/50 text-teal-300 font-bold'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-850'
                }`}
              >
                <span className="text-2xl">✅</span>
                <div className="text-left leading-tight">
                  <div className="text-xs font-black">복습완료 보관함</div>
                  <div className="text-[9px] text-slate-500 mt-0.5">3차 완료 오답 & 인쇄</div>
                </div>
              </button>

              {/* 수업자료 교안 */}
              {onOpenSlideList && (
                <button
                  onClick={() => {
                    setShowMenuDrawer(false);
                    onOpenSlideList();
                  }}
                  className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 text-slate-300 hover:bg-slate-850 flex items-center space-x-3 transition-all"
                >
                  <span className="text-2xl">🖥️</span>
                  <div className="text-left leading-tight">
                    <div className="text-xs font-black">핵심 수업자료</div>
                    <div className="text-[9px] text-slate-500 mt-0.5">주차별 교안 슬라이드</div>
                  </div>
                </button>
              )}

              {/* 이용안내 가이드 */}
              <button
                onClick={() => handleSelectDrawerTab('guide')}
                className={`p-3.5 rounded-2xl border flex items-center space-x-3 transition-all ${
                  activeTab === 'guide'
                    ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 font-bold'
                    : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-850'
                }`}
              >
                <span className="text-2xl">💡</span>
                <div className="text-left leading-tight">
                  <div className="text-xs font-black">앱 이용안내</div>
                  <div className="text-[9px] text-slate-500 mt-0.5">오답노트 사용 팁</div>
                </div>
              </button>

              {/* 어드민 관리자 패널 (관리자 계정 전용) */}
              {isAdmin && (
                <button
                  onClick={() => handleSelectDrawerTab('admin')}
                  className={`p-3.5 rounded-2xl border flex items-center space-x-3 transition-all ${
                    activeTab === 'admin'
                      ? 'bg-purple-500/10 border-purple-500/50 text-purple-300 font-bold'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-850'
                  }`}
                >
                  <span className="text-2xl">👑</span>
                  <div className="text-left leading-tight">
                    <div className="text-xs font-black">어드민 관리자</div>
                    <div className="text-[9px] text-slate-500 mt-0.5">학생 통계 및 관리</div>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
