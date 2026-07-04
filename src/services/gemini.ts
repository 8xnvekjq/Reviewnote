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
}

/**
 * Parses a base64 Data URL to extract its MIME type and raw base64 data string.
 */
const parseBase64Image = (dataUrl: string): { mimeType: string; base64Data: string } => {
  const matches = dataUrl.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
  if (!matches || matches.length < 3) {
    throw new Error('올바르지 않은 이미지 형식입니다.');
  }

  return {
    mimeType: matches[1],
    base64Data: matches[2]
  };
};

/**
 * Downloads a public image URL and converts it into a base64 string for Gemini API.
 */
const imageUrlToBase64 = async (url: string): Promise<{ mimeType: string; base64Data: string }> => {
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
};

/**
 * Calls Gemini API to analyze the math problem image and returns structured feedback.
 */
export const analyzeMistakeWithGemini = async (
  imageUrl: string,
  apiKey: string
): Promise<{ title: string; analysis: MistakeAnalysis; grade: string; chapter: string }> => {
  const { mimeType, base64Data } = await imageUrlToBase64(imageUrl);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const prompt = `수학 문제 사진입니다. 이 사진 속 문제를 분석하고 올바른 풀이법과 메타데이터를 진단해 주세요.
모든 수학적 수식, 방정식, 기호, 변수 및 계산 표현은 가독성을 극대화하기 위해 반드시 LaTeX 문법으로 작성하고 수학 구분 기호로 감싸야 합니다.
- 문장 내부의 인라인 수식은 $...$로 감싸주세요 (예: $\\angle BAC = \\angle CAD$, $\\overline{AC} = 3\\sqrt{5}$).
- 줄바꿈이 필요한 단독 블록 수식은 $$...$$로 감싸주세요.

★ [가장 중요 - 줄바꿈 및 소제목 규칙] ★
- 모든 소제목은 반드시 독립된 단독 라인에 '### 소제목 제목' 형태로 작성해 주십시오.
- 각 소제목 앞뒤로는 반드시 줄바꿈 기호(\n\n)를 두 번 배치하여 단락을 완전히 분리해 주십시오.

1. solvingProcess: 문제의 정석적인 올바른 단계별 풀이 과정.
   - 각 소문제 단위로 '### (1) ...' 형태로 단락을 나누고, 핵심 개념 적용 단계마다 '### 개념명' 소제목을 단독 라인에 분리하여 작성해 주십시오.
   - 각 소제목 아래의 설명이나 수식은 글머리 기호('- ') 또는 번호 목록('1. ')을 사용해 깔끔히 줄바꿈을 적용해 주십시오.

2. hints: 단계별로 문제를 풀어나갈 수 있는 구체적인 힌트 목록.
   - 반드시 정확히 3개의 문자열 원소를 가진 JSON 배열이어야 합니다.
   - 1단계: 최초 접근법/발상, 2단계: 중간 연결 공식, 3단계: 마지막 핵심 실마리.
   - 각 단계의 힌트는 수학적 식을 포함하여 1~2문장 내외로 짤막하고 명확하게 작성하십시오.

3. problemText: 사진 속 문제 이미지에 나타난 원본 문제 지문 전체.
   - 수학적 기호, 수식, 변수 등은 완벽하게 LaTeX 문법으로 변환해서 텍스트를 작성해 주십시오.
   - 보기 선택지가 있다면 해당 문항 구성 지문도 빠짐없이 텍스트로 복원하여 작성해 주십시오.

4. problemBox: 학생 필기를 제외한 인쇄된 문제 본문 영역을 타이트하게 감싸는 바운딩 박스를 상하좌우 마진 백분율(0~100)로 응답해 주십시오.
   - 학생 필기가 여백에 있다면 필기 부분이 잘려나가도록 마진을 충분히 크게 설정하십시오.

5. grade: 아래 과목 목록 중 이 문제가 속하는 과목명을 정확히 하나만 선택하여 입력하세요.
   - 선택 가능한 과목: 중3-1, 중3-2, 공통수학1, 공통수학2, 대수, 미적분, 확률과 통계, 미적분2, 기타
   - 과목별 단원 기준:
     * 중3-1: 실수와 그 계산 / 다항식의 곱셈과 인수분해 / 이차방정식 / 이차함수와 그 그래프
     * 중3-2: 삼각비 / 원의 성질 / 통계
     * 공통수학1: 다항식 / 방정식과 부등식 / 경우의 수 / 행렬
     * 공통수학2: 도형의 방정식 / 집합과 명제 / 함수와 그래프
     * 대수: 지수함수와 로그함수 / 삼각함수 / 수열
     * 미적분: 함수의 극한과 연속 / 다항함수의 미분법 / 다항함수의 적분법
     * 확률과 통계: 순열과 조합 / 확률 / 통계
     * 미적분2: 수열의 극한 / 미분법 / 적분법

6. chapter: grade에서 선택한 과목의 단원 목록 중 이 문제가 속하는 단원명을 아래 제공된 단원명 목록에서만 토씨 하나 틀리지 않게 정확히 골라 출력해야 합니다. 임의의 텍스트를 생성하지 마십시오.

7. mistakeSummary: 사진 속 학생이 직접 작성한 필기나 풀이 과정을 분석하여, 핵심적으로 어디서 어떻게 틀렸는지 30자 이내의 한 문장으로 날카롭게 요약하세요.
   - 반드시 구체적인 수학적 원인을 포함해야 합니다 (예: "부호 실수", "공식 오적용", "인수분해 오류" 등)
   - 좋은 예: "이차방정식 판별식에서 b²-4ac의 부호를 반대로 계산함"
   - 좋은 예: "삼각함수 덧셈 공식에서 cos항의 부호를 누락함"
   - 학생 필기가 전혀 없는 경우에만: "학생 풀이 없음"

출력은 지정된 JSON 스키마를 엄격히 따라 다음 8가지 항목을 모두 한국어로 작성해야 합니다:
1. title: 문제의 주제나 공식을 담은 짤막하고 직관적인 제목
2. solvingProcess: 위의 지시사항을 따른 올바른 풀이 과정
3. hints: 위의 지시사항을 따른 단계별 힌트 목록 (정확히 3개)
4. problemText: 위의 지시사항을 따른 추출된 원본 문제 지문
5. problemBox: 위의 지시사항을 따른 필기 제외 인쇄 문제 영역 바운딩 박스
6. grade: 과목명
7. chapter: 단원명
8. mistakeSummary: 학생 풀이 기반 틀린 이유 1줄 요약 (30자 이내)`;

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
          mistakeSummary: { type: 'STRING' }
        },
        required: ['title', 'solvingProcess', 'hints', 'problemText', 'problemBox', 'grade', 'chapter', 'mistakeSummary']
      }
    }
  };

  try {
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
      throw new Error(`Gemini API 오류: ${errorMessage}`);
    }

    const result = await response.json();
    const responseText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      throw new Error('Gemini API로부터 올바른 응답 텍스트를 받지 못했습니다.');
    }

    const parsedJson: GeminiResponse = JSON.parse(responseText);

    // ★ 단원명 보정 및 보정 로직 (Fuzzy Matching)
    let resolvedGrade = parsedJson.grade || '기타';
    if (!MATH_CURRICULUM[resolvedGrade]) {
      resolvedGrade = '기타';
    }

    const allowedChapters = MATH_CURRICULUM[resolvedGrade] || ['기타'];
    let resolvedChapter = parsedJson.chapter || '기타';

    // 100% 매치되지 않는 경우, 공백 제거 후 유사성 검사로 매핑
    if (!allowedChapters.includes(resolvedChapter)) {
      const cleanTarget = resolvedChapter.replace(/\s+/g, '');
      const matched = allowedChapters.find(ch => {
        const cleanCh = ch.replace(/\s+/g, '');
        return cleanCh.includes(cleanTarget) || cleanTarget.includes(cleanCh);
      });
      if (matched) {
        resolvedChapter = matched;
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
        problemBox: parsedJson.problemBox
      }
    };
  } catch (error: any) {
    console.error('Gemini API call failed:', error);
    throw new Error(error.message || 'Gemini API 호출 중 장애가 발생했습니다.');
  }
};
