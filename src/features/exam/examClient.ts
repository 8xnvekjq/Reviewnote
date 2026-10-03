import { supabase } from '../../services/supabase';
import { examLiveTransport } from './liveTransport';
import type { AdminExamApi, AdminExamAttemptSummary, AdminLiveStudent, LiveInkResponse, AdminPaperActivity, ExamClient, ExamInkDocument, InkReplayData, PeerSolution } from './contract';
import {
  ExamClientError,
  mapAddedMistakes,
  mapCheckedAnswer,
  mapExamAttempt,
  mapExamPaper,
  mapExamPaperHistory,
  mapExamResult,
  mapExamResultSummary,
  toExamItemsPayload,
  toMistakeOrigin,
  toVisitOrderPayload,
} from './examMappers';

// 기출문제 풀이 서버 경계. 상태 전이·채점은 전부 SECURITY DEFINER RPC
// (supabase/migrations/20261002120000_exam_practice.sql, v2: 20261002180000_exam_practice_v2.sql)가 하고, 여기는 얇은 타입 래퍼다.
// 실패하면 학생에게 그대로 보여 줘도 되는 한국어 문구를 담은 ExamClientError를 throw한다
// (saveProgress만 예외: 계약대로 false).

async function callRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  let response;
  try {
    response = await supabase.rpc(name, args);
  } catch (err) {
    throw new ExamClientError(err);
  }
  if (response.error) throw new ExamClientError(response.error);
  return response.data;
}

/** 오답노트에 담을 때 자동으로 붙이는 스캐폴딩 이름(중복 확인에도 쓴다). */
export const ORIGINAL_SOLUTION_CAPTION = '원래풀이';

export const examClient: ExamClient = {
  liveTransport: examLiveTransport,
  async getInk(attemptId) {
    return await callRpc('get_exam_ink', { p_attempt_id: attemptId }) as ExamInkDocument[];
  },
  async getInkReplay(attemptId, questionId) {
    return await callRpc('get_exam_ink_replay', { p_attempt_id: attemptId, p_question_id: questionId }) as InkReplayData;
  },
  async getPeerSolution(attemptId, questionId) {
    return await callRpc('get_peer_solution', { p_attempt_id: attemptId, p_question_id: questionId }) as PeerSolution | null;
  },
  async getPeerSolutionReplay(attemptId, questionId, solutionKey) {
    return await callRpc('get_peer_solution_replay', { p_attempt_id: attemptId, p_question_id: questionId, p_solution_key: solutionKey }) as InkReplayData;
  },
  async saveInk(attemptId, questionId, { revision, legacyImport, events, batchId, idsHash }) {
    // 바뀐 내용만 보낸다(supabase/migrations/20261003050000_exam_ink_delta.sql). 필기 전체는 보내지 않는다.
    // Preserve conflict codes; the generic error mapper hides unknown server codes.
    const { data, error } = await supabase.rpc('save_exam_ink_delta', {
      p_attempt_id: attemptId, p_question_id: questionId, p_revision: revision, p_legacy_import: legacyImport,
      p_events: events, p_batch_id: batchId, p_ids_hash: idsHash,
    });
    if (error) throw new Error(error.message);
    if (!Number.isInteger(data) || data < 1) throw new Error('필기 저장을 확인하지 못했어요.');
    return data as number;
  },
  async listPaperHistory(paperId, studentId) {
    return mapExamPaperHistory(await callRpc('list_my_paper_history', {
      p_paper_id: paperId, p_student_id: studentId ?? null,
    }));
  },
  async listPapers() {
    const data = await callRpc('list_exam_papers_for_me', {});
    return Array.isArray(data) ? data.map(mapExamPaper) : [];
  },

  async getActiveAttempt(paperId) {
    const data = await callRpc('get_active_exam_attempt', { p_paper_id: paperId });
    return data == null ? null : mapExamAttempt(data);
  },

  async startAttempt(paperId, mode, elective) {
    const data = await callRpc('start_exam_attempt', { p_paper_id: paperId, p_mode: mode, p_elective: elective });
    return mapExamAttempt(data);
  },

  async saveProgress(attemptId, items, visitOrder) {
    try {
      const { data, error } = await supabase.rpc('save_exam_progress', {
        p_attempt_id: attemptId,
        p_items: toExamItemsPayload(items),
        p_visit_order: toVisitOrderPayload(visitOrder, 32767),
      });
      if (error) {
        console.warn('[exam] 진행 상황 저장 실패:', error.message);
        return false;
      }
      return data === true;
    } catch (err) {
      console.warn('[exam] 진행 상황 저장 실패:', err);
      return false;
    }
  },

  async checkAnswer(attemptId, questionId, answer) {
    const data = await callRpc('check_exam_answer', {
      p_attempt_id: attemptId,
      p_question_id: questionId,
      p_answer: answer,
    });
    return mapCheckedAnswer(data) ?? { isCorrect: false, correctAnswer: '' };
  },

  async submitAttempt(attemptId, items, visitOrder) {
    const data = await callRpc('submit_exam_attempt', {
      p_attempt_id: attemptId,
      p_items: toExamItemsPayload(items),
      p_visit_order: toVisitOrderPayload(visitOrder, 32767),
    });
    return mapExamResult(data);
  },

  async getResult(attemptId) {
    const data = await callRpc('get_exam_result', { p_attempt_id: attemptId });
    return mapExamResult(data);
  },

  async listMyResults(paperId) {
    const data = await callRpc('list_my_exam_results', { p_paper_id: paperId ?? null });
    return Array.isArray(data) ? data.map(mapExamResultSummary) : [];
  },

  async addToMistakes(attemptId, questionIds) {
    if (questionIds.length === 0) return [];
    const data = await callRpc('add_exam_questions_to_mistakes', {
      p_attempt_id: attemptId,
      p_question_ids: questionIds,
      p_origin: toMistakeOrigin(window.location.origin),
    });
    return mapAddedMistakes(data);
  },

  // HandwritingOverlay와 같은 방식: 학생 본인이 student_id·teacher_id 둘 다(스캐폴딩 insert 정책이 teacher_id = 본인을 요구).
  async addOriginalSolutions(rows) {
    if (rows.length === 0) return 0;
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw new ExamClientError('로그인이 필요해요.');
    const { data: existing, error } = await supabase.from('mistake_scaffoldings').select('mistake_id')
      .in('mistake_id', rows.map(row => row.mistakeId)).eq('caption', ORIGINAL_SOLUTION_CAPTION);
    if (error) throw new ExamClientError(error);
    const skip = new Set((existing ?? []).map(row => row.mistake_id as string));
    let added = 0;
    // 한 장이 수백 KB라 한 번에 하나씩 보낸다.
    for (const row of rows) {
      if (skip.has(row.mistakeId)) continue;
      const { error: insertError } = await supabase.from('mistake_scaffoldings').insert([{
        mistake_id: row.mistakeId, student_id: userId, teacher_id: userId, image_url: row.imageDataUrl, caption: ORIGINAL_SOLUTION_CAPTION,
      }]);
      if (insertError) throw new ExamClientError(insertError);
      skip.add(row.mistakeId);
      added++;
    }
    return added;
  },
};

