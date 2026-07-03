import React from 'react';
import logoImg from '../assets/logo.jpg';

interface HeaderProps {
  currentUser: string;
  onLogout: () => void;
  encryptedApiKey?: string;
  decryptedKey?: string;
  onShowApiGuide?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  currentUser, 
  onLogout,
  encryptedApiKey,
  decryptedKey,
  onShowApiGuide
}) => {
  const hasEnvKey = !!(import.meta.env.VITE_GEMINI_API_KEY);

  return (
    <header className="safe-top flex-none border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center space-x-2.5">
        <img 
          src={logoImg} 
          alt="더쿠키수학 로고" 
          className="w-8 h-8 rounded-lg object-cover shadow-lg border border-slate-800/80"
        />
        <div className="flex flex-col">
          <h1 className="text-base font-extrabold text-white leading-tight">
            오답클리닉
          </h1>
          <span className="text-[8px] font-bold text-slate-500 mt-0.5">
            최신 업데이트: v1.6.0 (07.03 21:00)
          </span>
        </div>
      </div>
      <div className="flex items-center space-x-3">
        <div className="flex flex-col items-end space-y-1">
          <span className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700 font-bold max-w-[100px] truncate">
            👤 {currentUser}
          </span>
          {onShowApiGuide && (
            hasEnvKey ? (
              <button 
                onClick={onShowApiGuide}
                className="flex items-center space-x-1 text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full text-[9px] border border-indigo-500/30 active:scale-95 transition-all hover:bg-indigo-500/20"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                <span>공용 API 활성 ❓</span>
              </button>
            ) : decryptedKey ? (
              <button 
                onClick={onShowApiGuide}
                className="flex items-center space-x-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full text-[9px] border border-emerald-500/30 active:scale-95 transition-all hover:bg-emerald-500/20"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>개인 API 활성 ❓</span>
              </button>
            ) : encryptedApiKey ? (
              <button 
                onClick={onShowApiGuide}
                className="flex items-center space-x-1 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full text-[9px] border border-amber-500/30 active:scale-95 transition-all hover:bg-amber-500/20"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                <span>보안 잠김 ❓</span>
              </button>
            ) : (
              <button 
                onClick={onShowApiGuide}
                className="text-[9px] text-slate-400 hover:text-slate-300 bg-slate-900 border border-slate-800 hover:border-slate-700 px-2 py-0.5 rounded-full active:scale-95 transition-all flex items-center space-x-1"
              >
                <span>API 키 미등록</span>
                <span className="w-3.5 h-3.5 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-[8px] font-bold">?</span>
              </button>
            )
          )}
        </div>
        <button 
          onClick={onLogout}
          className="text-[10px] text-red-400 hover:text-red-300 font-bold bg-red-950/20 px-2.5 py-2.5 rounded-xl border border-red-900/30 transition-colors"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
};
