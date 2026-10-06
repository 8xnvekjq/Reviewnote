// 시험이 끝난 뒤 결과 화면에서 문항을 열었을 때: 원래 필기 위에 덧칠해 이어 쓰기.
// 새 '다시 풀기'가 아니다 — 답·점수는 바뀌지 않고, 여기서 쓴 필기는 서버(필기 저장·재생 기록)에 절대 보내지 않는다.
// 이 기기에만(메모리 + localStorage, 원래 필기 캐시와 다른 키) 남긴다. 원래 필기를 지워도 그 지움 역시 이 기기에서만이다.
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ExamClient, ExamInkCanvasHandle, InkStroke, InkTool } from '../contract';
import { ExamInkReplay } from '../ink/ExamInkReplay';
import { LaserIcon } from './LaserIcon';
import { LassoIcon } from './LassoIcon';

const PEN_COLORS = [
  { value: '#1f2937', label: '검정' },
  { value: '#2563eb', label: '파랑' },
  { value: '#dc2626', label: '빨강' },
  { value: '#16a34a', label: '초록' },
];

/** 원래 필기 로컬 캐시(IndexedDB, inkStore)와 섞이지 않는 별도 키. */
const resultNotesKey = (attemptId: string, questionId: string) => `rn-exam-result-notes:v1:${attemptId}:${questionId}`;
// localStorage를 못 쓰는 환경(사생활 보호 모드 등)에서도 이 화면을 연 동안은 남게 한다.
const memory = new Map<string, InkStroke[]>();

function readNotes(key: string): InkStroke[] | null {
  if (memory.has(key)) return memory.get(key)!;
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed as InkStroke[] : null;
  } catch {
    return null;
  }
}
function writeNotes(key: string, strokes: InkStroke[] | null) {
  if (strokes) memory.set(key, strokes); else memory.delete(key);
  try {
    if (strokes) window.localStorage.setItem(key, JSON.stringify(strokes)); else window.localStorage.removeItem(key);
  } catch { /* 용량 초과·저장 불가 — 메모리에는 남아 있다 */ }
}

interface Props {
  client: Pick<ExamClient, 'getInkReplay'>;
  attemptId: string;
  /** 필기 키(한 페이지에 여러 문항이면 페이지 첫 문항). */
  questionId: string;
  imageUrl: string;
  /** 서버(·이 기기 동기화)에 있는 원래 필기. 여기서는 읽기만 한다. */
  strokes: InkStroke[];
  imageMaxWidth?: number;
  /** 원래 필기를 다 불러왔을 때만 쓴다(불러오기 전에 쓰면 원래 필기가 덧쓰기에서 빠진다). */
  ready: boolean;
  /** 관리자 검토: 열자마자 필기 순서를 자동 재생하고, 안내 문구를 관리자용으로. 덧쓴 필기는 학생 풀이에 저장되지 않는다. */
  review?: boolean;
  /** false면 덧쓴 필기를 어디에도 남기지 않는다(풀이 중 응시 검토 — 학생 필기가 계속 바뀌므로 예전 복사본이 새 필기를 가리지 않게). */
  persist?: boolean;
  /** '원래 풀이로' 바로 오른쪽에 붙는 버튼(다른 학생 풀이 보기). */
  extraTool?: ReactNode;
}

