// 학생이 적은 대책(userActionPlan) 분석 — deterministic 규칙 기반, 런타임 AI 호출 없음.
//
// 이 파일의 사전(MATH_TERMS/VAGUE_PHRASES/카테고리 정규식)은 Reviewnote에 실제로 저장된
// userActionPlan 코퍼스(관리자/test 제외, 2026-09 기준 약 450건)를 직접 읽고 반복되는 표현을
// 추출해서 만들었다 — 임의로 taxonomy를 먼저 만들고 끼워 맞춘 게 아니라, 실제 문장에서
// 나온 패턴을 코드로 옮긴 것. AI(이 조사를 수행한 세션)는 "코퍼스를 읽고 분류체계를 설계하는"
// 일회성 개발 보조로만 쓰였고, 이 파일이 배포된 뒤로는 매 실행마다 AI를 부르지 않는다.
//
// 핵심 발견: 문장 길이는 대책의 질과 상관이 약하다. "부호 확인"처럼 짧아도 구체적인 경우가
// 많고, "앞으로는 문제를 꼼꼼히 읽고 실수하지 않도록 노력하겠습니다"처럼 길어도 실행 기준이
// 없는 경우가 있다. 대신 "실제 수학적 대상(조건/공식/좌표/부호 등)을 구체적으로 언급했는가"가
// 훨씬 더 신뢰할 수 있는 신호였다 — 그래서 길이 대신 이 신호(hasMathContent)를 핵심 기준으로 삼는다.

export type PlanCategory = 'condition' | 'strategy' | 'conceptFormula' | 'calc';

export const PLAN_CATEGORY_LABEL: Record<PlanCategory, string> = {
  condition: '조건 확인',
  strategy: '풀이 전략',
  conceptFormula: '개념·공식',
  calc: '계산·검산',
};

// 카테고리별로 "자연스럽게 이어지는" root_causes 태그 — 학생 자기진단과 대책의 방향이
// 서로 통하는지 보는 용도일 뿐, 반드시 일치해야 한다는 규범은 아니다.
const CATEGORY_ROOTCAUSE_MAP: Record<PlanCategory, string[]> = {
  condition: ['misread'],
  strategy: ['strategy'],
  conceptFormula: ['concept', 'formula'],
  calc: ['calc'],
};

// 실제 코퍼스에서 반복 관찰된 카테고리 트리거 표현 — 정규식은 Korean 부분 문자열 매칭.
const CATEGORY_PATTERNS: Record<PlanCategory, RegExp> = {
  condition: /조건|잘\s*읽|똑바로.{0,2}(읽|보|봐)|꼼꼼.{0,3}읽|다시.{0,2}읽|제대로.{0,2}읽|검토|빠짐없이|빠뜨리지|누락|밑줄/,
  strategy: /경우.{0,3}나눠|나누어\s*풀|치환|그림|그려|좌표평면|로\s*생각한다|미지수로\s*두|식을?\s*세우|전략|먼저\s*구하|나눠서/,
  conceptFormula: /공식|개념|암기|외우|정리를|기억하자|기억해야|기억해놓|기억해놓겠/,
  calc: /계산|검산|부호|대입해서\s*확인|다시\s*계산|암산|약분|통분/,
};

// 실제 코퍼스에서 반복된 "일반적 다짐" 표현 — 수학적 대상 언급 없이 의지만 표현.
const VAGUE_PHRASES = ['집중', '천천히', '꼼꼼', '실수하지', '노력하겠', '조심', '열심히', '똑바로'];

