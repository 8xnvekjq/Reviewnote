import type { MistakeAnalysis, ProblemBox } from '../types';

interface GeminiResponse {
  title: string;
  solvingProcess: string;
  mistakeDetail: string;
  rootCause: string;
  actionPlan: string;
  hints: string[];
  problemText: string;
  problemBox: ProblemBox;
  grade: string;
  chapter: string;
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

  // Endpoint for Gemini 2.5 Flash
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const prompt = `수학 문제 사진입니다. 이 사진 속 문제를 분석하고 올바른 풀이법과 사용자가 실수하여 틀린 부분을 진단해 주세요.
모든 수학적 수식, 방정식, 기호, 변수 및 계산 표현은 가독성을 극대화하기 위해 반드시 LaTeX 문법으로 작성하고 수학 구분 기호로 감싸야 합니다.
- 문장 내부의 인라인 수식은 $...$로 감싸주세요 (예: $\\angle BAC = \\angle CAD$, $\\overline{AC} = 3\\sqrt{5}$).
- 줄바꿈이 필요한 단독 블록 수식은 $$...$$로 감싸주세요.

★ [가장 중요 - 줄바꿈 및 소제목 규칙] ★
- 모든 소제목은 반드시 독립된 단독 라인에 '### 소제목 제목' 형태로 작성해 주십시오.
- 각 소제목 앞뒤로는 반드시 줄바꿈 기호(\n\n)를 두 번 배치하여 단락을 완전히 분리해 주십시오.
- 오답 분석 및 대책 처방에 있는 각 리스트 항목들도 한 항목마다 반드시 줄바꿈 기호(\n\n)를 사용하여 엄격하게 단락을 쪼개어 가독성을 확보하십시오.

1. solvingProcess: 문제의 정석적인 올바른 단계별 풀이 과정.
   - 각 소문제 단위로 '### (1) ...' 형태로 단락을 나누고, 핵심 개념 적용 단계마다 '### 개념명' 소제목을 단독 라인에 분리하여 작성해 주십시오.
   - 각 소제목 아래의 설명이나 수식은 글머리 기호('- ') 또는 번호 목록('1. ')을 사용해 깔끔히 줄바꿈을 적용해 주십시오.

2. mistakeDetail: 사용자가 풀이 과정에서 실수한 구체적인 지점들에 대한 상세 분석 목록.
   - 반드시 첫 줄에 '### 오답 분석 가이드'라는 소제목 헤더를 단독 라인에 적고, 그 아래에 각 실수의 원인을 글머리 기호(예: '- **[실수 유형/개념 이름]**: 상세 설명...') 형식으로 줄바꿈(\n\n)을 주어가며 나열해 주세요.
   - 중요 단어는 **볼드체**로 강조해 주세요.

3. rootCause: 해당 실수가 일어난 근본적인 수학적 오개념이나 틀린 이유 분석.
   - 학생들이 무엇을 헷갈려했는지, 어떤 개념의 누수가 원인인지를 짚어 요약 기술해 주세요. 핵심 문구는 **볼드체**로 처리해 주세요.

4. actionPlan: 이 실수를 다시 반복하지 않기 위한 핵심 처방을 딱 한 문장으로 작성해 주세요.
   - 반드시 1~2줄 이내의 짧고 명확한 단일 문장으로만 작성하십시오. (긴 목록 형식 절대 금지)
   - 형식 예시: "원주각 성질로 같은 현의 길이를 먼저 파악한 후, 두 삼각형에 코사인법칙을 세워 연립하는 흐름을 반드시 익혀 두세요."

5. hints: 단계별로 문제를 풀어나갈 수 있는 구체적인 힌트 목록.
   - 반드시 정확히 3개의 문자열 원소를 가진 JSON 배열이어야 합니다.
   - 1단계: 최초 접근법/발상, 2단계: 중간 연결 공식, 3단계: 마지막 핵심 실마리.
   - 각 단계의 힌트는 수학적 식을 포함하여 1~2문장 내외로 짤막하고 명확하게 작성하십시오.

6. problemText: 사진 속 문제 이미지에 나타난 원본 문제 지문 전체.
   - 수학적 기호, 수식, 변수 등은 완벽하게 LaTeX 문법으로 변환해서 텍스트를 작성해 주십시오.
   - 보기 선택지가 있다면 해당 문항 구성 지문도 빠짐없이 텍스트로 복원하여 작성해 주십시오.

7. problemBox: 학생 필기를 제외한 인쇄된 문제 본문 영역을 타이트하게 감싸는 바운딩 박스를 상하좌우 마진 백분율(0~100)로 응답해 주십시오.
   - 학생 필기가 여백에 있다면 필기 부분이 잘려나가도록 마진을 충분히 크게 설정하십시오.

8. grade: 아래 과목 목록 중 이 문제가 속하는 과목명을 정확히 하나만 선택하여 입력하세요.
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

9. chapter: grade에서 선택한 과목의 단원 목록 중 이 문제가 속하는 단원명을 정확히 하나만 선택하여 입력하세요.

출력은 지정된 JSON 스키마를 엄격히 따라 다음 9가지 항목을 모두 한국어로 작성해야 합니다:
1. title: 문제의 주제나 공식을 담은 짤막하고 직관적인 제목
2. solvingProcess: 위의 지시사항을 따른 올바른 풀이 과정
3. mistakeDetail: 위의 지시사항을 따른 실수한 지점 분석
4. rootCause: 위의 지시사항을 따른 근본적인 틀린 이유
5. actionPlan: 위의 지시사항을 따른 한 문장 핵심 처방
6. hints: 위의 지시사항을 따른 단계별 힌트 목록 (정확히 3개)
7. problemText: 위의 지시사항을 따른 추출된 원본 문제 지문
8. problemBox: 위의 지시사항을 따른 필기 제외 인쇄 문제 영역 바운딩 박스
9. grade: 과목명
10. chapter: 단원명`;

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
          mistakeDetail: { type: 'STRING' },
          rootCause: { type: 'STRING' },
          actionPlan: { type: 'STRING' },
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
          chapter: { type: 'STRING' }
        },
        required: ['title', 'solvingProcess', 'mistakeDetail', 'rootCause', 'actionPlan', 'hints', 'problemText', 'problemBox', 'grade', 'chapter']
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

    return {
      title: parsedJson.title || '분석 완료된 문제',
      grade: parsedJson.grade || '기타',
      chapter: parsedJson.chapter || '기타',
      analysis: {
        solvingProcess: parsedJson.solvingProcess,
        mistakeDetail: parsedJson.mistakeDetail,
        rootCause: parsedJson.rootCause,
        actionPlan: parsedJson.actionPlan,
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
