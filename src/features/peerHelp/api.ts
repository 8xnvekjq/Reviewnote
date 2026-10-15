// 서로 도와주기 서버 함수 묶음. 학생은 표를 직접 읽지 못하고 이 함수들(supabase/migrations/20261028100000_peer_help.sql)로만 쓴다.
// 상대방은 동물 얼굴·칭호·학년(HelpLabel)으로만 보인다. 포인트는 giveHelpFeedback 안에서 서버가 준다.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { InkReplayEvent, InkStroke } from '../exam/contract.ts';
import { HELP_MAX_BYTES, decodeHelpSolution, encodeHelpSolution, helpSolutionStats, type HelpSolutionFile } from './solutionFile.ts';

export const HELP_BUCKET = 'help-solutions';
/** 서버와 같은 보상. 화면 안내용 — 실제 지급은 서버가 한도에 따라 정한다.
 *  도움 됐어요 = 도우미에게 지식의 조각 1개 + 10P, 이해 못 했어요 = 도우미 5P, 피드백을 남긴 요청자 3P. */
export const HELP_REWARD = { likeShards: 1, likePoints: 10, unclear: 5, requester: 3 } as const;

export interface HelpLabel { face: string; title: string | null; grade: string | null }
export type HelpRequestStatus = 'open' | 'closed' | 'cancelled';
export type HelpFeedback = 'like' | 'unclear';

export interface MyHelpRequest {
  id: string; mistake_id: string; status: HelpRequestStatus; created_at: string; solution_count: number; unseen_count: number;
  /** 서로 도와주기 탭의 '내가 도움 요청한 문제' 목록용 */
  image_url?: string | null; title?: string | null;
}
export interface OpenHelpRequest {
  id: string; image_url: string; title: string | null; grade: string | null; chapter: string | null;
  created_at: string; solution_count: number; requester: HelpLabel; mine_submitted: boolean;
}
export interface HelpSolutionRow {
  id: string; storage_path: string; stroke_count: number; duration_ms: number; created_at: string;
  feedback: HelpFeedback | null; helper: HelpLabel; file_available: boolean;
}
export interface GivenHelp {
  id: string; request_id: string; created_at: string; feedback: HelpFeedback | null; feedback_at: string | null;
  reward: number; shards?: number; image_url: string | null; requester: HelpLabel;
}
export interface FeedbackResult { helper_reward: number; helper_shards?: number; requester_reward: number; closed: boolean }
/** 로그인 알림: 내 요청에 새로 온 풀이(요청별 묶음). */
export interface HelpArrival { request_id: string; title: string | null; image_url: string | null; count: number }
export interface AdminHelpRow {
  solution_id: string; request_id: string; created_at: string; request_status: HelpRequestStatus;
  image_url: string | null; mistake_title: string | null; storage_path: string; stroke_count: number; duration_ms: number;
  feedback: HelpFeedback | null; helper_reward: number; requester_reward: number; removed_at: string | null; file_available: boolean;
  helper: { id: string; name: string | null; face: string }; requester: { id: string; name: string | null; face: string };
}

/** 서버 오류 문구(한국어)를 그대로 보여 줄 수 있게 꺼낸다. */
function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message && /[가-힣]/.test(error.message) ? error.message : fallback);
}

async function rpc<T>(client: SupabaseClient, name: string, args: Record<string, unknown>, fallback: string): Promise<T> {
  const { data, error } = await client.rpc(name, args);
  if (error) fail(error, fallback);
  return data as T;
}

export const requestHelp = (client: SupabaseClient, mistakeId: string) =>
  rpc<{ id: string; status: HelpRequestStatus; solution_count: number }>(client, 'request_help', { p_mistake_id: mistakeId }, '도움 요청을 걸지 못했어요.');
export const cancelHelpRequest = (client: SupabaseClient, requestId: string) =>
  rpc<null>(client, 'cancel_help_request', { p_request_id: requestId }, '도움 요청을 취소하지 못했어요.');
export const myHelpRequests = (client: SupabaseClient) =>
  rpc<MyHelpRequest[]>(client, 'my_help_requests', {}, '도움 요청 상태를 불러오지 못했어요.');
export const listHelpRequests = (client: SupabaseClient, limit = 40) =>
  rpc<OpenHelpRequest[]>(client, 'list_help_requests', { p_limit: limit }, '도와줄 문제 목록을 불러오지 못했어요.');
export const listHelpSolutions = (client: SupabaseClient, requestId: string) =>
  rpc<HelpSolutionRow[]>(client, 'list_help_solutions', { p_request_id: requestId }, '풀이 목록을 불러오지 못했어요.');
export const myHelpGiven = (client: SupabaseClient, limit = 30) =>
  rpc<GivenHelp[]>(client, 'my_help_given', { p_limit: limit }, '내가 보낸 풀이를 불러오지 못했어요.');
export const giveHelpFeedback = (client: SupabaseClient, solutionId: string, kind: HelpFeedback) =>
  rpc<FeedbackResult>(client, 'give_help_feedback', { p_solution_id: solutionId, p_kind: kind }, '피드백을 보내지 못했어요.');
export const helpNewArrivals = (client: SupabaseClient) =>
  rpc<HelpArrival[]>(client, 'help_new_arrivals', {}, '새 풀이 알림을 불러오지 못했어요.');
export const markHelpArrivalsNotified = (client: SupabaseClient) =>
  rpc<number>(client, 'mark_help_arrivals_notified', {}, '알림을 확인 처리하지 못했어요.');
export const adminListHelp = (client: SupabaseClient, limit = 100) =>
  rpc<AdminHelpRow[]>(client, 'admin_list_help', { p_limit: limit }, '도움 기록을 불러오지 못했어요.');
export const adminRemoveHelpSolution = (client: SupabaseClient, solutionId: string) =>
  rpc<{ removed: boolean; helper_clawback?: number; requester_clawback?: number }>(client, 'admin_remove_help_solution', { p_solution_id: solutionId }, '풀이를 지우지 못했어요.');

/** 필기를 파일로 올린 뒤 풀이를 제출한다. 제출이 거절되면 올린 파일은 정리 작업이 하루 뒤 지운다. */
export async function submitHelpSolution(client: SupabaseClient, requestId: string, userId: string, events: InkReplayEvent[], strokes: InkStroke[]) {
  const blob = await encodeHelpSolution(events, strokes);
  if (blob.size > HELP_MAX_BYTES) throw new Error('풀이가 너무 커요. 필기를 조금 줄여 주세요.');
  const path = `${userId}/${crypto.randomUUID()}.json.gz`;
  const { error: uploadError } = await client.storage.from(HELP_BUCKET).upload(path, blob, { contentType: 'application/gzip', upsert: false });
  if (uploadError) fail(null, '풀이 파일을 올리지 못했어요. 인터넷 연결을 확인해 주세요.');
  const stats = helpSolutionStats(events, strokes);
  return rpc<{ id: string }>(client, 'submit_help_solution', {
    p_request_id: requestId, p_storage_path: path, p_stroke_count: stats.strokeCount, p_duration_ms: stats.durationMs, p_bytes: blob.size,
  }, '풀이를 보내지 못했어요.');
}

export async function downloadHelpSolution(client: SupabaseClient, storagePath: string): Promise<HelpSolutionFile> {
  const { data, error } = await client.storage.from(HELP_BUCKET).download(storagePath);
  if (error || !data) fail(null, '풀이를 불러오지 못했어요.');
  return decodeHelpSolution(data);
}
