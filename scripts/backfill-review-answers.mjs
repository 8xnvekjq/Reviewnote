#!/usr/bin/env node
// 일회성 백필 스크립트: finalAnswer가 비어 있는 옛 mistakes 레코드 중, 이미 저장된 solvingProcess
// 해설 텍스트만으로 정답을 명확하게 추출할 수 있는 경우에 한해 analysis.finalAnswer를 채운다.
// 복습체크 AI 자동채점([CHANGE 1] Edge Function)은 finalAnswer가 비어 있으면 애초에 판정 근거가
// 없다고 보고 곧바로 manual_review로 떨어뜨리므로, 이 백필은 "그런 옛 문제들도 AI 자동채점의
// 혜택을 받을 수 있게" 정답 데이터를 사후 보강하는 별개의 관리자 실행 전용 작업이다(라이브
// 채점 파이프라인의 일부가 아님).
//
// 실행 방법:
//   node --experimental-strip-types scripts/backfill-review-answers.mjs           # 기본: dry-run(아무것도 쓰지 않음)
//   node --experimental-strip-types scripts/backfill-review-answers.mjs --apply   # 실제로 UPDATE 실행
//
// 필요한 환경변수 (하드코딩 금지 — 실행 전 셸에 설정해 둘 것):
//   SUPABASE_URL              - 이 프로젝트의 Supabase URL
//   SUPABASE_SERVICE_ROLE_KEY - service_role 키 (RLS 우회 필요 — 전체 학생의 mistakes를 다뤄야 함)
//   GEMINI_API_KEY_PAID       - gemini-proxy/Edge Function이 쓰는 것과 동일한 유료 API 키
//
// 이 스크립트는 대화형 승인 없이 대량의 프로덕션 행을 수정할 수 있으므로, 코드 작성자(worker)가
// 직접 실행하지 않는다 — 리뷰 후 코디네이터가 --dry-run으로 먼저 결과를 확인하고 --apply로 실행한다.

import { createClient } from '@supabase/supabase-js';
import { SOLVING_PLACEHOLDER_TEXT } from '../src/types/index.ts';

