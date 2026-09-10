// "건" 단위 horizontal bar list — %/정답률/오답률 등 분모가 필요한 표현은 절대 만들지 않는다.
interface BarListProps {
  rows: { label: string; count: number; color?: string }[];
  unit?: string;
  onSelectRow?: (label: string) => void;
  selectedLabel?: string;
}

export function BarList({ rows, unit = '건', onSelectRow, selectedLabel }: BarListProps) {
  const max = Math.max(1, ...rows.map(r => r.count));
  return (
    <div className="rn-examprep-barlist">
      {rows.map(row => {
        const pct = Math.round((row.count / max) * 100);
        const clickable = !!onSelectRow;
        const Tag = clickable ? 'button' : 'div';
        return (
          <Tag
            key={row.label}
            type={clickable ? 'button' : undefined}
            className={`rn-examprep-bar-row ${selectedLabel === row.label ? 'is-selected' : ''}`}
            onClick={clickable ? () => onSelectRow!(row.label) : undefined}
          >
            <span className="rn-examprep-bar-label">{row.label}</span>
            <span className="rn-examprep-bar-track">
              <span
                className="rn-examprep-bar-fill"
                style={{ width: `${Math.max(row.count > 0 ? 6 : 0, pct)}%`, background: row.color || 'var(--rn-accent)' }}
              />
            </span>
            <span className="rn-examprep-bar-count">{row.count}{unit}</span>
          </Tag>
        );
      })}
    </div>
  );
}
