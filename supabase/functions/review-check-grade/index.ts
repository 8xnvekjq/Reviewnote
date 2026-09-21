// 복습체크 AI 자동채점 — 학생이 다시 답한 5문제(이하)를 서버에서 Gemini로 채점하고,
// service_role 전용 RPC(apply_review_check_ai_grade_batch)로 결과를 저장한다.
//
// 왜 브라우저가 아니라 여기서 계산해야 하는가: solve/classify/extract처럼 클라이언트가 계산한
// 결과를 그대로 저장하게 두면, 학생이 devtools로 "내 답이 정답"이라는 조작된 채점 결과를 직접
// RPC에 넘길 수 있다. 그래서 최종 판정은 반드시 이 Edge Function(학생이 우회 불가능한 서버
// 경계) 안에서 계산하고, service_role 키로만 실행 가능한 RPC로만 저장한다.
//
// 인증 모델: 요청자 본인 JWT로 만든 RLS-scoped 클라이언트로만 세션/문항/오답노트를 읽는다(본인
// 것만 보이는 걸 RLS가 이미 보장하므로 별도 소유권 체크를 하지 않는다). 캐시 테이블 읽기/쓰기와
// 최종 RPC 호출에는 service_role 클라이언트만 쓴다.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import {
  clampAiGradeVerdict,
  type AiGradeVerdict,
  type ClampedAiGradeResult,
  type RawAiGradeResult,
} from '../../../src/utils/reviewCheckGrading.ts';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

// AI 채점 프롬프트/로직 버전 — 프롬프트를 의미 있게 바꿀 때만 이 숫자를 올린다(그 외 코드
// 변경으로는 올리지 않음). review_check_ai_grade_cache의 유니크 키에 포함되어, 버전을 올리면
// 과거 캐시가 자동으로 무효화되고 새 프롬프트로 다시 채점된다.
export const GRADING_VERSION = 1;

const GEMINI_MODEL = 'gemini-2.5-flash';
// 학생 회선이 아니라 서버-서버 호출이라 이미지 다운로드 재시도만큼 길게 잡을 필요는 없지만,
// gemini.ts의 "일시적 과부하는 짧게 재시도" 철학은 그대로 따른다.
const GEMINI_MAX_RETRIES = 2;
const GEMINI_RETRY_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`환경변수 ${name}가 설정되어 있지 않습니다.`);
  return value;
}

interface GeminiGradingInput {
  problemText: string;
  correctAnswer: string;
  solvingProcess: string;
  studentAnswer: string;
}

