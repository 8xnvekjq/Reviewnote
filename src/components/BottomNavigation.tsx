import React, { useState } from 'react';
import type { ActiveTab } from '../types';

interface BottomNavigationProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  isAdmin?: boolean;
  onlineUsers: { id: string; display_name: string; username: string }[];
}

export const BottomNavigation: React.FC<BottomNavigationProps> = ({ 
  activeTab, 
  setActiveTab, 
  isAdmin,
  onlineUsers = []
}) => {
  const [showOnlinePopup, setShowOnlinePopup] = useState(false);

  return (
    <div className="fixed bottom-1.5 left-4 right-4 z-40">
      {/* Online 인원수 배지 (하단 내비바 좌측 상단 플로팅) */}
      <div className="absolute -top-3.5 left-3 select-none z-50">
        <button
          onClick={() => setShowOnlinePopup(!showOnlinePopup)}
          className="px-2.5 py-0.5 rounded-full bg-slate-950/90 border border-slate-800 text-[8px] font-black text-slate-300 hover:text-white flex items-center space-x-1 shadow-md hover:scale-105 active:scale-95 transition-all backdrop-blur-md"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Online {onlineUsers.length}</span>
        </button>
        
        {/* 온라인 사용자 이름 목록 팝업 */}
        {showOnlinePopup && (
          <div className="absolute bottom-6 left-0 w-44 bg-slate-950/95 border border-slate-800/80 rounded-xl p-3 shadow-2xl backdrop-blur-md space-y-1.5 animate-fade-in">
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

      <nav className="h-16 rounded-2xl border border-slate-800/80 bg-slate-900/75 backdrop-blur-lg flex items-center justify-around px-4 shadow-xl shadow-black/40">
        {/* 어드민 계정은 👑 어드민, 학생 계정은 💡 이용안내 탭 노출 */}
        {isAdmin ? (
          <button
            onClick={() => setActiveTab('admin')}
            className={`flex flex-col items-center justify-center w-16 h-12 rounded-xl transition-all ${activeTab === 'admin' ? 'text-amber-400 scale-105 font-bold' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <span className="text-lg">👑</span>
            <span className="text-[10px] mt-0.5">어드민</span>
          </button>
        ) : (
          <button
            onClick={() => setActiveTab('guide')}
            className={`flex flex-col items-center justify-center w-16 h-12 rounded-xl transition-all ${activeTab === 'guide' ? 'text-amber-400 scale-105 font-bold' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <span className="text-lg">💡</span>
            <span className="text-[10px] mt-0.5">이용안내</span>
          </button>
        )}

        {/* Tab 1: Notes List */}
        <button 
          onClick={() => setActiveTab('notes')}
          className={`flex flex-col items-center justify-center w-16 h-12 rounded-xl transition-all ${activeTab === 'notes' ? 'text-indigo-400 scale-105 font-bold' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <span className="text-lg">📓</span>
          <span className="text-[10px] mt-0.5">오답노트</span>
        </button>

        {/* Tab 2: Floating Camera Trigger */}
        <button 
          onClick={() => setActiveTab('camera')}
          className={`flex items-center justify-center w-14 h-14 rounded-full transition-all -translate-y-4 shadow-lg ${activeTab === 'camera' ? 'bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white scale-110 shadow-indigo-600/40 ring-4 ring-slate-950' : 'bg-slate-800 text-slate-300 hover:bg-slate-750 shadow-black/50 ring-4 ring-slate-950 hover:scale-105'}`}
        >
          <span className="text-xl">📷</span>
        </button>

        {/* Tab 3: Stats */}
        <button 
          onClick={() => setActiveTab('stats')}
          className={`flex flex-col items-center justify-center w-16 h-12 rounded-xl transition-all ${activeTab === 'stats' ? 'text-emerald-400 scale-105 font-bold' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <span className="text-lg">📊</span>
          <span className="text-[10px] mt-0.5">분석통계</span>
        </button>

        {/* Tab 4: Completed Reviews */}
        <button 
          onClick={() => setActiveTab('completed')}
          className={`flex flex-col items-center justify-center w-16 h-12 rounded-xl transition-all ${activeTab === 'completed' ? 'text-teal-400 scale-105 font-bold' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <span className="text-lg">✅</span>
          <span className="text-[10px] mt-0.5">복습완료</span>
        </button>
      </nav>
    </div>
  );
};
