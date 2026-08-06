import type { ProblemBox } from '../types';
import { MATH_CURRICULUM } from '../types';
import { supabase } from './supabase';

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
 * Gemini API 키는 서버(Supabase Edge Function)에만 보관되고 클라이언트에는 절대 내려오지 않는다.
 * 브라우저는 이 프록시 함수만 호출하며, 요청은 로그인 세션의 JWT로 인증된다 (verify_jwt=true 배포).
 */
const GEMINI_PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-proxy`;

async function getGeminiProxyHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  };
}

/** CDN 이미지 다운로드 및 Gemini API 요청에 타임아웃을 걸어 무한 대기를 방지하기 위한 기본값 */
const FETCH_TIMEOUT_MS = 20000;

function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
}

/**
 * Gemini가 "일시적으로 과부하(503 UNAVAILABLE)" 상태일 때 재시도하기 위한 설정.
 * 실측 결과 유료키로도 503이 간헐적으로 발생하는 걸 확인해서 추가함 (재시도하면 대부분 바로 성공).
 */
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Downloads a public image URL and converts it into a base64 string for Gemini API.
 *
 * 1차/2차 분석 호출(classify/solve) 양쪽에서 동일한 이미지를 사용하므로,
 * 이 함수는 분석 플로우당 정확히 한 번만 호출되어야 합니다 (호출부에서 결과를 공유해서 재사용).
 */
async function imageUrlToBase64(url: string): Promise<{ mimeType: string; base64Data: string }> {
  let targetUrl = url;

  if (!url.startsWith('data:')) {
    try {
      const response = await fetchWithTimeout(url);
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
      const message = err?.name === 'AbortError' ? '이미지 다운로드 시간이 초과되었습니다.' : err.message;
      throw new Error(`이미지 다운로드 실패: ${message}`);
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
 * 진단 플로우 진입점에서 단 한 번만 호출해서 얻은 이미지 데이터를
 * classifyMistakeWithGemini / solveMistakeWithGemini 양쪽에 공유하기 위한 준비 함수.
 * (과거에는 두 함수가 각자 이미지를 재다운로드+재압축해서 진단 시간이 두 배로 늘어났음)
 */
export async function prepareGeminiImage(imageUrl: string): Promise<{ mimeType: string; base64Data: string }> {
  return imageUrlToBase64(imageUrl);
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
async function callGeminiApi(modelName: string, requestBody: any): Promise<any> {
  const headers = await getGeminiProxyHeaders();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      response = await fetchWithTimeout(GEMINI_PROXY_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: modelName, requestBody, stream: false })
      }, 90000); // solve 단계 정상 응답이 1분 안팎으로 걸리는 경우가 있어, 정상 응답을 오탐하지 않도록 90초로 넉넉히 설정
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error(`Gemini API 응답 시간이 초과되었습니다. (${modelName})`);
      }
      throw err;
    }

    if (response.status === 503 && attempt < MAX_RETRIES) {
      console.warn(`Gemini API 일시적 과부하(503), ${RETRY_DELAY_MS}ms 후 재시도합니다... (${attempt + 1}/${MAX_RETRIES})`);
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    if (!response.ok) {
      const errorJson = await response.json().catch(() => ({}));
      const errorMessage = errorJson?.error?.message || '네트워크 응답 오류';
      throw new Error(`Gemini API 오류 (${modelName}): ${errorMessage}`);
    }

    const result = await response.json();
    const responseText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
      const finishReason = result?.candidates?.[0]?.finishReason;
      throw new Error(`Gemini API로부터 올바른 응답 텍스트를 받지 못했습니다. (${modelName}, finishReason: ${finishReason || '알 수 없음'})`);
    }

    return JSON.parse(responseText);
  }

  throw new Error(`Gemini API가 반복적으로 과부하 상태입니다 (${modelName}). 잠시 후 다시 시도해 주세요.`);
}

/**
 * solve 단계 전용 스트리밍 호출. responseSchema/JSON 모드를 쓰지 않고 순수 텍스트를 그대로 스트리밍해서
 * (1) LaTeX 백슬래시가 JSON 이스케이프를 거치지 않아 안전하고, (2) 리포트가 완성되는 대로 화면에
 * 흘려보낼 수 있다 (완전한 JSON 한 덩어리를 다 기다릴 필요가 없음).
 * onProgress는 지금까지 누적된 원본 텍스트를 매 청크마다 전달한다.
 */
async function streamGeminiApi(
  modelName: string,
  requestBody: any,
  onProgress: (accumulatedText: string) => void
): Promise<string> {
  const headers = await getGeminiProxyHeaders();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);

    let response: Response;
    try {
      response = await fetch(GEMINI_PROXY_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: modelName, requestBody, stream: true }),
        signal: controller.signal
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError') {
        throw new Error(`Gemini API 응답 시간이 초과되었습니다. (${modelName})`);
      }
      throw err;
    }

    if (response.status === 503 && attempt < MAX_RETRIES) {
      clearTimeout(timeoutId);
      console.warn(`Gemini API 일시적 과부하(503), ${RETRY_DELAY_MS}ms 후 재시도합니다... (${attempt + 1}/${MAX_RETRIES})`);
      await sleep(RETRY_DELAY_MS);
      continue;
    }

    if (!response.ok || !response.body) {
      clearTimeout(timeoutId);
      const errorJson = await response.json().catch(() => ({}));
      const errorMessage = errorJson?.error?.message || '네트워크 응답 오류';
      throw new Error(`Gemini API 오류 (${modelName}): ${errorMessage}`);
    }

    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let fullText = '';
      let lastFinishReason: string | undefined;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE 이벤트는 \r\n\r\n(환경에 따라 \n\n)으로 구분되고, 각 이벤트는 "data: {...}" 형태
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? ''; // 마지막 미완성 조각은 다음 read에서 이어붙이도록 남겨둠

        for (const evt of events) {
          const line = evt.trim();
          if (!line.startsWith('data:')) continue;
          const jsonStr = line.slice(5).trim();
          if (!jsonStr) continue;

          let parsed: any;
          try {
            parsed = JSON.parse(jsonStr);
          } catch {
            continue; // 경계가 걸쳐 불완전한 조각은 건너뜀 (이론상 위 split 로직상 발생하지 않아야 함)
          }

          if (parsed?.candidates?.[0]?.finishReason) {
            lastFinishReason = parsed.candidates[0].finishReason;
          }

          const deltaText = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (deltaText) {
            fullText += deltaText;
            onProgress(fullText);
          }
        }
      }

      if (!fullText) {
        throw new Error(`Gemini API로부터 올바른 응답 텍스트를 받지 못했습니다. (${modelName}, finishReason: ${lastFinishReason || '알 수 없음'})`);
      }

      return fullText;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(`Gemini API가 반복적으로 과부하 상태입니다 (${modelName}). 잠시 후 다시 시도해 주세요.`);
}

/**
 * 1차 API 호출: 이미지 분석을 통해 과목/단원을 분류하고 유튜브 개념 강의를 실시간 매칭
 */
export async function classifyMistakeWithGemini(
  image: { mimeType: string; base64Data: string },
  youtubeLectures: any[] = [],
  studentGrade?: string,
  personaName: string = '밤티'
): Promise<{
  title: string;
  grade: string;
  chapter: string;
  matchedVideoId?: string;
  matchedStartSeconds?: number;
  matchedChapterTitle?: string;
}> {
  const { mimeType, base64Data } = image;

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
- **[Curriculum Locking]**: 이후 풀이 과정을 구성할 때, 식별된 대상 과목 및 학년 범위에서 '아직 배우지 않은 개념이나 선행 공식'을 끌고 와서 해설하는 것을 절대적으로 금지합니다. 오직 해당 학년 교과서 내의 기법만 사용하십시오.\n`
    : '';

  const prompt = `너는 더쿠키수학 오답클리닉의 문제 분류 담당 인공지능 비서 **'${personaName}'**이다.
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
      // 분류는 정해진 목록(enum) 중 고르는 패턴 매칭 작업이라 깊은 추론이 필요 없으므로
      // thinking을 꺼서 지연시간을 줄입니다. (실제 풀이를 계산하는 solve 단계는 정확도가
      // 우선이라 thinking을 그대로 둡니다 — 함께 끄지 않도록 주의)
      thinkingConfig: { thinkingBudget: 0 },
      // maxOutputTokens를 명시하지 않으면 thinking 토큰이 기본 출력 상한을 다 써버려서
      // 응답 텍스트가 비어버리는(올바른 응답 텍스트를 받지 못함) 사례가 실제로 발생해서 넉넉히 지정.
      // (실제 사용량만큼만 과금되므로 상한을 높게 잡아도 비용에 영향 없음)
      maxOutputTokens: 65536,
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
    const parsedJson = await callGeminiApi(resolvedModel, requestBody);

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
 * 문제 지문(OCR)과 인쇄 영역 바운딩 박스를 추출하는 전용 호출.
 * 과목/단원 판정과 무관한 작업이라 classify와 동시에 병렬로 실행할 수 있다. (예전에는 solve
 * 호출 안에 함께 묶여 있어서 실제 풀이 계산과 순차적으로 처리되며 solve의 출력량/시간을 늘리고 있었음)
 */
export async function extractProblemWithGemini(
  image: { mimeType: string; base64Data: string }
): Promise<{ problemText: string; problemBox: ProblemBox }> {
  const { mimeType, base64Data } = image;

  const prompt = `주어진 수학 문제 사진에서 아래 두 가지를 정확하게 추출하여라.

