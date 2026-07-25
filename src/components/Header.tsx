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
  nickname?: string;
  onLogout: () => void;
  onUpdateNickname?: (newNickname: string) => Promise<void>;
  myScore?: number;
  onOpenStore?: () => void;
  equippedTitle?: string;
  streakDays?: number;
}

export const Header: React.FC<HeaderProps> = ({ currentUser, nickname, onLogout, onUpdateNickname, myScore, onOpenStore, equippedTitle, streakDays }) => {
  const [showUserMenu, setShowUserMenu] = React.useState(false);
  const buildLabel = `v${__APP_VERSION__} (${formatBuildTime(__BUILD_TIME__)})`;
  const displayName = nickname || currentUser;

  return (
    <header className="safe-top flex-none border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-4 py-3 flex items-center justify-between sticky top-0 z-30">
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
        {/* 연속 복습 일수 (🔥 Streak 배지 - 깜빡임 제거) */}
        {streakDays !== undefined && streakDays > 0 && (
          <span className="text-[9.5px] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/30 font-black flex items-center space-x-0.5 flex-none">
            <span>🔥</span>
            <span>{streakDays}일 연속</span>
          </span>
        )}

        {/* 내 주간 점수 미니 배지 (클릭 시 럭키상점으로 이동) */}
        {myScore !== undefined && (
          <button 
            onClick={onOpenStore}
            className="text-[10px] text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30 font-black flex items-center space-x-1 flex-none animate-fade-in hover:scale-105 active:scale-95 transition-all shadow-sm"
            title="럭키상점으로 이동"
          >
            <span>⚡</span>
            <span>{myScore}점</span>
            <span className="text-[8px] bg-amber-400 text-slate-950 px-1 rounded-full ml-0.5 font-bold">🎁</span>
          </button>
        )}

        {/* 칭호 배지 */}
        {equippedTitle && (
          <span className="text-[9px] text-amber-300 bg-gradient-to-r from-amber-500/20 to-purple-500/20 px-2 py-0.5 rounded-full border border-amber-500/40 font-black truncate max-w-[90px] flex-none">
            👑 {equippedTitle}
          </span>
        )}

        {/* 내 아이디/닉네임 클릭 시 펼쳐지는 우측 상단 유저 드롭다운 메뉴 (닉네임 변경 및 로그아웃 포함) */}
        <div className="relative">
          <button 
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="text-[10px] text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-750 px-2.5 py-1 rounded-full border border-slate-700 font-bold max-w-[120px] truncate flex items-center space-x-1 transition-all"
            title="내 계정 메뉴"
          >
            <span>👤</span>
            <span className="truncate">{displayName}</span>
            <span className="text-[8px] text-slate-500 ml-0.5">▼</span>
          </button>

          {showUserMenu && (
            <>
              {/* 드롭다운 바깥 클릭 시 닫기 오버레이 */}
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowUserMenu(false)} 
              />

              {/* 우측 상단 팝업 드롭다운 */}
              <div className="absolute right-0 mt-1.5 w-40 bg-slate-900/95 border border-slate-800 rounded-xl p-2 shadow-2xl z-50 backdrop-blur-md animate-fade-in space-y-1.5">
                <div className="px-2 py-1 border-b border-slate-800">
                  <p className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">접속 닉네임</p>
                  <p className="text-[10.5px] font-black text-slate-200 truncate">{displayName}</p>
                </div>

                {/* 닉네임 변경 버튼 (로그아웃 바로 위) */}
                {onUpdateNickname && (
                  <button 
                    onClick={async () => {
                      const input = prompt("새로운 닉네임을 입력하세요 (실제 이름은 변경되지 않습니다):", displayName);
                      if (input !== null && input.trim()) {
                        await onUpdateNickname(input.trim());
                        setShowUserMenu(false);
                      }
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-300 hover:text-indigo-200 text-[10.5px] font-bold flex items-center space-x-1.5 transition-colors border border-indigo-900/30"
                  >
                    <span>✏️</span>
                    <span>닉네임 변경</span>
                  </button>
                )}

                {/* 로그아웃 버튼 */}
                <button 
                  onClick={() => {
                    setShowUserMenu(false);
                    onLogout();
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg bg-red-950/30 hover:bg-red-900/40 text-red-400 hover:text-red-300 text-[10.5px] font-bold flex items-center space-x-1.5 transition-colors border border-red-900/30"
                >
                  <span>🚪</span>
                  <span>로그아웃</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
