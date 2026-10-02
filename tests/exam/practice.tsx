// 기출문제 풀이 화면(ExamPracticeScreen)을 메모리 mock client 로 띄우는 standalone fixture.
// 실제 앱처럼 상단바/하단 탭을 흉내 낸 껍데기 안에 마운트해, 풀이 화면이 그걸 덮는지도 본다.
// URL 파라미터: user, limit(실전 제한시간 분, 소수 가능), persist(1이면 localStorage 이어 풀기), failSave(1), latency(ms)
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import '../../src/styles/design-system.css';
import { ExamPracticeScreen } from '../../src/features/exam/ExamPracticeScreen';
import { createMockExamClient } from '../../src/features/exam/ui/mockExamClient';
import AdminStudentExamSummary from '../../src/components/admin/AdminStudentExamSummary';
import type { AdminExamAttemptSummary, ExamAttempt } from '../../src/features/exam/contract';
import { inkDelta } from '../../src/features/exam/ink/inkReplay';

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

const adminRows: AdminExamAttemptSummary[] = [];
const adminAttempts = new Map<string, ExamAttempt>();
if (params.get('records') === '1') {
  const completed = await client.startAttempt('2025-06-math', 'free', '미적분');
  const strokes = [{ id: 'example', tool: 'pen' as const, color: '#2563eb', size: 4,
    points: [{ x: .15, y: .6, pressure: .5, t: 0 }, { x: .7, y: .8, pressure: .5, t: 200 }] }];
  const events = [inkDelta([], strokes, 'draw'), inkDelta(strokes, [], 'erase'), inkDelta([], strokes, 'undo')];
  await client.saveInk(completed.id, completed.questions[0].id, strokes, 0, false, events, crypto.randomUUID());
  const items = completed.questions.map(question => ({ questionId: question.id, answer: '1', unsure: false, visits: 1, timeSpentMs: 15000 }));
  const result = await client.submitAttempt(completed.id, items, []);
  adminAttempts.set(completed.id, { ...completed, status: 'submitted', items });
  const active = await client.startAttempt('2025-06-math', 'free', '미적분');
  adminAttempts.set(active.id, active);
  for (const [index, attempt] of [completed, active].entries()) adminRows.push({
    attemptId: attempt.id, paperId: attempt.paperId, paperTitle: '2025학년도 6월 모의평가 수학', round: index + 1,
    status: index === 0 ? 'submitted' : 'in_progress', mode: attempt.mode, elective: attempt.elective,
    startedAt: attempt.startedAt, submittedAt: index === 0 ? result.submittedAt : null,
    score: index === 0 ? result.score : null, maxScore: 100, answeredCount: index === 0 ? 30 : 0, questionCount: 30,
  });
}
const adminApi = {
  listAttempts: async () => adminRows,
  getAttempt: async (id: string) => adminAttempts.get(id)!,
  getInk: client.getInk, getInkReplay: client.getInkReplay, getResult: client.getResult,
};

createRoot(document.getElementById('root')!).render(params.get('records') === '1' ?
  <div className="rn-app" style={{ padding: 16, maxWidth: 680, margin: 'auto' }}>
    <AdminStudentExamSummary studentId="student-1" studentName="테스트 학생" api={adminApi} onPractice={() => { location.search = ''; }} />
  </div> :
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