// 실제 코퍼스에 등장한 수학적 대상 어휘(교과서 용어 + 실제 학생 표현) — 이 중 하나라도
// 포함되면 "구체적 수학 내용을 언급했다"고 판단한다.
const MATH_TERMS = [
  '조건', '공식', '개념', '부호', '계산', '검산', '대입', '치환', '경우', '그림', '그래프', '좌표',
  '미지수', '방정식', '부등식', '함수', '극한', '미분', '적분', '접선', '기울기', '거리', '행렬',
  '수열', '순열', '조합', '확률', '집합', '벡터', '삼각형', '사각형', '다각형', '넓이', '판별식',
  '인수분해', '이차', '삼차', '사차', '항등식', '무게중심', '내분점', '외분점', '대칭', '켤레',
  '분모', '분자', '통분', '약분', '절댓값', '제곱', '루트', '증감표', '극값', '수직', '평행',
  '사분면', '반지름', '중심', '성질', '정리', '공비', '공차', '수렴', '발산', '실근', '허근',
  '근과계수', '나머지', '조립제법', '순서쌍', '여집합', '교집합', '합집합', '부분집합', '원소',
  '자취', '직선', '점', '선분', '교점', '꼭짓점', '수선', '이등분', '내접', '외접', '외심', '내심',
  '무리수', '유리수', '허수', '복소수', '다항식', '몫', '최댓값', '최솟값', '극댓값',
  '극솟값', '증가', '감소', '기울기', '원점', 'x축', 'y축', 'x좌표', 'y좌표',
  // 실제 코퍼스에 등장한 정리/공식 고유명사
  '피타고라스', '사인법칙', '코사인법칙', '케일리', '신발끈', '드모르간', '아폴로니우스', '사잇값정리',
];
// '실수'는 "real number"(수학 용어)와 "mistake"(일상어, "실수하지 않도록"처럼 VAGUE_PHRASES와
// 훨씬 자주 겹침)로 뜻이 갈려 MATH_TERMS에서 의도적으로 제외했다 — 실제 코퍼스 검증 중
// "앞으로는 문제를 꼼꼼히 읽고 실수하지 않도록 노력하겠습니다" 같은 전형적인 추상 다짐 문장이
// '실수' 때문에 구체적으로 오분류되는 것을 확인하고 제거함.
const MATH_TERM_REGEX = new RegExp(MATH_TERMS.join('|'));
// 숫자/등호/부호 등 대수적 기호가 섞인 미니 수식("x=3", "a>0" 등)도 구체성 신호로 인정.
const ALGEBRAIC_SYMBOL_REGEX = /[=><≤≥]|\d\s*[+\-×÷*/^]|[a-zA-Z]\s*[=><]/;

function hasMathContent(text: string): boolean {
  return MATH_TERM_REGEX.test(text) || ALGEBRAIC_SYMBOL_REGEX.test(text);
}

// 아주 짧고 수학적 대상도, 다짐 표현도 없는 문장 — 답 조각("673", "?")이나 감정적 메모("멍충멍충")
// 등 "대책"으로 보기 어려운 경우. 무리하게 구체/추상으로 나누지 않고 별도로 분리한다.
function isUnclear(text: string, matchedVague: boolean, matchedMath: boolean): boolean {
  if (matchedVague || matchedMath) return false;
  const trimmed = text.trim();
  return trimmed.length <= 6 || /^[\d\s.,?()\-+=]+$/.test(trimmed);
}

export interface PlanClassification {
  categories: PlanCategory[];
  specificity: 'concrete' | 'vague' | 'unclear';
}

export function classifyPlanText(rawText: string): PlanClassification {
  const text = rawText.trim();
  const categories = (Object.keys(CATEGORY_PATTERNS) as PlanCategory[]).filter(cat => CATEGORY_PATTERNS[cat].test(text));
  const matchedMath = hasMathContent(text);
  const matchedVague = VAGUE_PHRASES.some(p => text.includes(p));
  let specificity: PlanClassification['specificity'];
  if (isUnclear(text, matchedVague, matchedMath)) specificity = 'unclear';
  else if (matchedMath) specificity = 'concrete';
  else specificity = 'vague';
  return { categories, specificity };
}

export interface PlanAggregateInput { text: string; rootCauses: string[] }

export interface PlanAggregateResult {
  total: number;
  categoryCounts: { category: PlanCategory; label: string; count: number }[];
  specificity: { concrete: number; vague: number; unclear: number };
  alignedCount: number;
  evaluableCount: number; // 대책 + root_causes 둘 다 있어서 연결성을 판단할 수 있는 건수
  repeatedVague: boolean; // 같은 모호한 표현이 2회 이상 반복됐는지
  interpretation: string[]; // 2~3문장 — 관리자(교사)가 읽는 문구, "학생이 ~" 3인칭
  interpretationForStudent: string[]; // 같은 판단을 학생 본인 시점으로 바꾼 문구(데이터는 동일, 문장만 다름)
}

function normalizeForDupCheck(text: string): string {
  return text.trim().replace(/\s+/g, '').replace(/[!?.~…♪🎶🎵]+$/gu, '');
}

