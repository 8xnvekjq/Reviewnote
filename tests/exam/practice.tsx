// 기출문제 풀이 화면(ExamPracticeScreen)을 메모리 mock client 로 띄우는 standalone fixture.
// 실제 앱처럼 상단바/하단 탭을 흉내 낸 껍데기 안에 마운트해, 풀이 화면이 그걸 덮는지도 본다.
// URL 파라미터: user, limit(실전 제한시간 분, 소수 가능), persist(1이면 localStorage 이어 풀기), failSave(1), latency(ms), sharedTeacher(1이면 관리자 탭↔학생 탭 선생님 풀이 공유)
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '../../src/index.css';
import '../../src/styles/design-system.css';
import { ExamPracticeScreen } from '../../src/features/exam/ExamPracticeScreen';
import { createMockExamClient, createMockLiveExamApi } from '../../src/features/exam/ui/mockExamClient';
import AdminStudentExamSummary from '../../src/components/admin/AdminStudentExamSummary';
import type { AdminExamApi, AdminExamAttemptSummary, AdminPaperStudentActivity, ExamAttempt } from '../../src/features/exam/contract';
import { inkDelta, inkIdsHash } from '../../src/features/exam/ink/inkReplay';
import { AdminLiveView } from '../../src/features/exam/ui/AdminLiveView';
import { createBroadcastTransport } from '../../src/features/exam/broadcastTransport';
import type { LiveTransport } from '../../src/features/exam/liveTransport';

const params = new URLSearchParams(location.search);
if (params.get('fakeAudio') === '1') {
  const stats = { starts: 0, stops: 0, timeslices: [] as number[], constraints: [] as unknown[], options: [] as unknown[] };
  (window as unknown as { __audioStats: typeof stats }).__audioStats = stats;
  const track = { stop() {}, getSettings: () => ({ channelCount: 1, sampleRate: 48000, noiseSuppression: true, autoGainControl: true, echoCancellation: false }) };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { async getUserMedia(constraints: unknown) {
    stats.constraints.push(constraints);
    if (params.get('denyAudio') === '1') throw new DOMException('거부됨', 'NotAllowedError');
    return { getTracks: () => [track], getAudioTracks: () => [track] };
  } } });
  class FakeMediaRecorder {
    static isTypeSupported(mime: string) { return mime === 'audio/webm;codecs=opus'; }
    state = 'inactive'; mimeType: string; audioBitsPerSecond: number;
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: (() => void) | null = null;
    timer: number | undefined;
    constructor(_stream: unknown, options: MediaRecorderOptions) {
      this.mimeType = options.mimeType!; this.audioBitsPerSecond = options.audioBitsPerSecond!; stats.options.push(options);
    }
    emit() { this.ondataavailable?.({ data: new Blob(['test-audio-chunk'], { type: this.mimeType }) }); }
    start(timeslice: number) {
      stats.starts++; stats.timeslices.push(timeslice); this.state = 'recording';
      this.timer = window.setInterval(() => this.emit(), 200);
    }
    stop() { if (this.state === 'inactive') return; stats.stops++; this.state = 'inactive'; clearInterval(this.timer); queueMicrotask(() => { this.emit(); this.onstop?.(); }); }
  }
  Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: FakeMediaRecorder });
}
const log: Array<{ method: string; args: unknown[] }> = [];
(window as unknown as { __examLog: typeof log }).__examLog = log;
const inkStats = { requests: 0, bytes: 0 }; // 필기 저장 요청 수·본문 바이트
(window as unknown as { __inkStats: typeof inkStats }).__inkStats = inkStats;
const client = createMockExamClient({
  admin: params.get('admin') === '1',
  worksheet: params.get('worksheet') === '1',
  filters: params.get('filters') === '1',
  timeLimitMinutes: params.has('limit') ? Number(params.get('limit')) : undefined,
  persistKey: params.get('persist') === '1' ? 'exam-practice-harness' : undefined,
  sharedTeacherKey: params.get('sharedTeacher') === '1' ? 'exam-practice-teacher-share' : undefined,
  failSave: params.get('failSave') === '1',
  latencyMs: params.has('latency') ? Number(params.get('latency')) : 0,
  inkStats,
  log,
});
// 목록 갱신 오류를 실제 화면에서 재현하는 테스트 전용 연결점.
(window as unknown as { __examClient: typeof client }).__examClient = client;

