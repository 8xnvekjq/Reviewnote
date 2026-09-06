// 화면별 transient UI 상태(스크롤 위치, 필터 등)를 세션 메모리에서만 보관하는 아주 얇은 저장소.
// DB/localStorage를 쓰지 않으므로 새로고침하면 항상 비워진다(의도된 동작) — 모듈 스코프의 평범한
// 객체 하나로 충분해서 Context를 두지 않는다. 탭 전환으로 화면 컴포넌트가 unmount/remount되어도
// 이 모듈 자체는 앱이 살아있는 동안 다시 로드되지 않으므로 값이 계속 유지된다.
const store: Record<string, unknown> = {};

export function getScreenState<T>(key: string): T | undefined {
  return store[key] as T | undefined;
}

export function setScreenState<T>(key: string, value: T): void {
  store[key] = value;
}
