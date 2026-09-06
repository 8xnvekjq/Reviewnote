import type { Dispatch, SetStateAction } from 'react';
import type { MistakeAnalysis, MistakeEntry, ReviewState } from '../../types';
import type { NoticeModalState } from '../../components/CustomNoticeModal';
import { supabase } from '../../services/supabase';
import { recordReviewStreak, getNewlyReachedMilestones, getKSTDateString, type StreakState } from '../../utils/streak';

interface UseReviewStateParams {
  // mistakes/selectedEntry 자체는 이 훅이 소유하지 않는다 — App.tsx의 최상위 state를 그대로 받아
  // 읽고(mistakes) 갱신(setMistakes/setSelectedEntry)만 한다.
  mistakes: MistakeEntry[];
  setMistakes: Dispatch<SetStateAction<MistakeEntry[]>>;
  setSelectedEntry: Dispatch<SetStateAction<MistakeEntry | null>>;
  session: any;
  streakState: StreakState;
  setStreakState: Dispatch<SetStateAction<StreakState>>;
  streakMilestoneClaimed: number;
  setStreakMilestoneClaimed: Dispatch<SetStateAction<number>>;
  setMyBonusPoints: Dispatch<SetStateAction<number>>;
  setDailyReviewCount: Dispatch<SetStateAction<number>>;
  comboBoosterExpiresAt: string | null;
  showNoticeModal: (info: Omit<NoticeModalState, 'isOpen'>) => void;
  // 정리하기(초기화) 직후 체크리스트 재생성 트리거 — useCheckpointGeneration이 소유한 함수를
  // 그대로 넘겨받아 호출만 한다(circular dependency를 피하기 위해 이 훅은
  // useCheckpointGeneration을 직접 호출하지 않는다).
  regenerateCheckpointsWithProgress: (entry: MistakeEntry) => void;
  fetchPeerActivities: () => void;
  loadWeeklyChampions: (userIdOverride?: string) => void;
}

