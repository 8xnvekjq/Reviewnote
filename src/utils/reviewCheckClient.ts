import { supabase } from '../services/supabase';

// 복습체크 DB 상태 전이는 전부 SECURITY DEFINER RPC로만 일어난다(RLS는 SELECT만 열어둠) —
// 여기 함수들은 그 RPC들의 얇은 타입 래퍼일 뿐, 상태를 직접 계산/검증하지 않는다(서버가 유일한
// 권한/정합성 판단 지점).

export type ReviewCheckStatus = 'in_progress' | 'submitted' | 'graded';
export type ReviewCheckGrade = 'correct' | 'incorrect' | null;
export type AiGradeVerdict = 'correct' | 'incorrect' | 'manual_review';
export type GradedSource = 'ai' | 'admin';

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
  // AI 자동채점 결과 — review-check-grade Edge Function이 채웠다면 존재, 아니라면(아직 미실행 /
  // 구버전 데이터) 전부 null. admin이 직접 O/X를 눌러 확정한 grade를 덮어쓰지 않는다.
  aiVerdict: AiGradeVerdict | null;
  aiConfidence: number | null;
  aiReason: string | null;
  aiNormalizedStudentAnswer: string | null;
  aiCanonicalAnswer: string | null;
  aiGradedAt: string | null;
  aiGradingVersion: number | null;
  gradedSource: GradedSource | null;
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
    aiVerdict: row.ai_verdict,
    aiConfidence: row.ai_confidence,
    aiReason: row.ai_reason,
    aiNormalizedStudentAnswer: row.ai_normalized_student_answer,
    aiCanonicalAnswer: row.ai_canonical_answer,
    aiGradedAt: row.ai_graded_at,
    aiGradingVersion: row.ai_grading_version,
    gradedSource: row.graded_source,
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

// 제출 직후 AI 자동채점을 요청한다 — 이 호출은 학생 제출 흐름의 필수 경로가 아니라 "되면 좋은"
// 보강 기능이다. 실패해도(네트워크 오류, Edge Function 장애 등) 절대 밖으로 throw하지 않고 그냥
// null을 돌려준다 — 호출부는 이미 존재하는 "선생님이 채점하면..." 대기 화면으로 자연스럽게
// 폴백하면 되므로, 이 실패 하나 때문에 제출 자체가 실패한 것처럼 보이면 안 된다.
export async function requestReviewCheckAiGrading(
  sessionId: string,
): Promise<{ allGraded: boolean; gradedCount: number; manualReviewCount: number } | null> {
  try {
    const { data, error } = await supabase.functions.invoke('review-check-grade', {
      body: { sessionId },
    });
    if (error) throw error;
    return {
      allGraded: !!data?.allGraded,
      gradedCount: data?.gradedCount ?? 0,
      manualReviewCount: data?.manualReviewCount ?? 0,
    };
  } catch (err) {
    console.error('Failed to request review check AI grading:', err);
    return null;
  }
}

// 문제카드 "약함" 표시용 — review_check_mastered_at은 "정답 확정" 시점에만 세워지고 "오답 확정"
// 시점엔 다시 null로 리셋되므로(private.apply_review_check_outcome 참고), null 하나만으로는
// "한 번도 복습체크 안 함"과 "복습체크에서 최근에 틀림"을 구분할 수 없다. 그래서 문제별로 실제
// review_check_items 이력을 직접 훑어 "가장 최근에 확정된 판정"을 계산한다 — 새 컬럼/테이블
// 없이 기존 세션/문항 데이터만으로 구하는 순수 파생값이다. 파생 로직 자체는 supabase를 import하지
// 않는 별도 순수 파일(reviewCheckLatestVerdict.ts)에 있다 — 그래야 Vite 없이도 유닛 테스트 가능.
import { reduceLatestVerdictByMistake, type LatestReviewCheckVerdict } from './reviewCheckLatestVerdict';
export type { LatestReviewCheckVerdict } from './reviewCheckLatestVerdict';
export { reduceLatestVerdictByMistake } from './reviewCheckLatestVerdict';

// 이 학생의 복습체크 전체 이력(모든 세션)에서, 문제(mistake)별로 가장 최근에 확정된 O/X 판정만
// 뽑아낸다. 관리자가 AI 판정을 뒤집은 경우에도 grade 컬럼 자체가 이미 최종값이므로(AI 채점
// RPC와 admin 채점 RPC가 같은 grade 컬럼을 공유) 별도의 "admin override 반영" 로직이 필요 없다.
export async function fetchLatestReviewCheckVerdictByMistake(
  studentId: string,
): Promise<Map<string, LatestReviewCheckVerdict>> {
  const sessions = await fetchStudentReviewCheckSessions(studentId); // 이미 created_at desc(최신순)
  if (sessions.length === 0) return new Map();

  const sessionOrder = new Map(sessions.map((s, i) => [s.id, i]));
  const { data, error } = await supabase
    .from('review_check_items')
    .select('mistake_id, grade, session_id')
    .in('session_id', sessions.map(s => s.id))
    .not('grade', 'is', null);
  if (error) throw error;

  const itemsInSessionRecencyOrder = (data || [])
    .slice()
    .sort((a, b) => (sessionOrder.get(a.session_id) ?? 0) - (sessionOrder.get(b.session_id) ?? 0))
    .map(row => ({ mistakeId: row.mistake_id as string, grade: row.grade as LatestReviewCheckVerdict }));

  return reduceLatestVerdictByMistake(itemsInSessionRecencyOrder);
}
