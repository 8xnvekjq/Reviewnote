import { useState } from 'react';
import { RADAR_WEAK_THRESHOLD, RADAR_STABLE_THRESHOLD, type ExamPrepRadarAxis } from '../../utils/examPrepAnalysis';

// 6축 학습 프로필 레이더 — 외부 차트 라이브러리 없이 순수 SVG로 구현(의존성 추가 불필요할 만큼
// 단순한 차트). 절대 실력 점수가 아니라 상대적 프로파일이라는 점은 이 컴포넌트 밖(caption)에서
// 명시한다 — 여기서는 시각화 + 축별 "이유 보기" 상호작용만 담당.
//
// 라벨/점수 텍스트는 SVG <text>가 아니라 HTML 버튼으로 그린다. 6축(n=6)에서는 맨 아래축
// (angle=90°, sin=1)의 라벨 기준점이 옛 viewBox 높이 바로 근처였고, 거기에 라벨+점수 두 줄
// 오프셋(dy=11, tspan dy=13)이 더해지면 viewBox 바깥으로 밀려나 잘려 보이지 않는 문제가 있었다.
// SVG 텍스트는 폭 제한/줄바꿈이 없어 옆축의 긴 라벨("조건 해석·문제 읽기")도 잘리기 쉬웠다.
// HTML 버튼은 max-width로 자연스럽게 줄바꿈되고, 탭 영역도 넓어져 모바일에서 "이유 보기"를
// 누르기도 더 쉽다 — 폰트를 억지로 줄이는 대신 이 구조 자체로 두 문제를 함께 해결한다.
interface RadarChartProps {
  scores: ExamPrepRadarAxis[];
}

const SIZE_X = 320;
const SIZE_Y = 300;
const CX = 160;
const CY = 145;
const R = 70;
const LABEL_R = R + 34;

function scoreColor(score: number): string {
  return score < RADAR_WEAK_THRESHOLD ? 'var(--rn-danger)' : score >= RADAR_STABLE_THRESHOLD ? 'var(--rn-success)' : 'var(--rn-text)';
}

export function RadarChart({ scores }: RadarChartProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const n = scores.length;
  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, r: number): [number, number] => [CX + r * Math.cos(angle(i)), CY + r * Math.sin(angle(i))];

  const rings = [0.25, 0.5, 0.75, 1].map(f =>
    Array.from({ length: n }, (_, i) => pt(i, R * f).join(',')).join(' '),
  );
  const dataPoints = scores.map((s, i) => pt(i, (R * Math.max(4, s.score)) / 100));
  const openAxis = openIndex !== null ? scores[openIndex] : null;

  return (
    <div className="rn-examprep-radar-wrap">
      <div className="rn-examprep-radar-stage" style={{ aspectRatio: `${SIZE_X} / ${SIZE_Y}` }}>
        <svg className="rn-examprep-radar-svg" viewBox={`0 0 ${SIZE_X} ${SIZE_Y}`} role="img" aria-label="6축 학습 프로필 레이더 차트">
          {rings.map((points, idx) => (
            <polygon key={idx} points={points} fill="none" stroke="var(--rn-line)" strokeWidth={1} />
          ))}
          {scores.map((_, i) => {
            const [x, y] = pt(i, R);
            return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="var(--rn-line)" strokeWidth={1} />;
          })}
          <polygon
            points={dataPoints.map(p => p.join(',')).join(' ')}
            fill="var(--rn-accent)"
            fillOpacity={0.22}
            stroke="var(--rn-accent)"
            strokeWidth={2}
          />
          {dataPoints.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={4} fill={scoreColor(scores[i].score)} />
          ))}
        </svg>
        {scores.map((s, i) => {
          const [x, y] = pt(i, LABEL_R);
          const sin = Math.sin(angle(i));
          const vAlign = sin > 0.4 ? 'below' : sin < -0.4 ? 'above' : 'middle';
          const left = `${(x / SIZE_X) * 100}%`;
          const top = `${(y / SIZE_Y) * 100}%`;
          const translateY = vAlign === 'below' ? '0%' : vAlign === 'above' ? '-100%' : '-50%';
          return (
            <button
              key={s.label}
              type="button"
              className="rn-examprep-radar-label"
              style={{ left, top, transform: `translate(-50%, ${translateY})` }}
              onClick={() => setOpenIndex(prev => (prev === i ? null : i))}
              aria-expanded={openIndex === i}
              aria-label={`${s.label} ${s.score}점 — 이유 보기`}
            >
              <span className="axis-name">{s.label}</span>
              <span className="axis-score" style={{ color: scoreColor(s.score) }}>{s.score}</span>
            </button>
          );
        })}
      </div>
      {openAxis && (
        <div className="rn-examprep-radar-detail" role="note">
          <div className="title">{openAxis.label} {openAxis.score} — 이유 보기</div>
          <ul>
            {openAxis.evidence.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