// O/X/★ 복습 상태머신 + 그와 결합된 포인트/스트릭/콤보부스터/일일퀘스트를 담당하는 훅. App.tsx에
// 있던 것을 그대로 옮긴 것으로, 복습 정책/점수 계산/needsHelp 정의/로그 집계 정의/퀘스트
// 조건/스트릭·부스터 정책을 전혀 바꾸지 않았다. review와 streak/points/quest는 handleUpdateReviews
// 안에서 원래도 하나의 흐름으로 강하게 결합되어 있어(같은 호출 안에서 순차적으로 실행되어야
// 하는 RPC들) 억지로 더 잘게 쪼개지 않았다.
export function useReviewState({
  mistakes,
  setMistakes,
  setSelectedEntry,
  session,
  streakState,
  setStreakState,
  streakMilestoneClaimed,
  setStreakMilestoneClaimed,
  setMyBonusPoints,
  setDailyReviewCount,
  comboBoosterExpiresAt,
  showNoticeModal,
  regenerateCheckpointsWithProgress,
  fetchPeerActivities,
  loadWeeklyChampions,
}: UseReviewStateParams) {
  // 매일 연속 복습 스트릭 갱신 (🔥 Daily Streak). 신규 오답 등록과 복습 완료 양쪽에서
  // 공유해서 호출한다 — 둘 중 어느 쪽을 먼저 해도 그날의 스트릭이 채워지도록.
  // 방어권 보유 여부는 Supabase user_items에서 실시간 조회 (인벤토리가 이전되면서
  // localStorage 'reviewnote_unlocked_items' 키는 더 이상 채워지지 않는 죽은 키였음)
  const applyDailyStreakUpdate = async () => {
    if (!session?.user?.id) return;

    const { data: shieldRow } = await supabase
      .from('user_items')
      .select('quantity')
      .eq('user_id', session.user.id)
      .eq('item_id', 'item_streak_shield')
      .maybeSingle();
    const hasShieldItem = !!(shieldRow && shieldRow.quantity > 0);

    const { updatedState, shieldUsed } = recordReviewStreak(streakState, hasShieldItem);
    setStreakState(updatedState);

    if (shieldUsed) {
      showNoticeModal({
        title: '🛡️ 스트릭 방어 성공!',
        message: "어제 복습을 놓쳤지만, 럭키상점에서 보유한 '스트릭 방어권'이 자동으로 발동되어 🔥 연속 복습 기록이 안전하게 보호되었습니다!",
        badge: '스트릭 방어권 발동',
        icon: '🛡️',
      });
      // '1회용' 아이템이므로 실제로 방어에 쓰인 순간 인벤토리에서 1개 소모 (이전에는 profiles.streak_shields
      // 카운터만 갱신하고 user_items 수량은 건드리지 않아서, 아이템을 갖고 있는 한 무한정 재사용되는 버그가 있었음)
      supabase.rpc('decrement_item_quantity', { user_id_param: session.user.id, item_id_param: 'item_streak_shield' })
        .then(() => window.dispatchEvent(new Event('reviewnote_inventory_updated')));
    }

    // 🔥 스트릭 서버 동기화 + 3/7/14/28일 콤보 마일스톤 보너스 지급 (콤보 포인트에만 적립, 주간 랭킹 점수는 영향 없음)
    // 스트릭이 새로 시작된 경우(1일차) 이전에 받은 마일스톤은 리셋되어 다시 받을 수 있음
    const previousClaimed = updatedState.currentStreak === 1 ? 0 : streakMilestoneClaimed;
    const newMilestones = getNewlyReachedMilestones(previousClaimed, updatedState.currentStreak);
    const bonusGained = newMilestones.reduce((sum, m) => sum + m.bonus, 0);
    const newClaimed = newMilestones.length > 0 ? newMilestones[newMilestones.length - 1].days : previousClaimed;

    const streakUpdatePayload: Record<string, number | string> = {
      current_streak: updatedState.currentStreak,
      streak_last_review_date: updatedState.lastReviewDate,
      streak_shields: updatedState.shieldsCount,
      streak_milestone_claimed: newClaimed,
    };

    supabase.from('profiles').update(streakUpdatePayload).eq('id', session.user.id).then(({ error: streakSyncError }) => {
      if (streakSyncError) console.error('Failed to sync streak to server:', streakSyncError);
    });

    setStreakMilestoneClaimed(newClaimed);
    if (bonusGained > 0) {
      // 스트릭 보너스도 리뷰 콤보 포인트와 동일하게 원자적 증감 RPC로 처리 (레이스 컨디션 방지)
      supabase.rpc('increment_bonus_points', { user_id_param: session.user.id, amount_param: bonusGained })
        .then(({ data, error: bonusRpcError }) => {
          if (bonusRpcError) {
            console.error('Failed to grant streak milestone bonus:', bonusRpcError);
          } else if (typeof data === 'number') {
            setMyBonusPoints(data);
          }
        });
      const milestoneDaysLabel = newMilestones.map(m => `${m.days}일`).join(', ');
      showNoticeModal({
        title: '🔥 연속 복습 콤보 달성!',
        message: `${milestoneDaysLabel} 마일스톤 보너스 ${bonusGained}점이 적립되었습니다! 🐱`,
        badge: '콤보 마일스톤 달성',
        icon: '🔥',
      });
    }
  };

  // Update reviews list in Supabase & local state
  const handleUpdateReviews = async (id: string, newReviews: ReviewState[], skipPointRecalc = false) => {
    try {
      const targetEntry = mistakes.find(m => m.id === id);
      if (!targetEntry) return;

      const oldReviews = targetEntry.reviews || ['', '', ''];
      const oldReviewDates = targetEntry.analysis?.reviewDates || ['', '', ''];
      const oldReviewPoints = targetEntry.analysis?.reviewPoints || [0, 0, 0];

      // 1. 기존에 'O' 였던 칸들의 날짜·점수를 순서대로 수집 (정리하기로 O가 다른 칸으로 옮겨가도
      //    "그 순간 실제로 딴 점수"를 그대로 데려가기 위함 — 몇 번째 칸인지로 점수를 다시 매기지 않는다)
      const existingODates: string[] = [];
      const existingOPoints: number[] = [];
      oldReviews.forEach((r, idx) => {
        if (r === 'O' && oldReviewDates[idx]) {
          existingODates.push(oldReviewDates[idx]);
          existingOPoints.push(oldReviewPoints[idx] || 0);
        }
      });

      // 2. newReviews 에 대응하여 currentDates/currentPoints 정렬 조립
      const currentDates = ['', '', ''];
      const currentPoints = [0, 0, 0];
      let oCounter = 0;

      for (let i = 0; i < 3; i++) {
        const state = newReviews[i];
        const oldState = oldReviews[i];

        if (state === '') {
          currentDates[i] = '';
          currentPoints[i] = 0;
        } else if (state === 'O') {
          // O 인 경우:
          // 기존에 'O' 였던 개수 범위 내의 도장은 예전 맞춘 시간·점수 슬라이딩 정비
          if (oCounter < existingODates.length) {
            currentDates[i] = existingODates[oCounter];
            currentPoints[i] = existingOPoints[oCounter];
            oCounter++;
          } else {
            // 새로 찍힌 O 이면 신규 타임스탬프 기록 + 지금 이 칸(1차/2차/3차) 배점으로 처음 확정
            const now = new Date();
            const dateStr = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            currentDates[i] = dateStr;
            currentPoints[i] = [3, 7, 15][i];
          }
        } else {
          // X 또는 star 인 경우
          if (state === oldState && oldReviewDates[i]) {
            currentDates[i] = oldReviewDates[i];
            currentPoints[i] = oldReviewPoints[i] || 1;
          } else {
            const now = new Date();
            const dateStr = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            currentDates[i] = dateStr;
            currentPoints[i] = 1;
          }
        }
      }

      // skipPointRecalc(정리하기)일 때는, 버려지는 X/★의 참여점수(1점씩)도 총점에서 사라지면 안 된다 —
      // 남아있는 칸(대부분 O) 중 아무 데나 그 만큼을 얹어서 합계 자체는 정리 전후로 정확히 그대로 유지한다.
      if (skipPointRecalc) {
        const totalOld = oldReviewPoints.reduce((sum, p) => sum + (p || 0), 0);
        const totalNew = currentPoints.reduce((sum, p) => sum + (p || 0), 0);
        const lost = totalOld - totalNew;
        if (lost > 0) {
          const keepIdx = currentPoints.findIndex((_, i) => newReviews[i] !== '');
          currentPoints[keepIdx >= 0 ? keepIdx : 0] += lost;
        }
      }

      // 📒 포인트 취득 시점의 실제 날짜를 영구 귀속시키는 append-only 로그.
      // reviewPoints/reviewDates는 "정리하기"로 슬롯이 합쳐지면 그 슬롯의 날짜를 따라가버려서,
      // 원래 이번 주에 딴 점수가 지난 주 날짜로 뒤엉켜 재배정되는 문제가 있었다 (주간 랭킹이 깎여 보이는 원인).
      // pointLog는 슬롯 구조와 무관하게 "언제 몇 점을 땄는지"만 쌓아두고, 정리하기(skipPointRecalc)일
      // 때는 아예 건드리지 않는다 — 그래야 정리를 몇 번 해도 주간 집계가 항상 정확하다.
      const now = new Date();
      const nowStr = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const existingPointLog = targetEntry.analysis?.pointLog || [];
      const newPointLogEntries: { date: string; points: number }[] = [];
      // 📒 같은 이유로 결과(O/X/★) 자체도 append-only 로그에 남긴다. "정리하기"로 X·★ 칸이
      // 비워지는 건 다시 풀어보라는 의도된 리셋이지만, 그와 별개로 어드민의 당일 정답률처럼
      // "오늘 실제로 무슨 결과가 있었는지"는 정리하기와 무관하게 보존되어야 한다.
      // slot(0~1~2)을 함께 남겨서, 같은 칸을 같은 날 다시 고쳐도(X→O 정정 등) "그 칸의 최종
      // 상태" 하나만 인정한다 — 시도/정정 횟수는 세지 않고 슬롯별 오늘 최종 결과만 본다(제품 정의).
      // 날짜는 pointLog(nowStr, 연도 없음)와 달리 연도가 포함된 ISO 문자열로 남긴다 — 매일 단위로
      // "오늘"을 비교하는 용도라 해가 바뀐 뒤 같은 월/일 과거 기록과 혼동되면 안 되기 때문.
      const nowIso = now.toISOString();
      const existingReviewLog = targetEntry.analysis?.reviewLog || [];
      const newReviewLogEntries: { date: string; state: ReviewState; slot: number }[] = [];
      if (!skipPointRecalc) {
        for (let i = 0; i < 3; i++) {
          const delta = currentPoints[i] - (oldReviewPoints[i] || 0);
          if (delta !== 0) newPointLogEntries.push({ date: nowStr, points: delta });

          // 빈칸으로 되돌아가는 것(되돌리기/재클릭 취소)도 함께 남긴다 — 그래야 집계에서
          // "그 칸의 가장 최근 상태"를 봤을 때 취소된 체크가 여전히 정답/오답으로 잡히지 않는다.
          const newState = newReviews[i];
          if (newState !== oldReviews[i]) {
            newReviewLogEntries.push({ date: nowIso, state: newState, slot: i });
          }
        }
      }

      // 🙋 "도움 필요" 영구 플래그: 3칸이 모두 채워졌는데 O가 하나도 없으면 true로 확정하고,
      // 이후 그 문제에서 O가 하나라도 나오면 false로 해제한다. 그 외(정리하기로 3칸이 비워지는
      // 경우 포함)에는 이전 값을 그대로 둔다 — reviews 배열만으로는 "정리하기" 순간 신호가
      // 사라지므로, 이 플래그로 정리하기와 무관하게 영속시킨다(needsHelp 필드 주석 참고).
      const hasO = newReviews.includes('O');
      const allFilled = newReviews.every(r => r !== '');
      let newNeedsHelp = targetEntry.analysis?.needsHelp ?? false;
      if (hasO) {
        newNeedsHelp = false;
      } else if (allFilled) {
        newNeedsHelp = true;
      }

      const updatedAnalysis: MistakeAnalysis = {
        solvingProcess: targetEntry.analysis?.solvingProcess || '',
        ...targetEntry.analysis,
        reviewDates: currentDates,
        reviewPoints: currentPoints,
        pointLog: [...existingPointLog, ...newPointLogEntries],
        reviewLog: [...existingReviewLog, ...newReviewLogEntries],
        needsHelp: newNeedsHelp,
        // 🧭 정리하기(초기화)면 기존 체크리스트를 지워 다시 진단하게 한다 — 반드시 undefined로
        // 지워야 한다(빈 배열 []은 truthy라 generateAndSaveSolutionCheckpoints의 "이미 있음" 캐시
        // 가드에 걸려 재생성이 아예 안 되고, undefined는 JSON 직렬화 시 키 자체가 빠져 DB에서도
        // 실제로 지워진다).
        ...(skipPointRecalc ? { solutionCheckpoints: undefined } : {}),
      };

      const { error } = await supabase
        .from('mistakes')
        .update({
          reviews: newReviews,
          analysis: updatedAnalysis,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      const updatedEntry = {
        ...targetEntry,
        reviews: newReviews,
        analysis: updatedAnalysis
      };

      setMistakes(prev => prev.map(m => m.id === id ? updatedEntry : m));
      setSelectedEntry(prev => prev && prev.id === id ? updatedEntry : prev);

      // 🧭 정리하기(초기화)였다면 방금 지운 체크리스트를 즉시 재생성 트리거 + 진행 상태 표시.
      if (skipPointRecalc) {
        regenerateCheckpointsWithProgress(updatedEntry);
      }

      // 🎯 복습 단계별 콤보 포인트 실시간·영구 적립 (1차 O=3, 2차 O=7, 3차 O=15, X/★=참여점수 1점).
      // "몇 번째 칸이냐"가 아니라 위에서 계산한 currentPoints(체크 시점에 확정된 실제 점수)를 그대로
      // 쓴다 — 그래야 "맞춘 오답 제외하고 정리하기"로 O가 다른 칸에 옮겨가도 배점이 안 바뀐다.
      // 이전 상태와 새 상태를 비교해서 "차이(delta)"만 반영한다 — O↔X↔빈칸을 왔다갔다 해도 매번
      // 다시 지급되지 않고(악용 방지), 반대로 되돌리면 정확히 그만큼 회수된다.
      // skipPointRecalc: 정리하기처럼 애초에 아무 점수 변화도 원치 않는 액션을 위한 추가 안전장치.
      let reviewPointDelta = 0;
      if (!skipPointRecalc) {
        for (let i = 0; i < 3; i++) {
          reviewPointDelta += currentPoints[i] - (oldReviewPoints[i] || 0);
        }
      }

      // ⚡ 콤보 부스터 3시간 5배 버프 적용 (사용 후 3시간 동안 모든 복습 획득 포인트 5배!)
      // 서버(profiles.combo_booster_expires_at, activate_combo_booster RPC로만 설정됨)를 신뢰
      // 근거로 삼는다 — 클라이언트가 임의로 localStorage 값을 조작해서 버프를 위조할 수 없다.
      const isBoosterActive = !!comboBoosterExpiresAt && Date.now() < new Date(comboBoosterExpiresAt).getTime();

      if (reviewPointDelta > 0 && isBoosterActive) {
        reviewPointDelta = reviewPointDelta * 5; // 복습 획득 포인트 5배 곱하기 적용
      }

      if (reviewPointDelta !== 0 && session?.user?.id) {
        // 서버 측 원자적 증감 RPC로 처리
        supabase.rpc('increment_bonus_points', { user_id_param: session.user.id, amount_param: reviewPointDelta })
          .then(({ data, error: bonusError }) => {
            if (bonusError) {
              console.error('Failed to sync review combo points:', bonusError);
            } else if (typeof data === 'number') {
              setMyBonusPoints(data);
            }
          });
      }

      // 🎯 일일 복습 퀘스트: 이번 호출에서 빈 칸('')에서 새로 체크된 개수만 오늘의 진행도에 반영
      // (되돌리기는 카운트하지 않음 — O↔X 왔다갔다 해도 매번 안 늘어나게)
      const newlyCheckedCount = newReviews.filter((r, i) => r !== '' && oldReviews[i] === '').length;
      if (newlyCheckedCount > 0 && session?.user?.id) {
        supabase.rpc('record_daily_review_progress', {
          user_id_param: session.user.id,
          today_param: getKSTDateString(),
          increment_param: newlyCheckedCount,
        }).then(({ data, error: questError }) => {
          if (questError) {
            console.error('Failed to record daily review quest progress:', questError);
            return;
          }
          const result = data as { count: number; bonusEarned: boolean } | null;
          if (!result) return;
          setDailyReviewCount(result.count);
          if (result.bonusEarned) {
            supabase.rpc('increment_bonus_points', { user_id_param: session.user.id, amount_param: 20 })
              .then(({ data: newTotal, error: bonusRpcError }) => {
                if (bonusRpcError) {
                  console.error('Failed to grant daily quest bonus:', bonusRpcError);
                  return;
                }
                if (typeof newTotal === 'number') setMyBonusPoints(newTotal);
                showNoticeModal({
                  title: '🎯 일일 복습 퀘스트 달성!',
                  message: '오늘 복습 5개를 모두 채웠어요!\n보너스 콤보 포인트 +20점을 받았습니다!',
                  badge: '일일 퀘스트 완료',
                  icon: '🎯',
                });
              });
          }
        });
      }

      // 매일 연속 복습 스트릭 갱신 (🔥 Daily Streak) — 신규 등록/복습 완료 공용 함수
      applyDailyStreakUpdate();

      // Refresh peer activities locally
      fetchPeerActivities();
      loadWeeklyChampions(); // MVP 챔피언 배너 즉각 갱신
    } catch (err: any) {
      console.error('Failed to update reviews:', err);
      // Fallback: update local React state anyway for immediate validation
      const targetEntry = mistakes.find(m => m.id === id);
      if (targetEntry) {
        const currentDates = [...(targetEntry.analysis?.reviewDates || ['', '', ''])];
        const oldReviews = targetEntry.reviews || ['', '', ''];
        for (let i = 0; i < 3; i++) {
          if (newReviews[i] !== '' && oldReviews[i] === '') {
            const now = new Date();
            const dateStr = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
            currentDates[i] = dateStr;
          } else if (newReviews[i] === '') {
            currentDates[i] = '';
          }
        }
        const updatedAnalysis: MistakeAnalysis = {
          solvingProcess: targetEntry.analysis?.solvingProcess || '',
          ...targetEntry.analysis,
          reviewDates: currentDates
        };
        const updatedEntry = {
          ...targetEntry,
          reviews: newReviews,
          analysis: updatedAnalysis
        };
        setMistakes(prev => prev.map(m => m.id === id ? updatedEntry : m));
        setSelectedEntry(prev => prev && prev.id === id ? updatedEntry : prev);
      }
    }
  };

  return {
    applyDailyStreakUpdate,
    handleUpdateReviews,
  };
}