// 내부 판단 로직일 뿐이라 solve처럼 페르소나/톤을 넣지 않고, 구조적이고 결정론적으로 유지한다.
function buildGradingPrompt(input: GeminiGradingInput): string {
  const problemSection = input.problemText
    ? `[문제 지문]\n${input.problemText}`
    : `[문제 지문]\n(문제 지문 정보가 없다 — 아래 정답과 풀이 과정만으로 판단하라)`;

  return `너는 수학 문제의 학생 답안을 채점하는 채점 보조 AI다. 학생이 제출한 답이 정답과
의미상 동일한지 정확하게 판단하는 것이 유일한 임무다.

${problemSection}

[저장된 정답]
${input.correctAnswer}

[AI가 작성한 전체 풀이 과정 — 어떤 형태의 답까지 동치로 인정할 수 있는지 판단하는 참고 자료]
${input.solvingProcess || '(풀이 과정 정보가 없다)'}

[학생이 제출한 답 — 원문 그대로]
${input.studentAnswer || '(빈 답안)'}

[판정 기준 — 문자열이 완전히 같은지가 아니라 수학적/의미적으로 동일한지를 판단하라]
- 소수와 분수는 값이 같으면 동일하게 인정한다 (예: 1/2 와 0.5).
- 학생이 객관식 번호만 적었더라도(예: "2번"), 그 번호가 가리키는 값이 정답과 같으면 동일하게 인정한다.
- 학생이 습관적으로 붙인 문항 번호나 라벨이 답 앞에 있어도(예: "2. 1/2"), 그 부분은 무시하고 실제 답만 비교한다.
- 동치인 대수적 표현(전개/약분/인수분해 형태 차이 등)은 동일하게 인정한다.
- 정답이 단위를 포함하는 의미라면, 학생 답에 단위가 있든 없든 값이 같으면 동일하게 인정한다.
- 문제/정답 맥락이 불충분하거나, 저장된 정답 자체가 비어 있거나 이상해 보이거나, 조금이라도 확신이
  서지 않으면 절대 추측하지 말고 verdict를 "manual_review"로 답하고 reason에 그 이유를 적는다.

[반환할 JSON 필드]
- verdict: "correct" | "incorrect" | "manual_review" 중 하나
- normalizedStudentAnswer: 학생 답을 비교 가능한 형태로 정규화한 값 (파악 불가하면 null)
- canonicalAnswer: 정답을 비교 가능한 형태로 정규화한 값 (파악 불가하면 null)
- reason: 선생님이 3초 안에 읽을 수 있는 한두 문장의 한국어 판정 근거
- confidence: 이 판정이 맞다고 스스로 생각하는 확신도 (0~1 사이 실수 — 고정값이 아니라 실제 판단에 따라 그때그때 다르게 답할 것)`;
}

async function callGeminiForGrading(apiKey: string, input: GeminiGradingInput): Promise<RawAiGradeResult> {
  const requestBody = {
    contents: [{ parts: [{ text: buildGradingPrompt(input) }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          verdict: { type: 'STRING', enum: ['correct', 'incorrect', 'manual_review'] },
          normalizedStudentAnswer: { type: 'STRING', nullable: true },
          canonicalAnswer: { type: 'STRING', nullable: true },
          reason: { type: 'STRING', nullable: true },
          confidence: { type: 'NUMBER' },
        },
        required: ['verdict', 'confidence'],
      },
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
    } catch (err) {
      // 네트워크 순단 — gemini.ts의 callGeminiApi와 동일하게 재시도 대상으로 취급.
      if (attempt < GEMINI_MAX_RETRIES) {
        await sleep(GEMINI_RETRY_DELAY_MS);
        continue;
      }
      throw err instanceof Error ? err : new Error('Gemini API 연결에 실패했습니다.');
    }

    if (response.status === 503 && attempt < GEMINI_MAX_RETRIES) {
      // 유료키로도 간헐적으로 발생하는 일시적 과부하 — 재시도하면 대부분 바로 성공한다.
      await sleep(GEMINI_RETRY_DELAY_MS);
      continue;
    }
    if (!response.ok) {
      throw new Error(`Gemini API 오류 (status ${response.status})`);
    }

    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      // Gemini가 간헐적으로 빈 candidates/parts를 반환하는 사례가 있어 이것도 재시도 대상으로 취급.
      if (attempt < GEMINI_MAX_RETRIES) {
        await sleep(GEMINI_RETRY_DELAY_MS);
        continue;
      }
      throw new Error('Gemini API로부터 올바른 응답 텍스트를 받지 못했습니다.');
    }

    return JSON.parse(text);
  }

  throw new Error('Gemini API가 반복적으로 응답하지 못했습니다.');
}

interface UngradedItemRow {
  mistake_id: string;
  submitted_answer: string | null;
  mistake: { analysis: Record<string, unknown> | null } | { analysis: Record<string, unknown> | null }[] | null;
}

interface PResultEntry extends ClampedAiGradeResult {
  mistakeId: string;
  gradingVersion: number;
}

// 앞뒤 공백/줄바꿈과 내부의 과도한 공백만 정리한다 — "2." 같은 문항 번호나 표기를 임의로 벗겨내지
// 않는다(모델이 학생의 진짜 원문을 그대로 봐야 한다).
function normalizeWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