export function ResultInkNotes({ client, attemptId, questionId, imageUrl, strokes, imageMaxWidth, ready, review = false, persist = true, extraTool }: Props) {
  // 관리자가 덧쓴 필기는 학생 본인 키와 섞이지 않게 따로 둔다(같은 기기에서 둘 다 열 일은 드물지만).
  const key = `${resultNotesKey(attemptId, questionId)}${review ? ':admin' : ''}`;
  // null = 아직 덧쓰지 않음 → 원래 필기를 그대로 보여 준다. 처음 쓰는 순간 원래 필기 + 새 획을 복사해 따로 둔다.
  const [notes, setNotes] = useState<InkStroke[] | null>(() => (persist ? readNotes(key) : null));
  const [tool, setTool] = useState<InkTool>('pen');
  const [color, setColor] = useState(PEN_COLORS[0].value);
  const [generation, setGeneration] = useState(0);
  const [, setHistoryTick] = useState(0);
  const inkRef = useRef<ExamInkCanvasHandle>(null);
  const shown = notes ?? strokes;

  const onChange = (next: InkStroke[]) => {
    if (persist) writeNotes(key, next);
    setNotes(next);
    setHistoryTick(t => t + 1);
  };
  const reset = () => {
    if (persist) writeNotes(key, null);
    setNotes(null);
    setGeneration(n => n + 1); // 캔버스 실행 취소 기록도 비운다
  };
  const canUndo = inkRef.current?.canUndo() ?? false;
  const canRedo = inkRef.current?.canRedo() ?? false;

  const toolbar = (
    <div className="exam-notes-tools" role="toolbar" aria-label="덧쓰기 도구" data-testid="exam-notes-tools">
      <div className="exam-tool-group">
        {([['pen', '펜', '✏️'], ['highlighter', '형광펜', '🖍️'], ['eraser', '지우개', '🧽'], ['laser', '레이저(남지 않음)', null], ['lasso', '올가미(옮기기·크기·회전)', null]] as const).map(([value, label, icon]) => (
          <button key={value} type="button" className={`exam-tool${tool === value ? ' is-on' : ''}`} aria-pressed={tool === value} aria-label={label} title={label} disabled={!ready} onClick={() => setTool(value)}>
            {icon ? <span aria-hidden="true">{icon}</span> : value === 'lasso' ? <LassoIcon /> : <LaserIcon />}
          </button>
        ))}
      </div>
      <div className="exam-tool-group">
        {PEN_COLORS.map(c => (
          <button key={c.value} type="button" className={`exam-color${color === c.value ? ' is-on' : ''}`} style={{ '--swatch': c.value } as CSSProperties} aria-pressed={color === c.value} aria-label={`${c.label}색`} disabled={!ready} onClick={() => { setColor(c.value); if (tool === 'eraser' || tool === 'laser' || tool === 'lasso') setTool('pen'); }} />
        ))}
      </div>
      <div className="exam-tool-group">
        <button type="button" className="exam-tool" aria-label="실행 취소" title="실행 취소" disabled={!canUndo} onClick={() => { inkRef.current?.undo(); setHistoryTick(t => t + 1); }}>↶</button>
        <button type="button" className="exam-tool" aria-label="다시 실행" title="다시 실행" disabled={!canRedo} onClick={() => { inkRef.current?.redo(); setHistoryTick(t => t + 1); }}>↷</button>
        <button type="button" className="exam-tool exam-tool-text" disabled={!notes} onClick={reset}>원래 풀이로</button>
        {extraTool}
      </div>
      <p className="exam-notes-note">{!ready ? (review ? '학생 필기를 불러온 뒤에 쓸 수 있어요.' : '원래 필기를 불러온 뒤에 이어 쓸 수 있어요.')
        : review ? '여기서 쓴 필기는 이 기기에서만 보여요. 학생 풀이에는 저장되지 않아요.'
        : '여기서 쓴 필기는 이 기기에만 남아요. 답·점수와 서버의 원래 풀이는 바뀌지 않아요.'}</p>
    </div>
  );

  return <ExamInkReplay client={client} attemptId={attemptId} questionId={questionId} imageUrl={imageUrl}
    strokes={strokes} imageMaxWidth={imageMaxWidth} autoOpen={review}
    // 관리자가 학생 풀이를 볼 때는 '다른 풀이 보기'와 같은 막대(문항 위 두 줄)로 보여 준다.
    inline={review} persistDock={!review} peerPlayback={review}
    notes={{ strokes: shown, onChange, tool, color, size: 4, inkRef, toolbar, ready, canvasKey: generation }} />;
}
