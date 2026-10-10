import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { BUG_CATALOG, BUG_GAME_MS, bugById } from '../logic/bugCatalog';
import type { BugId } from '../logic/bugCatalog';
import { BUG_RECOVERY_MS, createBugGame, predictBugSwipe, stepBugGame, swingBugNet } from '../logic/bugGame';
import type { Point } from '../logic/joystick';
import type { BugFinish } from './bugAdapter';
import { Window } from './GamePanels';
import './bugGame.css';

const sheets = import.meta.glob('../assets/bugs/dragonflies.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const sheet = Object.values(sheets)[0];
export function BugIcon({ id, silhouette = false, frame = 0 }: { id: BugId; silhouette?: boolean; frame?: number }) {
  const row = Math.max(0, BUG_CATALOG.findIndex(b => b.id === id));
  return <span className={'pwp-bug-icon' + (silhouette ? ' pwp-bug-silhouette' : '')} aria-hidden="true" style={sheet ? {
    backgroundImage: `url(${sheet})`, backgroundPosition: `${frame % 4 * -32}px ${row * -32}px`,
  } : undefined}>{sheet ? '' : 'ʚӝɞ'}</span>;
}
export function BugGame({ catchId, bugId, difficulty, onFinish, onCancel }: {
  catchId: string; bugId: BugId; difficulty: number; onFinish(caught: boolean): void; onCancel(): void;
}) {
  const game = useRef(createBugGame(difficulty, Array.from(catchId).reduce((n, c) => Math.imul(n, 31) + c.charCodeAt(0), 1)));
  const [view, setView] = useState(game.current);
  const [trail, setTrail] = useState<Point[]>([]);
  const stroke = useRef<{ pointer: number; points: Point[]; caught: boolean; length: number } | null>(null);
  const aim = useRef<Point>({ x: 1, y: 0 });
  const callbacks = useRef({ onFinish, onCancel }); callbacks.current = { onFinish, onCancel };
  const completed = useRef(false);
  const update = () => {
    setView(game.current);
    if (!completed.current && game.current.status !== 'playing') { completed.current = true; callbacks.current.onFinish(game.current.status === 'caught'); }
  };
  const updateRef = useRef(update); updateRef.current = update;
  const clock = useRef(0);
  const advance = () => {
    const now = performance.now(); game.current = stepBugGame(game.current, now - clock.current); clock.current = now;
  };
  useEffect(() => {
    let frame = 0; clock.current = performance.now();
    const tick = () => { advance(); updateRef.current(); if (!completed.current) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable]')) return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyB', 'Escape', 'KeyX'].includes(event.code)) {
        event.preventDefault(); event.stopImmediatePropagation();
      } else return;
      if (['KeyB', 'Escape', 'KeyX'].includes(event.code)) { if (!event.repeat) callbacks.current.onCancel(); return; }
      const directions: Record<string, Point> = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } };
      if (directions[event.code]) aim.current = directions[event.code];
      else if (!event.repeat) {
        advance(); const d = aim.current;
        const from = { x: -d.x * 100, y: -d.y * 100 }, to = { x: d.x * 100, y: d.y * 100 };
        game.current = swingBugNet(game.current, from, to); setTrail([from, to]); updateRef.current();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);
  const point = (event: PointerEvent<SVGSVGElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * 220 - 110, y: (event.clientY - rect.top) / rect.height * 220 - 110 };
  };
  const move = (event: PointerEvent<SVGSVGElement>) => {
    const s = stroke.current;
    if (!s || s.pointer !== event.pointerId) return;
    advance(); const to = point(event), from = s.points.at(-1)!;
    s.length += Math.hypot(to.x - from.x, to.y - from.y);
    // 짧은 포인터 샘플도 선분으로 검사하되, 탭은 휘두름으로 인정하지 않는다.
    if (s.length >= 8) {
      s.caught ||= swingBugNet(game.current, from, to, 0).status === 'caught';
    }
    s.points.push(to);
    game.current = predictBugSwipe(game.current, s.points[0], to); setTrail([...s.points]);
  };
  return <Window title="잠자리 잡기" onClose={onCancel} onCancel={onCancel} compact small>
    <div className="pwp-bug-content">
      <p>{bugById(bugId)?.name} · {'★'.repeat(view.stars)} · <b>{Math.max(0, (BUG_GAME_MS - view.elapsed) / 1000).toFixed(1)}초</b></p>
      <div className="pwp-bug-arena">
        <svg viewBox="-110 -110 220 220" role="img" aria-label="잠자리를 향해 손가락으로 쓸어 주세요" onPointerDown={event => {
          event.stopPropagation(); if (event.button !== 0 || stroke.current) return;
          advance(); if (game.current.elapsed < game.current.recoveryUntil || game.current.status !== 'playing') return;
          event.currentTarget.setPointerCapture(event.pointerId); const from = point(event);
          stroke.current = { pointer: event.pointerId, points: [from], caught: false, length: 0 }; setTrail([from]);
          game.current = predictBugSwipe(game.current, from, game.current.position, true);
        }} onPointerMove={move} onPointerUp={event => {
          const s = stroke.current; if (!s || s.pointer !== event.pointerId) return;
          move(event); stroke.current = null;
          // 지나간 자리를 나중 위치로 재검사하지 않는다. 회복 시간은 손을 뗄 때 한 번만 적용한다.
          if (game.current.status === 'playing' && s.length >= 8) game.current = {
            ...game.current, status: s.caught ? 'caught' : 'playing', recoveryUntil: game.current.elapsed + BUG_RECOVERY_MS,
          };
          updateRef.current();
        }} onPointerCancel={() => { stroke.current = null; setTrail([]); }}>
          <circle r="100" fill="#e4efd4" stroke="#8fbc82" strokeWidth="3" />
          <polyline points={trail.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#e7b562" strokeWidth="8" strokeLinecap="round" opacity=".7" />
        </svg>
        <span className="pwp-bug-flying" style={{ left: `${(view.position.x + 110) / 220 * 100}%`, top: `${(view.position.y + 110) / 220 * 100}%` }}><BugIcon id={bugId} frame={Math.floor(view.elapsed / 100)} /></span>
      </div>
      <p>{view.elapsed < view.recoveryUntil ? '채를 다시 드는 중…' : '손가락으로 쓱! 잠자리를 잡아 보세요'}</p>
      <small>방향키로 조준 · Space로 휘두르기 · B로 그만두기</small>
    </div>
  </Window>;
}
export function BugResult({ result, onClose }: { result: BugFinish; onClose(): void }) {
  const caught = result.ok && result.caught ? result : null, species = caught && bugById(caught.bugId);
  return <Window title={caught ? '잠자리를 잡았어요!' : '놓쳤어요…'} onClose={onClose} compact small>
    <div className="pwp-bug-content" role="status">{caught && species ? <>
      <BugIcon id={caught.bugId} /><p>{species.name} · {'★'.repeat(species.stars)}{caught.isNew ? ' · 새 친구!' : ''}</p>
      {caught.points && <p>+{caught.points.awarded} P (오늘 {caught.points.todayEarned}/{caught.points.cap}P)</p>}
      <p>+{caught.xpGain?.gained ?? species.xp} XP</p>
    </> : <p>{result.ok ? '놓쳤어요… 다시 날아올 거예요' : '결과를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'}</p>}</div>
  </Window>;
}
