import { MATH_CURRICULUM, type MistakeEntry } from '../types';
import { aggregatePlanPatterns, type PlanCategory } from './planPatternAnalysis';

// 관리자용 "시험대비 분석" 리포트 — 순수 계산 함수(AI 호출 없음).
//
// 설계 원칙(요청 사항 반영):
// - mistakeSummary/AI 오답원인 진단은 절대 사용하지 않는다. 근거는 root_causes(학생 자기진단),
//   userActionPlan(학생이 직접 쓴 대책), reviews(O/X/★), problemText(문제 원문), scaffolding
//   기록(재풀이/손풀이 존재 여부)만 사용한다.
// - 값은 전부 "건" 단위 카운트에서 유도한다. 오답노트 데이터에는 전체 시도 횟수(분모)가 없으므로
//   %나 정답률/오답률 표현은 절대 만들지 않는다.
// - Radar 6축은 절대 실력 점수가 아니라 "현재 오답 기록에서 관찰되는 상대적 프로파일"이다.

export const ROOT_CAUSE_LABEL: Record<string, string> = {
  concept: '개념',
  strategy: '풀이 전략',
  calc: '계산',
  formula: '공식',
  misread: '문제 읽기(오독)',
};

export function causeLabel(cause: string): string {
  return ROOT_CAUSE_LABEL[cause] || cause;
}

export const RADAR_AXIS_LABELS = ['개념 이해', '조건 해석·문제 읽기', '풀이 전략', '계산 정확도', '복습 이행', '자기교정·대책 실천'] as const;

export const RADAR_WEAK_THRESHOLD = 45;
export const RADAR_STABLE_THRESHOLD = 70;

// 6축 프로필은 "절대 실력 점수"가 아니라 Reviewnote 기록에서 계산한 상대적 학습 신호라는 점을
// 학생/관리자 화면 모두에서 반드시 함께 보여준다 — 정확한 문구는 임의로 바꾸지 않는다.
export const RADAR_DISCLAIMER_ADMIN =
  '이 점수는 절대적인 실력 점수가 아닙니다. Reviewnote에 기록된 오답, 복습 결과, 자기진단, 대책 등의 신호를 정해진 규칙으로 계산한 상대적 학습 프로필 점수입니다. 같은 학생 안에서 어떤 영역을 먼저 확인할지 비교하는 용도로 봐주세요.';
export const RADAR_DISCLAIMER_STUDENT =
  '이 숫자는 시험 점수가 아니라, 내 Reviewnote 기록에서 계산한 상대적 학습 신호예요.';

export interface ExamPrepChapterStat { chapter: string; count: number }
export interface ExamPrepCauseStat { cause: string; label: string; count: number }
export interface ExamPrepReviewBuckets { complete: number; inProgress: number; retry: number; unreviewed: number }
export interface ExamPrepWeakItem { title: string; detail: string; chapter?: string }
export interface ExamPrepChapterDrilldown {
  chapter: string;
  count: number;
  causes: ExamPrepCauseStat[];
  review: ExamPrepReviewBuckets;
  representativeTitles: string[];
}
export interface ExamPrepPriority { rank: 1 | 2 | 3; title: string; reason: string; suggestion: string }
export interface ExamPrepLessonStep { when: string; items: string[] }
export interface ExamPrepPlanSample { title: string; text: string; chapter?: string }
export interface ExamPrepPlanCategoryStat { category: PlanCategory; label: string; count: number }
export interface ExamPrepRadarAxis {
  label: string;
  score: number;
  // 이 축 점수를 낼 때 실제로 쓰인 표본 크기 — 작을수록 shrink가 강하게 걸려 있다는 뜻.
  sampleSize: number;
  // "이유 보기"에 그대로 노출하는 실제 계산 근거 문장들. 전부 실제 카운트에서 나온 값이며
  // AI가 생성한 해석 문장은 없다(마지막 한 줄도 score 구간에 따른 고정 템플릿).
  evidence: string[];
}

