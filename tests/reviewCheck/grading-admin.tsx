// 관리자 "복습체크" 채점 화면(AI 사전채점 반영분)을 실제 컴포넌트 + 실제 supabase-js 클라이언트로
// standalone 마운트해서 검증하기 위한 fixture.
import { createRoot } from 'react-dom/client';
import { ReviewCheckAdminOverlay } from '../../src/components/reviewCheck/ReviewCheckAdminOverlay';

const params = new URLSearchParams(location.search);
const studentId = params.get('student') || 'student-1';

createRoot(document.getElementById('root')!).render(
  <ReviewCheckAdminOverlay
    studentId={studentId}
    studentName="테스트 학생"
    onClose={() => { document.body.dataset.closed = 'true'; }}
  />,
);
