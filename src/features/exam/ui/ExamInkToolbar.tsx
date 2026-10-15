import type { CSSProperties, ReactNode } from 'react';
import type { InkTool } from '../contract';
import { LaserIcon } from './LaserIcon';
import { LassoIcon } from './LassoIcon';
import { PEN_COLORS, PEN_SIZES } from './inkToolbarOptions';

// 기출문제 풀이의 필기 도구 막대(펜·형광펜·지우개·레이저·올가미 / 색 / 굵기 / 실행 취소·다시 실행).
// 서로 도와주기 풀이 화면도 같은 막대를 쓴다(레이저는 리플레이에 남지 않아 거기서는 뺀다).
const TOOLS = [['pen', '펜', '✏️'], ['highlighter', '형광펜', '🖍️'], ['eraser', '지우개', '🧽'], ['laser', '레이저(남지 않음)', null], ['lasso', '올가미(옮기기·크기·회전)', null]] as const;

export function ExamInkToolbar({
  tool, toolPressed = true, color, size, onTool, onColor, onSize, canUndo, canRedo, onUndo, onRedo,
  laser = true, inert, historyExtra,
}: {
  tool: InkTool;
  /** false면 어떤 도구도 눌린 것으로 보이지 않는다(기출 원본의 '화면 이동' 중). */
  toolPressed?: boolean;
  color: string;
  size: number;
  onTool: (tool: InkTool) => void;
  onColor: (color: string) => void;
  onSize: (size: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** false면 레이저 버튼을 뺀다. */
  laser?: boolean;
  inert?: boolean;
  /** 실행 취소 묶음 끝에 붙일 버튼(예: 관리자 '이 문항 필기 지우기'). */
  historyExtra?: ReactNode;
}) {
  return (
    <div className="exam-tools" role="toolbar" aria-label="필기 도구" inert={inert || undefined}>
      <div className="exam-tool-group">
        {TOOLS.filter(([value]) => laser || value !== 'laser').map(([value, label, icon]) => {
          const on = toolPressed && tool === value;
          return (
          <button key={value} type="button" className={`exam-tool${on ? ' is-on' : ''}`} aria-pressed={on} aria-label={label} title={label} onClick={() => onTool(value)}>
            {icon ? <span aria-hidden="true">{icon}</span> : value === 'lasso' ? <LassoIcon /> : <LaserIcon />}
          </button>
          );
        })}
      </div>
      <div className="exam-tool-group">
        {PEN_COLORS.map(c => (
          <button key={c.value} type="button" className={`exam-color${color === c.value ? ' is-on' : ''}`} style={{ '--swatch': c.value } as CSSProperties} aria-pressed={color === c.value} aria-label={`${c.label}색`}
            onClick={() => { onColor(c.value); if (tool === 'eraser' || tool === 'laser' || tool === 'lasso') onTool('pen'); }} />
        ))}
      </div>
      <div className="exam-tool-group">
        {PEN_SIZES.map(s => (
          <button key={s.value} type="button" className={`exam-size${size === s.value ? ' is-on' : ''}`} aria-pressed={size === s.value} aria-label={`굵기 ${s.label}`} onClick={() => onSize(s.value)}>
            <i style={{ width: s.value + 3, height: s.value + 3 }} />
          </button>
        ))}
      </div>
      <div className="exam-tool-group">
        <button type="button" className="exam-tool" aria-label="실행 취소" title="실행 취소" disabled={!canUndo} onClick={onUndo}>↶</button>
        <button type="button" className="exam-tool" aria-label="다시 실행" title="다시 실행" disabled={!canRedo} onClick={onRedo}>↷</button>
        {historyExtra}
      </div>
    </div>
  );
}
