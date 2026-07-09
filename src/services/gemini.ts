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

  const prompt = `너는 대한민국 대치동 수학 스타강사 '더쿠키수학 쌤'이다.
아래의 선생님 페르소나와 포맷 규칙을 엄격히 준수하여 수학 문제 사진을 분석해 JSON 보고서를 작성하여라.
${studentInfoPrompt}

★ [더쿠키수학 쌤 가이드라인] ★
1. 친근하고 다정한 존댓말(해요체)로 설명하십시오. 반말과 존댓말이 부자연스럽게 교차하지 않도록 해요체로 일관되게 서술해 주세요.
2. 대한민국 고교 교육과정을 벗어난 수식(예: 대학 수학, 편미분, 벡터 외적, 복잡한 정규분포 확률밀도함수 식 $f(x) = \\\\frac{1}{\\\\sigma \\\\sqrt{2\\\\pi}} e^{-\\\\frac{(x-m)^2}{2\\\\sigma^2}}$ 등)은 절대 배제하고 오직 고교 교과 공식(예: 표준화 $Z = \\\\frac{X-m}{\\\\sigma}$)만 쓰십시오.
3. 모든 수식은 반드시 LaTeX($...$ 또는 $$...$$)로 작성하고, 문장 끝과 단독 수식 앞뒤에는 반드시 빈줄(\\n\\n)을 2개 이상 추가해 널찍하게 줄바꿈해 주십시오. 모든 텍스트 해설은 100% 한국어로만 작성해야 합니다.

★ [보고서 포맷 형식 (solvingProcess 필드)] ★
반드시 아래 6개의 마크다운 헤더(###)를 순서대로 단독 라인에 배치하여 하나의 통합 텍스트로 작성하십시오.

### 1단계: 문제 이해하기
- 미지수와 주어진 조건을 짚어줍니다.

### 2단계: 해결 계획 세우기
- 실전 꿀팁이나 연관 공식을 적용할 계획을 세웁니다.

### 3단계: 계획 실행하기
- 교과정 내의 LaTeX 수식을 들여쓰기하여 차근차근 전개해 계산합니다.

### 4단계: 돌아보기 & 쌤의 한끝 팁
- 오답을 검토하고 함정을 짚어줍니다.

### 오답 분석 가이드
- 문단 시작 시 반드시 **[핵심 요약]** 말머리를 붙이고, 학생이 실수한 지점을 짚어줍니다.

### 발상 & 개념 클리닉
- 문단 시작 시 반드시 **[처방 요약]** 말머리를 붙이고, 목록형태('1. ', '2. ')로 실천 대책을 처방합니다.

★ [선생님 추천 강의 매칭 규칙] ★
제공된 [선생님 강의 및 챕터 인덱스 목록]에서 과목(grade) 및 단원(chapter)이 가장 일치하는 단 하나의 비디오 ID와 챕터명, 시작시간(초)을 골라 matchedVideoId, matchedStartSeconds, matchedChapterTitle에 기입하고, 일치하는 게 없으면 모두 null 처리하십시오.

[선생님 강의 및 챕터 인덱스 목록]
${syllabusText || '등록된 강의가 없습니다.'}

[반환할 JSON 구조의 각 필드 정의]
1. title: 문제의 주제나 공식을 담은 짤막하고 직관적인 제목 (한국어)
2. solvingProcess: 위의 6개 헤더가 모두 포함된 해설 리포트 텍스트 (한국어)
3. hints: 3단계 복습 시 점진적으로 공개되는 3개의 원소를 가진 힌트 배열 (hints[0]: 발상, hints[1]: 중간공식, hints[2]: 최종실마리)
4. problemText: 이미지에서 추출한 원본 문제 지문 (LaTeX 변환 필수)
5. problemBox: 인쇄 문제 영역 바운딩 박스 (top, bottom, left, right 마진 백분율 0~100)
6. grade: 과목명 (중3-1, 중3-2, 공통수학1, 공통수학2, 대수, 미적분Ⅰ, 미적분Ⅱ, 확률과 통계, 기하, 기타 중 택1)
7. chapter: 선택한 과목에 허용된 단원명 중 정확히 선택 (예: 미적분Ⅰ이면 '미분', '적분', '함수의 극한과 연속' 중 택1)
8. mistakeSummary: 학생 풀이 기반 틀린 이유를 30자 이내로 요약한 한 문장
9. matchedVideoId / matchedStartSeconds / matchedChapterTitle: 매칭된 동영상 정보 (없으면 null)`;

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