const APPLY = process.argv.includes('--apply');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY_PAID = process.env.GEMINI_API_KEY_PAID;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GEMINI_API_KEY_PAID) {
  console.error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY_PAID 환경변수가 모두 필요합니다.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const GEMINI_MODEL = 'gemini-2.5-flash';
const RESOLVABLE_CONFIDENCE_THRESHOLD = 0.8; // 라이브 채점(0.7)보다 높다 — admin 재확인 없이
                                              // 바로 저장되는 일회성/비가역적에 가까운 쓰기라서.

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function extractAnswerFromSolvingProcess(solvingProcess) {
  const prompt = `다음은 이미 풀이가 완료된 수학 문제의 해설이다. 이 해설의 최종 정답을 추출하라.
정답이 이 해설 안에서 명확하게 특정될 수 있을 때만 extractedAnswer를 채우고 resolvable=true로
답하라. 조금이라도 모호하거나 여러 후보가 있으면 resolvable=false로 답하고 extractedAnswer는
비워두라.

[해설]
${solvingProcess}`;

  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          extractedAnswer: { type: 'STRING' },
          resolvable: { type: 'BOOLEAN' },
          confidence: { type: 'NUMBER' },
        },
        required: ['extractedAnswer', 'resolvable', 'confidence'],
      },
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY_PAID}`;
  const MAX_RETRIES = 2;
  const RETRY_DELAY_MS = 1500;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
    } catch (err) {
      if (attempt < MAX_RETRIES) { await sleep(RETRY_DELAY_MS); continue; }
      throw err;
    }
    if (response.status === 503 && attempt < MAX_RETRIES) { await sleep(RETRY_DELAY_MS); continue; }
    if (!response.ok) throw new Error(`Gemini API 오류 (status ${response.status})`);

    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      if (attempt < MAX_RETRIES) { await sleep(RETRY_DELAY_MS); continue; }
      throw new Error('Gemini API로부터 올바른 응답 텍스트를 받지 못했습니다.');
    }
    return JSON.parse(text);
  }
  throw new Error('Gemini API가 반복적으로 응답하지 못했습니다.');
}

async function fetchEligibleRows() {
  // is_hidden/solvingProcess/finalAnswer 조건은 src/components/MistakeCard.tsx의 isAnalyzed 판정,
  // SOLVING_PLACEHOLDER_TEXT 상수와 완전히 동일한 기준을 쓴다(따로 재정의하면 나중에 어긋날 수
  // 있어, 상수는 반드시 import해서 쓰고 절대 문자열을 직접 다시 타이핑하지 않는다).
  //
  // is_hidden과 finalAnswer 조건은 각각 "null 이거나 특정 값"이라는 OR 형태라, supabase-js의
  // .or()를 두 번 체이닝하는 대신(같은 이름의 쿼리 파라미터가 두 개 생겨 예측 가능성이 떨어짐)
  // solvingProcess 조건(단순 AND라 안전)만 서버에서 필터링하고, 나머지 OR 조건은 최종 결과에서
  // JS로 직접 걸러 정확한 의미를 보장한다 — 240건 안팎의 일회성 스크립트라 성능상 문제없다.
  const { data, error } = await supabase
    .from('mistakes')
    .select('id, analysis, is_hidden')
    .not('analysis->>solvingProcess', 'is', null)
    .neq('analysis->>solvingProcess', '')
    .neq('analysis->>solvingProcess', SOLVING_PLACEHOLDER_TEXT);
  if (error) throw error;

  return (data || []).filter(row => {
    const notHidden = !row.is_hidden;
    const finalAnswer = row.analysis?.finalAnswer;
    const finalAnswerEmpty = finalAnswer == null || String(finalAnswer).trim() === '';
    return notHidden && finalAnswerEmpty;
  });
}

async function main() {
  console.log(APPLY ? '=== 실행 모드: --apply (실제로 UPDATE 합니다) ===' : '=== dry-run 모드 (아무것도 쓰지 않습니다. --apply로 실제 반영) ===');

  const rows = await fetchEligibleRows();
  console.log(`대상(finalAnswer 없음 + solvingProcess 완료됨) 행 수: ${rows.length}건`);

  let updated = 0;
  let unresolved = 0;
  let errored = 0;

  for (const row of rows) {
    const solvingProcess = row.analysis?.solvingProcess || '';
    try {
      const { extractedAnswer, resolvable, confidence } = await extractAnswerFromSolvingProcess(solvingProcess);
      const ok = resolvable === true && typeof confidence === 'number' && confidence >= RESOLVABLE_CONFIDENCE_THRESHOLD && String(extractedAnswer || '').trim();

      if (!ok) {
        unresolved++;
        console.log(`[UNRESOLVED] ${row.id} (resolvable=${resolvable}, confidence=${confidence})`);
        continue;
      }

      const finalAnswer = String(extractedAnswer).trim();
      console.log(`[${APPLY ? 'UPDATE' : 'WOULD UPDATE'}] ${row.id} -> finalAnswer="${finalAnswer}" (confidence=${confidence})`);

      if (!APPLY) { updated++; continue; }

      // WHERE에 finalAnswer가 여전히 비어 있는지 재확인 — 이 스크립트의 읽기(SELECT)와 쓰기(UPDATE)
      // 사이에 실제 학생 활동으로 정상적으로 채워졌을 수 있는 값을 절대 덮어쓰지 않기 위한 필수
      // 안전장치(동시성 하에서도 "기존 정답이 있으면 절대 덮어쓰지 않음"을 보장).
      const { data: updatedRows, error: updateError } = await supabase
        .from('mistakes')
        .update({ analysis: { ...row.analysis, finalAnswer } })
        .eq('id', row.id)
        .or('analysis->>finalAnswer.is.null,analysis->>finalAnswer.eq.')
        .select('id');
      if (updateError) throw updateError;

      if (!updatedRows || updatedRows.length === 0) {
        console.log(`  (건너뜀: 그 사이 finalAnswer가 이미 채워짐 — 정상적인 동시성 상황)`);
      } else {
        updated++;
      }
    } catch (err) {
      errored++;
      console.error(`[ERROR] ${row.id}:`, err?.message || err);
    }
  }

  console.log('=== 요약 ===');
  console.log(`대상: ${rows.length}건`);
  console.log(`${APPLY ? '업데이트됨' : '업데이트 예정'}: ${updated}건`);
  console.log(`미해결(모호/저신뢰): ${unresolved}건`);
  console.log(`오류: ${errored}건`);
  if (!APPLY) {
    console.log('\ndry-run이었습니다 — 실제로 반영하려면 --apply 플래그를 붙여 다시 실행하세요.');
  }
}

main().catch(err => {
  console.error('백필 스크립트 실행 중 치명적 오류:', err);
  process.exit(1);
});