export interface ExamPrepReport {
  studentId: string;
  studentName: string;
  grade: string;
  startChapter: string;
  endChapter: string;
  rangeChapters: string[];
  N: number;
  T: number;
  chapterStats: ExamPrepChapterStat[];
  causeStats: ExamPrepCauseStat[];
  review: ExamPrepReviewBuckets;
  planCount: number;
  planRate: number;
  planCategoryStats: ExamPrepPlanCategoryStat[];
  planSpecificity: { concrete: number; vague: number; unclear: number };
  planInterpretation: string[];
  planSamples: ExamPrepPlanSample[];
  radar: ExamPrepRadarAxis[];
  weakItems: ExamPrepWeakItem[];
  stableItems: string[];
  priorities: ExamPrepPriority[];
  lessonSteps: ExamPrepLessonStep[];
  chapterDrilldowns: ExamPrepChapterDrilldown[];
  scaffoldingCount: number;
  dataGapChapters: string[];
  sampleWarning: string | null;
  generatedAt: string;
}

function reviewBucket(reviews: MistakeEntry['reviews']): keyof ExamPrepReviewBuckets {
  const r = reviews || [];
  if (r.some(s => s === 'X')) return 'retry';
  const filled = r.filter(s => s === 'O' || s === 'star');
  if (r.length === 3 && filled.length === 3) return 'complete';
  if (filled.length > 0) return 'inProgress';
  return 'unreviewed';
}

