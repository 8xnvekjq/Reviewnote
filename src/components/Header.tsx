import React from 'react';

interface HeaderProps {
  currentUser: string;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentUser, onLogout }) => {
  return (
    <header className="safe-top flex-none border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center space-x-2.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-emerald-400 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
          ∑
        </div>
        <div className="flex flex-col">
          <h1 className="text-base font-extrabold text-white leading-tight">
            오답클리닉
          </h1>
          <span className="text-[8px] font-bold text-slate-500 mt-0.5">
            최신 업데이트: v1.5.0 (07.03 14:52:20)
          </span>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <span className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700 font-bold max-w-[100px] truncate">
          👤 {currentUser}
        </span>
        <button 
          onClick={onLogout}
          className="text-[10px] text-red-400 hover:text-red-300 font-bold bg-red-950/20 px-2.5 py-0.5 rounded-full border border-red-900/30 transition-colors"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
};
