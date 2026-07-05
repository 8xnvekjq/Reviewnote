import React, { useEffect, useState } from 'react';
import type { AdminUserStat, MistakeEntry } from '../types';
import { supabase } from '../services/supabase';
import { formatDate } from '../utils/date';
import { ROOT_CAUSE_OPTIONS } from '../types';
import { LaTeXRenderer } from './LaTeXRenderer';

export const AdminPanel: React.FC = () => {
  const [stats, setStats] = useState<AdminUserStat[]>([]);
  const [allMistakes, setAllMistakes] = useState<MistakeEntry[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [filterStudent, setFilterStudent] = useState<string>('all');
  const [previewEntry, setPreviewEntry] = useState<MistakeEntry | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'stats' | 'mistakes'>('stats');

  const fetchAdminStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch all profiles (display_name 포함)
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, is_admin, display_name')
        .order('email', { ascending: true });

      if (profilesError) throw profilesError;

      // Build profilesMap: userId -> 이름(실명) 또는 아이디
      const pMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => {
        const username = p.email?.split('@')[0] || p.display_name || p.id.slice(0, 8);
        const displayName = p.display_name?.trim();
        pMap[p.id] = displayName || username;
      });
      setProfilesMap(pMap);

      // Fetch all mistakes
      const { data: mistakes, error: mistakesError } = await supabase
        .from('mistakes')
        .select('*')
        .order('date', { ascending: false });

      if (mistakesError) throw mistakesError;

      // Map full mistake entries for the 전체 오답 뷰
      const mappedMistakes: MistakeEntry[] = (mistakes || []).map((m: any) => ({
        id: m.id,
        userId: m.user_id,
        title: m.title,
        imageUrl: m.image_url,
        date: m.date,
        analysis: m.analysis || undefined,
        reviews: m.reviews || ['', '', ''],
        grade: m.grade || undefined,
        chapter: m.chapter || undefined,
        rootCauses: m.root_causes || [],
        userActionPlan: m.user_action_plan || undefined,
      }));
      setAllMistakes(mappedMistakes);

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
          username: username,
        });
      });

      (mistakes || []).forEach((m: any) => {
        const stat = statsMap.get(m.user_id);
        if (!stat) return;

        stat.mistakeCount += 1;

        const reviews: string[] = m.reviews || [];
        const isCompleted = reviews.filter(r => r === 'O').length === 3;

        if (isCompleted) {
          stat.completedCount += 1;
        }

        // 이번주 등록된 오답 집계
        const mDate = new Date(m.date);
        if (mDate >= mondayDate) {
          stat.weeklyTotalCount += 1;
          if (isCompleted) {
            stat.weeklyCompletedCount += 1;
          }
        }

        // Track latest activity date
        if (!stat.lastActivity || m.date > stat.lastActivity) {
          stat.lastActivity = m.date;
        }
      });

      // 각 유저별 주간 점수 산출
      statsMap.forEach((stat) => {
        const rate = stat.weeklyTotalCount > 0 ? (stat.weeklyCompletedCount / stat.weeklyTotalCount) : 0;
        stat.weeklyScore = (stat.weeklyCompletedCount * 10) + (rate * 100);
      });

      // Sort: 주간 복습 랭킹 점수 높은 순 정렬
      const sorted = Array.from(statsMap.values()).sort(
        (a, b) => b.weeklyScore - a.weeklyScore
      );

      setStats(sorted);
      setLastRefreshed(new Date());
    } catch (err: any) {
      setError(err.message || '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminStats();
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
          <p className="text-[11px] text-slate-500 mt-0.5">
            마지막 갱신: {lastRefreshed.toLocaleTimeString('ko-KR')}
          </p>
        </div>
        <button
          onClick={fetchAdminStats}
          disabled={isLoading}
          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-xs font-bold text-slate-300 transition-all disabled:opacity-50 flex items-center space-x-1.5"
        >
          <span className={isLoading ? 'animate-spin' : ''}>🔄</span>
          <span>새로고침</span>
        </button>
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
            onClick={() => setActiveSubTab('mistakes')}
            className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center space-x-1.5 ${
              activeSubTab === 'mistakes' 
                ? 'bg-slate-800 text-indigo-400 shadow-sm font-black' 
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span>📂</span>
            <span>전체 오답 뷰</span>
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
      {activeSubTab === 'stats' && !isLoading && !error && (
        <div className="space-y-3">
          {stats.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-sm">가입자가 없습니다.</div>
          ) : (
            stats.map((user) => {
              const isEmailValid = user.email && user.email.includes('@');
              const activeNotes = user.mistakeCount - user.completedCount;
              const completionRate = user.mistakeCount > 0
                ? Math.round((user.completedCount / user.mistakeCount) * 100)
                : 0;

              return (
                <div
                  key={user.userId}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 transition-all hover:border-slate-700"
                >
                  {/* User Identity Row */}
                  <div className="flex items-center space-x-3">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center text-white font-black text-base flex-none shadow-lg shadow-indigo-900/30">
                      {((user as any).displayName || (user as any).username || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-extrabold text-white text-sm truncate">
                          {(user as any).displayName || (user as any).username}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 truncate block mt-0.5">
                        {(user as any).displayName ? `아이디: ${(user as any).username}` : (isEmailValid ? user.email : '(이메일 정보 없음)')}
                      </span>
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
                        <span className="text-[9px] text-slate-500 block leading-none">최근 활동</span>
                        <span className="text-[10px] text-slate-400 font-medium leading-none block mt-0.5">
                          {user.lastActivity ? formatDate(user.lastActivity).split(' ')[0] : '—'}
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
      )}

      {/* ── 탭 2: 전체 오답 뷰 탭 ── */}
      {activeSubTab === 'mistakes' && !isLoading && !error && (
        <div className="space-y-4">
          {/* 학생 필터 */}
          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 p-3 rounded-2xl">
            <span className="text-[11px] text-slate-400 font-bold flex-none">👤 학생 필터</span>
            <select
              value={filterStudent}
              onChange={e => setFilterStudent(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-850 text-xs text-white outline-none focus:border-indigo-500 transition-colors cursor-pointer"
            >
              <option value="all">전체 학생 ({allMistakes.length}개)</option>
              {Array.from(new Set(allMistakes.map(m => m.userId).filter(Boolean) as string[]))
                .map(uid => {
                  const name = profilesMap[uid] || uid.slice(0, 8);
                  const cnt = allMistakes.filter(m => m.userId === uid).length;
                  return <option key={uid} value={uid}>{name} ({cnt}개)</option>;
                })}
            </select>
          </div>

          {/* 오답 카드 그리드 (이미지 전면 제거 및 초슬림 메타 구조 변경) */}
          {allMistakes.filter(m => filterStudent === 'all' || m.userId === filterStudent).length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">등록된 오답이 없습니다.</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {allMistakes
                .filter(m => filterStudent === 'all' || m.userId === filterStudent)
                .map(entry => {
                  const studentName = entry.userId ? (profilesMap[entry.userId] || entry.userId.slice(0, 8)) : undefined;
                  return (
                    <div
                      key={entry.id}
                      onClick={() => setPreviewEntry(entry)}
                      className="group bg-slate-900/50 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/30 rounded-2xl p-4 cursor-pointer transition-all active:scale-[0.98] space-y-3 shadow-sm flex flex-col justify-between"
                    >
                      {/* 카드 헤더 (이름 & 날짜) */}
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                        {studentName && (
                          <span className="font-bold text-indigo-400">👤 {studentName}</span>
                        )}
                        <span className="text-slate-500">{formatDate(entry.date)}</span>
                      </div>

                      {/* 문제 타이틀 */}
                      <div className="text-xs font-bold text-white leading-normal line-clamp-2 min-h-[32px] group-hover:text-indigo-300 transition-colors">
                        <LaTeXRenderer 
                          text={entry.title} 
                          className="text-white font-bold text-xs"
                        />
                      </div>

                      {/* 카드 푸터 (과목, 단원, 분석완료 여부 배지) */}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-850/80">
                        <div className="flex items-center space-x-1.5 overflow-hidden">
                          {entry.grade && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-600/10 text-emerald-400 border border-emerald-500/20 font-extrabold flex-none">
                              {entry.grade}
                            </span>
                          )}
                          {entry.chapter && (
                            <span className="text-[9px] text-slate-500 truncate font-semibold">
                              📌 {entry.chapter}
                            </span>
                          )}
                        </div>
                        {!entry.analysis ? (
                          <span className="text-[9px] text-amber-400 font-bold flex-none flex items-center bg-amber-400/5 px-2 py-0.5 rounded-full border border-amber-400/10">
                            <span className="w-1 h-1 rounded-full bg-amber-400 mr-1.5 animate-pulse"></span>미완료
                          </span>
                        ) : (
                          <span className="text-[9px] text-indigo-400 font-bold flex-none bg-indigo-500/5 px-2 py-0.5 rounded-full border border-indigo-500/10">
                            ✓ 진단됨
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* 미리보기 모달 */}
      {previewEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setPreviewEntry(null)}
        >
          <div
            className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-2">
                  {previewEntry.userId && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 font-bold">
                      👤 {profilesMap[previewEntry.userId] || previewEntry.userId.slice(0, 8)}
                    </span>
                  )}
                  {previewEntry.grade && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 font-bold">
                      {previewEntry.grade}
                    </span>
                  )}
                  {previewEntry.chapter && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 border border-slate-600 font-bold">
                      {previewEntry.chapter}
                    </span>
                  )}
                </div>
                <div className="font-bold text-white text-sm mt-1 min-w-0">
                  <LaTeXRenderer 
                    text={previewEntry.title} 
                    className="text-white font-bold text-sm line-clamp-1 inline-block w-full"
                  />
                </div>
                <p className="text-[10px] text-slate-500">{formatDate(previewEntry.date)}</p>
              </div>
              <button onClick={() => setPreviewEntry(null)} className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 active:scale-90 transition-all">✕</button>
            </div>
            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <img src={previewEntry.imageUrl} alt={previewEntry.title} className="w-full rounded-xl border border-slate-800 object-contain max-h-72" />
              {previewEntry.analysis && (
                <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
                  <p className="text-[10px] font-bold text-indigo-400 mb-2">💡 정석 풀이</p>
                  <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{previewEntry.analysis.solvingProcess.replace(/\$[^$]+\$/g, '[수식]').slice(0, 300)}{previewEntry.analysis.solvingProcess.length > 300 ? '...' : ''}</p>
                </div>
              )}
              {previewEntry.rootCauses && previewEntry.rootCauses.length > 0 && (
                <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 space-y-2">
                  <p className="text-[10px] font-bold text-amber-400">⚠️ 선택된 실수 원인</p>
                  <div className="flex flex-wrap gap-1.5">
                    {previewEntry.rootCauses.map(rc => {
                      const opt = ROOT_CAUSE_OPTIONS.find(o => o.id === rc);
                      return opt ? (
                        <span key={rc} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold">
                          {opt.label}
                        </span>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
              {previewEntry.userActionPlan && (
                <div className="bg-emerald-950/30 rounded-xl border border-emerald-800/30 p-4">
                  <p className="text-[10px] font-bold text-emerald-400 mb-2">✏️ 학생 나만의 대책</p>
                  <p className="text-xs text-slate-300 leading-relaxed">{previewEntry.userActionPlan}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
