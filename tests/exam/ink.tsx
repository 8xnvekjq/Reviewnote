import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ExamInkCanvas } from '../../src/features/exam/ink/ExamInkCanvas';
import type { ExamInkCanvasHandle, InkStroke, InkTool } from '../../src/features/exam/contract';
import '../../src/index.css';
import '../../src/styles/design-system.css';

declare global { interface Window { __ink: { strokes: () => InkStroke[]; handle: () => ExamInkCanvasHandle | null } } }

const COLORS = ['#111827', '#2563eb', '#dc2626'];

function Harness() {
  const handle = useRef<ExamInkCanvasHandle>(null);
  const [strokes, setStrokes] = useState<InkStroke[]>([]);
  const [tool, setTool] = useState<InkTool>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(3);
  const [narrow, setNarrow] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  window.__ink = { strokes: () => strokesRef.current, handle: () => handle.current };
  const toolButton = (value: InkTool, label: string) => (
    <button type="button" className={`rn-button rn-button-compact ${tool === value ? 'rn-button-primary' : 'rn-button-secondary'}`} aria-pressed={tool === value} onClick={() => setTool(value)}>{label}</button>
  );
  return (
    <main style={{ padding: 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {toolButton('pen', '펜')}
        {toolButton('highlighter', '형광펜')}
        {toolButton('eraser', '지우개')}
        {toolButton('laser', '레이저')}
        {COLORS.map(c => (
          <button key={c} type="button" className="rn-icon-button" aria-label={`색 ${c}`} aria-pressed={color === c} onClick={() => setColor(c)}>
            <span style={{ width: 18, height: 18, borderRadius: 9, background: c, display: 'block' }} />
          </button>
        ))}
        <button type="button" className="rn-button rn-button-secondary rn-button-compact" onClick={() => setSize(size === 3 ? 6 : 3)}>굵기 {size}</button>
        <button type="button" className="rn-button rn-button-secondary rn-button-compact" disabled={!handle.current?.canUndo()} onClick={() => handle.current?.undo()}>되돌리기</button>
        <button type="button" className="rn-button rn-button-secondary rn-button-compact" disabled={!handle.current?.canRedo()} onClick={() => handle.current?.redo()}>다시 하기</button>
        <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={() => handle.current?.clear()}>모두 지우기</button>
        <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={() => setNarrow(!narrow)}>{narrow ? '넓게' : '좁게'}</button>
        <button type="button" className="rn-button rn-button-ghost rn-button-compact" onClick={() => setReadOnly(!readOnly)}>{readOnly ? '쓰기' : '보기 전용'}</button>
        <span data-testid="count" style={{ alignSelf: 'center', color: 'var(--rn-muted)' }}>획 {strokes.length}개</span>
      </div>
      <div data-testid="paper" style={{ width: narrow ? 420 : 700, maxWidth: '100%' }}>
        <ExamInkCanvas
          ref={handle}
          imageUrl="/exams/2025-06-math/c-15.png"
          strokes={strokes}
          onChange={setStrokes}
          tool={tool}
          color={color}
          size={size}
          readOnly={readOnly}
        />
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