const adminRows: AdminExamAttemptSummary[] = [];
const adminAttempts = new Map<string, ExamAttempt>();
const adminMode = params.get('records') === '1' || params.get('activity') === '1';
// ?recordsPaper=2026-hanneung-79-advanced: 관리자 검토 화면을 한능검 심화 응시로 띄운다(시대별 결과 확인용).
const recordsPaper = params.get('recordsPaper') || '2025-06-math';
const recordsMath = recordsPaper === '2025-06-math';
if (adminMode) {
  const completed = await client.startAttempt(recordsPaper, 'free', recordsMath ? '미적분' : null);
  const strokes = [{ id: 'example', tool: 'pen' as const, color: '#2563eb', size: 4,
    points: [{ x: .15, y: .6, pressure: .5, t: 0 }, { x: .7, y: .8, pressure: .5, t: 200 }] }];
  const events = [inkDelta([], strokes, 'draw'), inkDelta(strokes, [], 'erase'), inkDelta([], strokes, 'undo')];
  await client.saveInk(completed.id, completed.questions[0].id,
    { revision: 0, legacyImport: false, events, batchId: crypto.randomUUID(), idsHash: await inkIdsHash(strokes) });
  const items = completed.questions.map(question => ({ questionId: question.id, answer: '1', unsure: false, visits: 1, timeSpentMs: 15000 }));
  const result = await client.submitAttempt(completed.id, items, []);
  adminAttempts.set(completed.id, { ...completed, status: 'submitted', items });
  const active = await client.startAttempt(recordsPaper, 'free', recordsMath ? '미적분' : null);
  adminAttempts.set(active.id, active);
  for (const [index, attempt] of [completed, active].entries()) adminRows.push({
    attemptId: attempt.id, paperId: attempt.paperId, paperTitle: result.paperTitle, round: index + 1,
    status: index === 0 ? 'submitted' : 'in_progress', mode: attempt.mode, elective: attempt.elective,
    startedAt: attempt.startedAt, submittedAt: index === 0 ? result.submittedAt : null,
    score: index === 0 ? result.score : null, maxScore: 100, answeredCount: index === 0 ? items.length : 0, questionCount: completed.questions.length,
  });
}
// 시험지별 응시 현황(관리자): 같은 mock 응시 두 건을 두 학생의 최근 응시로 보여 준다.
const activityRows: AdminPaperStudentActivity[] = adminRows.map((row, index) => ({
  ...row, studentId: `s${index + 1}`, studentName: index === 0 ? '김학생' : '이학생', attemptCount: index === 0 ? 2 : 1, inProgress: index === 0,
}));
const adminApi: AdminExamApi = {
  listLivePapers: async () => [],
  getLiveExam: async () => [],
  getLiveStudentOrder: async () => [],
  getLiveInk: async () => ({ mode: 'full', revision: 0, strokes: [] }),
  listAttempts: async () => adminRows,
  getAttempt: async (id: string) => adminAttempts.get(id)!,
  getInk: client.getInk, getInkReplay: client.getInkReplay, getResult: client.getResult,
  listPaperActivity: async () => params.get('activity') === '1' ? [{ paperId: '2025-06-math', students: activityRows }] : null,
};

