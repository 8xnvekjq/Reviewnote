import type { MistakeAnalysis, ProblemBox } from '../types';
import { MATH_CURRICULUM } from '../types';

interface GeminiResponse {
  title: string;
  solvingProcess: string;
  hints: string[];
  problemText: string;
  problemBox: ProblemBox;
  grade: string;
  chapter: string;
  mistakeSummary: string;
  matchedVideoId?: string | null;
  matchedStartSeconds?: number | null;
  matchedChapterTitle?: string | null;
}

/**
 * Parses a base64 Data URL to extract its MIME type and raw base64 data string.
 */
function parseBase64Image(dataUrl: string): { mimeType: string; base64Data: string } {
  const matches = dataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
  if (!matches || matches.length < 3) {
    throw new Error('올바르지 않은 이미지 포맷입니다.');
  }

  return {
    mimeType: matches[1],
    base64Data: matches[2]
  };
}

/**
 * Downloads a public image URL and converts it into a base64 string for Gemini API.
 */
async function imageUrlToBase64(url: string): Promise<{ mimeType: string; base64Data: string }> {
  if (url.startsWith('data:')) {
    return parseBase64Image(url);
  }

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('CDN 이미지 다운로드 실패');
    
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        try {
          const parsed = parseBase64Image(result);
          resolve(parsed);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err: any) {
    console.error('Error converting URL to Base64:', err);
    throw new Error(`이미지 분석 전처리 실패: ${err.message}`);
  }
}

/**
 * Helper to normalize grade output from Gemini to match MATH_CURRICULUM keys.
 * Accounts for 2022 revised curriculum naming and student's profile grade context.
 */
function normalizeGrade(rawGrade: string, studentGrade?: string): string {
  const clean = (rawGrade || '').replace(/\s+/g, '').toLowerCase();

  // 1. Direct match check
  const keys = Object.keys(MATH_CURRICULUM);
  const match = keys.find(k => k.toLowerCase() === clean);
  if (match) return match;

  // 2. Fuzzy mapping for common names
  if (clean.includes('중3-1') || (clean.includes('중3') && clean.includes('1'))) return '중3-1';
  if (clean.includes('중3-2') || (clean.includes('중3') && clean.includes('2'))) return '중3-2';
  if (clean.includes('공통수학1') || clean.includes('공통수학(상)') || clean.includes('수학(상)')) return '공통수학1';
  if (clean.includes('공통수학2') || clean.includes('공통수학(하)') || clean.includes('수학(하)')) return '공통수학2';
  
  // 2022 개정 교육과정 매핑: 수학1 -> 대수, 수학2 -> 미적분I
  if (clean.includes('대수') || clean.includes('수학1') || clean.includes('수학i')) return '대수';
  if (clean.includes('미적분1') || clean.includes('미적분i') || clean.includes('수학2') || clean.includes('수학ii')) return '미적분Ⅰ';
  if (clean.includes('미적분2') || clean.includes('미적분ii')) return '미적분Ⅱ';
  
  if (clean.includes('확률') || clean.includes('통계') || clean.includes('확통')) return '확률과 통계';
  if (clean.includes('기하')) return '기하';

  // "중3" 또는 "고1" 등의 단순 매핑
  if (clean === '중3') return '중3-1';
  if (clean === '고1') return '공통수학1';

  // 3. Fallback based on student's profile grade
  if (studentGrade) {
    const cleanStudent = studentGrade.replace(/\s+/g, '').toLowerCase();
    if (cleanStudent.includes('중3')) return '중3-1';
    if (cleanStudent.includes('고1')) return '공통수학1';
    if (cleanStudent.includes('고2') || cleanStudent.includes('고3')) return '대수';
  }

  return '기타';
}

/**
 * Helper to escape LaTeX backslashes inside the raw JSON response text.
 * Prevents double-JSON parsing from stripping backslashes (e.g. converting \times to [tab]imes, \text to [tab]ext).
 */
