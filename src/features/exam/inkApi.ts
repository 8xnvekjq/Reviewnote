import { decodeInkPayload, encodeInkEvents } from './ink/inkCodec.ts';
import { isMissingFunction } from './inkLoader.ts';
import type { InkReplayEvent } from './contract.ts';

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
type Response = { data: unknown; error: { message: string; code?: string } | null };

/** 신형 RPC는 압축 본문을 반환한다. 미적용 서버에서만 구형 RPC로 바꾼다. */
export async function readInkAtBoundary(rpc: Rpc, name: string, args: Record<string, unknown>): Promise<unknown> {
  try { return decodeInkPayload(await rpc(`${name}_v2`, args)); }
  catch (error) {
    if (!isMissingFunction(error)) throw error;
    return decodeInkPayload(await rpc(name, args));
  }
}

export async function saveInkAtBoundary(rpc: (name: string, args: Record<string, unknown>) => Promise<Response>,
  args: Record<string, unknown> & { p_events: InkReplayEvent[] }): Promise<Response> {
  let response = await rpc('save_exam_ink_delta_v2', { ...args, p_events: encodeInkEvents(args.p_events) });
  // 배포 전 저장됐지만 응답이 유실된 로컬 batch는 원래 구형 본문으로 재확인해야 한다.
  // batch id/revision/id 해시는 그대로라 서버가 다른 요청을 잘못 승인하지 않는다.
  if (response.error && (isMissingFunction(response.error) || /EXAM_REPLAY_BATCH_MISMATCH/.test(response.error.message))) {
    response = await rpc('save_exam_ink_delta', args);
  }
  return response;
}