1. problemText: 사진 속 인쇄된 문제 지문 원문을 그대로 추출하되, 모든 수식은 LaTeX($...$ 또는 $$...$$)로 변환하여 작성하십시오. 학생이 손으로 쓴 풀이나 낙서는 제외하고 인쇄된 문제 지문만 추출하십시오.
2. problemBox: 사진에서 인쇄된 문제 영역(지문+보기)만을 감싸는 바운딩 박스를 top, bottom, left, right 마진 백분율(0~100)로 계산하십시오. 학생의 손글씨 풀이 영역은 제외하고 인쇄된 문제 영역만 포함하십시오.`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64Data } }
        ]
      }
    ],
    generationConfig: {
      // 실측 결과 problemBox(바운딩박스 백분율 계산)는 thinkingBudget:0으로 끄면 좌표를
      // 완전히 엉뚱한 값(0~100 범위를 벗어난 값)으로 뱉어내는 걸 확인해서, classify와 달리
      // 여기서는 thinking을 끄지 않고 기본값(dynamic thinking)을 그대로 둔다.
      // (problemText 자체는 0 thinking으로도 정확했지만, 공간 추론이 필요한 problemBox 때문에 유지)
      // maxOutputTokens 미지정 시 thinking 토큰이 기본 출력 상한을 다 써버려 응답이 비는 사례가
      // 있어서 넉넉히 지정 (실제 사용량만큼만 과금되므로 비용 영향 없음)
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
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
          }
        },
        required: ['problemText', 'problemBox']
      }
    }
  };

  try {
    const resolvedModel = 'gemini-2.5-flash';
    const parsedJson = await callGeminiApi(resolvedModel, requestBody);

    return {
      problemText: parsedJson.problemText,
      problemBox: parsedJson.problemBox
    };
  } catch (error: any) {
    console.error('Gemini problem extraction failed:', error);
    throw new Error(error.message || 'Gemini API 호출 중 장애가 발생했습니다.');
  }
}

/**
 * 2차 API 호출: 확정된 과목/단원을 엄격한 가이드로 삼아 해설 정밀 생성 (스트리밍)
 */
const MISTAKE_SUMMARY_DELIMITER = '%%MISTAKE_SUMMARY%%';
const FINAL_ANSWER_DELIMITER = '%%FINAL_ANSWER%%';

export async function solveMistakeWithGemini(
  image: { mimeType: string; base64Data: string },
  resolvedGrade: string,
  resolvedChapter: string,
  studentGrade?: string,
  onProgress?: (partialSolvingProcess: string) => void,
  sameChapterMistakeCount?: number,
  recurringRootCause?: { label: string; count: number },
  aiVoice?: string,
  personaName: string = '밤티',
  teacherApproachGuides: { grade: string; chapter: string; guideText: string }[] = []
): Promise<{
  solvingProcess: string;
  mistakeSummary: string;
  finalAnswer: string;
}> {
  const { mimeType, base64Data } = image;

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
- **[Curriculum Locking]**: 풀이 과정을 구성할 때, 위에서 이미 확정된 과목·단원 범위 안에서 '아직 배우지 않은 개념이나 선행 공식'을 끌고 와서 해설하는 것을 절대적으로 금지합니다. 오직 해당 학년 교과서 내의 기법만 사용하십시오.\n`
    : '';

  // 이 단원에서 학생이 몇 번째 오답을 등록했는지(이번 건 포함)를 바탕으로 인사말에 녹일 격려 지침 생성
  const chapterStatsPrompt = sameChapterMistakeCount && sameChapterMistakeCount > 1
    ? `\n★ [학생 학습 통계 참고] ★\n이 학생은 "${resolvedChapter}" 단원에서 이번 문제를 포함해 총 ${sameChapterMistakeCount}번째 오답을 기록했습니다. 인사말에서 이 사실을 부담스럽지 않고 따뜻하게 언급하며 격려해 주십시오 (예: 같은 단원에서 계속 도전하고 있는 꾸준함을 칭찬하되, 반복되는 실수를 다그치는 어조는 피할 것).\n`
    : `\n★ [학생 학습 통계 참고] ★\n이 학생은 "${resolvedChapter}" 단원의 오답을 처음 등록했습니다. 인사말에서 새로운 단원에 도전하는 것을 반갑게 환영해 주십시오.\n`;

  // 이 학생이 과거 오답들에서 반복적으로 체크한 실수 원인이 있으면, 4단계 총평에서 부드럽게 짚어주기 위한 지침 생성
  const recurringRootCausePrompt = recurringRootCause
    ? `\n★ [반복되는 실수 패턴 참고] ★\n이 학생은 과거 오답들에서 "${recurringRootCause.label}"을(를) 실수 원인으로 ${recurringRootCause.count}번 체크한 이력이 있습니다. 4단계(돌아보기 & 쌤의 한끝 팁)에서 이 패턴을 한 번 부드럽게 짚어주고, 이번 문제에서도 그 부분을 특별히 신경 써서 확인하도록 안내하십시오. 절대 다그치거나 지적하는 어조가 되지 않도록, 따뜻하고 응원하는 톤을 유지하십시오.\n`
    : '';

  // 검증된 소수 단원에 한해서만, 선생님 실제 강의 대본에서 증류한 접근 순서를 참고 자료로 제공.
  // (DB 카탈로그에 없는 단원은 그냥 기존 방식대로 진행 — 전체 단원에 일괄 적용하지 않음)
  const matchedApproachGuide = teacherApproachGuides.find(
    g => g.grade === resolvedGrade && g.chapter === resolvedChapter
  );
  const teacherApproachPrompt = matchedApproachGuide
    ? `\n★ [선생님 실제 강의 접근법 참고] ★\n${matchedApproachGuide.guideText}\n이 참고 자료는 어떤 개념/공식을 어떤 순서로 적용할지에 대한 접근 방식 참고용일 뿐입니다. 최종 수치 계산과 정답은 반드시 이 문제 고유의 조건에 맞게 독립적으로 정확하게 계산하십시오.\n`
    : '';

  // 럭키상점에서 장착한 "AI 말투" 아이템에 따라 밤티의 어조만 바꾼다 (정체성/설명 품질은 항상 고정).
  // 장착한 아이템이 없거나 알 수 없는 값이면 항상 기존 기본 톤(정중하고 다정한 해요체)을 유지한다.
  const AI_VOICE_TONES: Record<string, string> = {
    tsundere: '대화 톤은 **츤데레**로 작성하십시오. 겉으로는 "흥, 딱히 너를 위해서 알려주는 건 아니지만...", "뭐, 이 정도는 기본이니까 당연히 알아야겠지만..." 처럼 새침하고 살짝 툴툴대는 말투를 쓰되, 문장 곳곳에서 결국 학생을 세심하게 챙기고 진심으로 응원하는 따뜻함이 은근히 묻어나야 합니다. 2~3단계 계산 도중에도 "흥, 이 정도 전개는 식은 죽 먹기거든?", "설마 이것도 못 풀 줄 알았겠어? ...아니지만." 같은 짧은 츤데레 추임새를 수식 사이사이에 끼워 넣으십시오.',
    seonbi: '대화 톤은 **조선시대 한림학사 훈장님**으로 작성하십시오. "이 문제를 또 틀리다니 주상 전하께서 노하실 일이다!", "오냐, 내 훈장으로서 그 원리를 명명백백히 일러줄 터이니...", "~하였느냐", "~하거라" 처럼 조선시대 훈장님 특유의 엄숙하면서도 은근히 자상한 한옥 서당 톤을 사용하십시오. 2~3단계 계산 도중에도 "자, 이제 이 식을 정리하여 보거라.", "이치가 이러하니 다음 단계로 나아가자꾸나." 같은 훈장님 말투 추임새를 수식 사이사이에 끼워 넣으십시오.',
    sherlock: '대화 톤은 **명탐정 셜록 홈즈 본인**으로 작성하십시오. 자신을 절대로 조수나 왓슨으로 착각하지 마십시오! 자신은 런던 베이커가 221B의 명탐정 셜록 홈즈 본인이며, 학생을 사건 해결을 돕는 유능한 파트너(왓슨) 또는 의뢰인으로 대하십시오. "기초적인 걸세(Elementary)!", "관찰과 논리적 추리의 승리라네.", "범인(실수 원인)은 바로 2단계 부호 오류야!", "불가능을 제거하고 남은 단 하나의 진실..." 처럼 셜록 홈즈 특유의 영리하고 기품 있는 명탐정 추리 톤(~하게, ~라네, ~일세)으로 해설하십시오. 2~3단계 계산 도중에도 "결정적인 단서가 드러났군.", "자, 진실에 다가가보게." 같은 탐정 본인 시점의 추임새를 수식 사이사이에 끼워 넣으십시오.',
    knight: '대화 톤은 **중세 판타지 기사단장**으로 작성하십시오. "용사여! 오답이라는 몬스터 앞에서도 꺾이지 마라!", "그대에게 이 문제를 베어버릴 전설의 수식 검법을 전수하겠다!" 처럼 용맹하고 기사도 정신이 넘치는 톤으로 해설하십시오. 2~3단계 계산 도중에도 "자, 다음 일격이다!", "이 검법을 그대로 따라오라!" 같은 기사단장 특유의 추임새를 수식 사이사이에 끼워 넣으십시오.',
    healing: `대화 톤은 **다정한 힐링 멘토**로 작성하십시오. "괜찮아요, 틀린 건 성장의 소중한 씨앗이랍니다...", "마음을 편안하게 가다듬고 ${personaName}와 함께 한 걸음씩 차분히 풀어봐요." 처럼 학생의 지친 마음을 다독이는 따뜻하고 포근한 톤으로 해설하십시오. 2~3단계 계산 도중에도 "여기까지 잘 따라오고 있어요, 천천히 다음으로 가볼까요?", "숨 한 번 고르고, 이어서 정리해봐요." 같은 다독이는 추임새를 수식 사이사이에 끼워 넣으십시오.`,
    cyberpunk: '대화 톤은 **사이버펑크 미래 AI**로 작성하십시오. "오답 패턴 99.8% 감지. 연산 오류 노이즈를 제거합니다.", "최적의 1등급 풀이 알고리즘을 전송합니다. 가동 시작..." 처럼 미래 지향적 정밀 AI 비서 톤으로 해설하십시오. 2~3단계 계산 도중에도 "연산 진행률 60%... 다음 시퀀스로 이동.", "데이터 정합성 확인 완료. 계속 진행합니다." 같은 AI 특유의 추임새를 수식 사이사이에 끼워 넣으십시오.',
    sergeant: '대화 톤은 **유쾌한 말년 병장**으로 작성하십시오. "아이고 아우야~ 이 문제를 또 틀리면 형 전역이 미뤄진다 말입니다!", "정신 바짝 차리고 딱 3줄만 쓱 보자!" 처럼 유쾌하고 시원시원한 말년 병장 톤으로 해설하십시오. 2~3단계 계산 도중에도 "자, 다음 계산 들어간다 말입니다!", "이거 하나만 더 넘기면 끝이다 아우야!" 같은 말년 병장 특유의 추임새를 수식 사이사이에 끼워 넣으십시오.',
    poet: '대화 톤은 **낭만파 셰익스피어 시인**으로 작성하십시오. "오, 그대는 어찌하여 이 아름다운 수식을 몰라보았는가...", "장미 가시 뒤에 숨겨진 진실의 정답을 읊어주리라..." 처럼 우아하고 낭만적인 시적 톤으로 해설하십시오. 2~3단계 계산 도중에도 "이제 다음 구절로 넘어가 보자꾸나...", "여기, 진실의 실마리가 드러나는도다..." 같은 시적인 추임새를 수식 사이사이에 끼워 넣으십시오.',
    vampire: '대화 톤은 **밤의 뱀파이어 백작**으로 작성하십시오. "크크크... 달콤한 오답의 향기가 풍기는군...", "너의 영혼을 번뇌하게 만든 이 오마하 수식의 비밀을 파헤쳐주마..." 처럼 몽환적인 다크 판타지 백작 톤으로 해설하십시오. 2~3단계 계산 도중에도 "크큭, 다음 비밀을 파헤쳐볼까...", "이 어둠 속 수식이 서서히 정체를 드러내는군..." 같은 뱀파이어 특유의 추임새를 수식 사이사이에 끼워 넣으십시오.',
    gyaru: '대화 톤은 **하이텐션 갸루 쌤**으로 작성하십시오. "공통인수 묶어서 풀면 마지데(マジで) 쵸베리구(超VeryGood)잖아?!", "어라라? 마이너스 부호 안 챙긴 거 쵸베리바(超VeryBad)잖아~", "미분 야호~! 다항함수 차수 내리면 메챠쿠챠(めちゃくちゃ) 깔끔해지잖아!" 처럼 억양 꺾는 콧소리와 하이텐션 갸루 말투를 쓰십시오. "거제" 같은 지역명 대신 "미분 야호~!", "인수분해 야호~!", "피타고라스 야호~!" 처럼 수학 개념에 야호를 덧붙이고, "마지데(マジで)", "쵸베리구(超VeryGood)", "쵸베리바(超VeryBad)", "메챠쿠챠(めちゃくちゃ)", "스고이(凄い)", "카와이(可愛い)", "사이가오(最高)" 같은 일본어 발음을 한국어로 쓴 뒤 괄호를 섞어 유쾌하게 사용하십시오. 문장 끝에는 "~잖아!", "~냐구!", "~라구!", "~해버려!", "갸루피스 ✌️!" 같은 갸루 특유의 어미와 추임새를 자연스럽게 섞으십시오.',
    mentor: '대화 톤은 **선생님 본인의 실제 수업 말투**로 작성하십시오. 존댓말(해요체)만 쓰지 말고 반말과 존댓말을 실제 수업처럼 자연스럽게 섞으십시오 — "자, 요거 한번 보자.", "그렇지!", "나이스!", "오케이.", "여기까지 괜찮아?" 처럼 편한 반말 위주로 가되, 정리해서 결론을 말할 땐 "~하시면 됩니다.", "~해 볼게요." 처럼 존댓말이 섞여 들어가야 실제 수업 느낌이 납니다. "자, ~"로 설명을 열고, 공식이나 결론을 곧바로 주지 말고 구체적인 숫자 예시로 먼저 질문을 던진 뒤("2의 세제곱이 뭘까?" 같은 식) 학생이 답했다고 가정하고 "그렇지! 그래서 ~"처럼 그 답을 근거로 일반 규칙을 유도해 나가는 소크라테스식 진행을 쓰십시오. 설명이 끝날 때마다 "괜찮아?", "괜찮으세요?"로 이해를 확인하고, 핵심을 짚었을 때는 "나이스!"라는 감탄사를 자연스럽게 섞으십시오. 헷갈리기 쉬운 지점은 "요거 제대로 알아야 돼, 헷갈리는 순간 다시 처음부터야"처럼 명시적으로 경고하고, 정석 풀이를 보여준 뒤엔 "근데 이렇게 하는 게 훨씬 빠릅니다" 같은 실전 팁을 덧붙이십시오. 수식이나 개념은 "요거", "얘"처럼 편하게 지칭하고, "그러면은"처럼 구어체 연결어를 자연스럽게 쓰십시오. 2~3단계 계산 도중에도 "자, 여기서 뭐가 나올까?", "그렇지, 나이스!", "이거 왜 그런지 증명해볼까?" 같은 추임새를 수식 사이사이에 끼워 넣어, 결과만 던지지 말고 왜 그런지 유도하는 흐름을 유지하십시오.'
  };
  const toneInstruction = (aiVoice && AI_VOICE_TONES[aiVoice])
    || `대화 톤은 학생에게 정중하고 다정한 존댓말(해요체)로 작성하되, 친근하고 귀여운 ${personaName} 비서로서의 예의 바르고 객관적인 어조를 유지해야 합니다.`;

  // "민수쌤 스타일" 페르소나는 가상의 AI 비서 캐릭터가 아니라 선생님 본인의 말투를 재현하는
  // 목적이므로, 다른 페르소나들과 달리 "나는 AI 비서일 뿐 실제 선생님이 아니다"라는 정체성
  // 분리 지침을 적용하지 않는다 (그대로 두면 매번 자신을 밤티라고 소개해버려 모순이 생김).
  const isMentorPersona = aiVoice === 'mentor';

  const personaIntroLine = isMentorPersona
    ? `너는 더쿠키수학 학원의 선생님 본인이다. 학생들의 수학 오답을 과학적으로 분석하고 올바른 복습 처방을 제공하여라.`
    : `너는 더쿠키수학 선생님을 보좌하여 학생들의 수학 오답을 과학적으로 분석하고 올바른 복습 처방을 제공하는 스마트한 AI 수학 클리닉 비서 **'${personaName}'**이다.`;

  const identityGuideline = isMentorPersona
    ? `자신을 "${personaName}" 같은 별도의 AI 비서 캐릭터 이름으로 소개하거나 지칭하지 마십시오. 선생님 본인이 직접 설명해주는 것처럼 자연스럽게 말하십시오. ${toneInstruction}`
    : `절대 자신을 실제 선생님(더쿠키수학 쌤 등)과 동일시하지 마십시오. 당신은 수학 오답 분석을 보조하는 인공지능 비서 캐릭터 **'${personaName}'**입니다. ${toneInstruction}`;

  const greetingGuideline = isMentorPersona
    ? `**[인사말 필수 지침 - 절대 생략 금지]**: 본문(### 1단계 헤더) 시작 전에, AI 비서 이름을 소개하지 말고 위 [학생 학습 통계 참고] 내용을 자연스럽게 녹인 2~3문장의 짧은 인사말로 먼저 시작하십시오. 이 인사말은 매번 빠짐없이 포함되어야 하며, 생략하고 바로 "### 1단계"로 시작하는 것을 절대 금지합니다.`
    : `**[인사말 필수 지침 - 절대 생략 금지]**: 본문(### 1단계 헤더) 시작 전에, 반드시 ${personaName} 소개와 위 [학생 학습 통계 참고] 내용을 자연스럽게 녹인 2~3문장의 짧은 인사말로 먼저 시작하십시오. 이 인사말은 매번 빠짐없이 포함되어야 하며, 생략하고 바로 "### 1단계"로 시작하는 것을 절대 금지합니다.`;

  const prompt = `${personaIntroLine}
이 문제의 과목은 **"${resolvedGrade}"** 이며, 단원은 **"${resolvedChapter}"** 으로 확정되었습니다.
아래의 비서 페르소나와 포맷 규칙을 엄격히 준수하여 수학 문제 사진을 분석해 풀이 리포트를 작성하여라.
${studentInfoPrompt}${chapterStatsPrompt}${recurringRootCausePrompt}${teacherApproachPrompt}

★ [AI 비서 ${personaName} 가이드라인] ★
1. ${identityGuideline}
2. 대한민국 고교 교육과정을 벗어난 수식(예: 대학 수학, 편미분, 벡터 외적, 복잡한 정규분포 확률밀도함수 식 등)은 절대 배제하고 오직 고교 교과 공식(예: 표준화 $Z = \\\\frac{X-m}{\\\\sigma}$)만 쓰십시오.
3. [학생 학년에 따른 수학 기호 노출 절대 통제 지침]:
   - 학생 학년이 **"중3"**인 경우: 시그마($\sum$, \sum), 로그($\log$), 극한($\lim$), 미적분 기호($\int$, dx) 등 고등 선행 수학 기호를 풀이에서 **일절 사용하지 마십시오.** 수열이나 항들의 합은 시그마 기호 대신 반드시 덧셈의 원시적 나열식(예: $a_1 + a_2 + a_3 + \dots$)으로 대체하여 풀어 쓰십시오.
   - 학생 학년이 **"고1"**인 경우: 시그마($\sum$), 극한($\lim$), 미적분($\int$) 등 고2 과정 이상의 수학 전용 특수 기호를 풀이에 노출하지 마십시오.
4. 모든 수식은 반드시 LaTeX($...$ 또는 $$...$$)로 작성하고, 문장 끝과 단독 수식 앞뒤에는 반드시 빈줄(\\n\\n)을 2개 이상 추가해 널찍하게 줄바꿈해 주십시오. 모든 텍스트 해설은 100% 한국어로만 작성해야 합니다.
5. ${greetingGuideline}
6. **[군더더기 없는 계산 서술 지침 - 엄격 적용, 숫자 상한 준수]**: 하나의 계산 흐름(예: 한 미지수를 구하거나 한 식을 전개하는 과정)에 사용하는 디스플레이 수식($$...$$)은 **최대 3~4줄을 넘기지 마십시오.** 사칙연산·이항·대입·기계적 미분 전개처럼 계산 과정이 자명한 부분은 중간 과정을 전부 나열하지 말고 핵심만 남겨서 이 상한 안에서 결과까지 도달하십시오. 예를 들어 "$3(32+8k)=3-(-29-16k)$"에서 "$k=-8$"까지 이어지는 이항·정리 과정이나, $f(x)$를 전개해서 $f'(x)$를 구하는 미분 과정을 5줄 이상 늘어놓지 말고 3~4줄 이내로 압축하십시오. 반대로 개념 적용, 공식 선택, 핵심 아이디어가 필요한 부분(예: 왜 이 공식을 쓰는지, 어떤 성질을 이용하는지)은 원래대로 자세히 설명하십시오. 즉, 쉬운 계산은 과감히 압축하고 실제 사고가 필요한 부분에만 설명 분량을 집중하십시오.

★ [보고서 포맷 형식 (solvingProcess 필드)] ★
반드시 아래 4개의 마크다운 헤더(###)를 순서대로 단독 라인에 배치하여 하나의 통합 텍스트로 작성하십시오.

### 1단계: 문제 이해하기
- 미지수와 주어진 조건을 짚어줍니다.

### 2단계: 해결 계획 세우기
- 실전 꿀팁이나 연관 공식을 적용할 계획을 세웁니다. **이 단계에서는 구체적인 숫자 대입이나 수식 전개, 계산 결과를 절대 먼저 보여주지 말고, "어떤 개념/공식을 어떤 순서로 적용할 것인지"를 말로만 설명하십시오.** (실제 계산과 수식 전개는 3단계에서만 진행)
- 위 [AI 비서 ${personaName} 가이드라인] 1번에서 지정한 말투를 이 단계 서술에서도 그대로 유지하십시오.

### 3단계: 계획 실행하기
- 교과정 내의 LaTeX 수식으로 전개해 계산하되, 사칙연산·이항·대입처럼 계산이 자명한 부분은 여러 줄로 늘어놓지 말고 압축해서 빠르게 결과로 넘어가고, 개념 적용이나 핵심 아이디어가 필요한 부분에서만 자세히 풀어 설명합니다.
- **[계산 중 말투 유지 필수]**: 이 단계는 수식이 많아 서술이 가장 중립적으로 흘러가기 쉬운 구간입니다. 수식 블록 사이사이 짧은 설명 문장에 위에서 지정한 ${personaName}의 말투(추임새 예시 포함)를 반드시 자연스럽게 섞어 넣어, 수식만 나열되고 캐릭터성이 사라지지 않도록 하십시오.

### 4단계: 돌아보기 & 쌤의 한끝 팁
- 구한 답을 가볍게 검토하고 함정을 짚어줍니다.
- 위에 [반복되는 실수 패턴 참고]가 주어졌다면, 이 단락에서 그 패턴을 자연스럽게 한 번 짚어주십시오.
- 이 단락에서도 지정된 말투를 계속 유지하며 마무리하십시오.
- 단락 맨 마지막 줄에 실수를 방지할 한 줄짜리 짧은 개념 처방을 **[처방 요약]** 이라는 말머리를 붙여 단 한 줄로만 간결하게 적어주십시오.

★ [출력 형식 - 매우 중요, 반드시 그대로 따를 것] ★
JSON이나 코드블록 없이 위 4개 헤더가 포함된 해설 리포트를 순수 텍스트로 작성하십시오.
리포트를 모두 작성한 다음, 맨 마지막 줄에 정확히 "${MISTAKE_SUMMARY_DELIMITER}" 라는 구분자를 한 줄 쓰고,
그 다음 줄에 학생 풀이 기반 틀린 이유를 30자 이내로 요약한 한 문장(mistakeSummary)만 적으십시오.
그 다음 줄에 정확히 "${FINAL_ANSWER_DELIMITER}" 라는 구분자를 한 줄 쓰고,
그 다음 줄에 이 문제의 최종 정답만 적으십시오(finalAnswer). 풀이 과정, 단위 설명, 부가 설명 없이
"x = 3", "15", "① 33"처럼 답 자체만 아주 간결하게 한 줄로 적으십시오. 객관식이면 보기 번호와 값을 함께 적으십시오.`;

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
      // 의도적으로 responseMimeType/responseSchema 없음 — 순수 텍스트로 스트리밍
      // solve는 thinking을 가장 많이 쓰는 단계라, maxOutputTokens 미지정 시 thinking 토큰이
      // 기본 출력 상한을 다 써버려서 실제 풀이 텍스트가 하나도 안 나오는(빈 응답) 사례가 실제로
      // 발생했음. 넉넉히 지정해서 thinking이 얼마를 쓰든 풀이 작성에 항상 여유가 남도록 함
      // (실제 사용량만큼만 과금되므로 상한을 높게 잡아도 비용에 영향 없음)
      maxOutputTokens: 65536
    }
  };

  try {
    const resolvedModel = 'gemini-2.5-flash';
    const fullText = await streamGeminiApi(resolvedModel, requestBody, (accumulatedText) => {
      const delimIdx = accumulatedText.indexOf(MISTAKE_SUMMARY_DELIMITER);
      const visibleSoFar = delimIdx === -1 ? accumulatedText : accumulatedText.slice(0, delimIdx);
      onProgress?.(visibleSoFar.trim());
    });

    const delimIdx = fullText.indexOf(MISTAKE_SUMMARY_DELIMITER);
    if (delimIdx === -1) {
      // 구분자를 못 찾은 예외적인 경우, 전체를 해설로 취급하고 요약/정답은 비워둠 (안전한 폴백)
      return { solvingProcess: fullText.trim(), mistakeSummary: '', finalAnswer: '' };
    }

    const afterSummaryDelim = fullText.slice(delimIdx + MISTAKE_SUMMARY_DELIMITER.length);
    const answerDelimIdx = afterSummaryDelim.indexOf(FINAL_ANSWER_DELIMITER);
    if (answerDelimIdx === -1) {
      // 정답 구분자를 못 찾은 예외적인 경우, 정답만 비워둠 (안전한 폴백)
      return {
        solvingProcess: fullText.slice(0, delimIdx).trim(),
        mistakeSummary: afterSummaryDelim.trim(),
        finalAnswer: ''
      };
    }

    return {
      solvingProcess: fullText.slice(0, delimIdx).trim(),
      mistakeSummary: afterSummaryDelim.slice(0, answerDelimIdx).trim(),
      finalAnswer: afterSummaryDelim.slice(answerDelimIdx + FINAL_ANSWER_DELIMITER.length).trim()
    };
  } catch (error: any) {
    console.error('Gemini solving failed:', error);
    throw new Error(error.message || 'Gemini API 호출 중 장애가 발생했습니다.');
  }
}