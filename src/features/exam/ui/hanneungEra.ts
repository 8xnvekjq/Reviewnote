// 한능검 시대별 진단: 문항 시대 태그(data/*.topics.json) + 채점 결과 → 시대별 맞은 수·점수·약한 시대.
// 순수 함수만 둔다(JSON import 없음) — 태그 레지스트리는 data/hanneungTopics.ts.
import type { ExamResultItem } from '../contract.ts';

/** 표시 순서도 이 순서. */
export const HANNEUNG_ERAS = [
  { id: 'prehistory', label: '선사·초기 국가' },
  { id: 'three-kingdoms', label: '삼국·가야' },
  { id: 'north-south', label: '남북국' },
  { id: 'goryeo', label: '고려' },
  { id: 'joseon-early', label: '조선 전기' },
  { id: 'joseon-late', label: '조선 후기' },
  { id: 'opening', label: '개항기·대한제국' },
  { id: 'colonial', label: '일제 강점기' },
  { id: 'modern', label: '현대' },
  { id: 'cross', label: '시대 통합' },
] as const;
export type HanneungEra = typeof HANNEUNG_ERAS[number]['id'];
export const HANNEUNG_FIELDS = ['정치', '경제', '사회', '문화'] as const;
export type HanneungField = typeof HANNEUNG_FIELDS[number];

export interface HanneungTopic {
  number: number;
  era: HanneungEra;
  field: HanneungField;
  keywords: string[];
  confidence: 'high' | 'low';
  note: string;
}
/** 프런트엔드에 번들되는 파일 — 정답·배점은 넣지 않는다. */
export interface HanneungTopicFile {
  paperId: string;
  questions: HanneungTopic[];
}

/** 정답률이 이보다 낮으면 "보충 필요". */
export const WEAK_RATE = 0.6;

export interface EraStat {
  era: HanneungEra;
  label: string;
  total: number;
  correct: number;
  points: number;
  earned: number;
  /** correct / total (0~1) */
  rate: number;
}

export function eraLabel(era: HanneungEra): string {
  return HANNEUNG_ERAS.find(row => row.id === era)?.label ?? era;
}

/** 시대별 집계. 태그가 없는 문항은 빼고, 문항이 0개인 시대는 결과에 넣지 않는다. */
export function eraStats(items: Pick<ExamResultItem, 'number' | 'isCorrect' | 'points'>[], topics: HanneungTopicFile): EraStat[] {
  const eraOf = new Map(topics.questions.map(topic => [topic.number, topic.era]));
  const byEra = new Map<HanneungEra, EraStat>();
  for (const item of items) {
    const era = eraOf.get(item.number);
    if (!era) continue;
    const stat = byEra.get(era) ?? { era, label: eraLabel(era), total: 0, correct: 0, points: 0, earned: 0, rate: 0 };
    stat.total += 1;
    stat.points += item.points;
    if (item.isCorrect) {
      stat.correct += 1;
      stat.earned += item.points;
    }
    byEra.set(era, stat);
  }
  return HANNEUNG_ERAS.flatMap(({ id }) => {
    const stat = byEra.get(id);
    return stat ? [{ ...stat, rate: stat.correct / stat.total }] : [];
  });
}

/** 정답률 60% 미만 시대들("보충 필요"). 없으면 정답률이 가장 낮은 1개("가장 약한 시대") — 모두 만점이면 없음.
 *  동률이면 표시 순서상 앞 시대. */
export function weakEras(stats: EraStat[]): { kind: 'needs-work' | 'weakest'; eras: HanneungEra[] } | null {
  const weak = stats.filter(stat => stat.rate < WEAK_RATE);
  if (weak.length > 0) return { kind: 'needs-work', eras: weak.map(stat => stat.era) };
  const lowest = stats.reduce<EraStat | null>((min, stat) => (min == null || stat.rate < min.rate ? stat : min), null);
  return lowest && lowest.rate < 1 ? { kind: 'weakest', eras: [lowest.era] } : null;
}

/** 결과의 시험지 id. 이전 서버 응답에 paperId가 없으면 문항 이미지 경로(/exams/<paperId>/…)에서 찾는다. */
export function resultPaperId(result: { paperId?: string; items: Pick<ExamResultItem, 'imageUrl'>[] }): string | null {
  if (result.paperId) return result.paperId;
  const match = /^\/exams\/([^/]+)\//.exec(result.items[0]?.imageUrl ?? '');
  return match ? match[1] : null;
}
