// 기출문제 풀이 화면(ExamPracticeScreen)을 메모리 mock client 로 띄우는 standalone fixture.
// 실제 앱처럼 상단바/하단 탭을 흉내 낸 껍데기 안에 마운트해, 풀이 화면이 그걸 덮는지도 본다.
// URL 파라미터: user, limit(실전 제한시간 분, 소수 가능), persist(1이면 localStorage 이어 풀기), failSave(1), latency(ms)
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import '../../src/styles/design-system.css';
import { ExamPracticeScreen } from '../../src/features/exam/ExamPracticeScreen';
import { createMockExamClient } from '../../src/features/exam/ui/mockExamClient';

const params = new URLSearchParams(location.search);
const log: Array<{ method: string; args: unknown[] }> = [];
(window as unknown as { __examLog: typeof log }).__examLog = log;
const client = createMockExamClient({
  admin: params.get('admin') === '1',
  timeLimitMinutes: params.has('limit') ? Number(params.get('limit')) : undefined,
  persistKey: params.get('persist') === '1' ? 'exam-practice-harness' : undefined,
  failSave: params.get('failSave') === '1',
  latencyMs: params.has('latency') ? Number(params.get('latency')) : 0,
  log,
});

createRoot(document.getElementById('root')!).render(
  <div className="rn-app" style={{ display: 'flex', flexDirection: 'column' }}>
    <header className="rn-header" data-testid="fake-app-header"><div className="rn-header-inner"><strong>Reviewnote</strong></div></header>
    <main className="rn-main">
      <div className="screen-enter">
        <ExamPracticeScreen
          client={client}
          currentUserId={params.get('user') || 'student-1'}
          onExit={() => { document.body.dataset.exited = '1'; }}
        />
      </div>
    </main>
    <nav className="rn-dock" data-testid="fake-app-dock"><div className="rn-dock-inner rn-bottom-nav"><span>홈</span></div></nav>
  </div>,
);
