import type { AdminExamApi, AdminPaperActivity } from '../contract.ts';
import { startLivePolling, type PollEnvironment } from './livePolling.ts';

/** 응답이 시험지 id·인원 수뿐이라 화면이 보이는 동안 12초마다 받아도 가볍다. */
export const LIVE_BADGE_POLL_MS = 12000;

/**
 * 시험지 고르기 화면의 Live 배지.
 * 응시 현황(관리자 판별)이 성공할 때까지 백오프로 다시 묻고 — 한 번 실패하면 새로고침 전까지 배지가 영영 안 뜨던 원인 —
 * 관리자면 Live 목록을 주기적으로 받는다. 학생이면 서버가 null을 주므로 Live 목록은 묻지 않는다.
 * 숨김 시 정지·복귀 즉시 1회·요청 중복 금지·실패 백오프는 startLivePolling이 맡는다.
 */
export function startLiveBadgePolling(
  api: Pick<AdminExamApi, 'listPaperActivity' | 'listLivePapers'>,
  env: PollEnvironment,
  on: { activity(rows: AdminPaperActivity[]): void; counts(counts: Map<string, number>): void },
  interval = LIVE_BADGE_POLL_MS,
) {
  let stopped = false;
  let stopLive = () => {};
  let stopCheck = () => {};
  stopCheck = startLivePolling(async () => {
    const rows = await api.listPaperActivity();
    if (stopped) return;
    stopCheck();
    if (!rows) return;
    on.activity(rows);
    stopLive = startLivePolling(async () => {
      const live = await api.listLivePapers();
      if (!stopped) on.counts(new Map(live.map(row => [row.paperId, row.liveCount])));
    }, env, interval);
  }, env, interval);
  return () => { stopped = true; stopCheck(); stopLive(); };
}
