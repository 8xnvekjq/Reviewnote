import React, { useEffect, useState } from 'react';
import type { AdminUserStat } from '../types';
import { supabase } from '../services/supabase';
import { formatDate } from '../utils/date';
import { GACHA_ITEMS, getTitleBadgeStyle } from '../utils/gachaCatalog';
import { RecentActivityFeed } from './RecentActivityFeed';
import { CatPawIcon } from './CatPawIcon';

interface AdminPanelProps {
  onBack?: () => void;
  onRefresh?: () => void;
  onSelectTab?: (tab: any) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onSelectTab }) => {
  const [stats, setStats] = useState<AdminUserStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [activeSubTab, setActiveSubTab] = useState<'stats' | 'activity'>('stats');
  const [gradeFilter, setGradeFilter] = useState<string>('all');

  // 학생 카드 클릭 시 장착 아이템 조회용 상태 (보유 전체가 아닌 "현재 장착 중"인 것만 표시)
  const [selectedStudent, setSelectedStudent] = useState<AdminUserStat | null>(null);

  const handleOpenStudentItems = (user: AdminUserStat) => {
    setSelectedStudent(user);
  };

  const fetchAdminStats = async (isInitial = false) => {
    if (isInitial) {
      setIsLoading(true);
    }
    setError(null);
    try {
      // Fetch all profiles (display_name, nickname, school_grade, equipped_title 포함)
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, is_admin, display_name, nickname, school_grade, equipped_title, equipped_stamp, equipped_theme, equipped_ai_voice, bonus_points, point_adjustment')
        .order('email', { ascending: true });

      if (profilesError) throw profilesError;

      // Fetch all mistakes
      const { data: mistakes, error: mistakesError } = await supabase
        .from('mistakes')
        .select('*')
        .order('date', { ascending: false });

      if (mistakesError) throw mistakesError;

      // Fetch all mistakes is completed successfully, proceed to monday calculation

      // 이번주 월요일 00:00 KST에 해당하는 UTC 경계선 계산
      const now = new Date();
      const kstTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const day = kstTime.getUTCDay();
      const diff = kstTime.getUTCDate() - day + (day === 0 ? -6 : 1);
      const mondayKst = new Date(Date.UTC(kstTime.getUTCFullYear(), kstTime.getUTCMonth(), diff, 0, 0, 0));
      const mondayDate = new Date(mondayKst.getTime() - 9 * 60 * 60 * 1000); // UTC 날짜

      // Aggregate per user (stats cards)
      const statsMap = new Map<string, AdminUserStat & { displayName?: string; username: string }>();

      (profiles || []).forEach((p: any) => {
        const username = p.email?.split('@')[0] || p.display_name || p.id.slice(0, 8);
        statsMap.set(p.id, {
          userId: p.id,
          email: p.email || '(이메일 없음)',
          mistakeCount: 0,
          completedCount: 0,
          lastActivity: null,
          weeklyScore: 0,
          weeklyTotalCount: 0,
          weeklyCompletedCount: 0,
          displayName: p.display_name?.trim() || undefined,
          nickname: p.nickname?.trim() || undefined,
          username: username,
          schoolGrade: p.school_grade || '',
          equippedTitle: p.equipped_title || undefined,
          equippedStamp: p.equipped_stamp || undefined,
          equippedTheme: p.equipped_theme || undefined,
          equippedAiVoice: p.equipped_ai_voice || undefined,
          lastReviewDate: null,
          // 럭키상점 콤보 포인트 잔액 (App.tsx의 currentDisplayPoints와 동일 공식)
          comboPoints: Math.max(0, (p.bonus_points || 0) + (p.point_adjustment || 0)),
        });
      });

      // 날짜 파싱 유틸리티 (이번 주 오답 스탬프 여부 확인용)
      const isDateInCurrentWeek = (dateStr: string) => {
        if (!dateStr) return false;
        try {
          let parsedDate: Date;
          if (dateStr.includes('-') || dateStr.includes('T')) {
            parsedDate = new Date(dateStr);
          } else if (dateStr.includes('.')) {
            parsedDate = new Date(dateStr.replace(/\./g, '/'));
          } else {
            parsedDate = new Date(`${new Date().getFullYear()}/${dateStr}`);
          }
          return !isNaN(parsedDate.getTime()) && parsedDate >= mondayDate;
        } catch {
          return false;
        }
      };

      (mistakes || []).forEach((m: any) => {
        const stat = statsMap.get(m.user_id);
        if (!stat) return;

        stat.mistakeCount += 1;

        const reviews: string[] = m.reviews || [];
        const isCompleted = reviews.filter(r => r === 'O').length === 3;

        if (isCompleted) {
          stat.completedCount += 1;
        }

        // 이번주 등록된 오답 집계 (신규 등록 오답)
        const mDate = new Date(m.date);
        if (mDate >= mondayDate) {
          stat.weeklyTotalCount += 1;
        }

        // 이번주 복습 완료 집계 (등록일 무관, 이번주 완료 건)
        const updateDate = m.updated_at ? new Date(m.updated_at) : mDate;
        if (isCompleted && updateDate >= mondayDate) {
          stat.weeklyCompletedCount += 1;
        }

        // 3단 콤보 점수 계산 — weekly_leaderboard SQL 뷰(명예의전당)와 완전히 동일한 공식으로 통일함.
        // reviewPoints/reviewDates(칸 위치 기반)가 아니라 analysis.pointLog(포인트를 실제로 딴
        // 날짜에 영구 귀속된 append-only 로그)를 기준으로 합산한다. "정리하기"로 O가 다른 칸에
        // 옮겨가면 그 칸의 날짜(reviewDates)가 바뀌어버려 원래 이번 주에 딴 점수가 지난 주로
        // 잘못 재배정되는 문제가 있었음 — pointLog는 정리하기가 건드리지 않으므로 항상 정확하다.
        const pointLog: { date: string; points: number }[] = m.analysis?.pointLog || [];
        const comboScore = pointLog.reduce((sum, entry) => {
          return sum + (isDateInCurrentWeek(entry.date) ? (entry.points || 0) : 0);
        }, 0);

        stat.weeklyScore += comboScore;

        // Track latest activity date
        if (!stat.lastActivity || m.date > stat.lastActivity) {
          stat.lastActivity = m.date;
        }

        // Track last review date (check if reviews array has at least one checked state)
        const hasBeenReviewed = reviews.some(r => r !== '');
        if (hasBeenReviewed && m.updated_at) {
          if (!stat.lastReviewDate || m.updated_at > stat.lastReviewDate) {
            stat.lastReviewDate = m.updated_at;
          }
        }
      });

      // 각 유저별 주간 점수 산출 (콤보제 적용)
      statsMap.forEach((stat) => {
        stat.weeklyScore = Math.round(stat.weeklyScore);
      });

      // Sort: 최근 오답 복습한 순 정렬 (복습 기록이 없는 학생은 최하단 배치)
      const sorted = Array.from(statsMap.values()).sort((a, b) => {
        if (a.lastReviewDate && b.lastReviewDate) {
          return new Date(b.lastReviewDate).getTime() - new Date(a.lastReviewDate).getTime();
        }
        if (a.lastReviewDate) return -1;
        if (b.lastReviewDate) return 1;
        
        // 복습 기록이 모두 없는 경우, 최근 업로드(lastActivity) 순 정렬
        if (a.lastActivity && b.lastActivity) {
          return new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime();
        }
        if (a.lastActivity) return -1;
        if (b.lastActivity) return 1;

        return a.email.localeCompare(b.email);
      });

      setStats(sorted);
      setLastRefreshed(new Date());
    } catch (err: any) {
      setError(err.message || '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminStats(true);

    // ⚡ Realtime 실시간 동기화: profiles 및 mistakes 테이블 변경 시 즉시 배경 갱신 (깜빡임 0건)
    const channel = supabase
      .channel('admin-dashboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          fetchAdminStats(false);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mistakes' },
        () => {
          fetchAdminStats(false);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const totalMistakes = stats.reduce((s, u) => s + u.mistakeCount, 0);
  const totalCompleted = stats.reduce((s, u) => s + u.completedCount, 0);
  const totalUsers = stats.length;

  return (
    <div className="space-y-6">
      {/* Admin Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-white flex items-center">
            <span className="mr-2">👑</span> 어드민 대시보드
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5 flex items-center space-x-1.5">
            <span>마지막 갱신: {lastRefreshed.toLocaleTimeString('ko-KR')}</span>
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {onSelectTab && (
            <button
              onClick={() => onSelectTab('scaffolding')}
              className="px-3 py-1.5 rounded-xl bg-purple-950/60 hover:bg-purple-900/80 border border-purple-500/40 text-xs font-black text-purple-300 transition-all flex items-center space-x-1.5 shadow-md shadow-purple-500/10"
            >
              <span>🧩</span>
              <span>취약 오답 클리닉</span>
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {!isLoading && !error && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-2xl p-3 text-center">
            <div className="text-2xl font-black text-white">{totalUsers}</div>
            <div className="text-[10px] text-slate-400 font-bold mt-0.5">총 가입자</div>
          </div>
          <div className="bg-indigo-900/30 border border-indigo-700/40 rounded-2xl p-3 text-center">
            <div className="text-2xl font-black text-indigo-300">{totalMistakes}</div>
            <div className="text-[10px] text-indigo-400 font-bold mt-0.5">전체 오답노트</div>
          </div>
          <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-2xl p-3 text-center">
            <div className="text-2xl font-black text-emerald-300">{totalCompleted}</div>
            <div className="text-[10px] text-emerald-400 font-bold mt-0.5">전체 복습완료</div>
          </div>
        </div>
      )}

      {/* 서브 탭 스위처 */}
      {!isLoading && !error && (
        <div className="flex border-b border-slate-800/80 p-0.5 bg-slate-950/40 rounded-xl">
          <button
            onClick={() => setActiveSubTab('stats')}
            className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center space-x-1.5 ${
              activeSubTab === 'stats' 
                ? 'bg-slate-800 text-amber-400 shadow-sm font-black' 
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span>📊</span>
            <span>가입자 현황</span>
          </button>
          <button
            onClick={() => setActiveSubTab('activity')}
            className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center space-x-1.5 ${
              activeSubTab === 'activity' 
                ? 'bg-slate-800 text-purple-400 shadow-sm font-black' 
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span>🕘</span>
            <span>최근 활동기록</span>
          </button>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-2xl p-4 text-center space-y-2">
          <div className="text-2xl">⚠️</div>
          <p className="text-sm font-bold text-red-300">데이터 로드 실패</p>
          <p className="text-xs text-red-400/80 leading-relaxed">{error}</p>
          <p className="text-[10px] text-slate-500">Supabase SQL 에디터에서 admin 마이그레이션을 실행했는지 확인해 주세요.</p>
        </div>
      )}

      {/* Loading Shimmer */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4 animate-pulse">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-slate-700/60" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-slate-700/60 rounded w-2/3" />
                  <div className="h-2.5 bg-slate-700/40 rounded w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── 탭 1: 가입자 현황 탭 ── */}
      {activeSubTab === 'stats' && !isLoading && !error && (() => {
        const filteredStats = stats.filter(user => {
          if (gradeFilter === 'all') return true;
          if (gradeFilter === 'unassigned') return !user.schoolGrade;
          return user.schoolGrade === gradeFilter;
        });

        return (
          <div className="space-y-3.5">
            {/* Grade Filter Dropdown */}
            <div className="flex items-center space-x-2 bg-slate-900/60 border border-slate-800/80 p-2.5 rounded-2xl">
              <span className="text-[10px] text-slate-500 font-extrabold uppercase px-1">🎓 학년 필터</span>
              <select
                value={gradeFilter}
                onChange={e => setGradeFilter(e.target.value)}
                className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-850 text-xs text-white outline-none focus:border-indigo-500 transition-colors cursor-pointer font-bold"
              >
                <option value="all">전체 학년 ({stats.length}명)</option>
                <option value="중3">중3 ({stats.filter(u => u.schoolGrade === '중3').length}명)</option>
                <option value="고1">고1 ({stats.filter(u => u.schoolGrade === '고1').length}명)</option>
                <option value="고2">고2 ({stats.filter(u => u.schoolGrade === '고2').length}명)</option>
                <option value="고3">고3 ({stats.filter(u => u.schoolGrade === '고3').length}명)</option>
                <option value="unassigned">미지정 ({stats.filter(u => !u.schoolGrade).length}명)</option>
              </select>
            </div>

            {filteredStats.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs border border-dashed border-slate-850 rounded-2xl bg-slate-900/20">
                해당 학년의 가입자가 없습니다.
              </div>
            ) : (
              filteredStats.map((user) => {
              const isEmailValid = user.email && user.email.includes('@');
              const activeNotes = user.mistakeCount - user.completedCount;
              const completionRate = user.mistakeCount > 0
                ? Math.round((user.completedCount / user.mistakeCount) * 100)
                : 0;

              return (
                <div
                  key={user.userId}
                  onClick={() => handleOpenStudentItems(user)}
                  role="button"
                  tabIndex={0}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 transition-all hover:border-slate-700 cursor-pointer"
                >
                  {/* User Identity Row */}
                  <div className="flex items-center space-x-3">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center text-white font-black text-base flex-none shadow-lg shadow-indigo-900/30">
                      {((user as any).displayName || (user as any).username || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        {/* 이름 (어드민에게는 이름 옆에 닉네임 병기) */}
                        {(() => {
                          const realName = (user as any).displayName || (user as any).username;
                          const nick = user.nickname;
                          const hasCustomNick = nick && nick !== realName;

                          return (
                            <span className={`font-extrabold text-sm truncate ${user.email?.toLowerCase().startsWith('test') ? 'text-rainbow-wave' : 'text-white'}`}>
                              {realName} {hasCustomNick && <span className="text-amber-400 font-bold text-xs ml-1">({nick})</span>}
                            </span>
                          );
                        })()}
                        {user.equippedTitle && (() => {
                          const badge = getTitleBadgeStyle(user.equippedTitle);
                          return (
                            <span className={`text-[9px] px-2 py-0.5 rounded-full border flex items-center space-x-1 flex-none ${badge.style}`}>
                              <span>{badge.icon}</span>
                              <span>{user.equippedTitle}</span>
                            </span>
                          );
                        })()}
                      </div>
                      <span className="text-[10px] text-slate-400 truncate block mt-0.5">
                        {(user as any).displayName ? `아이디: ${(user as any).username}` : (isEmailValid ? user.email : '(이메일 정보 없음)')}
                      </span>
                      {/* 학년 선택 컴포넌트 추가 */}
                      <div className="flex items-center space-x-1.5 mt-2">
                        <span className="text-[9px] text-slate-500 font-bold">학년:</span>
                        <select
                          value={user.schoolGrade || ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={async (e) => {
                            const newGrade = e.target.value;

                            try {
                              const { error } = await supabase
                                .from('profiles')
                                .update({ school_grade: newGrade || null })
                                .eq('id', user.userId);
                                
                              if (error) throw error;
                              
                              // Update local state
                              setStats(prev => prev.map(u => u.userId === user.userId ? { ...u, schoolGrade: newGrade } : u));
                            } catch (err: any) {
                              alert('학년 업데이트 실패: ' + err.message);
                            }
                          }}
                          className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 focus:border-indigo-500 text-[10px] text-white outline-none transition-colors font-bold text-center cursor-pointer"
                        >
                          <option value="">선택 없음</option>
                          <option value="중3">중3</option>
                          <option value="고1">고1</option>
                          <option value="고2">고2</option>
                          <option value="고3">고3</option>
                        </select>
                      </div>
                    </div>
                    {/* Weekly Score and Last Activity */}
                    <div className="text-right flex-none pl-3 border-l border-slate-800/80 space-y-1">
                      <div>
                        <span className="text-[9px] text-slate-500 block leading-none">주간 스코어</span>
                        <span className="text-xs font-black text-amber-400 leading-tight block">
                          {Math.round(user.weeklyScore)}점
                        </span>
                        <span className="text-[8px] text-slate-500 block leading-none mt-0.5">
                          ({user.weeklyCompletedCount}개 완료 / {user.weeklyTotalCount}개 등록)
                        </span>
                      </div>
                      <div className="pt-1 border-t border-slate-850">
                        <span className="text-[9px] text-slate-500 block leading-none">콤보 포인트</span>
                        <span className="text-xs font-black text-emerald-400 leading-tight block">
                          ⚡ {user.comboPoints ?? 0}점
                        </span>
                      </div>
                      <div className="pt-1 border-t border-slate-850">
                        <span className="text-[9px] text-slate-500 block leading-none">최근 업로드</span>
                        <span className="text-[10px] text-slate-400 font-medium leading-none block mt-0.5">
                          {user.lastActivity ? formatDate(user.lastActivity).split(' ')[0] : '—'}
                        </span>
                      </div>
                      <div className="pt-1 border-t border-slate-850">
                        <span className="text-[9px] text-indigo-400 block leading-none font-bold">마지막 복습</span>
                        <span className="text-[10px] text-indigo-300 font-semibold leading-none block mt-0.5">
                          {user.lastReviewDate ? formatDate(user.lastReviewDate).split(' ')[0] : '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-3 gap-2">
                    {/* Total Notes */}
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center">
                      <div className="text-xl font-black text-white">{user.mistakeCount}</div>
                      <div className="text-[10px] text-slate-500 font-bold mt-0.5">총 오답노트</div>
                    </div>
                    {/* Active Notes */}
                    <div className="bg-indigo-950/50 border border-indigo-800/40 rounded-xl p-3 text-center">
                      <div className="text-xl font-black text-indigo-300">{activeNotes}</div>
                      <div className="text-[10px] text-indigo-500 font-bold mt-0.5">진행중</div>
                    </div>
                    {/* Completed */}
                    <div className="bg-emerald-950/50 border border-emerald-800/40 rounded-xl p-3 text-center">
                      <div className="text-xl font-black text-emerald-300">{user.completedCount}</div>
                      <div className="text-[10px] text-emerald-500 font-bold mt-0.5">복습완료</div>
                    </div>
                  </div>

                  {/* Completion Progress Bar */}
                  {user.mistakeCount > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500 font-bold">복습 진행률</span>
                        <span className="text-[10px] font-black text-slate-400">{completionRate}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full transition-all"
                          style={{ width: `${completionRate}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      );
    })()}

      {/* ── 탭 2: 최근 활동기록 (Recent Activity Feed) 탭 ── */}
      {activeSubTab === 'activity' && (
        <div className="space-y-4 animate-scale-up">
          <RecentActivityFeed />
        </div>
      )}

      {/* ── 학생 카드 클릭 시: 현재 장착 중인 아이템만 조회하는 모달 ── */}
      {selectedStudent && (() => {
        const equippedSlots: { category: string; label: string; value?: string }[] = [
          { category: 'TITLE', label: '칭호', value: selectedStudent.equippedTitle },
          { category: 'STAMP', label: '스탬프', value: selectedStudent.equippedStamp },
          { category: 'THEME', label: '테마', value: selectedStudent.equippedTheme },
          { category: 'AI_VOICE', label: 'AI 말투', value: selectedStudent.equippedAiVoice },
        ];

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
            onClick={() => setSelectedStudent(null)}
          >
            <div
              className="w-full max-w-sm max-h-[80vh] bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4 animate-scale-up flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 flex-none">
                <h3 className="text-sm font-extrabold text-white flex items-center space-x-2 min-w-0">
                  <span>🎽</span>
                  <span className="truncate">
                    {(() => {
                      const realName = (selectedStudent as any).displayName || (selectedStudent as any).username;
                      const nick = selectedStudent.nickname;
                      const hasCustomNick = nick && nick !== realName;
                      return `${realName}${hasCustomNick ? ` (${nick})` : ''} 장착 아이템`;
                    })()}
                  </span>
                </h3>
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 rounded-lg flex-none"
                >
                  ✕
                </button>
              </div>

              <div className="overflow-y-auto flex-1 space-y-2">
                {equippedSlots.map(slot => {
                  const catalogItem = slot.value
                    ? GACHA_ITEMS.find(g => g.category === slot.category && g.effectValue === slot.value)
                    : undefined;

                  return (
                    <div
                      key={slot.category}
                      className="flex items-center space-x-3 bg-slate-950 border border-slate-800 rounded-xl p-2.5"
                    >
                      <span className="text-2xl flex-none flex items-center justify-center">
                        {catalogItem?.icon === '🐾' ? <CatPawIcon className="w-6 h-6" /> : (catalogItem?.icon || '—')}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">{slot.label}</span>
                        {catalogItem ? (
                          <>
                            <div className="flex items-center space-x-1.5">
                              <span className={`text-[8px] font-black px-1.5 py-0.2 rounded bg-gradient-to-r ${catalogItem.color} text-white flex-none`}>
                                {catalogItem.rarity}
                              </span>
                              <span className="text-xs font-bold text-white truncate">{catalogItem.name}</span>
                            </div>
                            <p className="text-[10px] text-slate-500 truncate mt-0.5">{catalogItem.description}</p>
                            {/* 칭호는 실제 헤더에 보이는 것과 동일한 스타일로 미리보기 (희귀도별 공통 색이 아닌 실제 발광 효과) */}
                            {slot.category === 'TITLE' && catalogItem.effectValue && (() => {
                              const titleBadge = getTitleBadgeStyle(catalogItem.effectValue);
                              return (
                                <div className="mt-1.5">
                                  <span className={`text-[9px] px-2 py-0.5 rounded-full border inline-flex items-center space-x-1 ${titleBadge.style}`}>
                                    <span>{titleBadge.icon}</span>
                                    <span>{catalogItem.effectValue}</span>
                                  </span>
                                </div>
                              );
                            })()}
                          </>
                        ) : (
                          <span className="text-xs text-slate-600">미장착 (기본값)</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
