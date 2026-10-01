// 전체메뉴 "최근 사용" 기록 — 순수 함수 + try/catch로 감싼 localStorage 읽기/쓰기.
// 키는 메뉴 항목의 고유 키(ActiveTab 또는 'slides' 같은 비-탭 항목)이며, 사용자별로 따로 저장한다.

export const MENU_RECENT_STORED = 5;
export const MENU_RECENT_SHOWN = 2;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** 로그인 안 했으면 null — 기록도 표시도 하지 않는다. */
export function menuRecentStorageKey(userId: string | null | undefined): string | null {
  return userId ? `rn-menu-recent-v1:${userId}` : null;
}

/** 방금 고른 항목을 맨 앞에 넣고 중복을 지운 뒤 max개까지만 남긴다. */
export function pushMenuRecent(list: readonly string[], key: string, max = MENU_RECENT_STORED): string[] {
  return [key, ...list.filter(item => item !== key)].slice(0, max);
}

/** 지금 보이는(권한상 허용된) 항목만 순서대로 count개 고른다. */
export function pickVisibleMenuRecent(list: readonly string[], visible: readonly string[], count = MENU_RECENT_SHOWN): string[] {
  const allowed = new Set(visible);
  const picked: string[] = [];
  for (const key of list) {
    if (picked.length >= count) break;
    if (allowed.has(key) && !picked.includes(key)) picked.push(key);
  }
  return picked;
}

/** 저장된 문자열을 안전하게 해석한다 — 깨진 값이면 빈 목록. */
export function parseMenuRecent(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0).slice(0, MENU_RECENT_STORED);
  } catch {
    return [];
  }
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadMenuRecent(userId: string | null | undefined, storage: StorageLike | null = defaultStorage()): string[] {
  const key = menuRecentStorageKey(userId);
  if (!key || !storage) return [];
  try {
    return parseMenuRecent(storage.getItem(key));
  } catch {
    return [];
  }
}

/** 기록 후 새 목록을 돌려준다(저장 실패해도 메모리상 목록은 갱신). */
export function recordMenuRecent(userId: string | null | undefined, itemKey: string, storage: StorageLike | null = defaultStorage()): string[] {
  const key = menuRecentStorageKey(userId);
  if (!key) return [];
  const next = pushMenuRecent(loadMenuRecent(userId, storage), itemKey);
  try {
    storage?.setItem(key, JSON.stringify(next));
  } catch {
    // 사파리 비공개 모드 등 — 메뉴 동작에는 영향 없음.
  }
  return next;
}
