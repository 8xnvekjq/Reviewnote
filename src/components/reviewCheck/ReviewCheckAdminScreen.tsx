import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabase';
import { fetchAllReviewCheckSessions, type ReviewCheckSession } from '../../utils/reviewCheckClient';
import { ReviewCheckAdminOverlay } from './ReviewCheckAdminOverlay';
import '../../styles/examPrep.css';
import '../../styles/reviewCheck.css';

interface StudentRow {
  id: string;
  name: string;
  username: string;
  schoolGrade: string;
}

// 전체메뉴 "복습체크"의 어드민 전용 진입점 — 채점/학생별 시험 관리를 한 곳에 모은다. 이전에는
// AdminPanel(가입자 현황 대시보드)의 학생 카드 안에 배지+버튼으로 끼어 있었는데, 어드민 패널
// 본연의 역할(가입자 통계/최근 활동)과 무관한 기능이 섞여 있었다 — 그 기능 전체를 여기로 옮기고
// AdminPanel에서는 완전히 뺐다.
//
// profiles 조회는 App.tsx의 profilesMap(get_profile_directory RPC 결과)을 재사용하지 않는다 —
// 그 RPC는 학생에게 노출해도 안전한 정보만 주는 용도로 관리자 계정을 의도적으로 제외하는 등
// 공개 범위가 다르게 설계돼 있다(App.tsx 주석 참고). 여기서는 AdminPanel과 동일하게 관리자
// 전용 직접 조회(관리자만 RLS로 전체 프로필을 볼 수 있음)로 학생 목록을 가져온다.
export function ReviewCheckAdminScreen() {
  const [students, setStudents] = useState<StudentRow[] | null>(null);
  const [sessions, setSessions] = useState<ReviewCheckSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);

  const loadStudents = async () => {
    try {
      const { data, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, is_admin, display_name, nickname, school_grade')
        .order('email', { ascending: true });
      if (profilesError) throw profilesError;
      const rows: StudentRow[] = (data || [])
        .filter((p: any) => !p.is_admin)
        .map((p: any) => {
          const username = p.email?.split('@')[0] || p.id.slice(0, 8);
          const displayName = (p.display_name || '').trim();
          const nickname = (p.nickname || '').trim();
          const name = displayName || username;
          return {
            id: p.id,
            name: nickname && nickname !== name ? `${name} (${nickname})` : name,
            username,
            schoolGrade: p.school_grade || '',
          };
        });
      setStudents(rows);
    } catch (err: any) {
      setError(err?.message || '학생 목록을 불러오지 못했어요.');
    }
  };

  const loadSessions = () => {
    fetchAllReviewCheckSessions().then(setSessions).catch(err => console.error('Failed to load review check sessions:', err));
  };

  useEffect(() => {
    loadStudents();
    loadSessions();

    // 학생이 새로 제출하거나 다른 관리자가 채점을 마치면 목록 배지가 바로 최신화되도록.
    const channel = supabase
      .channel('review-check-admin-screen')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'review_check_sessions' }, () => loadSessions())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  if (error) {
    return (
      <div className="rn-empty">
        <span>{error}</span>
        <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={() => { setError(null); loadStudents(); }} style={{ marginTop: 8 }}>다시 시도</button>
      </div>
    );
  }
  if (!students) {
    return <div className="rn-empty"><span>불러오는 중...</span></div>;
  }

  // 채점 대기가 있는 학생을 맨 위로, 그다음 최근 채점 순, 기록이 없는 학생은 마지막.
  const latestByStudent = new Map<string, ReviewCheckSession>();
  for (const s of sessions) {
    if (!latestByStudent.has(s.studentId)) latestByStudent.set(s.studentId, s); // created_at desc로 이미 정렬됨 -> 첫 항목이 최신
  }
  const pendingByStudent = new Map<string, ReviewCheckSession>();
  for (const s of sessions) {
    if (s.status === 'submitted' && !pendingByStudent.has(s.studentId)) pendingByStudent.set(s.studentId, s);
  }
  const sorted = [...students].sort((a, b) => {
    const aPending = pendingByStudent.has(a.id);
    const bPending = pendingByStudent.has(b.id);
    if (aPending !== bPending) return aPending ? -1 : 1;
    const aLatest = latestByStudent.get(a.id)?.createdAt;
    const bLatest = latestByStudent.get(b.id)?.createdAt;
    if (aLatest && bLatest) return bLatest.localeCompare(aLatest);
    if (aLatest) return -1;
    if (bLatest) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      <p className="rn-caption" style={{ marginBottom: 14 }}>학생이 제출한 복습체크를 채점하고, 학생별 시험 기록을 확인해요.</p>
      <div className="rn-reviewcheck-history-list">
        {sorted.map(student => {
          const pending = pendingByStudent.get(student.id);
          const recentGraded = !pending ? latestByStudent.get(student.id) : undefined;
          return (
            <button
              type="button"
              key={student.id}
              className="rn-reviewcheck-history-row rn-reviewcheck-student-row"
              onClick={() => setSelected({ id: student.id, name: student.name })}
            >
              <span className="rn-reviewcheck-student-name">
                {student.name}
                {student.schoolGrade && <small>{student.schoolGrade}</small>}
              </span>
              {pending ? (
                <span className="pending">채점 대기 · {pending.totalCount}문제</span>
              ) : recentGraded ? (
                <span className="result">최근 {recentGraded.correctCount}/{recentGraded.totalCount}</span>
              ) : (
                <span className="rn-reviewcheck-student-empty">기록 없음</span>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <ReviewCheckAdminOverlay
          studentId={selected.id}
          studentName={selected.name}
          onClose={() => { setSelected(null); loadSessions(); }}
        />
      )}
    </div>
  );
}
