export interface StreakState {
  currentStreak: number;
  lastReviewDate: string; // YYYY-MM-DD
  shieldsCount: number;
}

const STORAGE_KEY = 'reviewnote_streak_state';

// 연속 복습 콤보 보너스 마일스톤 (연속일수 -> 1회성 지급 보너스 포인트).
// 스트릭 런(연속 기록) 하나당 한 번씩만 지급되며, 스트릭이 끊기고 새로 시작하면 다시 받을 수 있다.
export const STREAK_MILESTONES: { days: number; bonus: number }[] = [
  { days: 3, bonus: 10 },
  { days: 7, bonus: 30 },
  { days: 14, bonus: 100 },
  { days: 28, bonus: 250 },
];

/**
 * 이전에 지급받은 마일스톤(previousClaimed, 0/3/7/14/28)보다 높으면서
 * 현재 스트릭 일수로 새로 도달한 마일스톤들을 전부 반환한다 (보통 1개, 값이 어긋나 있으면 여러 개일 수도 있음).
 */
export function getNewlyReachedMilestones(previousClaimed: number, currentStreak: number): { days: number; bonus: number }[] {
  return STREAK_MILESTONES.filter(m => m.days > previousClaimed && currentStreak >= m.days);
}

// KST 날짜 구하기 (YYYY-MM-DD)
export function getKSTDateString(date: Date = new Date()): string {
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const kst = new Date(utc + (9 * 3600000));
  const year = kst.getFullYear();
  const month = String(kst.getMonth() + 1).padStart(2, '0');
  const day = String(kst.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 두 KST 날짜 사이의 일수 차이 계산
export function getDaysDiff(dateStr1: string, dateStr2: string): number {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  const diffTime = Math.abs(d2.getTime() - d1.getTime());
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

// 마지막 복습일로부터 시간이 지나 스트릭이 끊겼는지 검사하고, 필요하면 방어권을 소모하거나 리셋한다.
// (localStorage 로드와 서버 상태 동기화 양쪽에서 동일한 규칙을 적용하기 위해 분리)
function applyStreakExpiry(state: StreakState): StreakState {
  const today = getKSTDateString();
  const next = { ...state };

  // 만약 마지막 복습일로부터 2일 이상 지난 경우 (스트릭 끊김 검사)
  if (next.lastReviewDate && next.currentStreak > 0) {
    const diff = getDaysDiff(next.lastReviewDate, today);
    if (diff > 1) {
      // 1일 초과해서 놓쳤고, 방어권이 있으면 1개 자동 사용하여 방어
      if (diff === 2 && next.shieldsCount > 0) {
        next.shieldsCount -= 1;
        // 스트릭 유지
      } else {
        // 방어권 없거나 이틀 이상 놓치면 리셋
        next.currentStreak = 0;
      }
    }
  }
  return next;
}

// 저장된 스트릭 상태 로드
export function loadStreakState(): StreakState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed: StreakState = JSON.parse(saved);
      return applyStreakExpiry(parsed);
    }
  } catch (e) {
    console.error(e);
  }

  return {
    currentStreak: 1, // 디폴트 1일 시작
    lastReviewDate: getKSTDateString(),
    shieldsCount: 1, // 가챠로 획득 가능
  };
}

// 서버(profiles 테이블)에 저장된 스트릭 상태와 로컬(localStorage) 상태 중 하나를 골라
// 이 기기에서 사용할 "권위있는" 상태를 결정한다. 기기를 바꿔도 스트릭이 안 끊기게 하는 것이
// 목적이므로 서버에 기록이 있으면 서버를 우선하고, 없으면(첫 동기화 이전) 로컬을 그대로 쓴다.
// 어느 쪽을 쓰든 만료 검사(applyStreakExpiry)는 다시 적용해서 규칙이 항상 일관되게 한다.
export function reconcileStreakState(dbState: StreakState | null, localState: StreakState): StreakState {
  const base = dbState && dbState.lastReviewDate ? dbState : localState;
  const reconciled = applyStreakExpiry(base);
  saveStreakState(reconciled);
  return reconciled;
}

// 스트릭 상태 저장
export function saveStreakState(state: StreakState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error(e);
  }
}

// 복습 수행 시 스트릭 갱신 함수
export function recordReviewStreak(currentState: StreakState, hasShieldItem: boolean): { updatedState: StreakState; shieldUsed: boolean } {
  const today = getKSTDateString();
  let shieldUsed = false;
  const newState = { ...currentState };

  // 방어권 소유 개수 갱신
  if (hasShieldItem && newState.shieldsCount === 0) {
    newState.shieldsCount = 1;
  }

  if (!newState.lastReviewDate) {
    newState.currentStreak = 1;
    newState.lastReviewDate = today;
  } else if (newState.lastReviewDate === today) {
    // 오늘 이미 복습한 이력이 있음 -> 스트릭 유지
  } else {
    const diff = getDaysDiff(newState.lastReviewDate, today);
    if (diff === 1) {
      // 어제 복습하고 오늘 복습 -> 스트릭 1일 증가!
      newState.currentStreak += 1;
      newState.lastReviewDate = today;
    } else if (diff === 2 && newState.shieldsCount > 0) {
      // 하루 지났으나 방어권이 있음! 방어권 소모 후 연속 유지
      newState.shieldsCount -= 1;
      newState.currentStreak += 1;
      newState.lastReviewDate = today;
      shieldUsed = true;
    } else {
      // 그 이상 지나고 방어권 없으면 1일부터 새로 시작
      newState.currentStreak = 1;
      newState.lastReviewDate = today;
    }
  }

  saveStreakState(newState);
  return { updatedState: newState, shieldUsed };
}
