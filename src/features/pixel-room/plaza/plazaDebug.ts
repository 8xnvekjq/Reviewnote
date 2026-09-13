// Pixel World 실시간 이동 디버그 로거 — 기본 비활성. 실제 두 계정으로 순간이동/경로 스킵 문제를
// 재현·검증할 때 DevTools 콘솔에서 `localStorage.setItem('rn-plaza-debug', '1')` 실행 후
// 새로고침하면, 파이프라인 각 단계(로컬 이동 → send → receive → smoothing enqueue/advance →
// render)가 performance.now() 기준 timestamp와 좌표를 달고 콘솔에 찍힌다. `localStorage.removeItem
// ('rn-plaza-debug')`로 끈다. 코드 수정 없이 온오프할 수 있게 하기 위한 임시 계측이며 기본값
// OFF라 평소 사용자 경험에는 전혀 영향이 없다 — 광장은 이미 admin/test 계정만 들어오므로 이
// 이상의 접근 제어는 두지 않았다.
export const PLAZA_DEBUG = typeof window !== 'undefined' && window.localStorage?.getItem('rn-plaza-debug') === '1';

export function plazaDebugLog(tag: string, ...args: unknown[]): void {
  if (PLAZA_DEBUG) console.debug(`[PlazaDebug] ${tag}`, ...args);
}
