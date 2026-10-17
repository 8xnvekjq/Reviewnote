// 거의 바뀌지 않는 목록(강의·타임라인·선생님 접근법 가이드)을 이 기기에 잠깐 저장해 둔다.
// 로그인 토큰이 갱신될 때마다(약 1시간) 같은 목록을 통째로 다시 받던 것을 줄여 Supabase egress를 아낀다.
// 저장소가 막혀 있거나(사파리 비공개 창 등) 깨져 있으면 그냥 서버에서 받는다.
export async function cachedCatalog<T>(key: string, ttlMs: number, fetcher: () => Promise<T | null>): Promise<T | null> {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const saved = JSON.parse(raw) as { at: number; data: T };
      if (saved && typeof saved.at === 'number' && Date.now() - saved.at < ttlMs) return saved.data;
    }
  } catch { /* 저장소를 못 읽으면 서버에서 받는다 */ }
  const data = await fetcher();
  if (data !== null) {
    try { window.localStorage.setItem(key, JSON.stringify({ at: Date.now(), data })); } catch { /* 저장 실패는 무시 */ }
  }
  return data;
}

export const CATALOG_TTL_MS = 12 * 60 * 60 * 1000;
