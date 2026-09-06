import React, { useEffect, useState } from 'react';
import type { AdminUserStat, DailyReviewStat } from '../types';
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

  // 학생 카드 클릭 시 여는 상세 모달 — 학생 "객체"가 아니라 id만 들고 있는다.
  // 객체를 통째로 저장하면 실시간 갱신(fetchAdminStats)으로 stats가 새로 만들어져도 모달은
  // 예전 스냅샷을 계속 보여주게 된다. id로만 들고 있고, 표시할 때마다 최신 stats에서 다시 찾는다
  // (학생이 삭제/필터 밖으로 사라지면 selectedStudent가 자연히 null이 되어 모달도 자동으로 닫힘).
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const selectedStudent = selectedStudentId ? stats.find(u => u.userId === selectedStudentId) || null : null;

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
      // 학생별 날짜별(YYYY-MM-DD, 로컬 자정 기준) 복습 정답률 — "오늘" 정답률과 완전히 동일한
      // 정의를 날짜 축으로 확장한 것. Map<userId, Map<dateKey, DailyReviewStat>>
      const dailyStatsByUser = new Map<string, Map<string, DailyReviewStat>>();
      // reviewLog의 date는 항상 연도 포함 ISO 문자열이라(pointLog와 달리) 별도 포맷 분기가 필요 없다.
      const getLocalDateKey = (isoDateStr: string): string | null => {
        const d = new Date(isoDateStr);
        if (isNaN(d.getTime())) return null;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };
      // 최근 14일 창(오늘 포함)의 하한 날짜 키 — "최근 14개 활동일"이 아니라 "최근 14일간의
      // 활동"이어야 하므로, 활동이 뜸한 학생이라도 이 날짜 이전 기록은 표시하지 않는다.
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setHours(0, 0, 0, 0);
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13);
      const fourteenDaysAgoKey = `${fourteenDaysAgo.getFullYear()}-${String(fourteenDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(fourteenDaysAgo.getDate()).padStart(2, '0')}`;

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
          todayReviewedCount: 0,
          todayCorrectCount: 0,
          todayIncorrectCount: 0,
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

      // 오늘(현지 자정 기준) 여부 판정 유틸 — pointLog와 동일한 'M/D HH:mm' 포맷의 reviewLog에 사용
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setDate(tomorrowStart.getDate() + 1);
      const isDateToday = (dateStr: string) => {
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
          return !isNaN(parsedDate.getTime()) && parsedDate >= todayStart && parsedDate < tomorrowStart;
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

        // 오늘 복습 정답률 집계 — reviews/reviewDates가 아니라 reviewLog(append-only 결과 로그) 기준.
        // "정리하기"로 X·★ 칸이 비워지는 건 의도된 동작(다시 풀어보게 리셋)이라 UI 슬롯 자체는
        // 정확하지만, 그 때문에 reviews/reviewDates만으로는 오늘 있었던 결과를 재구성할 수 없다.
        //
        // [제품 정의] 오늘 정답률은 "각 슬롯의 오늘 최종 상태" 기준이다 — 같은 칸을 같은 날 X→O로
        // 고치면 최종 O 1건만 인정하고, 시도/정정 횟수는 이번 범위에서 세지 않는다. slot별로 로그의
        // 마지막 항목만 남기면 이게 그대로 구현된다(되돌리기로 인한 취소도 마지막 항목이 ''가 되어
        // 자연히 제외됨).
        // (구조적 한계: 3칸을 모두 채운 뒤 "정리하기"로 칸을 비우고 같은 날 그 칸을 또 체크하면
        //  slot 번호가 재사용되어 정리 전 결과가 최신 결과에 덮일 수 있음. 완전히 없애려면 정리하기를
        //  관통하는 별도 시도 ID가 필요한데, 이번 범위(시도/정정 횟수 미집계)에서는 필요치 않다고
        //  판단해 허용하고 문서로만 남김.)
        // ★(보류)는 코드 전반의 관례(정리 대상·취약 판정에서 X와 동일 취급)를 따라 오답에 합산한다.
        const reviewLog: { date: string; state: 'O' | 'X' | 'star' | ''; slot: number }[] = m.analysis?.reviewLog || [];
        const latestBySlot = new Map<number, { date: string; state: 'O' | 'X' | 'star' | '' }>();
        reviewLog.forEach(entry => latestBySlot.set(entry.slot, entry)); // 배열은 항상 시간순 추가라 마지막에 덮어쓴 값이 최신
        latestBySlot.forEach(entry => {
          if (entry.state === '') return; // 되돌리기로 취소된 체크는 집계 제외
          if (!isDateToday(entry.date)) return;
          stat.todayReviewedCount += 1;
          if (entry.state === 'O') {
            stat.todayCorrectCount += 1;
          } else {
            stat.todayIncorrectCount += 1;
          }
        });

        // 날짜별(최근 14일) 복습 정답률 — 위 "오늘" 집계와 동일한 정의를 날짜 축으로 확장.
        // 같은 슬롯을 같은 날짜 안에서 여러 번 고쳐도(X→O 등) 그 날짜의 마지막 항목만 인정한다
        // — reviewLog는 항상 시간순으로 append되므로, (slot, 날짜) 키로 덮어쓰기만 해도 "그 날의
        // 최종 상태"가 된다. 오늘 하루만 볼 때는 이 방식과 위 latestBySlot(전체 로그에서 슬롯별
        // 최신 1건, 그게 오늘이면 집계) 방식이 항상 같은 결과를 낸다 — 오늘보다 미래 항목은
        // 존재할 수 없으므로 "슬롯의 전체 최신"과 "슬롯의 오늘자 최신"이 같기 때문. 과거 날짜에서만
        // 두 방식이 갈리며(과거엔 그 이후 정정이 있을 수 있음), 이번 날짜별 집계는 각 날짜마다
        // 독립적으로 "그 날짜의 최종 상태"를 남겨 정확한 히스토리를 보존한다.
        const latestBySlotAndDate = new Map<string, { dateKey: string; state: 'O' | 'X' | 'star' | '' }>();
        reviewLog.forEach(entry => {
          const dateKey = getLocalDateKey(entry.date);
          if (!dateKey) return;
          latestBySlotAndDate.set(`${entry.slot}-${dateKey}`, { dateKey, state: entry.state });
        });

        if (latestBySlotAndDate.size > 0) {
          let userDailyMap = dailyStatsByUser.get(m.user_id);
          if (!userDailyMap) {
            userDailyMap = new Map<string, DailyReviewStat>();
            dailyStatsByUser.set(m.user_id, userDailyMap);
          }
          latestBySlotAndDate.forEach(({ dateKey, state }) => {
            if (state === '') return; // 되돌리기로 취소된 체크는 집계 제외
            const dayStat = userDailyMap!.get(dateKey) || { date: dateKey, reviewedCount: 0, correctCount: 0, incorrectCount: 0 };
            dayStat.reviewedCount += 1;
            if (state === 'O') {
              dayStat.correctCount += 1;
            } else {
              dayStat.incorrectCount += 1;
            }
            userDailyMap!.set(dateKey, dayStat);
          });
        }

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

      // 각 유저별 주간 점수 산출 (콤보제 적용) + 날짜별 복습 정답률 최근 14일 정리(최신순).
      // "최근 14개 활동일"이 아니라 "최근 14일간의 활동"이므로 날짜 창으로 자르고, 그 안에서도
      // 활동 없는 날짜는 행을 만들지 않는다 — Map에는 애초에 활동이 있었던 날짜만 들어있음.
      statsMap.forEach((stat) => {
        stat.weeklyScore = Math.round(stat.weeklyScore);

        const userDailyMap = dailyStatsByUser.get(stat.userId);
        if (userDailyMap) {
          stat.dailyReviewStats = Array.from(userDailyMap.values())
            .filter(day => day.date >= fourteenDaysAgoKey)
            .sort((a, b) => b.date.localeCompare(a.date));
        }
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
              const realName = (user as any).displayName || (user as any).username;
              const nick = user.nickname;
              const hasCustomNick = nick && nick !== realName;
              // 최근 업로드(lastActivity)와 마지막 복습(lastReviewDate) 중 실제로 더 최근인 쪽을 표시 —
              // 복습 후 새 오답을 업로드했다면 그게 더 최근 활동이므로 review 우선으로 고정하면 안 됨
              const lastActivityRaw = [user.lastActivity, user.lastReviewDate]
                .filter((d): d is string => !!d)
                .reduce((latest, d) => (!latest || new Date(d) > new Date(latest) ? d : latest), null as string | null);
              const lastActivityLabel = lastActivityRaw ? formatDate(lastActivityRaw).split(' ')[0] : '—';
              const todayAccuracyLabel = user.todayReviewedCount > 0
                ? `${Math.round((user.todayCorrectCount / user.todayReviewedCount) * 100)}%`
                : '—';

              return (
                // 압축된 기본 카드: 스캔에 필요한 핵심 정보만 (이름/최근 활동/오늘 복습·정답률/학년 미지정 배지).
                // 학년 select·주간 스코어·콤보 포인트·누적 통계·진행률·장착 아이템은 클릭 시 여는 상세
                // 모달로 이동(아래 selectedStudent 블록) — 값과 로직은 그대로 재사용, 위치만 옮김.
                <div
                  key={user.userId}
                  onClick={() => setSelectedStudentId(user.userId)}
                  onKeyDown={(e) => {
                    // 학년 select 등 상세 정보가 이제 모달 안에 있어서, 카드 자체를 키보드로 열 수
                    // 있어야 그 안의 컨트롤에도 도달할 수 있다.
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedStudentId(user.userId);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className="bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center space-x-3 transition-all hover:border-slate-700 cursor-pointer"
                >
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center text-white font-black text-xs flex-none">
                    {(realName || 'U').charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-1.5 min-w-0">
                      <span className={`font-bold text-xs truncate ${user.email?.toLowerCase().startsWith('test') ? 'text-rainbow-wave' : 'text-white'}`}>
                        {realName}{hasCustomNick && <span className="text-amber-400 font-semibold"> ({nick})</span>}
                      </span>
                      {!user.schoolGrade && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-500 border border-slate-700 font-bold flex-none">
                          학년 미지정
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-slate-500 truncate block mt-0.5">
                      최근 활동 {lastActivityLabel}
                    </span>
                  </div>

                  {/* 오늘의 복습 (reviewLog 기준 — 항상 표시, 활동 없으면 0/— 로) */}
                  <div className="flex-none text-right pl-2">
                    <span className="text-[9px] text-amber-400 font-bold block leading-none">
                      오늘 {user.todayReviewedCount}문제
                    </span>
                    <span className="text-xs font-black text-amber-300 block leading-none mt-1">
                      {todayAccuracyLabel}
                    </span>
                  </div>
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

      {/* ── 학생 카드 클릭 시 여는 상세 모달 ── 압축 카드에서 뺀 정보(학년/주간 스코어/콤보 포인트/
          누적 통계/진행률/장착 아이템)를 여기로 그대로 옮겨왔다. 값·저장 로직은 기존 카드에서 쓰던
          것을 그대로 재사용(select의 onChange 등) — selectedStudent가 stats에서 매번 다시 찾은
          최신 값이라 학년을 바꿔도 이 모달 안에서 바로 최신 상태로 보인다. ── */}
      {selectedStudent && (() => {
        const isEmailValid = selectedStudent.email && selectedStudent.email.includes('@');
        const activeNotes = selectedStudent.mistakeCount - selectedStudent.completedCount;
        const completionRate = selectedStudent.mistakeCount > 0
          ? Math.round((selectedStudent.completedCount / selectedStudent.mistakeCount) * 100)
          : 0;
        const realName = (selectedStudent as any).displayName || (selectedStudent as any).username;
        const nick = selectedStudent.nickname;
        const hasCustomNick = nick && nick !== realName;

        const equippedSlots: { category: string; label: string; value?: string }[] = [
          { category: 'TITLE', label: '칭호', value: selectedStudent.equippedTitle },
          { category: 'STAMP', label: '스탬프', value: selectedStudent.equippedStamp },
          { category: 'THEME', label: '테마', value: selectedStudent.equippedTheme },
          { category: 'AI_VOICE', label: 'AI 말투', value: selectedStudent.equippedAiVoice },
        ];

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
            onClick={() => setSelectedStudentId(null)}
          >
            <div
              className="w-full max-w-sm max-h-[85vh] bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4 animate-scale-up flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 flex-none">
                <h3 className="text-sm font-extrabold text-white flex items-center space-x-2 min-w-0">
                  <span className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center text-white font-black text-xs flex-none">
                    {(realName || 'U').charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate">
                    {realName}{hasCustomNick ? ` (${nick})` : ''}
                  </span>
                  {selectedStudent.equippedTitle && (() => {
                    const badge = getTitleBadgeStyle(selectedStudent.equippedTitle);
                    return (
                      <span className={`text-[9px] px-2 py-0.5 rounded-full border flex items-center space-x-1 flex-none ${badge.style}`}>
                        <span>{badge.icon}</span>
                        <span>{selectedStudent.equippedTitle}</span>
                      </span>
                    );
                  })()}
                </h3>
                <button
                  onClick={() => setSelectedStudentId(null)}
                  className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 rounded-lg flex-none"
                >
                  ✕
                </button>
              </div>

              <div className="overflow-y-auto flex-1 space-y-4">
                {/* 아이디/이메일 + 학년 선택 */}
                <div className="space-y-1.5">
                  <span className="text-[10px] text-slate-400 truncate block">
                    {(selectedStudent as any).displayName ? `아이디: ${(selectedStudent as any).username}` : (isEmailValid ? selectedStudent.email : '(이메일 정보 없음)')}
                  </span>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[9px] text-slate-500 font-bold">학년:</span>
                    <select
                      value={selectedStudent.schoolGrade || ''}
                      onChange={async (e) => {
                        const newGrade = e.target.value;
                        const targetId = selectedStudent.userId;

                        try {
                          const { error } = await supabase
                            .from('profiles')
                            .update({ school_grade: newGrade || null })
                            .eq('id', targetId);

                          if (error) throw error;

                          // Update local state
                          setStats(prev => prev.map(u => u.userId === targetId ? { ...u, schoolGrade: newGrade } : u));
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

                {/* 주간 스코어 / 콤보 포인트 / 최근 업로드 / 마지막 복습 */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                    <span className="text-[9px] text-slate-500 block leading-none">주간 스코어</span>
                    <span className="text-xs font-black text-amber-400 leading-tight block mt-1">
                      {Math.round(selectedStudent.weeklyScore)}점
                    </span>
                    <span className="text-[8px] text-slate-500 block leading-none mt-0.5">
                      ({selectedStudent.weeklyCompletedCount}개 완료 / {selectedStudent.weeklyTotalCount}개 등록)
                    </span>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                    <span className="text-[9px] text-slate-500 block leading-none">콤보 포인트</span>
                    <span className="text-xs font-black text-emerald-400 leading-tight block mt-1">
                      ⚡ {selectedStudent.comboPoints ?? 0}점
                    </span>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                    <span className="text-[9px] text-slate-500 block leading-none">최근 업로드</span>
                    <span className="text-[10px] text-slate-400 font-medium leading-none block mt-1">
                      {selectedStudent.lastActivity ? formatDate(selectedStudent.lastActivity).split(' ')[0] : '—'}
                    </span>
                  </div>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                    <span className="text-[9px] text-indigo-400 block leading-none font-bold">마지막 복습</span>
                    <span className="text-[10px] text-indigo-300 font-semibold leading-none block mt-1">
                      {selectedStudent.lastReviewDate ? formatDate(selectedStudent.lastReviewDate).split(' ')[0] : '—'}
                    </span>
                  </div>
                </div>

                {/* 누적 오답노트 통계 + 복습 진행률 */}
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-center">
                      <div className="text-xl font-black text-white">{selectedStudent.mistakeCount}</div>
                      <div className="text-[10px] text-slate-500 font-bold mt-0.5">총 오답노트</div>
                    </div>
                    <div className="bg-indigo-950/50 border border-indigo-800/40 rounded-xl p-3 text-center">
                      <div className="text-xl font-black text-indigo-300">{activeNotes}</div>
                      <div className="text-[10px] text-indigo-500 font-bold mt-0.5">진행중</div>
                    </div>
                    <div className="bg-emerald-950/50 border border-emerald-800/40 rounded-xl p-3 text-center">
                      <div className="text-xl font-black text-emerald-300">{selectedStudent.completedCount}</div>
                      <div className="text-[10px] text-emerald-500 font-bold mt-0.5">복습완료</div>
                    </div>
                  </div>
                  {selectedStudent.mistakeCount > 0 && (
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

                {/* 오늘의 복습 정답률 상세 (reviewLog 기준 — 정리하기해도 안 사라짐, ★는 오답에 합산) */}
                <div className="bg-amber-950/20 border border-amber-800/30 rounded-xl px-3 py-2 flex items-center justify-between">
                  <span className="text-[10px] text-amber-400 font-bold">
                    🎯 오늘 {selectedStudent.todayReviewedCount}문제 · 정답 {selectedStudent.todayCorrectCount} · 오답 {selectedStudent.todayIncorrectCount}
                  </span>
                  <span className="text-xs font-black text-amber-300">
                    {selectedStudent.todayReviewedCount > 0
                      ? `${Math.round((selectedStudent.todayCorrectCount / selectedStudent.todayReviewedCount) * 100)}%`
                      : '—'}
                  </span>
                </div>

                {/* 날짜별 복습 정답률 (최근 14일) — "오늘" 정답률과 완전히 동일한 정의를 날짜
                    축으로 확장. 활동 없는 날짜는 행을 만들지 않음(fetchAdminStats에서 이미 필터됨) */}
                {selectedStudent.dailyReviewStats && selectedStudent.dailyReviewStats.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">📅 날짜별 복습 (최근 14일)</span>
                    <div className="border border-slate-800 rounded-xl overflow-hidden">
                      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-1.5 bg-slate-800/50 text-[9px] font-bold text-slate-500">
                        <span>날짜</span>
                        <span className="text-right">문제</span>
                        <span className="text-right">정답</span>
                        <span className="text-right">오답</span>
                        <span className="text-right">정답률</span>
                      </div>
                      <div className="divide-y divide-slate-800/60 max-h-56 overflow-y-auto">
                        {selectedStudent.dailyReviewStats.map(day => (
                          <div key={day.date} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-3 py-1.5 text-[10px]">
                            <span className="text-slate-300 font-semibold">{day.date.slice(5)}</span>
                            <span className="text-right text-slate-400">{day.reviewedCount}</span>
                            <span className="text-right text-emerald-400 font-bold">{day.correctCount}</span>
                            <span className="text-right text-red-400 font-bold">{day.incorrectCount}</span>
                            <span className="text-right text-amber-300 font-black">
                              {Math.round((day.correctCount / day.reviewedCount) * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* 장착 아이템 */}
                <div className="space-y-2">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">🎽 장착 아이템</span>
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
          </div>
        );
      })()}
    </div>
  );
};
