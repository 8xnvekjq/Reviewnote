import { createRoot } from 'react-dom/client';
import { ReviewCheckScreen } from '../../src/components/reviewCheck/ReviewCheckScreen';
import type { MistakeEntry } from '../../src/types';
import '../../src/index.css';
import '../../src/styles/design-system.css';

// 복습체크 실제 화면을 사용하되 외부 요청은 픽스처 응답만 반환한다.
const original = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  if (url.origin === location.origin || url.protocol === 'data:') return original(input, init);
  const session = { id: 'practice', student_id: 'student', grade: '공통수학1', start_chapter: '이차방정식', end_chapter: '이차방정식', status: 'in_progress', total_count: 1, correct_count: 0, created_at: '2026-10-01T00:00:00Z' };
  const items = [{ id: 'item', session_id: 'practice', mistake_id: 'mistake', position: 1, submitted_answer: null, grade: null }];
  const response = url.pathname.endsWith('/review_check_sessions') ? session : url.pathname.endsWith('/review_check_items') ? items : [];
  return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="white"/><text x="20" y="50" font-size="24">2 + 3 = ?</text></svg>')}`;
const mistake: MistakeEntry = { id: 'mistake', userId: 'student', title: '계산 연습', imageUrl: image, date: '2026-10-01', grade: '공통수학1', chapter: '이차방정식', reviews: ['', '', ''] };
createRoot(document.getElementById('root')!).render(<ReviewCheckScreen currentUserId="student" mistakes={[mistake]} />);