// Two actual browser tabs share a mock WebSocket bus and saved RPC state.
// Only this opt-in fixture uses BroadcastChannel/localStorage; production uses Supabase.
if (params.has('broadcast')) {
  const wireLog: Array<{ topic: string; event: string; payload: unknown }> = [];
  let connected = true;
  let sendFailure = false;
  const statuses = new Set<(ready: boolean) => void>();
  const topics = new Set<string>();
  const role = params.get('broadcast');
  const mockTransport: LiveTransport = {
    open(topic, event, receive, status) {
      const channel = new BroadcastChannel(`exam-test:${topic}`);
      topics.add(topic);
      statuses.add(status);
      channel.onmessage = e => { if (connected && e.data.event === event) receive(e.data.payload); };
      queueMicrotask(() => status(connected));
      return {
        send(name, payload) {
          if (!connected) return;
          wireLog.push({ topic, event: name, payload });
          channel.postMessage({ event: name, payload });
        },
        close() { topics.delete(topic); statuses.delete(status); channel.close(); },
      };
    },
  };
  // Same private-channel API and broadcast envelope as Supabase, with a local wire only.
  const transport = params.get('transport') === 'supabase' ? createBroadcastTransport({
    realtime: { async setAuth() {}, isConnected: () => connected },
    channel(topic: string, options: { config: { private: boolean; broadcast: { ack: boolean } } }) {
      if (!options.config.private) throw new Error('Expected private channel');
      const bus = new BroadcastChannel(`exam-test:${topic}`);
      const bindings: Array<{ event: string; receive: (message: unknown) => void }> = [];
      let notify: (state: string) => void = () => {};
      const channel = {
        state: 'joining',
        on(_type: string, filter: { event: string }, receive: (message: unknown) => void) { bindings.push({ event: filter.event, receive }); return this; },
        subscribe(callback: (state: string) => void) {
          notify = callback; topics.add(topic);
          statuses.add(update);
          queueMicrotask(() => update(connected));
          return this;
        },
        async send(message: { event: string; payload: unknown }) {
          if (!connected) return 'error';
          if (sendFailure) return 'error';
          wireLog.push({ topic, ...message }); bus.postMessage(message); return 'ok';
        },
        close() { topics.delete(topic); statuses.delete(update); bus.close(); channel.state = 'closed'; notify('CLOSED'); },
      };
      const update = (value: boolean) => { channel.state = value ? 'joined' : 'errored'; notify(value ? 'SUBSCRIBED' : 'CHANNEL_ERROR'); };
      bus.onmessage = e => { if (connected) for (const item of bindings) if (item.event === '*' || item.event === e.data.event) item.receive(e.data); };
      return channel;
    },
    async removeChannel(channel: { close(): void }) { channel.close(); return 'ok'; },
  } as unknown as Parameters<typeof createBroadcastTransport>[0]) : mockTransport;
  (window as unknown as { __broadcast: unknown }).__broadcast = {
    log: wireLog,
    topics,
    setConnected(value: boolean) { connected = value; for (const status of statuses) status(value); },
    setSendFailure(value: boolean) { sendFailure = value; },
  };
  client.liveTransport = transport;
  adminApi.liveTransport = transport;
  const metaKey = 'exam-broadcast-attempt';
  const docsKey = 'exam-broadcast-docs';
  const originalStart = client.startAttempt;
  client.startAttempt = async (...args) => {
    const attempt = await originalStart(...args);
    localStorage.setItem(metaKey, JSON.stringify(attempt));
    localStorage.setItem(docsKey, '[]');
    return attempt;
  };
  const originalSave = client.saveInk;
  client.saveInk = async (...args) => {
    const revision = await originalSave(...args);
    localStorage.setItem(docsKey, JSON.stringify(await client.getInk(args[0])));
    return revision;
  };
  if (role === 'admin') {
    adminApi.getLiveExam = async () => {
      const attempt: ExamAttempt | null = JSON.parse(localStorage.getItem(metaKey) ?? 'null');
      if (!attempt) return [];
      const docs: Awaited<ReturnType<typeof client.getInk>> = JSON.parse(localStorage.getItem(docsKey) ?? '[]');
      const doc = [...docs].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))[0];
      const question = attempt.questions.find(q => q.id === doc?.questionId) ?? attempt.questions[0];
      return [{ attemptId: attempt.id, studentId: 'student-1', studentName: '방송 학생', questionId: question.id,
        number: question.number, imageUrl: question.imageUrl, revision: doc?.revision ?? 0,
        updatedAt: doc?.updatedAt ?? attempt.startedAt, answeredCount: 0 }];
    };
    adminApi.getLiveInk = async (_attemptId, questionId) => {
      const docs: Awaited<ReturnType<typeof client.getInk>> = JSON.parse(localStorage.getItem(docsKey) ?? '[]');
      const doc = docs.find(d => d.questionId === questionId);
      return { mode: 'full', revision: doc?.revision ?? 0, strokes: doc?.strokes ?? [] };
    };
  }
}

function BroadcastAdminFixture() {
  const [open, setOpen] = useState(false);
  return <div><button data-testid="broadcast-open" onClick={() => setOpen(true)}>Live 열기</button>
    {open && <AdminLiveView api={adminApi} paperId={params.get('broadcastPaper') || '2025-06-math'} title="방송 검증" onClose={() => setOpen(false)} />}</div>;
}

if (params.get('live') === '1') {
  const live = createMockLiveExamApi();
  if (params.has('livecount')) live.setCount(Number(params.get('livecount')));
  Object.assign(adminApi, live.api, { listPaperActivity: async () => [] });
  // `&hint=1`: an in-page broadcast bus, so tests can send student hints between real polling ticks.
  const listeners = new Set<(payload: unknown) => void>();
  if (params.get('hint') === '1') adminApi.liveTransport = {
    open(_topic, event, receive, status) {
      if (event === 'ink') listeners.add(receive);
      queueMicrotask(() => status(true));
      return { send() {}, close() { listeners.delete(receive); } };
    },
  };
  (window as unknown as { __live: unknown }).__live = { ...live,
    broadcast: (payload: unknown) => { for (const listener of listeners) listener(payload); } };
}

createRoot(document.getElementById('root')!).render(params.get('broadcast') === 'admin' ? <BroadcastAdminFixture /> : params.get('records') === '1' ?
  <div className="rn-app" style={{ padding: 16, maxWidth: 680, margin: 'auto' }}>
    <AdminStudentExamSummary studentId="student-1" studentName="테스트 학생" api={adminApi} onPractice={() => { location.search = ''; }} />
  </div> :
  <div className="rn-app" style={{ display: 'flex', flexDirection: 'column' }}>
    <header className="rn-header" data-testid="fake-app-header"><div className="rn-header-inner"><strong>Reviewnote</strong></div></header>
    <main className="rn-main">
      <div className="screen-enter">
        <ExamPracticeScreen
          isAdmin={params.get('admin') === '1'}
          client={client}
          currentUserId={params.get('user') || 'student-1'}
          admin={adminApi}
          onExit={() => { document.body.dataset.exited = '1'; }}
        />
      </div>
    </main>
    <nav className="rn-dock" data-testid="fake-app-dock"><div className="rn-dock-inner rn-bottom-nav"><span>홈</span></div></nav>
  </div>,
);
