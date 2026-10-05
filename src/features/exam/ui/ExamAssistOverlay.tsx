import { useEffect, useRef, useState } from 'react';
import type { LiveChannel, LiveTransport } from '../liveTransport';
import { drawLaser } from '../ink/inkLaser';
import { INK_REFERENCE_WIDTH } from '../ink/inkModel';
import { ASSIST_BATCH_MS, ASSIST_HOLD_MS, ASSIST_MAX_POINTS, assistAlpha, emptyAssist, parseAssist, receiveAssist } from '../ink/inkAssist';
import type { AssistMessage, AssistPoint } from '../ink/inkAssist';

/** 캔버스의 실제 이미지 너비를 공유하므로 확대·여백·화면 크기에 관계없이 같은 자리에 보인다. */
export function ExamAssistOverlay({ transport, attemptId, questionId, imageWidth, active = true, enabled = false, admin = false, clearToken = 0 }:
  { transport?: LiveTransport; attemptId: string; questionId: string; imageWidth: number; active?: boolean; enabled?: boolean; admin?: boolean; clearToken?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef(emptyAssist());
  const channel = useRef<LiveChannel | undefined>(undefined);
  const ready = useRef(false);
  const [writing, setWriting] = useState(false);
  const requestPaint = useRef<() => void>(() => {});
  const gesture = useRef<{ pointerId: number; strokeId: string; points: AssistPoint[]; pending: AssistPoint[]; seq: number } | null>(null);
  const flush = useRef<(done: boolean) => void>(() => {});
  flush.current = done => {
    const g = gesture.current;
    if (!g) return;
    // 데이터 없는 배치도 누른 채 멈춘 펜의 생존 신호다. 미사용 시에는 전송하지 않는다.
    do {
      const message: AssistMessage = { version: 1, kind: 'stroke', questionId, strokeId: g.strokeId,
        points: g.pending.splice(0, ASSIST_MAX_POINTS), done: done && g.pending.length === 0, seq: g.seq++ };
      try { if (ready.current) channel.current?.send('assist', message); } catch { /* 연결 해제는 조용히 무시 */ }
    } while (g.pending.length);
  };
  useEffect(() => {
    state.current = emptyAssist(); setWriting(false);
    if (!transport || !active) return;
    let disposed = false;
    try {
      channel.current = transport.open(`exam-assist:${attemptId}`, 'assist', value => {
        if (disposed || admin) return;
        const message = parseAssist(value);
        if (message) {
          state.current = receiveAssist(state.current, message, questionId, performance.now());
          requestPaint.current();
        }
      }, connected => { if (!disposed) ready.current = connected; });
    } catch { /* 선택 기능: 풀이 화면을 방해하지 않는다 */ }
    return () => { disposed = true; ready.current = false; channel.current?.close(); channel.current = undefined; };
  }, [transport, active, attemptId, questionId, admin]);
  useEffect(() => {
    if (!admin || !clearToken) return;
    gesture.current = null;
    state.current = emptyAssist();
    requestPaint.current();
    try { if (ready.current) channel.current?.send('assist', { version: 1, kind: 'clear', questionId }); } catch { /* 선택 기능 */ }
  }, [clearToken, admin, questionId]);
  useEffect(() => {
    if (enabled && active) return;
    flush.current(true); gesture.current = null;
    state.current = { ...state.current, writing: false };
    requestPaint.current();
  }, [enabled, active]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0, fadeTimer = 0;
    const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const paint = () => {
      raf = 0;
      window.clearTimeout(fadeTimer);
      const rect = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(rect.width * dpr), height = Math.round(rect.height * dpr);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const ctx = canvas.getContext('2d');
      const alpha = active ? assistAlpha(state.current, performance.now()) : 0;
      if (!alpha) state.current = emptyAssist();
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, width, height);
        ctx.setTransform(imageWidth * dpr / INK_REFERENCE_WIDTH, 0, 0, imageWidth * dpr / INK_REFERENCE_WIDTH, 0, 0);
        drawLaser(ctx, [...state.current.strokes.values()].map(s => ({ points: s.points, endedAt: s.done ? 0 : null })), 0, 10 * dpr,
          { glowWidth: 8.5, coreWidth: 3, alpha });
      }
      canvas.dataset.strokeCount = String(state.current.strokes.size);
      setWriting(!admin && state.current.writing && alpha > 0);
      if (state.current.strokes.size) {
        const remaining = state.current.lastActivity + ASSIST_HOLD_MS - performance.now();
        if (remaining > 0) fadeTimer = window.setTimeout(schedule, remaining);
        else schedule();
      }
    };
    requestPaint.current = schedule;
    const observer = new ResizeObserver(schedule);
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    schedule();
    return () => {
      cancelAnimationFrame(raf); window.clearTimeout(fadeTimer); observer.disconnect(); requestPaint.current = () => {};
    };
  }, [imageWidth, active, admin, questionId]);
  useEffect(() => {
    if (!admin || !enabled || !active) return;
    const timer = window.setInterval(() => {
      if (gesture.current) { state.current.lastActivity = performance.now(); flush.current(false); requestPaint.current(); }
    }, ASSIST_BATCH_MS);
    return () => window.clearInterval(timer);
  }, [admin, enabled, active]);
  useEffect(() => () => { gesture.current = null; }, []);
  const preview = (done: boolean) => {
    const g = gesture.current;
    if (!g) return;
    if (assistAlpha(state.current, performance.now()) === 0) state.current = emptyAssist();
    state.current.strokes.set(g.strokeId, { points: g.points, seq: g.seq, done });
    state.current = { ...state.current, lastActivity: performance.now(), writing: !done };
    requestPaint.current();
  };
  const point = (event: React.PointerEvent<HTMLCanvasElement>): AssistPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(16, (event.clientX - rect.left) / Math.max(1, imageWidth))),
      y: Math.max(0, Math.min(32, (event.clientY - rect.top) / Math.max(1, imageWidth))) };
  };
  const finish = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (gesture.current?.pointerId !== event.pointerId) return;
    preview(true); flush.current(true); gesture.current = null;
  };
  return <>
    <canvas ref={canvasRef} data-testid="exam-assist-overlay" aria-label={admin ? '도와주기 펜 그리기' : undefined} aria-hidden={!admin}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 5,
        pointerEvents: admin && enabled && active ? 'auto' : 'none', touchAction: enabled ? 'none' : undefined }}
      onPointerDown={event => {
        if (!admin || !enabled || !active || !ready.current || gesture.current || event.button !== 0) return;
        if (assistAlpha(state.current, performance.now()) > 0 && (state.current.strokes.size >= 128 ||
          [...state.current.strokes.values()].reduce((n, s) => n + s.points.length, 0) >= 16_000)) return;
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        const p = point(event);
        gesture.current = { pointerId: event.pointerId, strokeId: crypto.randomUUID(), points: [p], pending: [p], seq: 0 };
        preview(false); flush.current(false);
      }}
      onPointerMove={event => {
        const g = gesture.current;
        if (!g || g.pointerId !== event.pointerId || g.points.length >= 16_000) return;
        const p = point(event); g.points = [...g.points, p]; g.pending.push(p); preview(false);
      }} onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish} />
    {writing && <small role="status" data-testid="exam-assist-writing" style={{ position: 'absolute', right: 8, top: 8, zIndex: 6,
      pointerEvents: 'none', background: '#fff4f6', color: '#be123c', borderRadius: 8, padding: '3px 7px' }}>선생님이 쓰는 중</small>}
  </>;
}