const CATEGORY_TEMPLATE: Record<PlanCategory, string> = {
  condition: '조건을 다시 확인하려는 대책이 반복됩니다. 문제를 읽을 때 표시 순서를 정하면 더 실행하기 쉬워져요.',
  calc: '계산 후 확인하는 대책을 자주 세우고 있습니다. 부호·계산·조건 대조처럼 검산 순서를 정하면 더 효과적이에요.',
  strategy: '풀이 시작 전에 무엇을 먼저 구할지 정하는 대책이 나타납니다. 전략 선택에서 스스로 체크하려는 경향으로 볼 수 있어요.',
  conceptFormula: '공식·개념을 다시 확인하려는 대책이 자주 나타납니다. 외운 내용을 문제에 바로 적용해보는 연습을 함께 하면 좋아요.',
};

export function aggregatePlanPatterns(plans: PlanAggregateInput[]): PlanAggregateResult {
  const categoryCountMap: Record<PlanCategory, number> = { condition: 0, strategy: 0, conceptFormula: 0, calc: 0 };
  const specificity = { concrete: 0, vague: 0, unclear: 0 };
  let alignedCount = 0;
  let evaluableCount = 0;
  const vagueTexts: Record<string, number> = {};

  plans.forEach(({ text, rootCauses }) => {
    const { categories, specificity: tier } = classifyPlanText(text);
    categories.forEach(c => { categoryCountMap[c]++; });
    specificity[tier]++;
    if (tier === 'vague') {
      const key = normalizeForDupCheck(text);
      vagueTexts[key] = (vagueTexts[key] || 0) + 1;
    }
    if (rootCauses.length > 0) {
      evaluableCount++;
      const aligned = categories.some(c => CATEGORY_ROOTCAUSE_MAP[c].some(rc => rootCauses.includes(rc)));
      if (aligned) alignedCount++;
    }
  });

  const categoryCounts = (Object.keys(categoryCountMap) as PlanCategory[])
    .map(category => ({ category, label: PLAN_CATEGORY_LABEL[category], count: categoryCountMap[category] }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);

  const repeatedVague = Object.values(vagueTexts).some(n => n >= 2);

  // 판단 로직은 한 번만 계산하고, 문장만 역할별로 나눈다(관리자용 3인칭 "학생이 ~" / 학생
  // 본인용 1인칭) — "다음 상담에서" 같은 교사 일정 표현도 학생용에서는 제거한다.
  const interpretation: string[] = [];
  const interpretationForStudent: string[] = [];
  if (plans.length === 0) {
    interpretation.push('아직 대책을 작성한 오답이 없어요.');
    interpretationForStudent.push('아직 대책을 작성한 오답이 없어요.');
  } else {
    const top = categoryCounts[0];
    if (top) { interpretation.push(CATEGORY_TEMPLATE[top.category]); interpretationForStudent.push(CATEGORY_TEMPLATE[top.category]); }
    if (specificity.vague > 0 && (repeatedVague || specificity.vague >= Math.max(2, Math.ceil(plans.length * 0.3)))) {
      const vagueLine = '다만 "집중하기", "천천히 풀기"처럼 행동 기준이 넓은 표현도 반복되어, 다음 문제에서 바로 실행할 수 있는 순서로 바꿔보면 좋아요.';
      interpretation.push(vagueLine);
      interpretationForStudent.push(vagueLine);
    }
    if (evaluableCount >= 3) {
      const alignRate = alignedCount / evaluableCount;
      if (alignRate >= 0.6) {
        interpretation.push('학생이 체크한 실수 유형과 대책이 대체로 잘 연결되어 있어요.');
        interpretationForStudent.push('내가 체크한 실수 유형과 대책이 대체로 잘 연결되어 있어요.');
      } else if (alignRate < 0.35) {
        interpretation.push('학생이 체크한 실수 유형과 대책이 다른 방향을 향하는 경우가 있어 — 다음 상담에서 같이 짚어보면 좋아요.');
        interpretationForStudent.push('내가 체크한 실수 유형과 대책이 다른 방향을 향할 때가 있어요 — 대책을 쓸 때 체크한 실수 유형을 먼저 다시 보면 좋아요.');
      }
    }
    if (specificity.unclear > 0 && specificity.unclear >= plans.length * 0.3) {
      const unclearLine = '짧은 메모라 의도를 판단하기 어려운 대책도 섞여 있어요.';
      interpretation.push(unclearLine);
      interpretationForStudent.push(unclearLine);
    }
  }

  return {
    total: plans.length,
    categoryCounts,
    specificity,
    alignedCount,
    evaluableCount,
    repeatedVague,
    interpretation: interpretation.slice(0, 3),
    interpretationForStudent: interpretationForStudent.slice(0, 3),
  };
}
