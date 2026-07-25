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
  const [showRightDrawer, setShowRightDrawer] = useState(false);

  // 메뉴 선택 시 우측 사이드바 자동 닫기 및 탭 이동
  const handleSelectMenu = (tab: ActiveTab) => {
    setActiveTab(tab);
    setShowRightDrawer(false);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 select-none">

      {/* ── 1. 플로팅 상단 배지 (온라인 N명 / 수업자료 / 복습하기) ───────────────── */}
      <div className="relative w-full px-4">

        {/* Online 인원수 배지 (화면 좌측 상단 플로팅) */}
        <div className="absolute -top-3.5 left-4 z-50">
          <button
            onClick={() => setShowOnlinePopup(!showOnlinePopup)}
            className="px-2.5 py-0.5 rounded-full bg-slate-955/90 border border-slate-800 text-[8px] font-black text-slate-300 hover:text-white flex items-center space-x-1 shadow-md hover:scale-105 active:scale-95 transition-all backdrop-blur-md"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Online {onlineUsers.length}</span>
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

        {/* 수업자료 배지 버튼 (화면 우측 복습하기 왼편 플로팅) */}
        {onOpenSlideList && (
          <div className="absolute -top-3.5 right-[90px] z-50">
            <button
              onClick={onOpenSlideList}
              className="px-3 py-0.5 rounded-full bg-emerald-700 hover:bg-emerald-650 border-2 border-emerald-400 text-[8.5px] font-black text-white flex items-center space-x-1 shadow-[0_0_12px_rgba(16,185,129,0.65)] hover:shadow-[0_0_18px_rgba(16,185,129,0.85)] hover:scale-105 active:scale-95 transition-all backdrop-blur-md"
            >
              <span>🖥️ 수업자료</span>
            </button>
          </div>
        )}

        {/* 복습하기 배지 버튼 (화면 우측 상단 플로팅 + 황금 글로우) */}
        {onStartReviewSession && (
          <div className="absolute -top-3.5 right-4 z-50">
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

        {/* Tab 1: 💡 이용안내 (어드민일 때 👑 어드민) */}
        {isAdmin ? (
          <button
            onClick={() => {
              setActiveTab('admin');
              setShowRightDrawer(false);
            }}
            className={`flex flex-col items-center justify-center w-14 h-11 rounded-xl transition-all ${
              activeTab === 'admin' ? 'text-amber-400 scale-105 font-black' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span className="text-lg">👑</span>
            <span className="text-[9.5px] mt-0.5">어드민</span>
          </button>
        ) : (
          <button
            onClick={() => {
              setActiveTab('guide');
              setShowRightDrawer(false);
            }}
            className={`flex flex-col items-center justify-center w-14 h-11 rounded-xl transition-all ${
              activeTab === 'guide' ? 'text-amber-400 scale-105 font-black' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span className="text-lg">💡</span>
            <span className="text-[9.5px] mt-0.5">이용안내</span>
          </button>
        )}

        {/* Tab 2: 📓 오답노트 (메인) */}
        <button
          onClick={() => {
            setActiveTab('notes');
            setShowRightDrawer(false);
          }}
          className={`flex flex-col items-center justify-center w-14 h-11 rounded-xl transition-all ${
            activeTab === 'notes' ? 'text-indigo-400 scale-105 font-black' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <span className="text-lg">📓</span>
          <span className="text-[9.5px] mt-0.5">오답노트</span>
        </button>

        {/* Tab 3: 📷 중앙 카메라스캐너 (시그니처 입체 셔터) */}
        <button
          onClick={() => {
            setActiveTab('camera');
            setShowRightDrawer(false);
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
            setShowRightDrawer(false);
          }}
          className={`flex flex-col items-center justify-center w-14 h-11 rounded-xl transition-all relative ${
            activeTab === 'store' ? 'text-amber-400 scale-105 font-black' : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <span className="text-lg animate-pulse">🎁</span>
          <span className="text-[9.5px] mt-0.5">럭키상점</span>
        </button>

        {/* Tab 5: ☰ 전체메뉴 (우측 슬라이드 메뉴 펼침 버튼) */}
        <button
          onClick={() => setShowRightDrawer(!showRightDrawer)}
          className={`flex flex-col items-center justify-center w-14 h-11 rounded-xl transition-all ${
            showRightDrawer || ['stats', 'completed'].includes(activeTab)
              ? 'text-purple-400 scale-105 font-black'
              : 'text-slate-500 hover:text-slate-300'
          }`}
        >
          <span className="text-lg">☰</span>
          <span className="text-[9.5px] mt-0.5">전체메뉴</span>
        </button>
      </nav>

      {/* ── 3. ☰ 우측 세로 슬라이드 패널 (Right Side Slide-Over Drawer) ─────────── */}
      {showRightDrawer && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* 어두운 배경 반투명 오버레이 (클릭 시 슬라이드 패널 닫기) */}
          <div
            className="absolute inset-0 bg-slate-955/75 backdrop-blur-sm animate-fade-in transition-opacity"
            onClick={() => setShowRightDrawer(false)}
          />

          {/* 우측에서 스스륵 펼쳐지는 세로 직사각형 메뉴 패널 */}
          <div className="absolute top-0 right-0 bottom-0 w-72 max-w-[85vw] bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col animate-slide-left z-50 overflow-y-auto">

            {/* 슬라이드 헤더 */}
            <div className="p-5 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <span className="text-xl">☰</span>
                <div>
                  <h3 className="text-sm font-black text-white">전체 메뉴</h3>
                  <p className="text-[9.5px] text-slate-500 font-bold">더쿠키수학 오답클리닉</p>
                </div>
              </div>

              {/* X 닫기 버튼 */}
              <button
                onClick={() => setShowRightDrawer(false)}
                className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white font-black text-xs transition-colors"
              >
                ✕
              </button>
            </div>

            {/* 세로 메뉴 항목 리스트 */}
            <div className="p-4 space-y-2 flex-1">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block px-2 pb-1">
                학습 기능 & 메뉴
              </span>

              {/* 1. 📊 분석통계 (전체메뉴로 이동) */}
              <button
                onClick={() => handleSelectMenu('stats')}
                className={`w-full p-3.5 rounded-2xl border flex items-center space-x-3.5 transition-all text-left group ${
                  activeTab === 'stats'
                    ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300 font-bold shadow-lg shadow-emerald-500/5'
                    : 'bg-slate-955/60 border-slate-850 hover:border-slate-700 text-slate-300 hover:bg-slate-850'
                }`}
              >
                <span className="text-2xl group-hover:scale-110 transition-transform">📊</span>
                <div>
                  <div className="text-xs font-black text-emerald-400">분석통계</div>
                  <div className="text-[9.5px] text-slate-500 mt-0.5">내 학습 현황 & 취약 단원 분석</div>
                </div>
              </button>

              {/* 2. 3차 복습완료 보관함 */}
              <button
                onClick={() => handleSelectMenu('completed')}
                className={`w-full p-3.5 rounded-2xl border flex items-center space-x-3.5 transition-all text-left group ${
                  activeTab === 'completed'
                    ? 'bg-teal-500/10 border-teal-500/50 text-teal-300 font-bold shadow-lg shadow-teal-500/5'
                    : 'bg-slate-955/60 border-slate-850 hover:border-slate-700 text-slate-300 hover:bg-slate-850'
                }`}
              >
                <span className="text-2xl group-hover:scale-110 transition-transform">✅</span>
                <div>
                  <div className="text-xs font-black">복습완료 보관함</div>
                  <div className="text-[9.5px] text-slate-500 mt-0.5">3차 완료 오답 & 모아 찍기 인쇄</div>
                </div>
              </button>

              {/* 3. 더쿠키수학 핵심 수업자료 */}
              {onOpenSlideList && (
                <button
                  onClick={() => {
                    setShowRightDrawer(false);
                    onOpenSlideList();
                  }}
                  className="w-full p-3.5 rounded-2xl bg-slate-955/60 border border-slate-850 hover:border-slate-700 text-slate-300 hover:bg-slate-850 flex items-center space-x-3.5 transition-all text-left group"
                >
                  <span className="text-2xl group-hover:scale-110 transition-transform">🖥️</span>
                  <div>
                    <div className="text-xs font-black text-emerald-400">핵심 수업자료</div>
                    <div className="text-[9.5px] text-slate-500 mt-0.5">선생님 제작 주차별 교안 슬라이드</div>
                  </div>
                </button>
              )}

              {/* 4. 오답노트 이용안내 */}
              <button
                onClick={() => handleSelectMenu('guide')}
                className={`w-full p-3.5 rounded-2xl border flex items-center space-x-3.5 transition-all text-left group ${
                  activeTab === 'guide'
                    ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 font-bold shadow-lg shadow-amber-500/5'
                    : 'bg-slate-955/60 border-slate-850 hover:border-slate-700 text-slate-300 hover:bg-slate-850'
                }`}
              >
                <span className="text-2xl group-hover:scale-110 transition-transform">💡</span>
                <div>
                  <div className="text-xs font-black">앱 이용안내</div>
                  <div className="text-[9.5px] text-slate-500 mt-0.5">오답노트 및 복습 시스템 활용법</div>
                </div>
              </button>

              {/* 5. 어드민 관리자 패널 (어드민 전용) */}
              {isAdmin && (
                <button
                  onClick={() => handleSelectMenu('admin')}
                  className={`w-full p-3.5 rounded-2xl border flex items-center space-x-3.5 transition-all text-left group ${
                    activeTab === 'admin'
                      ? 'bg-purple-500/10 border-purple-500/50 text-purple-300 font-bold shadow-lg shadow-purple-500/5'
                      : 'bg-slate-955/60 border-slate-850 hover:border-slate-700 text-slate-300 hover:bg-slate-850'
                  }`}
                >
                  <span className="text-2xl group-hover:scale-110 transition-transform">👑</span>
                  <div>
                    <div className="text-xs font-black text-purple-300">어드민 관리자</div>
                    <div className="text-[9.5px] text-slate-500 mt-0.5">학생 데이터 통계 및 랭킹 관리</div>
                  </div>
                </button>
              )}
            </div>

            {/* 패널 하단 카피라이트 정보 */}
            <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 text-center space-y-1">
              <span className="text-[9px] font-black text-slate-500">더쿠키수학 AI 오답클리닉</span>
              <p className="text-[8px] text-slate-600 font-mono">Designed for Premium Math Learning</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
