import React from 'react';

interface HeaderProps {
  currentUser: string;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ currentUser, onLogout }) => {
  return (
    <header className="safe-top flex-none border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center space-x-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-emerald-400 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
          ∑
        </div>
        <h1 className="text-lg font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
          오답클리닉
        </h1>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-950/40 text-indigo-400 border border-indigo-900/30">
          v1.5.0 (07.03 14:52:20)
        </span>
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
