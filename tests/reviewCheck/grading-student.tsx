// AI 자동채점(requestReviewCheckAiGrading) 도입 후에도 학생 제출 흐름이 실제 컴포넌트 +
// 실제 supabase-js 클라이언트로 정상 동작하는지 검증하기 위한 standalone 마운트 fixture.
// 네트워크는 REST 응답 자체를 브라우저 테스트 러너가 가로채므로(supabase.ts는 건드리지 않음),
// URL이 진짜든 placeholder든 상관없다.
import { createRoot } from 'react-dom/client';
import { ReviewCheckScreen } from '../../src/components/reviewCheck/ReviewCheckScreen';
import type { MistakeEntry } from '../../src/types';

const params = new URLSearchParams(location.search);
const userId = params.get('user') || 'student-1';

const mistake: MistakeEntry = {
  id: 'mistake-1',
  title: '평면좌표 연습',
  imageUrl: 'https://example.com/mistake-1.png',
  date: '2026-09-01',
  grade: '공통수학2',
  chapter: '평면좌표',
  analysis: { solvingProcess: '두 점 사이의 거리를 구하면 된다.', finalAnswer: '5' },
};

createRoot(document.getElementById('root')!).render(
  <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
    <ReviewCheckScreen currentUserId={userId} schoolGrade="고1" mistakes={[mistake]} />
  </div>,
);
