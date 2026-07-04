// scratch/youtube_playlist_indexer.js
// 유튜브 재생목록 파싱 -> 자막 추출 -> Gemini AI 챕터 생성 -> Supabase DB 적재 통합 스크립트

import { createClient } from '@supabase/supabase-js';
import { YoutubeTranscript } from 'youtube-transcript';

const supabaseUrl = 'https://wcvkmdvrowljypueucwx.supabase.co';
const supabaseKey = 'sb_publishable_BtAepfY-CiPuAsOSxJ_Y8w_ZTNZ7UWI';

// Gemini API Key (Vite env에서 읽거나 없으면 프롬프트용 키 사용)
const geminiApiKey = 'AIzaSyA88_O8xG8x88-88888888888888888888'; // 실제 연동을 위해 임시 키 또는 로컬 키 필요

const supabase = createClient(supabaseUrl, supabaseKey);

// 지연 시간 함수 (유튜브 IP 차단 방지용)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 1. 유튜브 재생목록 HTML을 분석하여 비디오 목록을 긁어옵니다
 */
async function fetchPlaylistVideos(playlistId) {
  const url = `https://www.youtube.com/playlist?list=${playlistId}`;
  console.log(`📡 재생목록 페이지 연결 중: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });
  
  if (!response.ok) throw new Error('재생목록 페이지를 가져오지 못했습니다.');
  const html = await response.text();
  
  const videos = [];
  const seenIds = new Set();

  // 방법 A: ytInitialData 파싱 우회 후 정규식 패턴 스캔
  // 비디오 ID 및 타이틀 링크 구조: "url":"/watch?v=VIDEO_ID","title":{"runs":[{"text":"TITLE"}]
  const videoBlockRegex = /"playlistVideoRenderer":\s*({.+?})/g;
  let blockMatch;

  while ((blockMatch = videoBlockRegex.exec(html)) !== null) {
    try {
      const blockStr = blockMatch[1];
      // 괄호 밸런스를 맞추어 올바른 JSON 블록 추출
      let braceCount = 1;
      let jsonEndIndex = 0;
      for (let i = 1; i < blockStr.length; i++) {
        if (blockStr[i] === '{') braceCount++;
        else if (blockStr[i] === '}') braceCount--;
        if (braceCount === 0) {
          jsonEndIndex = i + 1;
          break;
        }
      }
      
      const parsedBlock = JSON.parse(blockStr.slice(0, jsonEndIndex));
      const videoId = parsedBlock.videoId;
      const title = parsedBlock.title?.runs?.[0]?.text || '제목 없음';
      
      if (videoId && !seenIds.has(videoId)) {
        seenIds.add(videoId);
        videos.push({
          videoId,
          title,
          description: parsedBlock.descriptionSnippet?.runs?.[0]?.text || ''
        });
      }
    } catch (e) {
      // 파싱 실패한 단일 블록은 스킵
    }
  }

  // 방법 B (백업): 일반 정규식 추출
  if (videos.length === 0) {
    const backupRegex = /\/watch\?v=([a-zA-Z0-9_-]{11})[^"]*?index=\d+/g;
    let backupMatch;
    while ((backupMatch = backupRegex.exec(html)) !== null) {
      const videoId = backupMatch[1];
      if (!seenIds.has(videoId)) {
        seenIds.add(videoId);
        videos.push({
          videoId,
          title: `영상 강의 (${videoId})`,
          description: ''
        });
      }
    }
  }

  return videos;
}


/**
 * 2. 특정 비디오의 자막을 초 단위로 수집합니다
 */
async function fetchVideoTranscript(videoId) {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ko' });
    return transcript; // Array<{ text, start, duration }>
  } catch (err) {
    console.warn(`⚠️ [${videoId}] 한국어 자막 추출 실패, 영어/기타 자막 시도...`);
    try {
      return await YoutubeTranscript.fetchTranscript(videoId);
    } catch (fallbackErr) {
      console.error(`❌ [${videoId}] 자막을 불러올 수 없습니다 (자막 비활성화 영상일 가능성 있음)`);
      return null;
    }
  }
}

/**
 * 3. 수집된 자막 내용을 Gemini에 보내 수학 교육과정 챕터 타임라인으로 가공합니다
 */
async function generateChaptersWithGemini(videoTitle, transcript, apiKey) {
  if (!apiKey || apiKey.startsWith('AIzaSyA88_')) {
    console.log('💡 유효한 Gemini API Key가 감지되지 않아 기본 타임라인(0초부터 재생)으로 자동 대체합니다.');
    return [{ startSeconds: 0, chapterTitle: '개념 강의 처음부터' }];
  }

  // 자막 텍스트 축약 (Gemini 토큰 절약 및 속도 향상용, 최대 500줄 추출)
  const sampledText = transcript
    .slice(0, 500)
    .map(t => `[${Math.floor(t.start)}초] ${t.text}`)
    .join('\n');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const prompt = `
이 스크립트는 대한민국 수학 강의 동영상 자막입니다.
영상 제목: "${videoTitle}"

아래 자막을 분석하여 단원/주제 개념이 바뀌는 주요 타임라인(시작 시간)을 3~5개의 핵심 챕터로 가공해 주세요.
반드시 고등학교 수학 교육과정 소단원 개념 기준(예: "삼차방정식의 근과 계수의 관계", "오메가의 성질")에 따라 챕터 제목을 정해야 합니다.

[자막 스크립트]
${sampledText}

응답은 반드시 아래의 JSON 스키마 규격을 엄격히 지켜 한국어로만 출력해 주십시오. JSON 이외의 임의의 텍스트 설명은 배제하십시오.
JSON 스키마:
[
  { "startSeconds": 시작시간_초단위_숫자, "chapterTitle": "챕터주제명" }
]
`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    if (!response.ok) throw new Error('Gemini API call failed');
    const result = await response.json();
    const responseText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!responseText) return [{ startSeconds: 0, chapterTitle: '개념 강의 처음부터' }];
    
    return JSON.parse(responseText);
  } catch (err) {
    console.error('⚠️ Gemini AI 타임라인 생성 중 오류 발생:', err.message);
    return [{ startSeconds: 0, chapterTitle: '개념 강의 처음부터' }];
  }
}

/**
 * 4. 분석된 비디오 및 타임라인을 Supabase DB에 적재합니다
 */
async function saveToDatabase(video, chapters) {
  console.log(`💾 DB 적재 중: ${video.title} (${chapters.length}개 챕터)...`);
  
  // 4-1. 강의 마스터 정보 저장
  const { data: lecture, error: lError } = await supabase
    .from('youtube_lectures')
    .upsert({
      video_id: video.videoId,
      title: video.title,
      description: video.description
    }, { onConflict: 'video_id' })
    .select('id')
    .single();

  if (lError) {
    console.error(`❌ 강의 정보 DB 적재 실패:`, lError);
    return;
  }

  // 4-2. 기존 타임라인 데이터 초기화 (재등록 방지)
  await supabase
    .from('youtube_timelines')
    .delete()
    .eq('lecture_id', lecture.id);

  // 4-3. 챕터 타임라인 대량 등록
  const timelineRows = chapters.map(ch => ({
    lecture_id: lecture.id,
    start_seconds: ch.startSeconds,
    chapter_title: ch.chapterTitle
  }));

  const { error: tError } = await supabase
    .from('youtube_timelines')
    .insert(timelineRows);

  if (tError) {
    console.error(`❌ 타임라인 DB 적재 실패:`, tError);
  } else {
    console.log(`✅ DB 저장 완료!`);
  }
}

/**
 * 메인 실행 제어기
 */
async function main() {
  const playlistId = 'PLw8NENAKl4HmkkDFqP-FdqAt48gm4cHiU';
  
  // 실제 연동된 API Key가 있다면 환경 설정에서 읽거나 수동 대입해줍니다.
  const apiKey = process.env.GEMINI_API_KEY || ''; 
  
  try {
    console.log('🚀 유튜브 재생목록 일괄 인덱싱을 시작합니다...');
    const videos = await fetchPlaylistVideos(playlistId);
    console.log(`▶️ 총 ${videos.length}개의 영상을 발견했습니다.\n`);

    for (let i = 0; i < videos.length; i++) {
      const v = videos[i];
      console.log(`--------------------------------------------------`);
      console.log(`[작업 ${i + 1}/${videos.length}] ${v.title} (ID: ${v.videoId})`);
      
      // 1. 자막 가져오기
      console.log(`🔍 자동 자막 긁어오는 중...`);
      const transcript = await fetchVideoTranscript(v.videoId);
      
      let chapters = [];
      if (!transcript) {
        console.log(`⚠️ 자막이 없어 0초 기본 타임라인으로 폴백 설정합니다.`);
        chapters = [{ startSeconds: 0, chapterTitle: '개념 강의 처음부터' }];
      } else {
        console.log(`🤖 Gemini AI에게 자막 분석 요청 중...`);
        chapters = await generateChaptersWithGemini(v.title, transcript, apiKey);
      }
      
      console.log('📌 생성된 타임라인:', chapters);

      // 2. DB 저장
      await saveToDatabase(v, chapters);

      // 3. 차단 방지를 위한 지연시간 (3초 대기)
      if (i < videos.length - 1) {
        console.log(`⏱️ 유튜브 서버 차단 방지를 위해 3초간 대기합니다...`);
        await sleep(3000);
      }
    }

    console.log('\n🎉 모든 재생목록 영상의 인덱싱 및 DB 적재가 끝났습니다!');

  } catch (err) {
    console.error('❌ 크리티컬 에러 발생:', err.message);
  }
}

main();
