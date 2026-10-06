import { useEffect, useMemo, useReducer, useState, type RefObject } from 'react';
import type { ExamClient } from '../contract';
import { formatClock } from '../ui/examLogic';
import { TeacherAudioCapture } from './audioRecorder';
import { TeacherAudioManager } from './TeacherAudioManager';

export function TeacherAudioRecorder({ client, ownerId, attemptId, questionId, navigationKey, stopRef, captureRef, onReset }: {
  client: ExamClient; ownerId: string; attemptId: string; questionId: string;
  navigationKey: string;
  /** "처음부터 다시": 이 문항의 필기를 지운다(녹음 정리는 여기서 먼저 한다). */
  onReset?: () => Promise<void>;
  captureRef: RefObject<TeacherAudioCapture | null>;
  stopRef: RefObject<(() => Promise<void>) | null>;
}) {
  const [, redraw] = useReducer(n => n + 1, 0);
  const capture = useMemo(() => new TeacherAudioCapture(client, ownerId, redraw), [client, ownerId]);
  const [now, setNow] = useState(Date.now());
  const state = capture.state;
  useEffect(() => {
    void capture.recover();
    const hidden = () => { if (document.hidden && (capture.state.recording || capture.state.busy)) void capture.stop('화면이 숨겨져 녹음을 멈추고 저장했어요.'); };
    const pagehide = () => { void capture.stop(); };
    const retry = () => capture.retry();
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', pagehide);
    window.addEventListener('online', retry);
    return () => {
      void capture.stop();
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', pagehide);
      window.removeEventListener('online', retry);
    };
  }, [capture]);
  useEffect(() => {
    captureRef.current = capture;
    stopRef.current = () => capture.stop();
    return () => { stopRef.current = null; captureRef.current = null; };
  }, [capture, stopRef, captureRef]);
  useEffect(() => () => { void capture.stop(); }, [capture, navigationKey]);
  useEffect(() => {
    if (!state.recording) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [state.recording]);
  return <div className="exam-audio-recorder" data-testid="exam-audio-recorder">
    <button type="button" className="exam-tool exam-tool-text" data-testid="exam-audio-record" aria-pressed={state.recording}
      aria-label={state.recording ? '음성 녹음 멈추기' : '음성 녹음 시작'} disabled={state.busy}
      onClick={() => { if (state.recording) void capture.stop(); else void capture.start(attemptId, questionId); }}>
      {state.recording ? `🔴 ${formatClock(Math.max(0, now - state.startedAt))}` : '🎙️'}
    </button>
    <span role="status" data-testid="exam-audio-status">
      {state.uploads.some(row => row.state === 'uploading') ? '업로드 중' : state.uploads.some(row => row.state === 'failed')
        ? <button type="button" className="exam-replay-link" onClick={() => capture.retry()}>실패 · 다시 시도</button>
        : state.uploads.length ? '완료' : ''}
    </span>
    <TeacherAudioManager client={client} capture={capture} attemptId={attemptId} questionId={questionId}
      onReset={onReset && (async () => {
        // 이 기기의 녹음(진행 중 녹음·대기 중 업로드)을 먼저 버려야 서버에서 지운 뒤 다시 올라가지 않는다.
        await capture.discardQuestion(attemptId, questionId);
        await onReset();
      })} />
    {state.notice && <span role="status" className="exam-audio-notice">{state.notice}</span>}
    {state.settings && <details className="exam-audio-settings"><summary>마이크 설정</summary>{state.settings}</details>}
  </div>;
}
