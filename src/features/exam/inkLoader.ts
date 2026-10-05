import type { ExamInkDocument, InkStroke } from './contract.ts';

// 응시 필기 불러오기. 2026-10-05 장애: get_exam_ink(응시 전체를 한 응답에, 큰 응시 11~12MB)가 8초 statement timeout에
// 걸렸고, 앱은 실패하면 10초마다 다시 불렀다. 이제 목록(본문 없음)을 먼저 받고, 이 기기에 같은 revision이 없는 문항만
// 저장 크기 기준으로 나눠 받는다(supabase/migrations/20261005100000_exam_ink_capacity.sql).

export interface InkIndexRow { questionId: string; revision: number; updatedAt?: string; lastBatchId?: string | null; size?: number }
type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;

/** 한 요청에 담을 저장(압축) 크기. 압축 전 텍스트로는 대략 4~7배(=3~5MB). 한 문항이 넘으면 그 문항만 따로. */
export const INK_CHUNK_STORED_BYTES = 768 * 1024;
const MAX_IDS_PER_REQUEST = 50;
/** 최근 응시 몇 개의 문항 필기를 기억한다(revision이 같으면 다시 받지 않는다). */
const CACHED_ATTEMPTS = 3;

type Cached = { revision: number; updatedAt?: string; lastBatchId: string | null; strokes: InkStroke[] };
const remembered = new Map<string, Map<string, Cached>>();

function remember(attemptId: string): Map<string, Cached> {
  let entry = remembered.get(attemptId);
  if (entry) remembered.delete(attemptId);
  else entry = new Map();
  remembered.set(attemptId, entry); // 가장 최근에 쓴 응시를 맨 뒤로
  while (remembered.size > CACHED_ATTEMPTS) remembered.delete(remembered.keys().next().value!);
  return entry;
}

/** 서버에 새 함수가 아직 없을 때(앱이 마이그레이션보다 먼저 배포된 경우). */
export function isMissingFunction(error: unknown): boolean {
  // examClient의 ExamClientError는 메시지를 한국어로 바꾸므로 원래 PostgREST 오류(cause)도 본다.
  for (let e: unknown = error, depth = 0; e != null && depth < 3; e = (e as { cause?: unknown }).cause, depth++) {
    const row = typeof e === 'object' ? e as { code?: unknown; message?: unknown } : { message: e };
    if (row.code === 'PGRST202' || /PGRST202|Could not find the function|function .* does not exist/i.test(String(row.message ?? ''))) return true;
  }
  return false;
}

export function chunkIndex(rows: InkIndexRow[], budget = INK_CHUNK_STORED_BYTES): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let bytes = 0;
  for (const row of rows) {
    const size = Math.max(0, row.size ?? 0);
    if (current.length && (bytes + size > budget || current.length >= MAX_IDS_PER_REQUEST)) { chunks.push(current); current = []; bytes = 0; }
    current.push(row.questionId);
    bytes += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/**
 * 결과는 get_exam_ink와 같다. 같은 (문항, revision, updatedAt)이면 기억해 둔 획 배열을 그대로 돌려준다
 * (획 배열은 어디서도 고치지 않고 새로 만든다 — inkReplay.applyInkEvent 참고).
 */
export async function loadExamInk(rpc: Rpc, attemptId: string): Promise<ExamInkDocument[]> {
  let index: InkIndexRow[];
  try {
    index = await rpc('get_exam_ink_index', { p_attempt_id: attemptId }) as InkIndexRow[];
  } catch (error) {
    if (!isMissingFunction(error)) throw error;
    return await rpc('get_exam_ink', { p_attempt_id: attemptId }) as ExamInkDocument[];
  }
  const known = remember(attemptId);
  const fresh = (row: InkIndexRow) => {
    const hit = known.get(row.questionId);
    return hit && hit.revision === row.revision && hit.updatedAt === row.updatedAt ? hit : null;
  };
  const missing = index.filter(row => !fresh(row));
  for (const ids of chunkIndex(missing)) {
    const docs = await rpc('get_exam_ink_questions', { p_attempt_id: attemptId, p_question_ids: ids }) as ExamInkDocument[];
    for (const doc of docs) known.set(doc.questionId, { revision: doc.revision, updatedAt: doc.updatedAt, lastBatchId: doc.lastBatchId ?? null, strokes: doc.strokes });
  }
  const present = new Set(index.map(row => row.questionId));
  for (const id of [...known.keys()]) if (!present.has(id)) known.delete(id);
  const out: ExamInkDocument[] = [];
  for (const row of index) {
    const hit = known.get(row.questionId);
    // 목록과 본문 사이에 저장이 끼어들면 본문 쪽이 더 새롭다. revision·lastBatchId도 본문 기준으로 쓴다.
    if (hit) out.push({ questionId: row.questionId, strokes: hit.strokes, revision: hit.revision, updatedAt: hit.updatedAt, lastBatchId: hit.lastBatchId });
  }
  return out;
}

/** 테스트용. */
export function forgetExamInk() { remembered.clear(); }
