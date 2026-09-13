import { supabase } from '../services/supabase';

// 시험대비 분석 "선생님 코멘트" — 학생별 공통 코멘트 1개(시험범위별로 나누지 않음). AI 생성이
// 아니라 관리자가 직접 작성한 자유 텍스트를 저장/조회한다. RLS(exam_prep_teacher_comments
// select/insert/update 정책)가 실제 접근 제어를 담당하므로, 여기서는 그 위에 얇은 클라이언트
// 래퍼만 둔다 — 학생이 다른 학생의 코멘트를 요청해도 서버가 빈 결과를 돌려줄 뿐이다.
export interface ExamPrepTeacherComment {
  studentId: string;
  content: string;
  updatedAt: string;
  updatedBy: string | null;
}

interface TeacherCommentRow {
  student_id: string;
  content: string;
  updated_at: string;
  updated_by: string | null;
}

function fromRow(row: TeacherCommentRow): ExamPrepTeacherComment {
  return { studentId: row.student_id, content: row.content, updatedAt: row.updated_at, updatedBy: row.updated_by };
}

export async function fetchTeacherComment(studentId: string): Promise<{ ok: true; comment: ExamPrepTeacherComment | null } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase
      .from('exam_prep_teacher_comments')
      .select('student_id, content, updated_at, updated_by')
      .eq('student_id', studentId)
      .maybeSingle();
    if (error) throw error;
    return { ok: true, comment: data ? fromRow(data) : null };
  } catch (err) {
    console.error('Failed to load exam prep teacher comment:', err);
    return { ok: false, error: '코멘트를 불러오지 못했어요.' };
  }
}

// 관리자만 호출 가능(테이블 RLS가 강제) — student_id를 키로 upsert하므로 시험범위와 무관하게
// 학생당 항상 하나의 최신 코멘트만 남는다. updated_at/updated_by는 DB 트리거가 서버에서
// 채우므로 여기서 보내지 않는다.
export async function saveTeacherComment(studentId: string, content: string): Promise<{ ok: true; comment: ExamPrepTeacherComment } | { ok: false; error: string }> {
  try {
    const { data, error } = await supabase
      .from('exam_prep_teacher_comments')
      .upsert({ student_id: studentId, content }, { onConflict: 'student_id' })
      .select('student_id, content, updated_at, updated_by')
      .single();
    if (error) throw error;
    return { ok: true, comment: fromRow(data) };
  } catch (err) {
    console.error('Failed to save exam prep teacher comment:', err);
    return { ok: false, error: '코멘트를 저장하지 못했어요. 다시 시도해 주세요.' };
  }
}