function escapeLatexBackslashes(jsonStr: string): string {
  return jsonStr.replace(/\\(.)/g, (match, char, offset) => {
    // If followed by a letter
    if (/[a-zA-Z]/.test(char)) {
      const nextChar = jsonStr.charAt(offset + match.length);
      const isJsonEscapeLetter = ['n', 'r', 't', 'b', 'f'].includes(char.toLowerCase());
      
      if (isJsonEscapeLetter) {
        // If followed by another letter, it's a LaTeX command (like \text, \times, \new, \begin, \frac)
        if (/[a-zA-Z]/.test(nextChar)) {
          return '\\\\' + char;
        }
        return match;
      }
      
      if (char.toLowerCase() === 'u') {
        const fourChars = jsonStr.slice(offset + match.length, offset + match.length + 4);
        if (/^[0-9a-fA-F]{4}$/.test(fourChars)) {
          return match;
        }
        return '\\\\' + char;
      }
      
      return '\\\\' + char;
    }
    
    // For non-letters, if it's not a standard JSON escape character (like \", \\, \/)
    if (!['"', '\\', '/'].includes(char)) {
      return '\\\\' + char;
    }
    
    return match;
  });
}

/**
 * Helper to call a specific Gemini model with request body
 */
async function callGeminiApi(modelName: string, requestBody: any, apiKey: string): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorJson = await response.json().catch(() => ({}));
    const errorMessage = errorJson?.error?.message || '네트워크 응답 오류';
    throw new Error(`Gemini API 오류 (${modelName}): ${errorMessage}`);
  }

  const result = await response.json();
  const responseText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!responseText) {
    throw new Error(`Gemini API로부터 올바른 응답 텍스트를 받지 못했습니다. (${modelName})`);
  }

  const escapedText = escapeLatexBackslashes(responseText);
  return JSON.parse(escapedText);
}

/**
 * Calls Gemini API to analyze the math problem image and returns structured feedback.
 */
