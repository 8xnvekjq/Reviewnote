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
 * 학생의 학년 정보와 AI가 분류한 과목/단원을 종합 검증하여,
 * 선행 학습 흐름을 존중하면서 꼬인 매핑을 역보정하는 프리미엄 통합 헬퍼 함수
 */
function normalizeGradeAndChapter(
  rawGrade: string,
  rawChapter: string,
  studentGrade?: string
): { grade: string; chapter: string } {
  const cleanGrade = (rawGrade || '').replace(/\s+/g, '').toLowerCase();
  const cleanChapter = (rawChapter || '').replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();

  // 1. 학생 학년 및 선행 탐색 우선순위 배열 구성
  // 학생 학년에서 시작해 한 학년씩 올려가며 우선 탐색할 수 있는 리스트
  let gradeSearchOrder = [
    '중3-1', '중3-2', '공통수학1', '공통수학2', '대수', '미적분Ⅰ', '미적분Ⅱ', '확률과 통계', '기하', '기타'
  ];

  if (studentGrade) {
    const cleanStudent = studentGrade.replace(/\s+/g, '').toLowerCase();
    if (cleanStudent.includes('중3')) {
      gradeSearchOrder = [
        '중3-1', '중3-2', '공통수학1', '공통수학2', '대수', '미적분Ⅰ', '미적분Ⅱ', '확률과 통계', '기하', '기타'
      ];
    } else if (cleanStudent.includes('고1')) {
      gradeSearchOrder = [
        '공통수학1', '공통수학2', '대수', '미적분Ⅰ', '미적분Ⅱ', '확률과 통계', '기하', '중3-1', '중3-2', '기타'
      ];
    } else if (cleanStudent.includes('고2')) {
      gradeSearchOrder = [
        '대수', '미적분Ⅰ', '확률과 통계', '기하', '미적분Ⅱ', '공통수학1', '공통수학2', '중3-1', '중3-2', '기타'
      ];
    } else if (cleanStudent.includes('고3')) {
      gradeSearchOrder = [
        '대수', '미적분Ⅰ', '미적분Ⅱ', '확률과 통계', '기하', '공통수학1', '공통수학2', '중3-1', '중3-2', '기타'
      ];
    }
  }

  // 2. 단원명(rawChapter) 매칭 우선 탐색
  // AI가 보낸 단원이 100% 매칭되거나 퍼지 매칭에 걸리는 진짜 교과를 찾음
  if (cleanChapter && cleanChapter !== '기타') {
    let bestGrade = '';
    let bestChapter = '';
    let highestScore = -1;

    // 우선순위가 높은 과목부터 순회
    for (const gradeKey of gradeSearchOrder) {
      const allowedChapters = MATH_CURRICULUM[gradeKey] || [];
      
      for (const ch of allowedChapters) {
        const cleanCh = ch.replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();

        // 2-1. 단원이 토씨 하나 틀리지 않고 100% 일치할 때
        if (cleanCh === cleanChapter) {
          return { grade: gradeKey, chapter: ch };
        }

        // 2-2. 부분 일치 매칭 (예: "이차방정식의 풀이" -> "이차방정식" / "정적분" -> "적분")
        if (cleanCh.includes(cleanChapter) || cleanChapter.includes(cleanCh)) {
          const score = 1000 + Math.max(cleanCh.length, cleanChapter.length);
          if (score > highestScore) {
            highestScore = score;
            bestGrade = gradeKey;
            bestChapter = ch;
          }
        }

        // 2-3. 자카드 유사도 매칭 (글자 겹침 수준 검사)
        const setCh = new Set(cleanCh.split(''));
        const setTarget = new Set(cleanChapter.split(''));
        let commonCount = 0;
        setTarget.forEach(char => {
          if (setCh.has(char)) commonCount++;
        });

        if (commonCount > highestScore && commonCount > 1) { // 최소 2글자 이상 일치 조건
          highestScore = commonCount;
          bestGrade = gradeKey;
          bestChapter = ch;
        }
      }

      // 만약 우선순위 높은 과목에서 매우 높은 확률(1000점 이상 부분일치)의 매칭을 찾았다면 루프를 일찍 조기 종료
      if (highestScore >= 1000) {
        break;
      }
    }

    if (bestGrade && bestChapter) {
      return { grade: bestGrade, chapter: bestChapter };
    }
  }

  // 3. 단원 매핑에 실패한 경우, 과목명(rawGrade)을 기반으로 매핑 복원 시도
  let resolvedGrade = '기타';
  const keys = Object.keys(MATH_CURRICULUM);
  
  // 3-1. 과목명 직접 일치 검사
  const match = keys.find(k => k.toLowerCase() === cleanGrade);
  if (match) {
    resolvedGrade = match;
  } else {
    // 3-2. 과목명 대표 키워드 포함 검사
    if (cleanGrade.includes('중3-1') || (cleanGrade.includes('중3') && cleanGrade.includes('1'))) resolvedGrade = '중3-1';
    else if (cleanGrade.includes('중3-2') || (cleanGrade.includes('중3') && cleanGrade.includes('2'))) resolvedGrade = '중3-2';
    else if (cleanGrade.includes('공통수학1') || cleanGrade.includes('공통수학(상)') || cleanGrade.includes('수학(상)')) resolvedGrade = '공통수학1';
    else if (cleanGrade.includes('공통수학2') || cleanGrade.includes('공통수학(하)') || cleanGrade.includes('수학(하)')) resolvedGrade = '공통수학2';
    else if (cleanGrade === '대수' || cleanGrade === '수학1' || cleanGrade === '수학i') resolvedGrade = '대수'; // 대수 완전 일치 우선
    else if (cleanGrade.includes('미적분1') || cleanGrade.includes('미적분i') || cleanGrade.includes('수학2') || cleanGrade.includes('수학ii')) resolvedGrade = '미적분Ⅰ';
    else if (cleanGrade.includes('미적분2') || cleanGrade.includes('미적분ii')) resolvedGrade = '미적분Ⅱ';
    else if (cleanGrade.includes('확률') || cleanGrade.includes('통계') || cleanGrade.includes('확통')) resolvedGrade = '확률과 통계';
    else if (cleanGrade.includes('기하')) resolvedGrade = '기하';
    else if (cleanGrade === '중3') resolvedGrade = '중3-1';
    else if (cleanGrade === '고1') resolvedGrade = '공통수학1';
    else if (studentGrade) {
      // 3-3. 최후의 폴백: 학생의 학년 기준 대입
      const cleanStudent = studentGrade.replace(/\s+/g, '').toLowerCase();
      if (cleanStudent.includes('중3')) resolvedGrade = '중3-1';
      else if (cleanStudent.includes('고1')) resolvedGrade = '공통수학1';
      else if (cleanStudent.includes('고2') || cleanStudent.includes('고3')) resolvedGrade = '대수';
    }
  }

  // 매핑 실패 시 과목만이라도 건졌다면, 해당 과목의 단원 목록 중 첫 번째 단원으로 덮어쓰지 않고 "기타" 단원으로 안전 배정
  return { grade: resolvedGrade, chapter: '기타' };
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
3. [학생 학년에 따른 수학 기호 노출 절대 통제 지침]:
   - 학생 학년이 **"중3"**인 경우: 시그마($\sum$, \sum), 로그($\log$), 극한($\lim$), 미적분 기호($\int$, dx) 등 고등 선행 수학 기호를 풀이와 힌트에서 **일절 사용하지 마십시오.** 수열이나 항들의 합은 시그마 기호 대신 반드시 덧셈의 원시적 나열식(예: $a_1 + a_2 + a_3 + \dots$)으로 대체하여 풀어 쓰십시오.
   - 학생 학년이 **"고1"**인 경우: 시그마($\sum$), 극한($\lim$), 미적분($\int$) 등 고2 과정 이상의 수학 전용 특수 기호를 풀이에 노출하지 마십시오.
4. 모든 수식은 반드시 LaTeX($...$ 또는 $$...$$)로 작성하고, 문장 끝과 단독 수식 앞뒤에는 반드시 빈줄(\\n\\n)을 2개 이상 추가해 널찍하게 줄바꿈해 주십시오. 모든 텍스트 해설은 100% 한국어로만 작성해야 합니다.

★ [보고서 포맷 형식 (solvingProcess 필드)] ★
반드시 아래 4개의 마크다운 헤더(###)를 순서대로 단독 라인에 배치하여 하나의 통합 텍스트로 작성하십시오.

### 1단계: 문제 이해하기
- 미지수와 주어진 조건을 짚어줍니다.

### 2단계: 해결 계획 세우기
- 실전 꿀팁이나 연관 공식을 적용할 계획을 세웁니다.

### 3단계: 계획 실행하기
- 교과정 내의 LaTeX 수식을 들여쓰기하여 차근차근 전개해 계산합니다.

### 4단계: 돌아보기 & 쌤의 한끝 팁
- 구한 답을 가볍게 검토하고 함정을 짚어줍니다.
- 단락 맨 마지막 줄에 실수를 방지할 한 줄짜리 짧은 개념 처방을 **[처방 요약]** 이라는 말머리를 붙여 단 한 줄로만 간결하게 적어주십시오.

★ [선생님 추천 강의 매칭 규칙] ★
제공된 [선생님 강의 및 챕터 인덱스 목록]에서 과목(grade) 및 단원(chapter)이 가장 일치하는 단 하나의 비디오 ID와 챕터명, 시작시간(초)을 골라 matchedVideoId, matchedStartSeconds, matchedChapterTitle에 기입하고, 일치하는 게 없으면 모두 null 처리하십시오.

[선생님 강의 및 챕터 인덱스 목록]
${syllabusText || '등록된 강의가 없습니다.'}

[반환할 JSON 구조 of 각 필드 정의]
- ★ [초중요 - 자가 규제 순서 준수] ★: 생성 시 반드시 grade와 chapter를 가장 첫 번째로 판단하고 뱉어내십시오. 당신이 스스로 뱉은 이 과목/단원 락(Lock)에 완벽히 얽매인 상태에서만 그 뒷단 필드들(solvingProcess 등)을 순차적으로 서술해야 합니다.
1. grade: 과목명 (중3-1, 중3-2, 공통수학1, 공통수학2, 대수, 미적분Ⅰ, 미적분Ⅱ, 확률과 통계, 기하, 기타 중 택1)
2. chapter: 선택한 과목에 허용된 단원명 중 정확히 선택 (예: 미적분Ⅰ이면 '미분', '적분', '함수의 극한과 연속' 중 택1)
3. title: 문제의 주제나 공식을 담은 짤막하고 직관적인 제목 (한국어)
4. solvingProcess: 위의 4개 헤더가 모두 포함된 해설 리포트 텍스트 (한국어)
5. hints: 3단계 복습 시 점진적으로 공개되는 3개의 원소를 가진 힌트 배열 (hints[0]: 발상, hints[1]: 중간공식, hints[2]: 최종실마리)
6. problemText: 이미지에서 추출한 원본 문제 지문 (LaTeX 변환 필수)
7. problemBox: 인쇄 문제 영역 바운딩 박스 (top, bottom, left, right 마진 백분율 0~100)
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
          grade: { type: 'STRING' },
          chapter: { type: 'STRING' },
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
          mistakeSummary: { type: 'STRING' },
          matchedVideoId: { type: 'STRING', nullable: true },
          matchedStartSeconds: { type: 'NUMBER', nullable: true },
          matchedChapterTitle: { type: 'STRING', nullable: true }
        },
        required: ['grade', 'chapter', 'title', 'solvingProcess', 'hints', 'problemText', 'problemBox', 'mistakeSummary']
      }
    }
  };

  try {
    const resolvedModel = 'gemini-3.5-flash';

    // 메인 모델인 gemini-3.5-flash 단독 1회 호출로 OCR 및 고정밀 수학 진단 실행
    const parsedJson: GeminiResponse = await callGeminiApi(resolvedModel, requestBody, apiKey);

    // 단원명 보정 및 보정 로직 (통합 Fuzzy Matching 및 선행 확장 보정)
    const { grade: resolvedGrade, chapter: resolvedChapter } = normalizeGradeAndChapter(
      parsedJson.grade || '',
      parsedJson.chapter || '',
      studentGrade
    );
    console.log(`Gemini response - rawGrade: "${parsedJson.grade}", resolvedGrade: "${resolvedGrade}", rawChapter: "${parsedJson.chapter}", resolvedChapter: "${resolvedChapter}"`);

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