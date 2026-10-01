// 앱에서 지연 로드하는 진입점 — 실제 서버 client를 여기서 묶어, 기출문제 풀이 코드가 메인 번들에 섞이지 않게 한다.
import { ExamPracticeScreen } from './ExamPracticeScreen';
import { examClient } from './examClient';

export default function ExamPracticeEntry({ currentUserId, onExit }: { currentUserId: string; onExit: () => void }) {
  return <ExamPracticeScreen client={examClient} currentUserId={currentUserId} onExit={onExit} />;
}
