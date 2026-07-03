import type { MistakeAnalysis } from '../types';

interface GeminiResponse {
  title: string;
  solvingProcess: string;
  mistakeDetail: string;
  rootCause: string;
  actionPlan: string;
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
): Promise<{ title: string; analysis: MistakeAnalysis }> => {
  const { mimeType, base64Data } = await imageUrlToBase64(imageUrl);

  // Endpoint for Gemini 2.5 Flash
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const prompt = `수학 문제 사진입니다. 이 사진 속 문제를 분석하고 올바른 풀이법과 사용자가 실수하여 틀린 부분을 진단해 주세요.
모든 수학적 수식, 방정식, 기호, 변수 및 계산 표현은 가독성을 극대화하기 위해 반드시 LaTeX 문법으로 작성하고 수학 구분 기호로 감싸야 합니다.
- 문장 내부의 인라인 수식은 $...$로 감싸주세요 (예: $\\angle BAC = \\angle CAD$, $\\overline{AC} = 3\\sqrt{5}$).
- 줄바꿈이 필요한 단독 블록 수식은 $$...$$로 감싸주세요.

가독성을 극대화하기 위해 다음 규칙을 엄격히 준수하여 텍스트를 구성해야 합니다:

1. solvingProcess: 문제의 정석적인 올바른 단계별 풀이 과정.
   - 구조: 문제를 구성하는 각 소문제(예: "(1) 선분 AC의 길이 구하기", "(2) 사각형 ABCD의 넓이 구하기") 단위로 단락을 먼저 나누어 주세요.
   - 각 단계마다 해결을 위해 사용된 핵심 수학적 개념이나 공식(예: "**원주각 성질 활용**", "**코사인법칙 적용 (각 $\\theta = ...$ )**", "**두 식 연립**", "**sin $\\theta$ 값 계산**", "**두 삼각형의 넓이 합**")을 볼드체 타이틀로 두어 설명과 수식을 구조화해 주세요.
   - 수식 전개 과정은 줄바꿈과 들여쓰기를 적절히 사용하여 단계별로 깔끔하게 구성해 주세요.

2. mistakeDetail: 사용자가 풀이 과정에서 실수한 구체적인 지점들에 대한 상세 분석 목록.
   - 반드시 첫 줄에 **오답 분석 가이드**라는 헤더를 적고, 그 아래에 각 실수의 원인을 글머리 기호(예: `- **[실수 유형/개념 이름]**: 상세 설명...`) 형식으로 나열해 주세요.
   - 중요 단어는 **볼드체**로 강조해 주세요.
   - 예시 형식:
     오답 분석 가이드
     - **도형 성질(원주각) 간과**: $\\angle BAC = \\angle CAD \\Rightarrow \\overline{CD} = \\overline{BC} = \\sqrt{10}$임을 알아채지 못해 수치 부족으로 풀이를 시작하지 못했습니다.
     - **임의의 수치 가정 대입**: 연립을 시작하지 못하자 $\\overline{AC} = \\sqrt{15}$로 잘못 가정하여 풀이를 이어나갔고, 연쇄적으로 (1)과 (2) 모두 틀리게 되었습니다.

3. rootCause: 해당 실수가 일어난 근본적인 수학적 오개념이나 틀린 이유 분석.
   - 학생들이 무엇을 헷갈려했는지, 어떤 중학 도형 또는 고교 수학 개념의 누수가 원인인지를 짚어 요약 기술해 주세요. 핵심 문구는 **볼드체**로 처리해 주세요.

4. actionPlan: 향후 동일한 실수를 방지하기 위한 구체적인 재발 방지 대책 및 처방.
   - 반드시 첫 줄에 **발상 & 개념 클리닉**이라는 헤더를 적고, 그 아래에 1., 2. 와 같은 번호 매김 목록 형식으로 나열해 주세요.
   - 각 항목은 **`번호. **[대책 타이틀]**: 상세 실천 방안`** 형식이어야 합니다.
   - 예시 형식:
     발상 & 개념 클리닉
     1. **원 내접 다각형의 중등 도형 성질 복습**: 원 문제에서는 사인/코사인법칙을 쓰기 전에 원주각과 현의 길이 성질을 반드시 먼저 체크합니다.
     2. **공통 변을 낀 삼각형의 연립 패턴 숙지**: 두 삼각형이 한 변($\\overline{AC}$)과 크기가 같은 각을 각각 공유하고 있을 때, 두 삼각형에서 각각 코사인법칙을 세워 식을 연립하는 풀이 흐름을 익혀 둡니다.

출력은 지정된 JSON 스키마를 엄격히 따라 다음 5가지 항목을 모두 한국어로 작성해야 합니다:
1. title: 문제의 주제나 공식을 담은 짤막하고 직관적인 제목 (예: '원 내접 사각형의 성질과 코사인법칙 연립')
2. solvingProcess: 위의 지시사항을 따른 올바른 풀이 과정
3. mistakeDetail: 위의 지시사항을 따른 실수한 지점 분석 (오답 분석 가이드 형식 준수)
4. rootCause: 위의 지시사항을 따른 근본적인 틀린 이유
5. actionPlan: 위의 지시사항을 따른 재발 방지 대책 (발상 & 개념 클리닉 형식 준수)`;

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
          actionPlan: { type: 'STRING' }
        },
        required: ['title', 'solvingProcess', 'mistakeDetail', 'rootCause', 'actionPlan']
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
      analysis: {
        solvingProcess: parsedJson.solvingProcess,
        mistakeDetail: parsedJson.mistakeDetail,
        rootCause: parsedJson.rootCause,
        actionPlan: parsedJson.actionPlan
      }
    };
  } catch (error: any) {
    console.error('Gemini API call failed:', error);
    throw new Error(error.message || 'Gemini API 호출 중 장애가 발생했습니다.');
  }
};
