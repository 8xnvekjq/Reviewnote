import { supabase } from '../services/supabase';

// 복습체크 DB 상태 전이는 전부 SECURITY DEFINER RPC로만 일어난다(RLS는 SELECT만 열어둠) —
// 여기 함수들은 그 RPC들의 얇은 타입 래퍼일 뿐, 상태를 직접 계산/검증하지 않는다(서버가 유일한
// 권한/정합성 판단 지점).

export type ReviewCheckStatus = 'in_progress' | 'submitted' | 'graded';
export type ReviewCheckGrade = 'correct' | 'incorrect' | null;

export interface ReviewCheckSession {
  id: string;
  studentId: string;
  grade: string;
  startChapter: string;
  endChapter: string;
  status: ReviewCheckStatus;
  totalCount: number;
  correctCount: number;
  createdAt: string;
  submittedAt: string | null;
  gradedAt: string | null;
  gradedBy: string | null;
}

export interface ReviewCheckItem {
  id: string;
  sessionId: string;
  mistakeId: string;
  position: number;
  submittedAnswer: string | null;
  grade: ReviewCheckGrade;
}

function mapSession(row: any): ReviewCheckSession {
  return {
    id: row.id,
    studentId: row.student_id,
    grade: row.grade,
    startChapter: row.start_chapter,
    endChapter: row.end_chapter,
    status: row.status,
    totalCount: row.total_count,
    correctCount: row.correct_count,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    gradedAt: row.graded_at,
    gradedBy: row.graded_by,
  };
}

function mapItem(row: any): ReviewCheckItem {
  return {
    id: row.id,
    sessionId: row.session_id,
    mistakeId: row.mistake_id,
    position: row.position,
    submittedAnswer: row.submitted_answer,
    grade: row.grade,
  };
}

// 학생 본인의 가장 최근 세션 1건 — 복습체크 화면 진입 시 "이어서 풀기 / 채점 대기 / 최근 결과"를
// 판단하는 기준. RLS가 본인 것만 보이게 이미 막아준다.
export async function fetchLatestReviewCheckSession(studentId: string): Promise<ReviewCheckSession | null> {
  const { data, error } = await supabase
    .from('review_check_sessions')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapSession(data) : null;
}

export async function fetchReviewCheckItems(sessionId: string): Promise<ReviewCheckItem[]> {
  const { data, error } = await supabase
    .from('review_check_items')
    .select('*')
    .eq('session_id', sessionId)
    .order('position', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapItem);
}

// 관리자용: 특정 학생의 세션 목록(내역) 전체 — 최신순.
export async function fetchStudentReviewCheckSessions(studentId: string): Promise<ReviewCheckSession[]> {
  const { data, error } = await supabase
    .from('review_check_sessions')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapSession);
}

// 관리자 대시보드 학생 카드용: 전체 학생의 세션을 한 번에 불러와 학생별로 "채점 대기 우선,
// 없으면 최근 결과"를 계산할 수 있게 한다(N+1 쿼리 방지).
export async function fetchAllReviewCheckSessions(): Promise<ReviewCheckSession[]> {
  const { data, error } = await supabase
    .from('review_check_sessions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapSession);
}

// 후보가 0개면 sessionId가 null로 온다(빈 in_progress 세션을 만들지 않음 — DB 함수 참고).
export async function startReviewCheckSession(params: {
  grade: string;
  startChapter: string;
  endChapter: string;
  rangeChapters: string[];
}): Promise<{ sessionId: string | null; mistakeIds: string[] }> {
  const { data, error } = await supabase.rpc('start_review_check_session', {
    p_grade: params.grade,
    p_start_chapter: params.startChapter,
    p_end_chapter: params.endChapter,
    p_range_chapters: params.rangeChapters,
  });
  if (error) throw error;
  return { sessionId: data.sessionId, mistakeIds: data.mistakeIds || [] };
}

export async function submitReviewCheckSession(
  sessionId: string,
  answers: { mistakeId: string; answer: string }[],
): Promise<void> {
  const { error } = await supabase.rpc('submit_review_check_session', {
    p_session_id: sessionId,
    p_answers: answers,
  });
  if (error) throw error;
}

export async function gradeReviewCheckSession(
  sessionId: string,
  grades: { mistakeId: string; grade: 'correct' | 'incorrect' }[],
): Promise<{ totalCount: number; correctCount: number; alreadyGraded: boolean }> {
  const { data, error } = await supabase.rpc('grade_review_check_session', {
    p_session_id: sessionId,
    p_grades: grades,
  });
  if (error) throw error;
  return data;
}

export async function updateReviewCheckItemGrade(
  sessionId: string,
  mistakeId: string,
  newGrade: 'correct' | 'incorrect',
): Promise<{ correctCount: number; changed: boolean }> {
  const { data, error } = await supabase.rpc('update_review_check_item_grade', {
    p_session_id: sessionId,
    p_mistake_id: mistakeId,
    p_new_grade: newGrade,
  });
  if (error) throw error;
  return data;
}
