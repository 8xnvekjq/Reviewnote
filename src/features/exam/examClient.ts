import { supabase } from '../../services/supabase';
import type { ExamClient } from './contract';
import {
  ExamClientError,
  mapAddedMistakes,
  mapExamAttempt,
  mapExamPaper,
  mapExamResult,
  mapExamResultSummary,
  toExamItemsPayload,
  toMistakeOrigin,
  toVisitOrderPayload,
} from './examMappers';

// 기출문제 풀이 서버 경계. 상태 전이·채점은 전부 SECURITY DEFINER RPC
// (supabase/migrations/20261002120000_exam_practice.sql)가 하고, 여기는 얇은 타입 래퍼다.
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

export const examClient: ExamClient = {
  async listPapers() {
    let response;
    try {
      response = await supabase
        .from('exam_papers')
        .select('id, title, exam_date, source, time_limit_minutes, electives')
        .eq('published', true)
        .order('exam_date', { ascending: false });
    } catch (err) {
      throw new ExamClientError(err);
    }
    if (response.error) throw new ExamClientError(response.error);
    return (response.data ?? []).map(mapExamPaper);
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
        p_visit_order: toVisitOrderPayload(visitOrder),
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
    }) as { isCorrect?: unknown; correctAnswer?: unknown } | null;
    return { isCorrect: data?.isCorrect === true, correctAnswer: String(data?.correctAnswer ?? '') };
  },

  async submitAttempt(attemptId, items, visitOrder) {
    const data = await callRpc('submit_exam_attempt', {
      p_attempt_id: attemptId,
      p_items: toExamItemsPayload(items),
      p_visit_order: toVisitOrderPayload(visitOrder),
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
};
