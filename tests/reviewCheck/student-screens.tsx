// 학생용 복습체크 기록 목록/상세 + 시험 중 이미지 확대를 real component + real supabase-js
// 클라이언트로 검증하기 위한 standalone 마운트 fixture(grading-student.tsx와 같은 컨벤션).
// 네트워크는 브라우저 테스트 러너가 REST 응답 자체를 가로채므로 URL이 진짜든 placeholder든 상관없다.
import { createRoot } from 'react-dom/client';
import { ReviewCheckScreen } from '../../src/components/reviewCheck/ReviewCheckScreen';
import type { MistakeEntry } from '../../src/types';

const params = new URLSearchParams(location.search);
const userId = params.get('user') || 'student-1';

// mistake-2는 의도적으로 analysis.finalAnswer가 없다 — "저장된 정답 없음" fallback 검증용.
const mistakes: MistakeEntry[] = [
  {
    id: 'mistake-1',
    title: '평면좌표 연습',
    imageUrl: 'https://example.com/mistake-1.png',
    date: '2026-09-01',
    grade: '공통수학2',
    chapter: '평면좌표',
    analysis: { solvingProcess: '두 점 사이의 거리를 구하면 된다. $d=\\sqrt{2}$', finalAnswer: '5' },
  },
  {
    id: 'mistake-2',
    title: '직선의 방정식 연습',
    imageUrl: 'https://example.com/mistake-2.png',
    date: '2026-09-01',
    grade: '공통수학2',
    chapter: '직선의 방정식',
    analysis: { solvingProcess: '기울기와 절편을 이용해 식을 세운다.' },
    userActionPlan: '기울기 공식을 다시 정리해서 외우기',
  },
  {
    id: 'mistake-3',
    title: '이차함수 그래프',
    imageUrl: 'https://example.com/mistake-3.png',
    date: '2026-09-01',
    grade: '공통수학2',
    chapter: '이차함수와 그래프',
    analysis: { solvingProcess: '꼭짓점 공식을 사용한다.', finalAnswer: 'x=3' },
  },
];

createRoot(document.getElementById('root')!).render(
  <div style={{ maxWidth: 480, margin: '0 auto', padding: 16 }}>
    <ReviewCheckScreen currentUserId={userId} schoolGrade="고1" mistakes={mistakes} />
  </div>,
);