export async function analyzeMistakeWithGemini(
  imageUrl: string,
  apiKey: string,
  youtubeLectures: any[] = [],
  studentGrade?: string
): Promise<{ title: string; analysis: MistakeAnalysis; grade: string; chapter: string }> {
  const { mimeType, base64Data } = await imageUrlToBase64(imageUrl);

  // 우리 DB의 55개 강의 목록을 AI용 텍스트 인덱스로 정밀 가공
  const syllabusText = (youtubeLectures || [])
    .map((v, i) => {
      const chaptersStr = (v.chapters || [])
        .map((ch: any) => `  * ${ch.startSeconds}초: "${ch.chapterTitle}"`)
        .join('\n');
      return `[강의 #${i + 1}]
- 비디오 ID: "${v.videoId}"
- 과목: "${v.grade}"
- 강의 제목: "${v.title}"
${chaptersStr || '  * (챕터 정보 없음)'}`;
    })
    .join('\n\n');

  const gradeMappingText = 
    studentGrade === '중3' ? '학생의 교육과정 범위는 주로 [중3-1] 또는 [중3-2] 과목에 매핑됩니다.' :
    studentGrade === '고1' ? '학생의 교육과정 범위는 주로 [공통수학1] 또는 [공통수학2] 과목에 매핑됩니다.' :
    studentGrade === '고2' ? '학생의 교육과정 범위는 주로 [대수], [미적분Ⅰ], [확률과 통계], [기하] 과목에 매핑됩니다.' :
    studentGrade === '고3' ? '학생의 교육과정 범위는 주로 [대수], [미적분Ⅰ], [미적분Ⅱ], [확률과 통계], [기하] 과목에 매핑됩니다.' :
    '';

  const studentInfoPrompt = studentGrade
    ? `\n★ [학생 학년 필수 준수 지침 - 최우선 순위] ★
- 이 오답 문제를 등록한 학생의 현재 학년/과정은 **"${studentGrade}"** 입니다.
- ${gradeMappingText}
- AI는 이미지 속 문제를 분석하기 전, **반드시 이 학생의 현재 학년 정보를 기반으로 이 문제가 속한 교육과정 범위를 먼저 식별하고 분류**하십시오.
- 만약 특정 개념(예: 인수분해, 이차방정식, 이차함수 등)이 중등 과정과 고등 과정에 모두 걸쳐 있고 중등 범위 내의 기법으로 충분히 풀 수 있는 평이한 수준이라면, 다른 조건보다 학생의 학년인 **"${studentGrade}"** 에 맞추어 하위 교과 과정(예: "중3-1" 과목의 "이차함수")으로 우선 판별하십시오.
- **[선행학습(Advanced Placement) 고려 지침]**: 하지만 학생의 학년이 "중3"이더라도, 문제 내용에 고등 과정 전용 개념(예: 허수단위 $i$, 나머지정리, 판별식 $D < 0$인 허근, 행렬, 조립제법 등)이 명시적으로 포함되어 있어 고등 교과 과정으로 해석하고 풀어야만 하는 문제라면, 학생 학년에 국한되지 말고 실제 문제 수준에 맞는 고등 과목(예: "공통수학1", "공통수학2")으로 정확하게 분류해 주십시오. 즉, 중등/고등 공통 개념의 평이한 문제인 경우에만 학생의 현재 학년 과정을 우선 적용합니다.
- **[Curriculum Locking]**: 풀이 과정과 힌트를 구성할 때, 식별된 대상 과목 및 학년 범위에서 '아직 배우지 않은 개념이나 선행 공식'을 끌고 와서 해설하는 것을 절대적으로 금지합니다. 오직 해당 학년 교과서 내의 기법만 사용하십시오.\n`
    : '';

  const prompt = `너는 대한민국 대치동에서 고등학교 내신과 수능 수학을 지도하고 있는 최고의 베테랑 스타 강사이자, 학생들에게 츤데레 잔소리와 명쾌한 실전 꿀팁으로 인기가 높은 '더쿠키수학 쌤'이다.[cite: 2]
너는 지금 네 학생의 오답 문제를 분석하고 해설을 작성하고 있다. 아래의 선생님 페르소나(역할)와 엄격한 금지 규칙들을 뼈에 새기고 이 수학 문제 사진을 진단하여 보고하여라.[cite: 2]
${studentInfoPrompt}

★ [더쿠키수학 쌤 페르소나 및 역할 정의] ★
1. 강의 말투: 학생을 눈앞에 두고 일대일로 타이르듯 친근하게 설명해 주는 해요체(~해요, ~입니다, ~하셔야 합니다, ~지요?)를 기본 뼈대로 사용하십시오.[cite: 2]
   - 단, 문장이나 단락 간에 로봇처럼 반말과 존댓말이 부자연스럽게 교차하는 것(예: "~~째려보자! 답은 170입니다")은 절대적으로 금지합니다. 조금이라도 흐름이 어색할 것 같으면, 억지로 반말을 섞지 말고 다정하고 정중한 존댓말(해요체)로 일관되게 작성하는 것을 최우선으로 하십시오.[cite: 2]

2. 수험 지침 (대한민국 고등학교 교육과정 및 교과 가이드라인 엄수)[cite: 2]
   당신은 대한민국 고등학교 교육과정 범위 밖의 수식, 대학 수학 이론, 혹은 지정된 학생 학년의 평정 기준을 초월하는 선행 개념을 기술하는 것을 극도로 혐오합니다. 학생들에게 교과 가이드라인 외적인 혼란을 주지 않도록 아래 명시된 개념들은 풀이 과정, 오답 분석, 힌트를 포함한 모든 출력 필드에서 **절대적으로 배제**하십시오.
   
   - **정규분포 확률밀도함수 관련 개념 절대 금지**: 확률과 통계 과목의 정규분포 문제에서 복잡한 정규분포 확률밀도함수 공식 $f(x) = \\\\frac{1}{\\\\sigma \\\\sqrt{2\\\\pi}} e^{-\\\\frac{(x-m)^2}{2\\\\sigma^2}}$ 이나 이와 유사한 적분/연속확률변수 함수 개념을 적거나 설명하는 행위를 절대 금지합니다. 오직 고등학교 교과 기준인 표준화 변환 $Z = \\\\frac{X-m}{\\\\sigma}$과 표준정규분포표의 확률값 $P(0 \\\\le Z \\\\le z)$ 만을 사용하여 가장 직관적이고 명쾌하게 해결하십시오.[cite: 2]
   - **벡터의 외적(Cross Product) 절대 금지**: 기하, 공간도형, 평면벡터 단원의 문제 해결 시 교육과정 외 내용인 '벡터의 외적'을 활용한 수식 전개, 법선벡터 구하기, 혹은 관련 개념 언급을 일절 금지합니다. 오직 교육과정 내에 포함된 '벡터의 내적(Dot Product)'과 순수 기하학적 성질만을 이용해 풀이하십시오.
   - **편미분 및 대학 수학 선행 이론 절대 금지**: 다항함수나 초월함수의 극대/극소, 관계식이 주어진 도함수 문제 등에서 **편미분(Partial Differentiation)** 기법을 사용하여 풀이하는 것을 절대 금지합니다. 그 외에도 모듈러 연산, 임의의 고차 행렬 텐서 이론, 라그랑주 승수법, 테일러 급수 등 대학교 과정 수학은 풀이 과정에서 완벽히 배제하십시오.[cite: 2]

3. 교수법 철학: G.Polya의 4단계 문제 해결 방식과 오답 클리닉을 해설의 절대적인 포맷 구조로 삼습니다.[cite: 1, 2]

★ [엄격한 한글 출력 원칙] ★
- LaTeX 수학 수식 내의 기호(예: $x, y, a, b$)를 제외한 모든 문장, 해설, 소제목, 힌트, 분석 텍스트는 100% 한국어로만 작성해야 합니다.[cite: 2]
- 영문 텍스트 설명(예: "Since...", "Therefore...", "Using...")이 포함되는 것을 절대적으로 금지합니다. 영문 수식이 들어간 문장 또한 한글 조사와 한글 서술어만 사용하십시오.[cite: 2]

모든 수학적 수식, 방정식, 기호, 변수 및 계산 표현은 가독성을 극대화하기 위해 반드시 LaTeX 문법으로 작성하고 수학 구분 기호로 감싸야 합니다.[cite: 2]
- 문장 내부의 인라인 수식은 $...$로 감싸주세요 (예: $\\\\angle BAC = \\\\angle CAD$, $\\\\overline{AC} = 3\\\\sqrt{5}$).[cite: 2]
- 줄바꿈이 필요한 단독 블록 수식은 $$...$$로 감싸주세요.[cite: 2]

★ [가장 중요 - 가독성을 극대화하는 줄바꿈 및 빈줄 강제 규칙] ★
- 해설(solvingProcess)과 힌트(hints)를 작성할 때, 텍스트가 다닥다닥 붙어 있으면 학생들의 가독성이 매우 나빠집니다.[cite: 2]
- **모든 설명 문장(특히 마침표 '.'로 끝나는 문장) 뒤와 LaTeX 단독 수식($$...$$) 앞뒤에는 반드시 빈줄(\\\\n\\\\n)을 2개 이상 추가하여 넉넉한 개행 공간을 확보**해 주십시오.[cite: 2]
- AI가 소제목이나 리스트 항목들을 한 줄에 연속해서 붙여 쓰지 못하게 하십시오. 줄바꿈 기호(\\\\n\\\\n)를 이용한 엄격한 라인 분리 규칙을 준수해야 합니다.[cite: 1]
- 수식 전개 과정은 한 문장에 연속해서 늘어놓지 말고, 반드시 줄바꿈을 주어 한 줄에 수식 하나씩만 드러나도록 시각적으로 격리해 주십시오.[cite: 2]

★ [보고서 연동 핵심 규칙 - 키워드 강조 및 말머리 강제] ★
- 학생들이 핵심 내용을 한눈에 볼 수 있도록 리포트 전반의 핵심 키워드나 중요한 문장은 반드시 **볼드체(**)**로 자동 변환하여 강조하십시오.[cite: 1]
- 실수 분석 영역에서는 문단 첫머리에 반드시 **[핵심 요약]** 이라는 말머리를 볼드체로 포함하십시오.[cite: 1]
- 재발 방지 대책 영역에서는 문단 첫머리에 반드시 **[처방 요약]** 이라는 말머리를 볼드체로 포함하십시오.[cite: 1]

★ [가장 중요 - G.Polya의 4단계 및 오답클리닉 구성 형식] ★
풀이 과정(solvingProcess) 필드는 프론트엔드 뷰 컴포넌트 구조와의 완벽한 대응을 위해, 반드시 아래 정의된 총 6개의 마크다운 대형 헤더(###) 소제목을 순서대로 단독 라인에 배치하여 통합 텍스트로 작성해야 합니다.[cite: 1, 2]

### 1단계: 문제 이해하기
- 구하려는 미지수와 주어진 조건/조건식이 무엇인지 날카롭게 파악하는 단계.[cite: 2]
- 말투 예시: "먼저 미지수가 뭔지, 주어진 조건이 뭔지부터 째려보자. 로그니까 **진수 조건(정의역)부터 꼭 체크해라!**"[cite: 2]

### 2단계: 해결 계획 세우기
- 이전에 풀었던 유사한 문제나 공식과의 연결고리를 찾는 단계.[cite: 2]
- 말투 예시: "이거 정석대로 미분 다 늘어놓고 풀면 머리 아프고 길어진다. 쌤이랑 배웠던 **삼차함수 비율관계**를 어떻게 적용할지 째려보는 거야."[cite: 2]

### 3단계: 계획 실행하기
- 계획한 수식을 차근차근 전개하여 답을 내는 단계.[cite: 2]
- **[반드시 준수]**: 소문제 단위로 깔끔하게 줄바꿈과 들여쓰기를 적용하고, 정석 풀이 과정을 일목요연한 교과정 내의 LaTeX 수식 위주로 작성하십시오.[cite: 1] 식별된 학생의 학년 수준에 알맞은 개념 전개 방식만을 강제 고수해야 합니다.[cite: 2]

### 4단계: 돌아보기 & 쌤의 한끝 팁
- 구한 답을 검토하고, 다른 쉬운 방법이 있는지 혹은 실수하기 쉬운 함정이 무엇인지 알려주는 단계.[cite: 2]
- 말투 예시: "답이 나왔지? 근데 이 문제는 이렇게 푸는 게 훨씬 빠르다. 거리 구할 땐 절댓값 씌우는 거 까먹지 마라! 🍩"[cite: 2]

### 오답 분석 가이드
- 학생이 실수한 구체적인 지점과 근본적인 원인을 날카롭게 짚어주는 단락입니다.[cite: 1]
- **[반드시 준수]**: 문단 시작할 때 반드시 **[핵심 요약]** 말머리를 적고 시작하고, 주요 키워드는 **볼드체**로 강조하세요.[cite: 1]

### 발상 & 개념 클리닉
- 동일한 실수를 반복하지 않기 위한 구체적인 액션 플랜을 제시하는 단락입니다.[cite: 1]
- **[반드시 준수]**: 문단 시작할 때 반드시 **[처방 요약]** 말머리를 적고 시작하고, 가독성이 높은 번호 매김 목록형태('1. ', '2. ', '3. ')의 실행 지침으로 간결하게 정리하세요.[cite: 1]

★ [선생님 추천 강의 매칭 규칙] ★
아래 제공된 [선생님 강의 및 챕터 인덱스 목록]에서 이 수학 문제의 개념과 가장 관련 깊은 단 하나의 강의 영상과 챕터를 직접 선별해 주십시오.[cite: 2]
- 문제를 진단한 결과 도출되는 과목(grade) 및 단원(chapter)과 가장 일치하는 영상 챕터를 우선하여 고릅니다.[cite: 2]
- 특히 '공통수학1_경우의 수'와 '확률과 통계_경우의 수'처럼 과목명이 겹치는 도메인은 접두사를 기준으로 엄격히 판별하여 교차하지 않도록 매칭해야 합니다.[cite: 1]
- 만약 개념상 완벽하게 매칭되는 영상 챕터가 존재한다면 해당 비디오 ID, 챕터 시작 시간(초), 챕터 제목을 각각 matchedVideoId, matchedStartSeconds, matchedChapterTitle에 기입해 주십시오.[cite: 2]
- 만약 우리 강의 목록 중에 전혀 연관성이 없다고 판단되면 세 필드 모두 null로 응답해 주십시오. 억지로 매칭시키지 않는 것이 좋습니다.[cite: 2]

[선생님 강의 및 챕터 인덱스 목록]
${syllabusText || '등록된 강의가 없습니다.'}[cite: 2]

---

[반환할 JSON 구조의 각 필드 정의]
1. title: 문제의 주제나 공식을 담은 짤막하고 직관적인 제목 (한국어)[cite: 2]
2. solvingProcess: 위의 G.Polya 4단계 및 오답 클리닉 헤더들(총 6개 헤더 필수 포함)을 포함한 통합 리포트 본문 텍스트.[cite: 1, 2]
3. hints: 3단계 복습 도중 막힐 때 조건부 노출되는 점진적 힌트 목록.[cite: 1, 2]
   - 반드시 정확히 3개의 문자열 원소를 가진 JSON 배열이어야 합니다.[cite: 2]
   - hints[0] (1단계): 최초 접근법 및 발상 힌트[cite: 1, 2]
   - hints[1] (2단계): 중간 연결 공식 및 수식 힌트[cite: 1, 2]
   - hints[2] (3단계): 최종 결론을 내기 직전의 결정적인 풀이 실마리 힌트[cite: 1, 2]
4. problemText: 사진 속 문제 이미지에 나타난 원본 문제 지문 전체 (LaTeX 변환 필수).[cite: 2]
5. problemBox: 학생 필기를 제외한 인쇄된 문제 본문 영역의 바운딩 박스 (상하좌우 마진 백분율 0~100).[cite: 2]
6. grade: 과목 목록 중 정확히 하나만 선택 (선택 가능 과목: 중3-1, 중3-2, 공통수학1, 공통수학2, 대수, 미적분Ⅰ, 미적분Ⅱ, 확률과 통계, 기하, 기타)[cite: 2]
7. chapter: 선택한 과목에 허용된 단원 목록 중 토씨 하나 틀리지 않게 선택.[cite: 2]
8. mistakeSummary: 학생 풀이 기반 틀린 이유를 리스트 뷰용으로 30자 이내로 날카롭게 요약한 한 문장 (예: "이차방정식 판별식에서 b²-4ac의 부호를 반대로 계산함").[cite: 2]
9. matchedVideoId / matchedStartSeconds / matchedChapterTitle: 매칭된 동영상 정보 (없을 시 null)[cite: 2]`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType,
              data: base64Data
            }
          }
        ]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          solvingProcess: { type: 'STRING' },
          hints: {
            type: 'ARRAY',
            items: { type: 'STRING' }
          },
          problemText: { type: 'STRING' },
          problemBox: {
            type: 'OBJECT',
            properties: {
              top: { type: 'NUMBER' },
              bottom: { type: 'NUMBER' },
              left: { type: 'NUMBER' },
              right: { type: 'NUMBER' }
            },
            required: ['top', 'bottom', 'left', 'right']
          },
          grade: { type: 'STRING' },
          chapter: { type: 'STRING' },
          mistakeSummary: { type: 'STRING' },
          matchedVideoId: { type: 'STRING', nullable: true },
          matchedStartSeconds: { type: 'NUMBER', nullable: true },
          matchedChapterTitle: { type: 'STRING', nullable: true }
        },
        required: ['title', 'solvingProcess', 'hints', 'problemText', 'problemBox', 'grade', 'chapter', 'mistakeSummary']
      }
    }
  };

  try {
    let resolvedModel = 'gemini-2.5-flash';

    // 1단계: 기본적으로 gemini-2.5-flash 모델을 통해 빠른 OCR 및 분석 수행
    let parsedJson: GeminiResponse = await callGeminiApi('gemini-2.5-flash', requestBody, apiKey);

    // 2단계: 문제 지문에 "그림" 이라는 단어가 포함되어 있는지 유연하게 검사 (예: "다음 그림과 같이", "그림과 같이", "그림에서" 등 모두 매칭)
    const cleanText = (parsedJson.problemText || '').replace(/\s+/g, '');
    if (cleanText.includes('그림')) {
      console.log('Detected figure reference ("그림") in problem text. Temporarily switching to gemini-3.5-flash for higher visual recognition accuracy.');
      try {
        // 일시적으로 gemini-3.5-flash 모델로 정밀 재분석 수행 후 덮어쓰기
        const parsedJson35: GeminiResponse = await callGeminiApi('gemini-3.5-flash', requestBody, apiKey);
        parsedJson = parsedJson35;
        resolvedModel = 'gemini-3.5-flash';
        console.log('Successfully re-analyzed using gemini-3.5-flash.');
      } catch (err35: any) {
        console.warn('Re-analysis with gemini-3.5-flash failed. Falling back to the initial gemini-2.5-flash result. Error:', err35.message || err35);
      }
    }

    // 단원명 보정 및 보정 로직 (Fuzzy Matching)
    const resolvedGrade = normalizeGrade(parsedJson.grade || '', studentGrade);
    console.log(`Gemini response - rawGrade: "${parsedJson.grade}", resolvedGrade: "${resolvedGrade}", rawChapter: "${parsedJson.chapter}"`);

    const allowedChapters = MATH_CURRICULUM[resolvedGrade] || ['기타'];
    let resolvedChapter = parsedJson.chapter || '기타';

    // 100% 매치되지 않는 경우, 공백 및 특수문자 제거 후 유니크 글자 겹침 비교 기반 매핑 (Fuzzy Match 오차 방지)
    if (!allowedChapters.includes(resolvedChapter)) {
      const cleanTarget = resolvedChapter.replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();
      
      let bestMatch = '';
      let highestScore = -1;

      allowedChapters.forEach(ch => {
        const cleanCh = ch.replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();
        
        // 1. 완전 부분 집합 매치
        if (cleanCh.includes(cleanTarget) || cleanTarget.includes(cleanCh)) {
          const score = 1000 + Math.max(cleanCh.length, cleanTarget.length);
          if (score > highestScore) {
            highestScore = score;
            bestMatch = ch;
          }
          return;
        }

        // 2. 글자 셋 중복 빈도 매치 (글자당 1점)
        const setCh = new Set(cleanCh.split(''));
        const setTarget = new Set(cleanTarget.split(''));
        let commonCount = 0;
        setTarget.forEach(char => {
          if (setCh.has(char)) {
            commonCount++;
          }
        });

        if (commonCount > highestScore && commonCount > 0) {
          highestScore = commonCount;
          bestMatch = ch;
        }
      });

      if (bestMatch && highestScore > 0) {
        resolvedChapter = bestMatch;
      } else {
        resolvedChapter = allowedChapters[0] || '기타'; // 매핑 실패 시 과목의 첫 번째 단원으로 기본 지정
      }
    }

    return {
      title: parsedJson.title || '분석 완료된 문제',
      grade: resolvedGrade,
      chapter: resolvedChapter,
      analysis: {
        solvingProcess: parsedJson.solvingProcess,
        mistakeSummary: parsedJson.mistakeSummary || undefined,
        hints: parsedJson.hints,
        problemText: parsedJson.problemText,
        problemBox: parsedJson.problemBox,
        matchedVideoId: parsedJson.matchedVideoId || undefined,
        matchedStartSeconds: parsedJson.matchedStartSeconds != null ? parsedJson.matchedStartSeconds : undefined,
        matchedChapterTitle: parsedJson.matchedChapterTitle || undefined,
        modelUsed: resolvedModel
      }
    };
  } catch (error: any) {
    console.error('Gemini API call failed:', error);
    throw new Error(error.message || 'Gemini API 호출 중 장애가 발생했습니다.');
  }
}