export const adminExamClient = {
  async listLivePapers() {
    return await callRpc('admin_list_live_exam_papers', {}) as Array<{ paperId: string; liveCount: number }>;
  },
  async getLiveExam(paperId: string) {
    return await callRpc('admin_get_live_exam', { p_paper_id: paperId }) as AdminLiveStudent[];
  },
  async getLiveInk(attemptId: string, questionId: string, sinceRevision: number | null) {
    return await callRpc('admin_get_live_ink', { p_attempt_id: attemptId, p_question_id: questionId, p_since_revision: sinceRevision }) as LiveInkResponse;
  },
  async listAttempts(studentId: string, offset = 0): Promise<AdminExamAttemptSummary[]> {
    return await callRpc('admin_list_student_exam_attempts', { p_student_id: studentId, p_offset: offset }) as AdminExamAttemptSummary[];
  },
  async getAttempt(attemptId: string) {
    return mapExamAttempt(await callRpc('admin_get_exam_attempt', { p_attempt_id: attemptId }));
  },
  async listPaperActivity(): Promise<AdminPaperActivity[] | null> {
    return await callRpc('admin_list_exam_paper_activity', {}) as AdminPaperActivity[] | null;
  },
};

/** 관리자 읽기 전용 검토(학생 결과·필기·필기 재생). 서버 함수가 관리자만 허용한다. */
export const adminExamApi: AdminExamApi = {
  liveTransport: examLiveTransport,
  ...adminExamClient,
  getInk: (attemptId: string) => examClient.getInk(attemptId),
  getInkReplay: (attemptId: string, questionId: string) => examClient.getInkReplay(attemptId, questionId),
  getResult: (attemptId: string) => examClient.getResult(attemptId),
};
