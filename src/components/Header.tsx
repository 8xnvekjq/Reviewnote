import React from 'react';
import logoImg from '../assets/logo.jpg';

// vite.config.ts의 define 블록에서 빌드 시 자동 주입
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

// UTC → KST(+9) 강제 변환 후 MM.DD HH:mm 포맷으로 반환 (서버/클라이언트 타임존 영향 방지)
const formatBuildTime = (iso: string): string => {
  try {
    const utcDate = new Date(iso);
    // UTC 시간에 9시간 밀리초를 명시적으로 더함
    const kstDate = new Date(utcDate.getTime() + 9 * 60 * 60 * 1000);
    
    const mm = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(kstDate.getUTCDate()).padStart(2, '0');
    const hh = String(kstDate.getUTCHours()).padStart(2, '0');
    const min = String(kstDate.getUTCMinutes()).padStart(2, '0');
    return `${mm}.${dd} ${hh}:${min}`;
  } catch {
    return '—';
  }
};

interface HeaderProps {
  currentUser: string;
  onLogout: () => void;
  myScore?: number;
}

export const Header: React.FC<HeaderProps> = ({ currentUser, onLogout, myScore }) => {
  const buildLabel = `v${__APP_VERSION__} (${formatBuildTime(__BUILD_TIME__)})`;

  return (
    <header className="safe-top flex-none border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-6 py-4 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center space-x-2.5 min-w-0 flex-1 mr-2">
        <img 
          src={logoImg} 
          alt="더쿠키수학 로고" 
          className="w-8 h-8 rounded-lg object-cover shadow-lg border border-slate-800/80 flex-none"
        />
        <div className="flex flex-col min-w-0">
          <h1 className="text-base font-extrabold text-white leading-tight truncate">
            오답클리닉
          </h1>
          <span className="text-[8px] font-bold text-slate-500 mt-0.5 whitespace-nowrap flex-none">
            {buildLabel}
          </span>
        </div>
      </div>
      <div className="flex items-center space-x-2 flex-none min-w-0 whitespace-nowrap">
        {/* 내 주간 점수 미니 배지 */}
        {myScore !== undefined && (
          <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 font-black flex items-center space-x-0.5 flex-none animate-fade-in">
            <span>⚡</span>
            <span>{myScore}점</span>
          </span>
        )}
        <span className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-full border border-slate-700 font-bold max-w-[100px] truncate flex-none">
          👤 {currentUser}
        </span>
        <button 
          onClick={onLogout}
          className="text-[10px] text-red-400 hover:text-red-300 font-bold bg-red-950/20 px-2.5 py-0.5 rounded-full border border-red-900/30 transition-colors flex-none"
        >
          로그아웃
        </button>
      </div>
    </header>
  );
};
