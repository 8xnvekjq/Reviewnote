import React, { useEffect, useState } from 'react';
import type { AdminUserStat } from '../types';
import { supabase } from '../services/supabase';
import { formatDate } from '../utils/date';

export const AdminPanel: React.FC = () => {
  const [stats, setStats] = useState<AdminUserStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [activeSubTab, setActiveSubTab] = useState<'stats' | 'changelog'>('stats');

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

      {/* ── 탭 2: 변경 이력 (Change Log) 탭 ── */}
      {activeSubTab === 'changelog' && (
        <div className="space-y-6 animate-scale-up">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center space-x-2">
              <span className="text-base">📋</span>
              <h3 className="font-extrabold text-white text-sm">더쿠키수학 오답클리닉 변경 이력</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              본 애플리케이션의 릴리즈 버전별 업데이트 내역 및 핵심 개선 사항을 확인할 수 있습니다.
            </p>
          </div>

          <div className="relative border-l border-slate-800 pl-6 ml-3 space-y-8">
            {/* Version 1.8.4 */}
            <div className="relative">
              <div className="absolute -left-[33px] top-1.5 w-4 h-4 rounded-full bg-indigo-500 border-4 border-slate-950" />
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-black px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    v1.8.4
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">2026.07.07</span>
                </div>
                <h4 className="font-bold text-white text-xs">주간 리더보드 롤오버 및 카드 레이아웃 슬림화</h4>
                <ul className="text-xs text-slate-400 list-disc list-inside space-y-1.5 pl-1 leading-relaxed">
                  <li><strong>주간 MVP 챔피언 배너</strong>: 금주 1위 점수가 0점일 시 지난주 우승자 정보로 자동 이월되는 안전성 로직 탑재</li>
                  <li><strong>카드 레이아웃 단축</strong>: 오답 카드 내 실수 지점과 학생 대책 수립 칸을 단일 행으로 축소하여 모바일 가시성 극대화</li>
                  <li><strong>가로 카메라 촬영 지원</strong>: 태블릿/모바일 가로 모드 촬영 시 조작 패널이 우측 사이드로 자동 재배치</li>
                  <li><strong>오답 분류 태그</strong>: 오답 원인 분류군에 이모지와 텍스트 라벨 병기화</li>
                </ul>
              </div>
            </div>

            {/* Version 1.7.5 */}
            <div className="relative">
              <div className="absolute -left-[33px] top-1.5 w-4 h-4 rounded-full bg-slate-800 border-4 border-slate-950" />
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-black px-2 py-0.5 rounded bg-slate-850 text-slate-400 border border-slate-700">
                    v1.7.5
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">2026.07.05</span>
                </div>
                <h4 className="font-bold text-white text-xs">AI 유튜브 맞춤 강의 추천 및 학생 가이드 신설</h4>
                <ul className="text-xs text-slate-400 list-disc list-inside space-y-1.5 pl-1 leading-relaxed">
                  <li><strong>유튜브 실시간 매칭</strong>: 오답 단원분류에 기반한 학원 재생목록 55개 강의 딥링크 추천 시스템 도입</li>
                  <li><strong>학생 가이드 탭</strong>: PWA 앱 설치 및 진단 체크 방법 등을 담은 디지털 학습 매뉴얼 탑재</li>
                  <li><strong>표시 포맷 개선</strong>: 어드민 패널 내 가입자 표기를 직관적인 <code className="text-indigo-400">아이디(이름)</code> 형식으로 통일</li>
                  <li><strong>이메일 자동 동기화</strong>: 신규 가입 시 이메일 누락을 방지하는 Supabase trigger function 마이그레이션 적용</li>
                </ul>
              </div>
            </div>

            {/* Version 1.5.0 */}
            <div className="relative">
              <div className="absolute -left-[33px] top-1.5 w-4 h-4 rounded-full bg-slate-800 border-4 border-slate-950" />
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-black px-2 py-0.5 rounded bg-slate-850 text-slate-400 border border-slate-700">
                    v1.5.0
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">2026.07.03</span>
                </div>
                <h4 className="font-bold text-white text-xs">수동 크롭 가이드라인 매칭 및 카메라 오토포커스</h4>
                <ul className="text-xs text-slate-400 list-disc list-inside space-y-1.5 pl-1 leading-relaxed">
                  <li><strong>오토포커스(Autofocus)</strong>: 렌즈 연속 자동 초점 및 터치 지점 수동초점(노란 링 비주얼) 추가</li>
                  <li><strong>조준 격자-크롭 박스 일치</strong>: 4:3 격자 비율과 크롭 기본 범위를 정확히 매칭해 자르기 피로도 경감</li>
                  <li><strong>오답 상세모달 개선</strong>: 지문, 풀이, 대책 등 길게 늘어지던 정보를 탭형 접이식(Accordion) 메뉴로 개편</li>
                  <li><strong>AI 오분류 크롭 차단</strong>: AI 임의 자르기 필터링을 걷어내고, 사용자가 선택한 원본 크롭 영역 그대로 고화질 보존</li>
                </ul>
              </div>
            </div>

            {/* Version 1.1.0 */}
            <div className="relative">
              <div className="absolute -left-[33px] top-1.5 w-4 h-4 rounded-full bg-slate-800 border-4 border-slate-950" />
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-black px-2 py-0.5 rounded bg-slate-850 text-slate-400 border border-slate-700">
                    v1.1.0
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">2026.07.01</span>
                </div>
                <h4 className="font-bold text-white text-xs">3단계 복습 피드백 및 보관함 이동 시스템</h4>
                <ul className="text-xs text-slate-400 list-disc list-inside space-y-1.5 pl-1 leading-relaxed">
                  <li><strong>복습 상태 진단</strong>: 개별 오답별 1~3차 복습 선택기(O/X/★) 및 3회 완료 시 복습완료 탭으로 자동 이동</li>
                  <li><strong>클리닉 리포트</strong>: 정석 풀이과정(LaTeX), 오답 분석 가이드 및 처방 대책 카드 레이아웃 고도화</li>
                  <li><strong>UI 세이프 존 대응</strong>: 모바일 Notch 바에 알맞은 헤더 탑 마진 및 수려한 글래스모피즘 하단 바 복원</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
