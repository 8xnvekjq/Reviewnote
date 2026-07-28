import React from 'react';
import logoImg from '../assets/logo.jpg';
import { getTitleBadgeStyle } from '../utils/gachaCatalog';

// vite.config.ts의 define 블록에서 빌드 시 자동 주입
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;

// UTC → KST(+9) 강제 변환 후 MM.DD HH:mm 포맷으로 반환
const formatBuildTime = (iso: string): string => {
  try {
    const utcDate = new Date(iso);
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
  hasNameChangeTicket?: boolean;
  onUpdateAiName?: (newName: string) => Promise<void>;
  hasAiNameChangeTicket?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  nickname,
  onLogout,
  onUpdateNickname,
  myScore,
  onOpenStore,
  equippedTitle,
  streakDays,
  hasNameChangeTicket,
  onUpdateAiName,
  hasAiNameChangeTicket,
}) => {
  const [showUserMenu, setShowUserMenu] = React.useState(false);
  const [isNicknameModalOpen, setIsNicknameModalOpen] = React.useState(false);
  const [nicknameInput, setNicknameInput] = React.useState('');
  const [isAiNameModalOpen, setIsAiNameModalOpen] = React.useState(false);
  const [aiNameInput, setAiNameInput] = React.useState('');
  const buildLabel = `v${__APP_VERSION__} (${formatBuildTime(__BUILD_TIME__)})`;

  // 보물가방 또는 상단 드롭다운에서 닉네임 모달 팝업 수신 이벤트
  React.useEffect(() => {
    const handleOpenModal = () => {
      setNicknameInput(nickname || '');
      setIsNicknameModalOpen(true);
    };
    window.addEventListener('reviewnote_open_nickname_modal', handleOpenModal);
    return () => {
      window.removeEventListener('reviewnote_open_nickname_modal', handleOpenModal);
    };
  }, [nickname]);

  // 보물가방에서 AI 이름 변경권 사용 시 모달 팝업 수신 이벤트
  React.useEffect(() => {
    const handleOpenAiNameModal = () => {
      setAiNameInput('');
      setIsAiNameModalOpen(true);
    };
    window.addEventListener('reviewnote_open_ai_name_modal', handleOpenAiNameModal);
    return () => {
      window.removeEventListener('reviewnote_open_ai_name_modal', handleOpenAiNameModal);
    };
  }, []);

  return (
    <>
      <header className="safe-top flex-none border-b-2 border-app-theme bg-app-header backdrop-blur-md px-4 py-3 flex items-center justify-between sticky top-0 z-30 transition-colors duration-300 shadow-md">
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
          {/* 연속 복습 일수 (🔥 Streak 배지) */}
          {streakDays !== undefined && streakDays > 0 && (
            <span className="text-[9.5px] text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/30 font-black flex items-center space-x-0.5 flex-none">
              <span>🔥</span>
              <span>{streakDays}일</span>
            </span>
          )}

          {/* 칭호 배지 (희귀도별 삐까뻔쩍 글로우 발광 이펙트 적용) */}
          {equippedTitle && (() => {
            const badge = getTitleBadgeStyle(equippedTitle);
            return (
              <span className={`text-[9px] px-2 py-0.5 rounded-full border truncate max-w-[105px] flex-none flex items-center space-x-0.5 ${badge.style}`}>
                <span>{badge.icon}</span>
                <span>{equippedTitle}</span>
              </span>
            );
          })()}

          {/* 내 계정 메뉴 드롭다운 */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="text-[10px] text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-750 px-2.5 py-1 rounded-full border border-slate-700 font-bold max-w-[120px] truncate flex items-center space-x-1 transition-all"
              title="내 계정 메뉴"
            >
              <span>👤</span>
              <span className="truncate">{currentUser}</span>
              <span className="text-[8px] opacity-70">▼</span>
            </button>

            {showUserMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowUserMenu(false)} 
                />

                <div className="absolute right-0 mt-2 w-48 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-2 z-50 space-y-1.5 animate-fade-in">
                  <div className="px-2.5 py-1.5 border-b border-slate-800/80">
                    <p className="text-[8px] text-slate-500 font-bold uppercase tracking-wider">닉네임</p>
                    <p className="text-[10.5px] font-black text-slate-200 truncate">{nickname || currentUser}</p>
                  </div>

                  {myScore !== undefined && (
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onOpenStore?.();
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg bg-amber-950/30 hover:bg-amber-900/40 text-amber-300 hover:text-amber-200 text-[10.5px] font-bold flex items-center space-x-1.5 transition-colors border border-amber-900/30"
                    >
                      <span>⚡</span>
                      <span>{myScore}점 · 럭키상점</span>
                      <span className="text-[8px] bg-amber-400 text-slate-950 px-1 rounded-full ml-auto font-bold">🎁</span>
                    </button>
                  )}

                  {/* ✏️ 닉네임 변경 버튼 (상시 노출 & 클릭 시 커스텀 UI 팝업 창 연동) */}
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      setNicknameInput(nickname || '');
                      setIsNicknameModalOpen(true);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg bg-indigo-950/30 hover:bg-indigo-900/40 text-indigo-300 hover:text-indigo-200 text-[10.5px] font-bold flex items-center space-x-1.5 transition-colors border border-indigo-900/30"
                  >
                    <span>✏️</span>
                    <span>닉네임 변경</span>
                  </button>

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

      {/* ── 닉네임 변경 자체 커스텀 UI 모달 팝업 창 (브라우저 alert/prompt 완전 대체) ── */}
      {isNicknameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-xs bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-sm font-extrabold text-white flex items-center space-x-2">
                <span>{hasNameChangeTicket ? '✏️' : '🏷️'}</span>
                <span>{hasNameChangeTicket ? '닉네임 변경' : '닉네임 변경권 필요'}</span>
              </h3>
              <button
                onClick={() => setIsNicknameModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {!hasNameChangeTicket ? (
              /* 변경권 0개 보유 시 커스텀 UI 안내 모달 창 */
              <div className="space-y-4 text-center py-2">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-2xl">
                  🏷️
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-extrabold text-white">
                    닉네임 변경권이 없습니다!
                  </p>
                  <p className="text-[11px] font-bold text-slate-400 leading-relaxed">
                    럭키상점에서 닉네임 변경권을 획득한 후 변경해 주세요.
                  </p>
                </div>
                <div className="flex items-center space-x-2 pt-2">
                  <button
                    onClick={() => setIsNicknameModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
                  >
                    닫기
                  </button>
                  <button
                    onClick={() => {
                      setIsNicknameModalOpen(false);
                      onOpenStore?.();
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-350 hover:to-amber-450 text-slate-950 text-xs font-black transition-all shadow-md shadow-amber-500/20 flex items-center justify-center space-x-1"
                  >
                    <span>🎁</span>
                    <span>상점으로 이동</span>
                  </button>
                </div>
              </div>
            ) : (
              /* 변경권 1개 이상 보유 시 커스텀 UI 입력 모달 창 */
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-300">
                    변경할 닉네임
                  </label>
                  <input
                    type="text"
                    value={nicknameInput}
                    onChange={(e) => setNicknameInput(e.target.value)}
                    placeholder="새 닉네임을 입력하세요 (최대 16자)"
                    maxLength={16}
                    className="w-full px-3.5 py-2.5 bg-slate-955 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && nicknameInput.trim() && onUpdateNickname) {
                        onUpdateNickname(nicknameInput.trim());
                        setIsNicknameModalOpen(false);
                      }
                    }}
                    autoFocus
                  />
                  <p className="text-[10px] text-slate-500">
                    * 닉네임 변경권 1개가 즉시 소모됩니다.
                  </p>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <button
                    onClick={() => setIsNicknameModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
                  >
                    취소
                  </button>
                  <button
                    onClick={async () => {
                      if (nicknameInput.trim() && onUpdateNickname) {
                        await onUpdateNickname(nicknameInput.trim());
                        setIsNicknameModalOpen(false);
                      }
                    }}
                    disabled={!nicknameInput.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-550 text-white text-xs font-black transition-all disabled:opacity-50 shadow-md shadow-indigo-600/20"
                  >
                    완료
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── AI 이름 변경 자체 커스텀 UI 모달 팝업 창 (닉네임 변경 모달과 동일한 패턴) ── */}
      {isAiNameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-xs bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4 animate-scale-up">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h3 className="text-sm font-extrabold text-white flex items-center space-x-2">
                <span>{hasAiNameChangeTicket ? '🎭' : '🏷️'}</span>
                <span>{hasAiNameChangeTicket ? 'AI 이름 변경' : 'AI 이름 변경권 필요'}</span>
              </h3>
              <button
                onClick={() => setIsAiNameModalOpen(false)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            {!hasAiNameChangeTicket ? (
              /* 변경권 0개 보유 시 커스텀 UI 안내 모달 창 */
              <div className="space-y-4 text-center py-2">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-2xl">
                  🏷️
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-extrabold text-white">
                    AI 이름 변경권이 없습니다!
                  </p>
                  <p className="text-[11px] font-bold text-slate-400 leading-relaxed">
                    럭키상점에서 AI 이름 변경권을 획득한 후 변경해 주세요.
                  </p>
                </div>
                <div className="flex items-center space-x-2 pt-2">
                  <button
                    onClick={() => setIsAiNameModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
                  >
                    닫기
                  </button>
                  <button
                    onClick={() => {
                      setIsAiNameModalOpen(false);
                      onOpenStore?.();
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-350 hover:to-amber-450 text-slate-950 text-xs font-black transition-all shadow-md shadow-amber-500/20 flex items-center justify-center space-x-1"
                  >
                    <span>🎁</span>
                    <span>상점으로 이동</span>
                  </button>
                </div>
              </div>
            ) : (
              /* 변경권 1개 이상 보유 시 커스텀 UI 입력 모달 창 */
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-300">
                    AI 페르소나 이름
                  </label>
                  <input
                    type="text"
                    value={aiNameInput}
                    onChange={(e) => setAiNameInput(e.target.value)}
                    placeholder="새 AI 이름을 입력하세요 (최대 10자)"
                    maxLength={10}
                    className="w-full px-3.5 py-2.5 bg-slate-955 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 outline-none focus:border-amber-500 transition-colors"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && aiNameInput.trim() && onUpdateAiName) {
                        onUpdateAiName(aiNameInput.trim());
                        setIsAiNameModalOpen(false);
                      }
                    }}
                    autoFocus
                  />
                  <p className="text-[10px] text-slate-500">
                    * AI 이름 변경권 1개가 즉시 소모됩니다.
                  </p>
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <button
                    onClick={() => setIsAiNameModalOpen(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all"
                  >
                    취소
                  </button>
                  <button
                    onClick={async () => {
                      if (aiNameInput.trim() && onUpdateAiName) {
                        await onUpdateAiName(aiNameInput.trim());
                        setIsAiNameModalOpen(false);
                      }
                    }}
                    disabled={!aiNameInput.trim()}
                    className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-550 text-white text-xs font-black transition-all disabled:opacity-50 shadow-md shadow-amber-600/20"
                  >
                    완료
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
