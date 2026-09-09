import React from 'react';
import type { ActiveTab } from '../types';
import logoImg from '../assets/logo.jpg';
import { AppIcon } from './ui/AppIcon';
import { Sheet } from './ui/Sheet';
import { getTitleBadgeStyle } from '../utils/gachaCatalog';
// rn-online-* 클래스는 notes.css에 정의돼 있다(MistakeList의 "함께 공부 중" 배지와 동일
// 컴포넌트/스타일 재사용 — 상단 네비바용으로 새로 만들지 않는다).
import '../styles/notes.css';

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
  userId?: string;
  nickname?: string;
  onLogout: () => void;
  onUpdateNickname?: (newNickname: string) => Promise<void>;
  myScore?: number;
  onOpenStore?: () => void;
  equippedTitle?: string;
  weeklyMedals?: { gold: number; silver: number; bronze: number };
  streakDays?: number;
  hasNameChangeTicket?: boolean;
  onUpdateAiName?: (newName: string) => Promise<void>;
  hasAiNameChangeTicket?: boolean;
  comboBoosterExpiresAt?: string | null; // 콤보 부스터 5배 버프 만료시각 (서버 profiles 기준)
  isAdmin?: boolean;
  onSelectTab?: (tab: ActiveTab) => void;
  onlineUsers?: { id: string; display_name: string; nickname?: string; username: string }[]; // 실시간 온라인 학생 — App.tsx가 이미 계산해 MistakeList/BottomNavigation에도 넘기는 것과 동일한 배열 재사용(신규 realtime subscription 없음)
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  nickname,
  onLogout,
  onUpdateNickname,
  myScore,
  onOpenStore,
  equippedTitle,
  weeklyMedals,
  streakDays,
  hasNameChangeTicket,
  onUpdateAiName,
  hasAiNameChangeTicket,
  comboBoosterExpiresAt,
  isAdmin,
  onSelectTab,
  onlineUsers = [],
}) => {
  const [showUserMenu, setShowUserMenu] = React.useState(false);
  const [showOnlinePopup, setShowOnlinePopup] = React.useState(false);
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

  // ⚡ 콤보 부스터 잔여 시간 계산 (서버 profiles.combo_booster_expires_at 기준 — App.tsx에서 전달받음)
  const getBoosterRemainingStr = () => {
    if (!comboBoosterExpiresAt) return null;
    const expiresAt = new Date(comboBoosterExpiresAt).getTime();
    if (isNaN(expiresAt) || Date.now() >= expiresAt) return null;

    const remainingMs = expiresAt - Date.now();
    const hours = Math.floor(remainingMs / (1000 * 60 * 60));
    const mins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours > 0 ? `${hours}h ` : ''}${mins}m`;
  };

  const boosterStr = getBoosterRemainingStr();

  return (
    <>
      <header className="rn-header">
        <div className="rn-header-inner">
          <div className="rn-brand">
            <img src={logoImg} alt="더쿠키수학 로고" />
            {/* 슬로건 문구는 제거 — 대신 예전처럼 버전/업데이트 시각을 상단에서 바로 보이게
                복원한다(프로필 시트 안에 있으면 한 번 더 탭해야 해서 접근성이 떨어졌다). */}
            <div><h1>Reviewnote<span className="sr-only"> 오답클리닉</span></h1><p>{buildLabel}</p></div>
          </div>
          <div className="rn-header-actions">
            {myScore !== undefined && <button type="button" className="rn-button rn-points" onClick={() => onOpenStore?.()} aria-label={`내 포인트 ${myScore}점, 럭키상점 열기`}><span aria-hidden="true">✦</span>{myScore.toLocaleString()}</button>}
            {/* 실시간 온라인 학생 확인 — 전체메뉴 정리 과정에서 사라진 기능을 상단 네비바에
                작은 아이콘 버튼으로 복원(git history 83f91a4 "Online 배지+목록 팝업" 기준).
                onlineUsers는 App.tsx의 last_seen_at 5분 윈도 폴링을 그대로 재사용 — 여기서
                별도 realtime/polling을 새로 만들지 않는다. MistakeList의 "함께 공부 중"
                배지와 데이터는 동일하지만(코드로 확인됨, 별도 presence 채널 없음), 오답노트
                탭에서만 보이던 것과 달리 이 버튼은 모든 화면에서 항상 접근 가능하다.
                🐛 실기기 회귀 수정: 예전엔 이 블록 전체를 {`{onlineUsers.length > 0 && ...}`}
                로 감싸서, 5분 윈도 안에 last_seen_at이 있는 사람이 아무도 없으면(흔한 상황)
                버튼 자체가 렌더되지 않아 기능이 있는지조차 알 수 없었다 — 요청대로 항상
                렌더하고(0명이어도 "👥 0"), 팝업 안에서만 빈 상태를 안내한다. */}
            <div className="rn-online-wrap">
              <button type="button" className="rn-online-badge" onClick={() => setShowOnlinePopup(v => !v)} aria-expanded={showOnlinePopup} aria-haspopup="dialog" aria-label={`실시간 온라인 학생 ${onlineUsers.length}명, 목록 보기`}>
                <span className="rn-online-dot" aria-hidden="true" />
                <span aria-hidden="true">👥</span>
                <span>{onlineUsers.length}</span>
              </button>
              {showOnlinePopup && (
                <div className="rn-online-popup" role="dialog" aria-label="실시간 온라인 학생 목록">
                  <div className="rn-online-popup-title"><span>공부 중인 친구들</span><span className="rn-online-live">● Live</span></div>
                  {onlineUsers.length === 0 ? (
                    <p className="rn-caption" style={{ textAlign: 'center', padding: '4px 0' }}>지금은 혼자 공부 중이에요.</p>
                  ) : (
                    <ul className="rn-online-popup-list">
                      {onlineUsers.map(u => (
                        <li key={u.id}><span className="rn-online-dot" aria-hidden="true" /><span>{u.nickname || u.display_name || u.username}</span></li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <button type="button" className="rn-icon-button" onClick={() => setShowUserMenu(true)} aria-label="내 계정 메뉴" aria-haspopup="dialog" aria-expanded={showUserMenu}><AppIcon name="user" /></button>
          </div>
        </div>
      </header>
      <Sheet open={showUserMenu} onClose={() => setShowUserMenu(false)} title={`${nickname || currentUser}의 공간`}>
        <p className="rn-caption">오늘도 한 걸음씩, 꾸준히.</p>
        <div className="rn-account-details">
          {streakDays !== undefined && streakDays > 0 && <span className="rn-caption">🔥 {streakDays}일 연속 복습</span>}
          {boosterStr && <button className="rn-button rn-points" onClick={() => { setShowUserMenu(false); onOpenStore?.(); }}>⚡ 5배 부스터 · {boosterStr}</button>}
          {equippedTitle && (() => { const badge = getTitleBadgeStyle(equippedTitle); return <span className={`px-3 py-1 rounded-full border text-xs ${badge.style}`}>{badge.icon} {equippedTitle}</span>; })()}
          {weeklyMedals && <span className="rn-caption" aria-label="역대 주간 메달">{weeklyMedals.gold > 0 && `🥇 ${weeklyMedals.gold} `}{weeklyMedals.silver > 0 && `🥈 ${weeklyMedals.silver} `}{weeklyMedals.bronze > 0 && `🥉 ${weeklyMedals.bronze}`}</span>}
        </div>
        <div className="rn-account-menu">                  {myScore !== undefined && (
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

                  {/* 🧩 취약 오답 클리닉 (스캐폴딩 탐색기) 어드민 바로가기 */}
                  {isAdmin && (
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        onSelectTab?.('scaffolding');
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 hover:text-purple-200 text-[10.5px] font-bold flex items-center space-x-1.5 transition-colors border border-purple-800/40"
                    >
                      <span>🧩</span>
                      <span>취약 오답 클리닉</span>
                    </button>
                  )}

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
      </Sheet>

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
