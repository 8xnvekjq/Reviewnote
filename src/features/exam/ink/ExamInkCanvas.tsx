// STUB: replaced by W2
// 풀이 화면(W3)이 계약(ExamInkCanvasProps/Handle)대로 붙어 있는지 확인하기 위한 최소 구현.
// 문항 이미지를 가로에 맞춰 깔고 그 위에 SVG polyline 으로 획을 그린다. 압력·도형 변환 없음.
import { useImperativeHandle, useRef, useState, type PointerEvent as ReactPointerEvent, type Ref } from 'react';
import type { ExamInkCanvasHandle, ExamInkCanvasProps, InkPoint, InkStroke } from '../contract';

let strokeSeq = 0;

export function ExamInkCanvas({ ref, imageUrl, strokes, onChange, tool, color, size, penOnlyWhenPenDetected = true, readOnly = false }: ExamInkCanvasProps & { ref?: Ref<ExamInkCanvasHandle> }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<InkStroke | null>(null);
  const [penSeen, setPenSeen] = useState(false);
  const undoStack = useRef<InkStroke[][]>([]);
  const redoStack = useRef<InkStroke[][]>([]);
  const [aspect, setAspect] = useState(1);

  const commit = (next: InkStroke[]) => {
    undoStack.current.push(strokes);
    redoStack.current = [];
    onChange(next);
  };

  useImperativeHandle(ref, () => ({
    undo() {
      const prev = undoStack.current.pop();
      if (!prev) return;
      redoStack.current.push(strokes);
      onChange(prev);
    },
    redo() {
      const next = redoStack.current.pop();
      if (!next) return;
      undoStack.current.push(strokes);
      onChange(next);
    },
    clear() { if (strokes.length) commit([]); },
    canUndo: () => undoStack.current.length > 0,
    canRedo: () => redoStack.current.length > 0,
  }));

  const toPoint = (e: ReactPointerEvent): InkPoint => {
    const rect = boxRef.current!.getBoundingClientRect();
    const w = rect.width || 1;
    return { x: (e.clientX - rect.left) / w, y: (e.clientY - rect.top) / w, pressure: e.pressure || 0.5, t: e.timeStamp };
  };
  const ignore = (e: ReactPointerEvent) => {
    if (readOnly) return true;
    if (e.pointerType === 'pen' && !penSeen) setPenSeen(true);
    return penOnlyWhenPenDetected && (penSeen || e.pointerType === 'pen') && e.pointerType === 'touch';
  };
  const eraseAt = (p: InkPoint) => {
    const hit = strokes.filter(s => s.points.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 0.02));
    if (hit.length) commit(strokes.filter(s => !hit.includes(s)));
  };

  const onDown = (e: ReactPointerEvent) => {
    if (ignore(e)) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = toPoint(e);
    if (tool === 'eraser') { eraseAt(p); setDraft({ id: 'eraser', tool: 'pen', color, size, points: [p] }); return; }
    strokeSeq += 1;
    setDraft({ id: `s-${Date.now()}-${strokeSeq}`, tool, color, size, points: [p] });
  };
  const onMove = (e: ReactPointerEvent) => {
    if (!draft || ignore(e)) return;
    const p = toPoint(e);
    if (tool === 'eraser') { eraseAt(p); return; }
    setDraft({ ...draft, points: [...draft.points, p] });
  };
  const onUp = () => {
    if (!draft) return;
    if (draft.id !== 'eraser' && draft.points.length > 0) commit([...strokes, draft]);
    setDraft(null);
  };

  const all = draft && draft.id !== 'eraser' ? [...strokes, draft] : strokes;
  return (
    <div ref={boxRef} className="exam-ink-stub" style={{ position: 'relative', width: '100%' }} data-testid="exam-ink-canvas">
      <img
        src={imageUrl}
        alt=""
        draggable={false}
        style={{ display: 'block', width: '100%', height: 'auto', userSelect: 'none' }}
        onLoad={e => setAspect(e.currentTarget.naturalHeight / Math.max(1, e.currentTarget.naturalWidth))}
      />
      <svg
        viewBox={`0 0 1 ${aspect}`}
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: readOnly || penSeen ? 'pan-y' : 'none', cursor: readOnly ? 'default' : 'crosshair' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        data-stroke-count={strokes.length}
      >
        {all.map(s => (
          <polyline
            key={s.id}
            points={s.points.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={s.color}
            strokeOpacity={s.tool === 'highlighter' ? 0.35 : 1}
            strokeWidth={(s.tool === 'highlighter' ? s.size * 3 : s.size) / 1000}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
    </div>
  );
}

export default ExamInkCanvas;