async function gradeOneItem(
  serviceClient: SupabaseClient,
  geminiApiKey: string,
  item: UngradedItemRow,
): Promise<PResultEntry> {
  const mistakeRow = Array.isArray(item.mistake) ? item.mistake[0] : item.mistake;
  const analysis = (mistakeRow?.analysis || {}) as Record<string, any>;
  const correctAnswer = String(analysis.finalAnswer || '').trim();
  const studentAnswer = normalizeWhitespace(item.submitted_answer || '');

  if (!correctAnswer) {
    // 정답 데이터 자체가 없으면 애초에 자신 있게 판정할 수 없다 — Gemini를 호출할 필요도 없이
    // 바로 manual_review(정말 애매한 것만 admin에게 넘기는 원칙과 일치, 여기선 "애매함"이 아니라
    // "판정 근거 자체가 없음"이라 더 확실한 케이스).
    return {
      mistakeId: item.mistake_id,
      verdict: 'manual_review',
      normalizedStudentAnswer: studentAnswer || null,
      canonicalAnswer: null,
      reason: '정답 데이터 없음',
      confidence: null,
      gradingVersion: GRADING_VERSION,
    };
  }

  const cacheKey = {
    mistake_id: item.mistake_id,
    correct_answer_snapshot: correctAnswer,
    student_answer_raw: studentAnswer,
    grading_version: GRADING_VERSION,
  };

  const { data: cached, error: cacheReadError } = await serviceClient
    .from('review_check_ai_grade_cache')
    .select('verdict, normalized_student_answer, canonical_answer, reason, confidence')
    .match(cacheKey)
    .maybeSingle();
  if (cacheReadError) throw cacheReadError;

  let graded: ClampedAiGradeResult;
  if (cached) {
    graded = {
      verdict: cached.verdict as AiGradeVerdict,
      normalizedStudentAnswer: cached.normalized_student_answer,
      canonicalAnswer: cached.canonical_answer,
      reason: cached.reason,
      confidence: cached.confidence,
    };
  } else {
    const rawResult = await callGeminiForGrading(geminiApiKey, {
      problemText: String(analysis.problemText || '').trim(),
      correctAnswer,
      solvingProcess: String(analysis.solvingProcess || '').trim(),
      studentAnswer,
    });
    // 모델이 스스로 임계값을 지킬 거라 믿지 않고 여기서 한 번 더 강제로 검증한다(서버 최종
    // 안전장치 — 이 부분만 순수 함수로 분리되어 별도 유닛테스트로 직접 커버된다).
    graded = clampAiGradeVerdict(rawResult);

    const { error: insertError } = await serviceClient
      .from('review_check_ai_grade_cache')
      .insert({
        mistake_id: item.mistake_id,
        correct_answer_snapshot: correctAnswer,
        student_answer_raw: studentAnswer,
        grading_version: GRADING_VERSION,
        verdict: graded.verdict,
        normalized_student_answer: graded.normalizedStudentAnswer,
        canonical_answer: graded.canonicalAnswer,
        reason: graded.reason,
        confidence: graded.confidence,
      });
    if (insertError) {
      if (insertError.code !== '23505') throw insertError; // 23505 = unique_violation 외에는 진짜 오류
      // 동시에 들어온 다른 요청이 같은 키로 먼저 캐시를 채운 경우 — 에러로 취급하지 않고 그 행을
      // 다시 읽어 그대로 재사용한다("먼저 쓴 쪽"을 진실로 삼는 편이 안전).
      const { data: refetched, error: refetchError } = await serviceClient
        .from('review_check_ai_grade_cache')
        .select('verdict, normalized_student_answer, canonical_answer, reason, confidence')
        .match(cacheKey)
        .maybeSingle();
      if (refetchError || !refetched) throw insertError;
      graded = {
        verdict: refetched.verdict as AiGradeVerdict,
        normalizedStudentAnswer: refetched.normalized_student_answer,
        canonicalAnswer: refetched.canonical_answer,
        reason: refetched.reason,
        confidence: refetched.confidence,
      };
    }
  }

  return { mistakeId: item.mistake_id, gradingVersion: GRADING_VERSION, ...graded };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let sessionId: string;
  try {
    const body = await req.json();
    sessionId = body?.sessionId;
    if (!sessionId || typeof sessionId !== 'string') throw new Error('sessionId가 필요합니다.');
  } catch {
    return jsonResponse({ error: 'sessionId가 필요합니다.' }, 400);
  }

  try {
    const supabaseUrl = requireEnv('SUPABASE_URL');
    const anonKey = requireEnv('SUPABASE_ANON_KEY');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    const geminiApiKey = requireEnv('GEMINI_API_KEY_PAID');

    // 요청자 본인 JWT로 RLS-scoped 조회 — 본인 세션/문항/오답노트만 보이는 걸 RLS가 이미
    // 보장하므로, 여기서 별도의 소유권 체크를 추가하지 않는다(남의 세션이면 그냥 "없음"으로 보임).
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    // 캐시 테이블과 최종 판정 RPC는 학생이 devtools로 직접 호출해서 조작할 수 없도록 반드시
    // service_role 클라이언트로만 접근한다.
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: session, error: sessionError } = await userClient
      .from('review_check_sessions')
      .select('id, status')
      .eq('id', sessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;

    if (!session) {
      // RLS 때문에 "남의 세션"과 "존재하지 않는 세션"이 구분 없이 똑같이 안 보인다 — 의도된
      // 동작이라 별도로 구분해서 알려주지 않는다.
      return jsonResponse({ error: '세션을 찾을 수 없어요.' }, 404);
    }
    if (session.status !== 'submitted') {
      // 이미 채점 완료됐거나 아직 학생이 풀이 중인 세션에 대한 재시도/경쟁 호출 — 실패가 아니라
      // 자연스러운 no-op으로 처리한다.
      return jsonResponse({ noop: true, reason: 'not_submitted' });
    }

    const { data: rawItems, error: itemsError } = await userClient
      .from('review_check_items')
      .select('mistake_id, submitted_answer, mistake:mistakes(analysis)')
      .eq('session_id', sessionId)
      .is('grade', null);
    if (itemsError) throw itemsError;

    const items = (rawItems || []) as UngradedItemRow[];
    if (items.length === 0) {
      return jsonResponse({ noop: true, reason: 'nothing_to_grade' });
    }

    const results: PResultEntry[] = [];
    for (const item of items) {
      try {
        results.push(await gradeOneItem(serviceClient, geminiApiKey, item));
      } catch (err) {
        // 이 항목 하나가 실패해도 이미 성공적으로 처리된 나머지 결과는 버리지 않는다 — 아래에서
        // 실제로 확보한 결과만큼만 RPC에 넘긴다(부분 성공이 완전 실패보다 학생에게 훨씬 낫다).
        console.error(`review-check-grade: 항목 채점 실패 (mistake_id=${item.mistake_id})`, err);
      }
    }

    if (results.length === 0) {
      return jsonResponse({ error: 'AI 채점에 실패했어요.' }, 500);
    }

    const { data: applied, error: applyError } = await serviceClient.rpc('apply_review_check_ai_grade_batch', {
      p_session_id: sessionId,
      p_results: results,
    });
    if (applyError) throw applyError;

    return jsonResponse({
      allGraded: !!applied?.allGraded,
      gradedCount: applied?.gradedCount ?? 0,
      manualReviewCount: applied?.manualReviewCount ?? 0,
    });
  } catch (err: any) {
    console.error('review-check-grade failed:', err);
    return jsonResponse({ error: err?.message || '채점 처리 중 오류가 발생했습니다.' }, 500);
  }
});
