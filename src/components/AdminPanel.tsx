import React, { useEffect, useState } from 'react';
import type { AdminUserStat } from '../types';
import { supabase } from '../services/supabase';
import { formatDate } from '../utils/date';
import { CHRONOLOGICAL_CHANGELOGS } from './StudentGuide';

const GUIDE_ITEMS = [
  {
    step: '01',
    emoji: '📷',
    title: '오답 사진 등록',
    desc: '하단 카메라 버튼을 누르고 오답을 정밀 촬영한 뒤, 원하는 문제 영역만 깔끔하게 사각형으로 조절해 오려내어 저장하세요.',
    colorClass: 'from-indigo-500/20 via-indigo-500/5 to-slate-900/40 border-indigo-500/30 text-indigo-400 bg-indigo-950/60 shadow-indigo-950/50'
  },
  {
    step: '02',
    emoji: '🤖',
    title: 'AI 수학 클리닉 진단',
    desc: '등록된 오답을 터치하고 [AI 분석 시작하기]를 누르면 수식 인식과 분류를 거쳐 정석 풀이, 실수 요인, 대책, 3단계 힌트가 자동 처방됩니다.',
    colorClass: 'from-purple-500/20 via-purple-500/5 to-slate-900/40 border-purple-500/30 text-purple-400 bg-purple-950/60 shadow-purple-950/50'
  },
  {
    step: '03',
    emoji: '📺',
    title: '선생님 추천 강의 딥링크',
    desc: '진단된 단원에 매핑되는 선생님의 개념 강의 유튜브 영상 및 정확한 챕터 시작점(타임라인) 바로가기가 매칭되어 제공됩니다.',
    colorClass: 'from-amber-500/20 via-amber-500/5 to-slate-900/40 border-amber-500/30 text-amber-400 bg-amber-950/60 shadow-amber-950/50'
  },
  {
    step: '04',
    emoji: '✏️',
    title: '3단계 누적 복습 시스템',
    desc: '기억이 흐려질 때마다 O/X/★ 버튼으로 복습 성공 여부를 체크하세요. 3회 완료(O 세 번) 시 자동으로 복습 완료함으로 안전하게 분리 보관됩니다.',
    colorClass: 'from-emerald-500/20 via-emerald-500/5 to-slate-900/40 border-emerald-500/30 text-emerald-400 bg-emerald-950/60 shadow-emerald-950/50'
  }
];

export const AdminPanel: React.FC = () => {
  const [stats, setStats] = useState<AdminUserStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [activeSubTab, setActiveSubTab] = useState<'stats' | 'changelog'>('stats');
  const [gradeFilter, setGradeFilter] = useState<string>('all');

  const fetchAdminStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Fetch all profiles (display_name, school_grade 포함)
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, is_admin, display_name, school_grade')
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
          username: username,
          schoolGrade: p.school_grade || '',
          lastReviewDate: null,
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
        const reviewDates: string[] = m.analysis?.reviewDates || [];
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

        // 3단 콤보 점수 계산 (1차: 2점, 2차: 3점, 3차 완료: 15점)
        let comboScore = 0;
        if (reviews[0] === 'O' && isDateInCurrentWeek(reviewDates[0])) comboScore += 2;
        if (reviews[1] === 'O' && isDateInCurrentWeek(reviewDates[1])) comboScore += 3;
        if (reviews[2] === 'O' && isDateInCurrentWeek(reviewDates[2])) comboScore += 15;

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
            onClick={() => setActiveSubTab('changelog')}
            className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all text-center flex items-center justify-center space-x-1.5 ${
              activeSubTab === 'changelog' 
                ? 'bg-slate-800 text-indigo-400 shadow-sm font-black' 
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span>📜</span>
            <span>변경 이력 (Change Log)</span>
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
                      {/* 학년 선택 컴포넌트 추가 */}
                      <div className="flex items-center space-x-1.5 mt-2">
                        <span className="text-[9px] text-slate-500 font-bold">학년:</span>
                        <select
                          value={user.schoolGrade || ''}
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

      {/* ── 탭 2: 변경 이력 (Change Log) 탭 ── */}
      {activeSubTab === 'changelog' && (
        <div className="space-y-6 animate-scale-up">

          {/* 오답클리닉 이용방법 (큰 이모지 디자인) */}
          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-black text-indigo-400 uppercase tracking-wider pl-1 text-left">오답클리닉 이용방법</h3>
            <div className="grid gap-4">
              {GUIDE_ITEMS.map((item, idx) => (
                <div 
                  key={idx} 
                  className={`relative bg-gradient-to-br ${item.colorClass} border rounded-3xl p-5 flex items-center space-x-5 shadow-lg backdrop-blur-sm hover:-translate-y-0.5 hover:shadow-xl transition-all duration-300 group text-left`}
                >
                  {/* 우상단 네온 스타일 스텝 인덱스 배지 */}
                  <span className="absolute top-4 right-5 text-2xl font-black text-slate-800/50 select-none tracking-tighter group-hover:text-slate-700/60 transition-colors font-mono">
                    {item.step}
                  </span>
                  
                  {/* 커다란 이모지 블록 */}
                  <span className="text-4xl flex-none w-16 h-16 rounded-2xl flex items-center justify-center border border-slate-800/60 bg-slate-950/80 shadow-inner group-hover:scale-105 transition-transform duration-300 select-none">
                    {item.emoji}
                  </span>
                  
                  {/* 텍스트 설명 영역 */}
                  <div className="space-y-1.5 min-w-0 pr-6">
                    <h4 className="text-sm font-extrabold text-white tracking-tight">{item.title}</h4>
                    <p className="text-xs text-slate-300 leading-relaxed font-medium">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 더쿠키수학 오답클리닉 변경 이력 */}
          <div className="space-y-4 pt-6 border-t border-slate-800">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider pl-1 text-left">더쿠키수학 오답클리닉 변경 이력</h3>
            <div className="relative border-l border-slate-800 pl-6 ml-3 space-y-8">
              {CHRONOLOGICAL_CHANGELOGS.map((log, idx) => (
                <div key={idx} className="relative">
                  <div className={`absolute -left-[33px] top-1.5 w-4 h-4 rounded-full ${idx === 0 ? 'bg-indigo-500' : 'bg-slate-800'} border-4 border-slate-950`} />
                  <div className="space-y-2 text-left">
                    <div className="flex items-center space-x-2">
                      <span className={`text-xs font-black px-2 py-0.5 rounded ${idx === 0 ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-slate-850 text-slate-400 border border-slate-700'}`}>
                        {log.version}
                      </span>
                      <span className="text-[10px] text-slate-500 font-bold">{log.date}</span>
                    </div>
                    <ul className="text-xs text-slate-400 list-disc list-inside space-y-1.5 pl-1 leading-relaxed">
                      {log.changes.map((change, cIdx) => (
                        <li key={cIdx} className="pl-1.5 -indent-4 list-none flex items-start">
                          <span className="text-emerald-500/80 mr-1.5 select-none">•</span>
                          <span>{change}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
