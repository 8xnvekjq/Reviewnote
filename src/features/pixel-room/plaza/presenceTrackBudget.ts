// Supabase Realtime은 한 사람이 presence track()/untrack()을 30초에 5번까지만 보낼 수 있다. 넘으면
// 서버가 그 채널을 닫아(ClientPresenceRateLimitReached) 그 학생이 다른 화면에서 사라졌다가 재접속 때
// 순간이동한다(2026-10 운영 로그: 하루 448번). 한 칸 여유를 두고 30초에 4번까지만 보낸다.
export const PRESENCE_TRACK_WINDOW_MS = 30_000;
export const PRESENCE_TRACK_MAX = 4;

/** 지금 track해도 되면 0, 아니면 기다릴 ms. history는 최근 track 시각들(오래된 순). */
export function presenceTrackDelay(history: readonly number[], now: number): number {
  const recent = history.filter(t => now - t < PRESENCE_TRACK_WINDOW_MS);
  if (recent.length < PRESENCE_TRACK_MAX) return 0;
  return recent[recent.length - PRESENCE_TRACK_MAX] + PRESENCE_TRACK_WINDOW_MS - now + 50;
}

/** 방금 보낸 시각을 더하고 창 밖의 오래된 기록은 버린다. */
export function recordPresenceTrack(history: readonly number[], now: number): number[] {
  return [...history.filter(t => now - t < PRESENCE_TRACK_WINDOW_MS), now];
}
