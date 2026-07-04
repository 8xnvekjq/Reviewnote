import React, { useEffect, useState } from 'react';
import type { AdminUserStat, MistakeEntry } from '../types';
import { supabase } from '../services/supabase';
import { formatDate } from '../utils/date';

export const AdminPanel: React.FC = () => {
  const [stats, setStats] = useState<AdminUserStat[]>([]);
  const [allMistakes, setAllMistakes] = useState<MistakeEntry[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [filterStudent, setFilterStudent] = useState<string>('all');
  const [previewEntry, setPreviewEntry] = useState<MistakeEntry | null>(null);

  const fetchAdminStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, is_admin')
        .order('email', { ascending: true });

      if (profilesError) throw profilesError;

      // Build profilesMap
      const pMap: Record<string, string> = {};
      (profiles || []).forEach((p: any) => {
        pMap[p.id] = p.email?.split('@')[0] || p.id.slice(0, 8);
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

      // Aggregate per user (stats cards)
      const statsMap = new Map<string, AdminUserStat>();

      (profiles || []).forEach((p: any) => {
        statsMap.set(p.id, {
          userId: p.id,
          email: p.email || '(이메일 없음)',
          mistakeCount: 0,
          completedCount: 0,
          lastActivity: null,
        });
      });

      (mistakes || []).forEach((m: any) => {
        const stat = statsMap.get(m.user_id);
        if (!stat) return;

        stat.mistakeCount += 1;

        // Check if all 3 reviews are 'O' → completed
        const reviews: string[] = m.reviews || [];
        if (reviews.filter(r => r === 'O').length === 3) {
          stat.completedCount += 1;
        }

        // Track latest activity date
        if (!stat.lastActivity || m.date > stat.lastActivity) {
          stat.lastActivity = m.date;
        }
      });

      // Sort: most mistakes first
      const sorted = Array.from(statsMap.values()).sort(
        (a, b) => b.mistakeCount - a.mistakeCount
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

      {/* User Stats — One Card Per User */}
      {!isLoading && !error && stats.length === 0 && (
        <div className="py-10 text-center text-slate-500 text-sm">
          가입자가 없습니다.
        </div>
      )}

      {!isLoading && !error && stats.length > 0 && (
        <div className="space-y-3">
          {stats.map((user, index) => {
            const username = user.email.split('@')[0];
            const domain = user.email.includes('@') ? '@' + user.email.split('@')[1] : '';
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
                    {username.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white text-sm truncate">{username}</span>
                      <span className="text-[10px] bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded-full border border-slate-700">
                        #{index + 1}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 truncate block">{domain || user.email}</span>
                  </div>
                  {/* Last Activity */}
                  <div className="text-right flex-none">
                    <span className="text-[10px] text-slate-500 block">마지막 활동</span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {user.lastActivity ? formatDate(user.lastActivity) : '—'}
                    </span>
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
          })}
        </div>
      )}
      {/* ─────────────────────────────────────────── */}
      {/* 전체 오답 뷰 섹션 */}
      {!isLoading && !error && allMistakes.length > 0 && (
        <div className="space-y-4 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-white flex items-center">
              <span className="mr-2">📋</span> 전체 오답 뷰
              <span className="ml-2 text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700 font-bold">
                {allMistakes.length}개
              </span>
            </h3>
          </div>

          {/* 학생 필터 */}
          <div className="flex items-center space-x-2">
            <span className="text-[11px] text-slate-500 font-bold flex-none">👤 학생</span>
            <select
              value={filterStudent}
              onChange={e => setFilterStudent(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white outline-none focus:border-indigo-500 transition-colors cursor-pointer"
            >
              <option value="all">전체 ({allMistakes.length}개)</option>
              {Array.from(new Set(allMistakes.map(m => m.userId).filter(Boolean) as string[]))
                .map(uid => {
                  const name = profilesMap[uid] || uid.slice(0, 8);
                  const cnt = allMistakes.filter(m => m.userId === uid).length;
                  return <option key={uid} value={uid}>{name} ({cnt}개)</option>;
                })}
            </select>
          </div>

          {/* 오답 카드 그리드 */}
          <div className="grid gap-3 sm:grid-cols-2">
            {allMistakes
              .filter(m => filterStudent === 'all' || m.userId === filterStudent)
              .map(entry => {
                const studentName = entry.userId ? (profilesMap[entry.userId] || entry.userId.slice(0, 8)) : undefined;
                return (
                  <div
                    key={entry.id}
                    onClick={() => setPreviewEntry(entry)}
                    className="group bg-slate-900/50 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/30 rounded-2xl overflow-hidden cursor-pointer transition-all active:scale-[0.98]"
                  >
                    <div className="aspect-[16/9] w-full bg-slate-950 relative overflow-hidden">
                      <img src={entry.imageUrl} alt={entry.title} className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-500" />
                      {/* 학생 이름 배지 */}
                      {studentName && (
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600/90 text-white backdrop-blur-sm flex items-center space-x-1">
                          <span>👤</span><span>{studentName}</span>
                        </div>
                      )}
                      <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-950/80 backdrop-blur-sm border border-slate-800 text-slate-300">
                        {formatDate(entry.date)}
                      </div>
                      {entry.grade && (
                        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600/80 text-white">
                          {entry.grade}
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-xs font-bold text-white line-clamp-1 group-hover:text-indigo-400 transition-colors">{entry.title}</p>
                      {entry.chapter && <p className="text-[10px] text-slate-500 mt-0.5">📌 {entry.chapter}</p>}
                      {!entry.analysis && (
                        <p className="text-[10px] text-amber-400 mt-1 font-medium flex items-center">
                          <span className="w-1 h-1 rounded-full bg-amber-400 mr-1 animate-pulse"></span>AI 분석 미완료
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
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
                <p className="font-bold text-white text-sm mt-1">{previewEntry.title}</p>
                <p className="text-[10px] text-slate-500">{formatDate(previewEntry.date)}</p>
              </div>
              <button onClick={() => setPreviewEntry(null)} className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 active:scale-90 transition-all">✕</button>
            </div>
            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <img src={previewEntry.imageUrl} alt={previewEntry.title} className="w-full rounded-xl border border-slate-800 object-contain max-h-72" />
              {previewEntry.analysis && (
                <>
                  <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
                    <p className="text-[10px] font-bold text-indigo-400 mb-2">💡 정석 풀이</p>
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{previewEntry.analysis.solvingProcess.replace(/\$[^$]+\$/g, '[수식]').slice(0, 300)}{previewEntry.analysis.solvingProcess.length > 300 ? '...' : ''}</p>
                  </div>
                  <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
                    <p className="text-[10px] font-bold text-amber-400 mb-2">🔍 틀린 이유</p>
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{previewEntry.analysis.rootCause}</p>
                  </div>
                  {previewEntry.analysis.actionPlan && (
                    <div className="bg-slate-950 rounded-xl border border-slate-800 p-4">
                      <p className="text-[10px] font-bold text-emerald-400 mb-2">🛡️ 핵심 처방</p>
                      <p className="text-xs text-slate-300 leading-relaxed">{previewEntry.analysis.actionPlan}</p>
                    </div>
                  )}
                </>
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
