// AI 채점 판정을 마지막으로 검증하는 순수 함수 — supabase/functions/review-check-grade/index.ts가
// 상대 경로로 그대로 import해서 쓴다(Deno/브라우저 양쪽에서 동일하게 동작하도록 외부 의존성 없이
// 순수하게 유지 — import 하나라도 추가하면 Deno 쪽 번들링이 깨질 수 있다).
//
// 모델이 스스로 confidence 임계값을 지킬 거라고 신뢰하지 않고, 여기서 무조건 한 번 더 강제로
// 클램프한다 — 낮은 확신의 AI 추측이 그대로 최종 채점(정답/오답)으로 저장되는 걸 막는 마지막
// 방어선이라, 이 파일 전체에서 가장 안전 관련도가 높은 로직이다.

export type AiGradeVerdict = 'correct' | 'incorrect' | 'manual_review';

export interface RawAiGradeResult {
  verdict: string;
  normalizedStudentAnswer: string | null;
  canonicalAnswer: string | null;
  reason: string | null;
  confidence: number | null;
}

export interface ClampedAiGradeResult {
  verdict: AiGradeVerdict;
  normalizedStudentAnswer: string | null;
  canonicalAnswer: string | null;
  reason: string | null;
  confidence: number | null;
}

const VALID_VERDICTS: AiGradeVerdict[] = ['correct', 'incorrect', 'manual_review'];

// 이 미만이면 verdict가 무엇이든 admin 확인이 필요한 것으로 취급한다.
export const AI_GRADE_CONFIDENCE_THRESHOLD = 0.7;

export function clampAiGradeVerdict(raw: RawAiGradeResult): ClampedAiGradeResult {
  const { confidence } = raw;
  const confidenceAboveThreshold = typeof confidence === 'number'
    && Number.isFinite(confidence)
    && confidence >= AI_GRADE_CONFIDENCE_THRESHOLD
    && confidence <= 1;
  const verdictValid = VALID_VERDICTS.includes(raw.verdict as AiGradeVerdict);
  const verdict: AiGradeVerdict = verdictValid && confidenceAboveThreshold
    ? (raw.verdict as AiGradeVerdict)
    : 'manual_review';

  return {
    verdict,
    normalizedStudentAnswer: raw.normalizedStudentAnswer ?? null,
    canonicalAnswer: raw.canonicalAnswer ?? null,
    reason: raw.reason ?? null,
    confidence: raw.confidence ?? null,
  };
}
