export interface StreakState {
  currentStreak: number;
  lastReviewDate: string; // YYYY-MM-DD
  shieldsCount: number;
}

const STORAGE_KEY = 'reviewnote_streak_state';

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

// 저장된 스트릭 상태 로드
export function loadStreakState(): StreakState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed: StreakState = JSON.parse(saved);
      const today = getKSTDateString();

      // 만약 마지막 복습일로부터 2일 이상 지난 경우 (스트릭 끊김 검사)
      if (parsed.lastReviewDate && parsed.currentStreak > 0) {
        const diff = getDaysDiff(parsed.lastReviewDate, today);
        if (diff > 1) {
          // 1일 초과해서 놓쳤고, 방어권이 있으면 1개 자동 사용하여 방어
          if (diff === 2 && parsed.shieldsCount > 0) {
            parsed.shieldsCount -= 1;
            // 스트릭 유지
          } else {
            // 방어권 없거나 이틀 이상 놓치면 리셋
            parsed.currentStreak = 0;
          }
        }
      }
      return parsed;
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
