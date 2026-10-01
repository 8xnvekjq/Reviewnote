// 관리자 학생 상세 모달의 "최근 복습체크 현황" standalone 마운트 fixture. AdminPanel 전체
// (profiles/mistakes 대량 조회 + realtime)를 띄우지 않고 새 컴포넌트만 마운트한다 — 학생 전환
// 버튼으로 selectedStudentId 변경(늦게 도착한 응답 취소)을 재현한다.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { AdminStudentReviewCheckSummary } from '../../src/components/admin/AdminStudentReviewCheckSummary';

const STUDENTS = ['student-1', 'student-slow', 'student-empty', 'student-error', 'student-only-progress'];

function Fixture() {
  const [studentId, setStudentId] = useState(new URLSearchParams(location.search).get('student') || 'student-1');
  return (
    <div className="max-w-sm p-5 bg-slate-900 space-y-4">
      <div className="flex flex-wrap gap-2">
        {STUDENTS.map(id => (
          <button key={id} type="button" data-student={id} onClick={() => setStudentId(id)} className="text-[10px] text-white">{id}</button>
        ))}
      </div>
      <AdminStudentReviewCheckSummary
        studentId={studentId}
        onOpenGrading={() => { document.body.dataset.openGrading = 'true'; }}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Fixture />);
