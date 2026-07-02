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
- 문장 내부의 인라인 수식은 $...$로 감싸주세요 (예: $x^2 - 4x - 5 = 0$, $x = 5$).
- 줄바꿈이 필요한 단독 블록 수식은 $$...$$로 감싸주세요.

가독성을 극대화하기 위해 다음 규칙을 엄격히 준수하여 텍스트를 구성해야 합니다:
1. solvingProcess: 문제의 정석적인 올바른 단계별 풀이 과정. 한눈에 들어오는 가독성 높은 LaTeX 표현을 적용해 주세요.
2. mistakeDetail: 사용자가 풀이 과정에서 실수한 구체적인 지점 상세 분석.
   - 문단 첫머리에 반드시 "**[핵심 요약]** 한 줄 요약..." 형태로 요약된 실수를 한눈에 띄게 강조해 주세요.
   - 실수한 식이나 계산 과정 등 중요 핵심 단어나 표현은 반드시 **볼드체(**)**로 강조하여 두드러지게 표현해 주세요.
3. rootCause: 해당 실수가 일어난 근본적인 수학적 오개념이나 틀린 이유 분석.
   - 학생들이 무엇을 헷갈려했는지(예: 기호 부호 혼동, 지수 덧셈을 곱셈으로 혼동 등)를 명확히 짚어주고, 핵심 문구는 **볼드체(**)**로 처리해 주세요.
4. actionPlan: 향후 동일한 실수를 방지하기 위한 구체적인 재발 방지 대책 및 처방.
   - 문단 첫머리에 반드시 "**[처방 요약]** 한 줄 처방..." 형태로 구체적 실행 대책을 요약해 주세요.
   - 가독성을 높이기 위해 반드시 글머리 기호(1., 2., 3. 또는 -)를 써서 번호를 매겨 깔끔하게 나눠주세요.
   - 실천해야 할 핵심 대상이나 규칙은 **볼드체(**)**로 강조해 주세요.

출력은 지정된 JSON 스키마를 엄격히 따라 다음 5가지 항목을 모두 한국어로 작성해야 합니다:
1. title: 문제의 주제나 공식을 담은 짤막하고 직관적인 제목 (예: '이차방정식 근의 공식 부호 실수', '지수법칙 지수 곱셈 오류')
2. solvingProcess: 위의 지시사항을 따른 올바른 풀이 과정
3. mistakeDetail: 위의 지시사항을 따른 실수한 지점 분석
4. rootCause: 위의 지시사항을 따른 근본적인 틀린 이유
5. actionPlan: 위의 지시사항을 따른 재발 방지 대책`;

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