export function computeExamPrepReport(
  allMistakes: MistakeEntry[],
  studentId: string,
  studentName: string,
  grade: string,
  startChapter: string,
  endChapter: string,
  scaffoldedMistakeIds: Set<string>,
): ExamPrepReport | null {
  const curriculum = MATH_CURRICULUM[grade] || [];
  const startIdx = curriculum.indexOf(startChapter);
  const endIdx = curriculum.indexOf(endChapter);
  if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) return null;
  const rangeChapters = curriculum.slice(startIdx, endIdx + 1);
  const rangeSet = new Set(rangeChapters);

  const inScope = allMistakes.filter(m =>
    m.userId === studentId &&
    !m.isHidden &&
    m.grade === grade &&
    !!m.chapter &&
    rangeSet.has(m.chapter),
  );
  const N = inScope.length;

  const chapterStats: ExamPrepChapterStat[] = rangeChapters.map(chapter => ({
    chapter,
    count: inScope.filter(m => m.chapter === chapter).length,
  }));
  const dataGapChapters = chapterStats.filter(c => c.count === 0).map(c => c.chapter);

  const causeCounts: Record<string, number> = {};
  const causeByChapter: Record<string, Record<string, number>> = {};
  let taggedCount = 0;
  inScope.forEach(m => {
    const causes = m.rootCauses || [];
    if (causes.length > 0) taggedCount++;
    causes.forEach(c => {
      causeCounts[c] = (causeCounts[c] || 0) + 1;
      if (m.chapter) {
        causeByChapter[c] = causeByChapter[c] || {};
        causeByChapter[c][m.chapter] = (causeByChapter[c][m.chapter] || 0) + 1;
      }
    });
  });
  const T = taggedCount;
  const causeStats: ExamPrepCauseStat[] = Object.entries(causeCounts)
    .map(([cause, count]) => ({ cause, label: causeLabel(cause), count }))
    .sort((a, b) => b.count - a.count);

  const review: ExamPrepReviewBuckets = { complete: 0, inProgress: 0, retry: 0, unreviewed: 0 };
  inScope.forEach(m => { review[reviewBucket(m.reviews)]++; });

  const plans = inScope.filter(m => m.userActionPlan?.trim());
  const planCount = plans.length;
  const planRate = N > 0 ? planCount / N : 0;
  const planPattern = aggregatePlanPatterns(plans.map(m => ({ text: m.userActionPlan!.trim(), rootCauses: m.rootCauses || [] })));
  const planSamples: ExamPrepPlanSample[] = plans.slice(0, 6).map(m => ({
    title: m.title, text: m.userActionPlan!.trim(), chapter: m.chapter,
  }));

  // Radar 6축 채점.
  //
  // 표본수 보정: sampleSize=0 → factor=0(무조건 50, 중립), 1~2 → factor .2~.4(50 쪽으로 강하게
  // 당김), 3~4 → factor .6~.8(제한적으로만 반영), 5 이상 → factor=1(원점수 그대로 사용). 요청된
  // "N=0 중립 / N=1~2 강한 shrink / N>=3 제한적 해석 / N>=5 정상 해석" 티어를 이산 분기 대신
  // factor=min(1, size/5) 연속함수 하나로 근사한 것 — 경계에서 점수가 뚝 끊기지 않는다.
  const shrink = (raw: number, sampleSize: number) => {
    const factor = Math.min(1, sampleSize / 5);
    return Math.round(50 + (raw - 50) * factor);
  };
  const rate = (count: number, denom: number) => (denom > 0 ? count / denom : 0);
  const evidenceTail = (score: number) =>
    score < RADAR_WEAK_THRESHOLD
      ? '현재 다른 영역보다 우선 확인 신호가 강합니다.'
      : score >= RADAR_STABLE_THRESHOLD
        ? '현재 다른 영역보다 안정적인 신호입니다.'
        : '다른 영역과 비슷한 수준의 신호입니다.';

  // 원인(root_causes) 기반 4축(개념/문제읽기/전략/계산)은 "그 원인 태그가 시험범위 전체 오답
  // N건 중 몇 건이나 나오는가"를 분모 N 기준으로 본다. 원인 기록이 없는 축은 강점으로 추정하지
  // 않고 50(중립)에 둔 채, 해당 원인의 발생 비율만큼 그 축만 최대 46점까지 낮춘다. 따라서 한
  // 원인만 계속 자기진단해도 나머지 세 축이 근거 없이 100점으로 올라가지 않는다. 또한 count는
  // causeCounts를 합산하지 않고 "해당 원인 중 하나라도 태그된 서로 다른 오답 건수"로 센다 —
  // 계산 정확도 축처럼 causes=['calc','formula'] 두 태그를 모두 가진 오답이 있으면 예전 방식은
  // 그 오답을 두 번 카운트해 count>N이 되어 rate>1(raw가 음수)이 나오는 버그가 있었다.
  const taggedByCauses = (causes: string[]) => inScope.filter(m => (m.rootCauses || []).some(c => causes.includes(c)));
  const axisFromCauses = (label: string, causes: string[]): ExamPrepRadarAxis => {
    if (T === 0) {
      return {
        label,
        score: 50,
        sampleSize: N,
        evidence: [`시험범위 내 자기진단(자기 체크) 기록이 아직 없어요 — 분석 표본 ${N}건.`],
      };
    }
    const tagged = taggedByCauses(causes);
    const count = tagged.length;
    const raw = Math.max(4, Math.min(50, Math.round(50 - rate(count, N) * 46)));
    const score = shrink(raw, N);
    const unresolved = tagged.filter(m => { const b = reviewBucket(m.reviews); return b === 'retry' || b === 'unreviewed'; }).length;
    const complete = tagged.filter(m => reviewBucket(m.reviews) === 'complete').length;
    return {
      label,
      score,
      sampleSize: N,
      evidence: [
        `${label} 관련 자기진단 ${count}건 (전체 ${N}건 중)`,
        `그중 최근 미해결(재도전 필요·미복습) ${unresolved}건`,
        `복습 완료 ${complete}건`,
        `분석 표본 ${N}건`,
        evidenceTail(score),
      ],
    };
  };

  const reviewedCount = N - review.unreviewed;
  const reviewAxisScore = shrink(Math.round(rate(reviewedCount, N) * 100), N);
  const reviewAxis: ExamPrepRadarAxis = {
    label: RADAR_AXIS_LABELS[4],
    score: reviewAxisScore,
    sampleSize: N,
    evidence: [
      `복습을 시작한 문제 ${reviewedCount}건 / 전체 ${N}건`,
      `복습 완료 ${review.complete}건, 진행 중 ${review.inProgress}건, 재도전 필요 ${review.retry}건, 미복습 ${review.unreviewed}건`,
      `분석 표본 ${N}건`,
      evidenceTail(reviewAxisScore),
    ],
  };

  // 대책은 작성 여부만으로 만점을 주지 않고, 실행 대상을 구체적으로 적은 대책은 1건,
  // 모호한 다짐은 0.5건으로 반영한다. 판단하기 어려운 짧은 메모는 점수에서 제외한다.
  const weightedPlanCount = planPattern.specificity.concrete + planPattern.specificity.vague * 0.5;
  const planAxisScore = shrink(Math.round(rate(weightedPlanCount, N) * 100), N);
  const planAxis: ExamPrepRadarAxis = {
    label: RADAR_AXIS_LABELS[5],
    score: planAxisScore,
    sampleSize: N,
    evidence: [
      `대책을 작성한 문제 ${planCount}건 / 전체 ${N}건`,
      `그중 구체적 대책 ${planPattern.specificity.concrete}건, 모호한 대책 ${planPattern.specificity.vague}건, 판단 어려움 ${planPattern.specificity.unclear}건`,
      `점수 반영값 ${weightedPlanCount}건 (구체적 1, 모호함 0.5, 판단 어려움 0)`,
      `분석 표본 ${N}건`,
      evidenceTail(planAxisScore),
    ],
  };

  const radar: ExamPrepRadarAxis[] = [
    axisFromCauses(RADAR_AXIS_LABELS[0], ['concept']),
    axisFromCauses(RADAR_AXIS_LABELS[1], ['misread']),
    axisFromCauses(RADAR_AXIS_LABELS[2], ['strategy']),
    axisFromCauses(RADAR_AXIS_LABELS[3], ['calc', 'formula']),
    reviewAxis,
    planAxis,
  ];

  // 취약점 TOP — 태그 개수 상위 원인 최대 3개(표본 1건짜리는 제외)
  const topCauses = causeStats.filter(c => c.count >= 2).slice(0, 3);
  const weakItems: ExamPrepWeakItem[] = topCauses.map(c => {
    const byChapter = causeByChapter[c.cause] || {};
    const topChapter = Object.entries(byChapter).sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      title: `${c.label} 관련 자기진단이 반복됨`,
      detail: topChapter
        ? `시험범위 내 자기진단 ${T}건 중 ${c.count}건이 "${c.label}" — 특히 ${topChapter}에서 자주 나타남`
        : `시험범위 내 자기진단 ${T}건 중 ${c.count}건이 "${c.label}"`,
      chapter: topChapter,
    };
  });
  if (review.unreviewed > 0) {
    const unreviewedChapters = Array.from(new Set(inScope.filter(m => reviewBucket(m.reviews) === 'unreviewed').map(m => m.chapter).filter(Boolean))) as string[];
    weakItems.push({
      title: '최근 등록 오답 중 아직 복습을 시작하지 않은 문제가 있음',
      detail: `${N}건 중 ${review.unreviewed}건이 미복습 — ${unreviewedChapters.slice(0, 3).join(', ')}${unreviewedChapters.length > 3 ? ' 등' : ''}`,
    });
  }
  if (dataGapChapters.length > 0) {
    weakItems.push({
      title: '일부 단원은 기록된 오답이 없어 판단이 어려움',
      detail: `${dataGapChapters.join(', ')} — 시험범위에 포함되지만 데이터가 없어 취약/안정 여부를 판단할 수 없음`,
    });
  }
  const finalWeak = weakItems.slice(0, 4);

  // 안정 영역 — 가장 적게 태그된 원인 + 재도전(X) 없는 단원
  const stableItems: string[] = [];
  const leastCause = [...causeStats].sort((a, b) => a.count - b.count)[0];
  if (leastCause && T > 0) {
    stableItems.push(`"${leastCause.label}"로 인한 자기진단이 상대적으로 드묾(${T}건 중 ${leastCause.count}건)`);
  }
  if (review.retry === 0 && N > 0) {
    stableItems.push('재도전(X)이 필요했던 문제가 시험범위 내에 없음 — 반복 실패 사례가 적은 편');
  }
  const bestChapter = chapterStats
    .filter(c => c.count > 0)
    .map(c => ({ chapter: c.chapter, retryCount: inScope.filter(m => m.chapter === c.chapter && reviewBucket(m.reviews) === 'retry').length, count: c.count }))
    .filter(c => c.retryCount === 0 && c.count >= 2)
    .sort((a, b) => b.count - a.count)[0];
  if (bestChapter) {
    stableItems.push(`${bestChapter.chapter} — 기록된 ${bestChapter.count}건 중 재도전(X)으로 이어진 경우가 없음`);
  }
  if (stableItems.length === 0) {
    stableItems.push('아직 안정적이라고 판단할 만큼 데이터가 쌓이지 않음');
  }

  const priorities: ExamPrepPriority[] = finalWeak.slice(0, 3).map((w, i) => ({
    rank: (i + 1) as 1 | 2 | 3,
    title: w.title,
    reason: w.detail,
    suggestion: w.chapter
      ? `${w.chapter} 문제부터 다시 풀리며 이 유형이 반복되는지 확인`
      : '해당 문제부터 다시 풀리며 반복 여부 확인',
  }));

  const lessonSteps: ExamPrepLessonStep[] = [
    { when: '다음 수업', items: [
      review.unreviewed > 0 ? `미복습 ${review.unreviewed}건부터 함께 재풀이` : '가장 최근 등록된 오답부터 재풀이',
      finalWeak[0] ? `${finalWeak[0].title} — 근거가 된 문제 유형 위주로 확인` : '취약 유형 확인',
    ] },
    { when: '그 다음 수업', items: [
      finalWeak[1] ? finalWeak[1].title : '다음으로 빈도 높은 자기진단 유형 재확인',
      '학생이 적은 대책이 실제로 적용됐는지 재풀이로 확인',
    ] },
    { when: '시험 직전', items: [
      review.retry > 0 ? `재도전(X) 표시된 ${review.retry}건 우선 재확인` : '★ 표시 문제 위주로 최종 점검',
      '새 고난도 문제보다 기존 오답 재확인 위주로 진행',
    ] },
  ];

  const chapterDrilldowns: ExamPrepChapterDrilldown[] = chapterStats
    .filter(c => c.count > 0)
    .map(c => {
      const items = inScope.filter(m => m.chapter === c.chapter);
      const causes: Record<string, number> = {};
      items.forEach(m => (m.rootCauses || []).forEach(cause => { causes[cause] = (causes[cause] || 0) + 1; }));
      const rv: ExamPrepReviewBuckets = { complete: 0, inProgress: 0, retry: 0, unreviewed: 0 };
      items.forEach(m => { rv[reviewBucket(m.reviews)]++; });
      return {
        chapter: c.chapter,
        count: c.count,
        causes: Object.entries(causes).map(([cause, count]) => ({ cause, label: causeLabel(cause), count })).sort((a, b) => b.count - a.count),
        review: rv,
        representativeTitles: items.slice(0, 3).map(m => m.title),
      };
    });

  const scaffoldingCount = inScope.filter(m => scaffoldedMistakeIds.has(m.id)).length;

  const sampleWarning = N < 8 ? `이번 시험범위 내 기록이 ${N}건으로 적은 편이라, 아래 해석은 참고용으로만 활용해 주세요.` : null;

  return {
    studentId, studentName, grade, startChapter, endChapter, rangeChapters,
    N, T, chapterStats, causeStats, review, planCount, planRate,
    planCategoryStats: planPattern.categoryCounts, planSpecificity: planPattern.specificity,
    planInterpretation: planPattern.interpretation, planSamples,
    radar, weakItems: finalWeak, stableItems: stableItems.slice(0, 3), priorities, lessonSteps,
    chapterDrilldowns, scaffoldingCount, dataGapChapters, sampleWarning,
    generatedAt: new Date().toISOString(),
  };
}
