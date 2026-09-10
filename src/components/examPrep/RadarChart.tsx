// 6축 학습 프로필 레이더 — 외부 차트 라이브러리 없이 순수 SVG로 구현(의존성 추가 불필요할 만큼
// 단순한 차트). 절대 실력 점수가 아니라 상대적 프로파일이라는 점을 이 컴포넌트 밖(caption)에서
// 명시한다 — 여기서는 시각화만 담당.
interface RadarChartProps {
  scores: { label: string; score: number }[];
}

const WEAK_THRESHOLD = 45;
const STABLE_THRESHOLD = 70;

export function RadarChart({ scores }: RadarChartProps) {
  const n = scores.length;
  const size = 300;
  const cx = size / 2;
  const cy = 140;
  const R = 96;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, r: number): [number, number] => [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];

  const rings = [0.25, 0.5, 0.75, 1].map(f =>
    Array.from({ length: n }, (_, i) => pt(i, R * f).join(',')).join(' '),
  );
  const dataPoints = scores.map((s, i) => pt(i, (R * Math.max(4, s.score)) / 100));

  return (
    <svg viewBox={`0 0 ${size} 268`} width="100%" role="img" aria-label="6축 학습 프로필 레이더 차트">
      {rings.map((points, idx) => (
        <polygon key={idx} points={points} fill="none" stroke="var(--rn-line)" strokeWidth={1} />
      ))}
      {scores.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--rn-line)" strokeWidth={1} />;
      })}
      <polygon
        points={dataPoints.map(p => p.join(',')).join(' ')}
        fill="var(--rn-accent)"
        fillOpacity={0.22}
        stroke="var(--rn-accent)"
        strokeWidth={2}
      />
      {dataPoints.map(([x, y], i) => {
        const s = scores[i].score;
        const color = s < WEAK_THRESHOLD ? 'var(--rn-danger)' : s >= STABLE_THRESHOLD ? 'var(--rn-success)' : 'var(--rn-accent)';
        return <circle key={i} cx={x} cy={y} r={4} fill={color} />;
      })}
      {scores.map((s, i) => {
        const [x, y] = pt(i, R + 30);
        const cos = Math.cos(angle(i));
        const sin = Math.sin(angle(i));
        const anchor = Math.abs(cos) < 0.15 ? 'middle' : cos > 0 ? 'start' : 'end';
        const dy = sin > 0.6 ? 11 : sin < -0.6 ? -3 : 4;
        const color = s.score < WEAK_THRESHOLD ? 'var(--rn-danger)' : s.score >= STABLE_THRESHOLD ? 'var(--rn-success)' : 'var(--rn-text)';
        return (
          <text key={i} x={x} y={y + dy} textAnchor={anchor} fontSize={10.5} fontWeight={700} fill="var(--rn-muted)">
            {s.label}
            <tspan x={x} dy={13} fontSize={11} fontWeight={800} fill={color}>{s.score}</tspan>
          </text>
        );
      })}
    </svg>
  );
}
