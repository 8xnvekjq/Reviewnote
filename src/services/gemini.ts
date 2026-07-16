import type { ProblemBox } from '../types';
import { MATH_CURRICULUM } from '../types';

/**
 * 브라우저 Canvas를 이용하여 이미지를 최대 가로/세로 1200px 크기로 축소하고,
 * JPEG 0.82 화질로 압축하여 base64 문자열을 리턴하는 헬퍼 함수.
 */
async function resizeAndCompressImage(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // CORS 에러 예방
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl); // 캔버스 미지원 시 원본 리턴
        return;
      }

      const MAX_WIDTH = 1200;
      const MAX_HEIGHT = 1200;
      let width = img.width;
      let height = img.height;

      // 종횡비 유지 리사이징 계산
      if (width > height) {
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width = Math.round((width * MAX_HEIGHT) / height);
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      // JPEG 포맷으로 화질 0.82로 압축하여 용량 대폭 절감
      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
      resolve(compressedDataUrl);
    };
    img.onerror = () => {
      reject(new Error('이미지 로딩 중 오류 발생'));
    };
    img.src = dataUrl;
  });
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
  let targetUrl = url;

  if (!url.startsWith('data:')) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('CDN 이미지 다운로드 실패');
      
      const blob = await response.blob();
      targetUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err: any) {
      console.error('Error fetching image CDN:', err);
      throw new Error(`이미지 다운로드 실패: ${err.message}`);
    }
  }

  try {
    // Canvas를 통한 고속 이미지 압축 및 리사이징 적용 (Input 토큰 요금 절감)
    const compressedDataUrl = await resizeAndCompressImage(targetUrl);
    return parseBase64Image(compressedDataUrl);
  } catch (err: any) {
    console.error('Error compressing image:', err);
    // 압축 에러 시 원본 parse 시도 (Fallback)
    return parseBase64Image(targetUrl);
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

  // 1. AI가 식별한 rawGrade를 공식 과목명으로 정밀 복원 시도 (과목 카테고리 락)
  let lockedGrade = '';
  const keys = Object.keys(MATH_CURRICULUM);
  const match = keys.find(k => k.replace(/\s+/g, '').toLowerCase() === cleanGrade);
  
  if (match) {
    lockedGrade = match;
  } else {
    // 과목명 대표 키워드 포함 검사
    if (cleanGrade.includes('중3-1') || (cleanGrade.includes('중3') && cleanGrade.includes('1'))) lockedGrade = '중3-1';
    else if (cleanGrade.includes('중3-2') || (cleanGrade.includes('중3') && cleanGrade.includes('2'))) lockedGrade = '중3-2';
    else if (cleanGrade.includes('공통수학1') || cleanGrade.includes('공통수학(상)') || cleanGrade.includes('수학(상)')) lockedGrade = '공통수학1';
    else if (cleanGrade.includes('공통수학2') || cleanGrade.includes('공통수학(하)') || cleanGrade.includes('수학(하)')) lockedGrade = '공통수학2';
    else if (cleanGrade === '대수' || cleanGrade === '수학1' || cleanGrade === '수학i') lockedGrade = '대수';
    else if (cleanGrade.includes('미적분1') || cleanGrade.includes('미적분i') || cleanGrade.includes('수학2') || cleanGrade.includes('수학ii')) lockedGrade = '미적분Ⅰ';
    else if (cleanGrade.includes('미적분2') || cleanGrade.includes('미적분ii')) lockedGrade = '미적분Ⅱ';
    else if (cleanGrade.includes('확률') || cleanGrade.includes('통계') || cleanGrade.includes('확통')) lockedGrade = '확률과 통계';
    else if (cleanGrade.includes('기하')) lockedGrade = '기하';
    else if (cleanGrade === '중3') lockedGrade = '중3-1';
    else if (cleanGrade === '고1') lockedGrade = '공통수학1';
    else if (studentGrade) {
      // 최후의 폴백: 학생의 학년 기준 대입
      const cleanStudent = studentGrade.replace(/\s+/g, '').toLowerCase();
      if (cleanStudent.includes('중3')) lockedGrade = '중3-1';
      else if (cleanStudent.includes('고1')) lockedGrade = '공통수학1';
      else if (cleanStudent.includes('고2') || cleanStudent.includes('고3')) lockedGrade = '대수';
    } else {
      lockedGrade = '기타';
    }
  }

  // 2. 탐색 과목 순서(gradeSearchOrder) 정의
  // 과목 락(lockedGrade)이 존재한다면, 타 과목으로 단원 매핑이 탈출(가로채기)하는 것을 방지하기 위해 오직 해당 과목만 탐색하도록 제한합니다.
  let gradeSearchOrder: string[] = [];
  if (lockedGrade && lockedGrade !== '기타') {
    gradeSearchOrder = [lockedGrade];
  } else {
    // 과목 락이 없을 때만 학생 학년 기반 우선순위 탐색 작동 (일반적이지 않음 - AI 판별이 최우선)
    gradeSearchOrder = [
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
  }

  // 3. 단원명(rawChapter) 매칭 탐색
  // AI가 보낸 단원이 100% 매칭되거나 퍼지 매칭에 걸리는 진짜 교과를 찾음
  if (cleanChapter && cleanChapter !== '기타') {
    let bestGrade = '';
    let bestChapter = '';
    let highestScore = -1;

    for (const gradeKey of gradeSearchOrder) {
      const allowedChapters = MATH_CURRICULUM[gradeKey] || [];
      
      for (const ch of allowedChapters) {
        const cleanCh = ch.replace(/[^a-zA-Z0-9가-힣]/g, '').toLowerCase();

        // 3-1. 단원이 토씨 하나 틀리지 않고 100% 일치할 때
        if (cleanCh === cleanChapter) {
          return { grade: gradeKey, chapter: ch };
        }

        // 3-2. 부분 일치 매칭 (예: "이차방정식의 풀이" -> "이차방정식" / "정적분" -> "적분")
        if (cleanCh.includes(cleanChapter) || cleanChapter.includes(cleanCh)) {
          const score = 1000 + Math.max(cleanCh.length, cleanChapter.length);
          if (score > highestScore) {
            highestScore = score;
            bestGrade = gradeKey;
            bestChapter = ch;
          }
        }

        // 3-3. 자카드 유사도 매칭 (글자 겹침 수준 검사)
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

  // 매핑 실패 시 과목만이라도 건졌다면, 해당 과목의 단원 목록 중 첫 번째 단원으로 덮어쓰지 않고 "기타" 단원으로 안전 배정
  return { grade: lockedGrade || '기타', chapter: '기타' };
}

/**
 * Helper to escape LaTeX backslashes inside the raw JSON response text.
 * Prevents double-JSON parsing from stripping backslashes (e.g. converting \times to [tab]imes, \text to [tab]ext).
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

  return JSON.parse(responseText);
}

/**
 * 1차 API 호출: 이미지 분석을 통해 과목/단원을 분류하고 유튜브 개념 강의를 실시간 매칭
 */
export async function classifyMistakeWithGemini(
  imageUrl: string,
  apiKey: string,
  youtubeLectures: any[] = [],
  studentGrade?: string
): Promise<{
  title: string;
  grade: string;
  chapter: string;
  matchedVideoId?: string;
  matchedStartSeconds?: number;
  matchedChapterTitle?: string;
}> {
  const { mimeType, base64Data } = await imageUrlToBase64(imageUrl);

  // 우리 DB의 강의 목록을 AI용 텍스트 인덱스로 정밀 가공
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
- AI는 이미지 속 문제를 분석하기 전, **이 학생의 현재 학년 정보를 뼈대로 삼되, 실제 문제의 교과서 수준에 맞추어 유연하고 정확하게 과목을 식별하고 분류**하십시오.
- 만약 특정 개념(예: 인수분해, 이차방정식, 이차함수 등)이 중등 과정과 고등 과정에 모두 걸쳐 있고 중등 범위 내의 기법으로 충분히 풀 수 있는 평이한 수준이라면, 다른 조건보다 학생의 학년인 **"${studentGrade}"** 에 맞추어 하위 교과 과정(예: "중3-1" 과목의 "이차함수")으로 우선 판별하십시오.
- **[선행학습(Advanced Placement) 고려 지침]**: 학생의 학년이 "중3"이더라도, 문제 내용에 고등 과정 전용 개념(예: 허수단위 $i$, 나머지정리, 판별식 $D < 0$인 허근, 행렬, 조립제법 등)이 명시적으로 포함되어 있어 고등 교과 과정으로 해석하고 풀어야만 하는 문제라면, 학생 학년에 국한되지 말고 실제 문제 수준에 맞는 고등 과목(예: "공통수학1", "공통수학2")으로 정확하게 분류해 주십시오.
- **[복습/기초학습(Review/Remedial) 고려 지침]**: 반대로, 학생의 현재 학년이 높더라도(예: "고1", "고2" 이상), 복습 및 기초 다지기를 위해 이전 학년의 문제(예: "중3-1"의 이차함수, "중3-2"의 삼각비 등)를 풀이할 수 있습니다. 문제의 소재나 표현이 명백히 하위 학년 수준에 해당한다면, 현재 학년에 억지로 매핑하지 말고 실제 문제 수준에 맞는 하위 학년 과목(예: "중3-1", "중3-2")으로 정확하게 분류하십시오.
- **[Curriculum Locking]**: 풀이 과정과 힌트를 구성할 때, 식별된 대상 과목 및 학년 범위에서 '아직 배우지 않은 개념이나 선행 공식'을 끌고 와서 해설하는 것을 절대적으로 금지합니다. 오직 해당 학년 교과서 내의 기법만 사용하십시오.\n`
    : '';

  const prompt = `너는 더쿠키수학 오답클리닉의 문제 분류 담당 인공지능 비서 **'밤티'**이다.
주어진 수학 문제 이미지를 보고 과목과 단원을 식별하고, 가장 어울리는 유튜브 개념 강의 딥링크를 추천하여라.
${studentInfoPrompt}

★ [단일 대단원/소단원 분리 판정 지침 - 절대 묶음 분류 금지] ★
- 단원(chapter)을 분류할 때 '이차방정식과 이차함수', '인수분해와 방정식' 처럼 여러 단원명을 문장이나 '와/과'로 묶어 복수로 제출하는 것을 엄격히 금지합니다.
- 문제의 핵심이 그래프 기하(y절편, 꼭짓점, 최댓값/최솟값, 그래프 평행이동 등)라면 무조건 **"이차함수와 그래프"** 단원 하나로만 분류하십시오.
- 문제의 핵심이 등식의 풀이(해 구하기, 근의 공식, 근과 계수의 관계, 판별식 등)라면 무조건 **"이차방정식"** 단원 하나로만 분류하십시오.
- 절대로 단원들을 하이브리드로 혼합하여 묶어 적지 말고, 단 하나의 고유 단원명으로만 명확하게 규정하여 리턴하십시오.

★ [공식 과목별 허용 단원 리스트 - 이 중에서만 정확하게 철자 하나 안 틀리게 골라서 chapter 필드에 리턴할 것] ★
- 중3-1: 제곱근과 실수, 근호를 포함한 식의 계산, 다항식의 곱셈과 인수분해, 이차방정식, 이차함수와 그래프
- 중3-2: 삼각비, 원과 직선, 원주각, 통계(대푯값과 산포도)
- 공통수학1: 다항식의 연산, 나머지정리와 인수분해, 복소수, 이차방정식, 이차방정식과 이차함수, 여러 가지 방정식, 여러 가지 부등식, 경우의 수, 순열과 조합, 행렬과 그 연산
- 공통수학2: 평면좌표, 직선의 방정식, 원의 방정식, 도형의 이동, 집합, 명제, 함수, 유리함수, 무리함수
- 대수: 지수와 로그, 지수함수와 로그함수, 삼각함수의 뜻과 그래프 (삼각방정식/부등식 포함), 삼각함수의 활용 (사인법칙, 코사인법칙 등), 등차수열과 등비수열, 수열의 합과 수학적 귀납법 (시그마 연산 및 귀납적 정의)
- 미적분Ⅰ: 함수의 극한, 함수의 연속, 미분계수와 도함수, 접선의 방정식과 평균값 정리, 극대·극소와 그래프, 방정식·부등식과 미분, 부정적분과 정적분, 정적분의 활용
- 미적분Ⅱ: 수열의 극한, 급수, 지수함수와 로그함수의 미분, 삼각함수의 미분, 여러 가지 미분법, 초월함수의 도함수 활용, 여러 가지 적분법, 초월함수 정적분의 활용
- 확률과 통계: 여러 가지 순열과 조합, 이항정리, 확률의 뜻과 성질, 조건부확률, 확률분포, 통계적 추정
- 기하: 이차곡선, 평면벡터의 연산과 성분, 평면벡터의 내적, 공간도형과 공간좌표
- 기타: 기타

★ [선생님 추천 강의 매칭 규칙] ★
제공된 [선생님 강의 및 챕터 인덱스 목록]에서 과목(grade) 및 단원(chapter)이 가장 일치하는 단 하나의 비디오 ID와 챕터명, 시작시간(초)을 골라 matchedVideoId, matchedStartSeconds, matchedChapterTitle에 기입하고, 일치하는 게 없으면 모두 null 처리하십시오.

[선생님 강의 및 챕터 인덱스 목록]
${syllabusText || '등록된 강의가 없습니다.'}

[반환할 JSON 구조 정의]
1. grade: 과목명 (중3-1, 중3-2, 공통수학1, 공통수학2, 대수, 미적분Ⅰ, 미적분Ⅱ, 확률과 통계, 기하, 기타 중 택1)
2. chapter: 위 [공식 과목별 허용 단원 리스트]에서 해당하는 단원명 중 철자 그대로 선택 (예: 대수 과목이면 '지수와 로그', '등차수열과 등비수열' 등 중 택1)
3. title: 문제의 주제나 공식을 담은 짤막하고 직관적인 제목 (한국어)
4. matchedVideoId / matchedStartSeconds / matchedChapterTitle: 매칭된 동영상 정보 (없으면 null)`;

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
          grade: { 
            type: 'STRING',
            enum: ['중3-1', '중3-2', '공통수학1', '공통수학2', '대수', '미적분Ⅰ', '미적분Ⅱ', '확률과 통계', '기하', '기타']
          },
          chapter: { type: 'STRING' },
          title: { type: 'STRING' },
          matchedVideoId: { type: 'STRING', nullable: true },
          matchedStartSeconds: { type: 'NUMBER', nullable: true },
          matchedChapterTitle: { type: 'STRING', nullable: true }
        },
        required: ['grade', 'chapter', 'title']
      }
    }
  };

  try {
    const resolvedModel = 'gemini-2.5-flash';
    const parsedJson = await callGeminiApi(resolvedModel, requestBody, apiKey);

    // 단원명 보정 및 보정 로직 (통합 Fuzzy Matching 및 선행 확장 보정)
    const { grade: resolvedGrade, chapter: resolvedChapter } = normalizeGradeAndChapter(
      parsedJson.grade || '',
      parsedJson.chapter || '',
      studentGrade
    );

    return {
      title: parsedJson.title || '분석 완료된 문제',
      grade: resolvedGrade,
      chapter: resolvedChapter,
      matchedVideoId: parsedJson.matchedVideoId || undefined,
      matchedStartSeconds: parsedJson.matchedStartSeconds != null ? parsedJson.matchedStartSeconds : undefined,
      matchedChapterTitle: parsedJson.matchedChapterTitle || undefined
    };
  } catch (error: any) {
    console.error('Gemini classification failed:', error);
    throw new Error(error.message || 'Gemini API 호출 중 장애가 발생했습니다.');
  }
}

/**
 * 2차 API 호출: 확정된 과목/단원을 엄격한 가이드로 삼아 해설 및 힌트 정밀 생성
 */
export async function solveMistakeWithGemini(
  imageUrl: string,
  apiKey: string,
  resolvedGrade: string,
  resolvedChapter: string,
  studentGrade?: string
): Promise<{
  solvingProcess: string;
  hints: string[];
  problemText: string;
  problemBox: ProblemBox;
  mistakeSummary: string;
}> {
  const { mimeType, base64Data } = await imageUrlToBase64(imageUrl);

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
- **[Curriculum Locking]**: 이 오답 문제의 확정된 과목은 **"${resolvedGrade}"** 이며, 단원은 **"${resolvedChapter}"** 입니다.
- 풀이 과정과 힌트를 구성할 때, 식별된 대상 과목 및 학년 범위에서 '아직 배우지 않은 개념이나 선행 공식'을 끌고 와서 해설하는 것을 절대적으로 금지합니다. 오직 해당 학년 교과서 내의 기법만 사용하십시오.\n`
    : '';

  const prompt = `너는 더쿠키수학 선생님을 보좌하여 학생들의 수학 오답을 과학적으로 분석하고 올바른 복습 처방을 제공하는 스마트한 AI 수학 클리닉 비서 **'밤티'**이다.
이 문제의 과목은 **"${resolvedGrade}"** 이며, 단원은 **"${resolvedChapter}"** 으로 확정되었습니다.
아래의 비서 페르소나와 포맷 규칙을 엄격히 준수하여 수학 문제 사진을 분석해 풀이 및 힌트 JSON 보고서를 작성하여라.
${studentInfoPrompt}

★ [AI 비서 밤티 가이드라인] ★
1. 절대 자신을 실제 선생님(더쿠키수학 쌤 등)과 동일시하지 마십시오. 당신은 수학 오답 분석을 보조하는 인공지능 비서 캐릭터 **'밤티'**입니다. 대화 톤은 학생에게 정중하고 다정한 존댓말(해요체)로 작성하되, 친근하고 귀여운 밤티 비서로서의 예의 바르고 객관적인 어조를 유지해야 합니다.
2. 대한민국 고교 교육과정을 벗어난 수식(예: 대학 수학, 편미분, 벡터 외적, 복잡한 정규분포 확률밀도함수 식 등)은 절대 배제하고 오직 고교 교과 공식(예: 표준화 $Z = \\\\frac{X-m}{\\\\sigma}$)만 쓰십시오.
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

[반환할 JSON 구조 정의]
1. solvingProcess: 위의 4개 헤더가 모두 포함된 해설 리포트 텍스트 (한국어)
2. hints: 3단계 복습 시 점진적으로 공개되는 3개의 원소를 가진 힌트 배열 (hints[0]: 발상, hints[1]: 중간공식, hints[2]: 최종실마리)
3. problemText: 이미지에서 추출한 원본 문제 지문 (LaTeX 변환 필수)
4. problemBox: 인쇄 문제 영역 바운딩 박스 (top, bottom, left, right 마진 백분율 0~100)
5. mistakeSummary: 학생 풀이 기반 틀린 이유를 30자 이내로 요약한 한 문장`;

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
          mistakeSummary: { type: 'STRING' }
        },
        required: ['solvingProcess', 'hints', 'problemText', 'problemBox', 'mistakeSummary']
      }
    }
  };

  try {
    const resolvedModel = 'gemini-2.5-flash';
    const parsedJson = await callGeminiApi(resolvedModel, requestBody, apiKey);

    return {
      solvingProcess: parsedJson.solvingProcess,
      hints: parsedJson.hints,
      problemText: parsedJson.problemText,
      problemBox: parsedJson.problemBox,
      mistakeSummary: parsedJson.mistakeSummary
    };
  } catch (error: any) {
    console.error('Gemini solving failed:', error);
    throw new Error(error.message || 'Gemini API 호출 중 장애가 발생했습니다.');
  }
}