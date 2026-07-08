// scratch/auto_youtube_timeline.js
// 유튜브 영상 링크 목록을 넣으면 자동으로 자막을 추출하고, 
// Gemini API를 통해 사용자님이 원하시는 형태의 타임라인 텍스트 및 DB 인서트용 SQL을 생성해주는 스크립트입니다.
//
// [실행 방법]
// 1. .env 파일에 VITE_GEMINI_API_KEY가 등록되어 있어야 합니다.
// 2. 터미널에서 실행: node scratch/auto_youtube_timeline.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { YoutubeTranscript } from 'youtube-transcript';
import dotenv from 'dotenv';

// __dirname 설정 (ES 모듈 대응)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env 로드
dotenv.config({ path: path.join(__dirname, '../.env') });

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;

// ----------------------------------------------------------------------
// [설정] 분석하고자 하는 유튜브 동영상 링크 목록을 여기에 넣으세요!
// 단일 링크 형태 또는 재생목록 ID 형태 둘 다 지원합니다.
// ----------------------------------------------------------------------
const VIDEO_LINKS = [
  'https://youtu.be/B6VRprbvYhw', // 여기에 링크들을 자유롭게 나열하면 됩니다.
  'https://youtu.be/byOHdeGoGXo',
  // ... 추가하고 싶은 유튜브 링크들을 배열로 적어주시면 됩니다.
];

// 만약 특정 재생목록 전체를 한 번에 가져와서 처리하고 싶다면 아래에 재생목록 ID를 넣으세요.
// (예: PLw8NENAKl4HmkkDFqP-FdqAt48gm4cHiU)
const PLAYLIST_ID = ''; 

// ----------------------------------------------------------------------
// 시간 포맷 변환 헬퍼 (초 -> 분:초)
// ----------------------------------------------------------------------
function formatSecondsToTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// 링크에서 Video ID 추출
function extractVideoId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// 유튜브 동영상 제목 가져오기 (오픈 크롤링 우회)
async function fetchVideoTitle(videoId) {
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await response.text();
    const titleMatch = html.match(/<title>(.*?)<\/title>/);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].replace(' - YouTube', '').trim();
    }
  } catch (err) {
    console.error(`⚠️ 제목 가져오기 실패 (Video ID: ${videoId}):`, err.message);
  }
  return `유튜브 영상 (${videoId})`;
}

// 재생목록 내의 비디오 목록 긁어오기
async function fetchPlaylistVideos(playlistId) {
  const url = `https://www.youtube.com/playlist?list=${playlistId}`;
  console.log(`📡 재생목록 분석 중: ${url}`);
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const html = await response.text();
  const videoIds = [];
  const regex = /"playlistVideoRenderer":\s*\{"videoId":"([a-zA-Z0-9_-]{11})"/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    videoIds.push(match[1]);
  }
  return [...new Set(videoIds)]; // 중복 제거
}

// ----------------------------------------------------------------------
// 메인 프로세스
// ----------------------------------------------------------------------
async function run() {
  if (!GEMINI_API_KEY) {
    console.error('❌ 에러: .env 파일에 VITE_GEMINI_API_KEY가 세팅되어 있지 않습니다.');
    return;
  }

  let targetVideoIds = [];

  // 1. 재생목록 설정 시 재생목록 비디오 ID 추출
  if (PLAYLIST_ID) {
    console.log(`🔍 재생목록 [${PLAYLIST_ID}] 분석 시작...`);
    try {
      targetVideoIds = await fetchPlaylistVideos(PLAYLIST_ID);
      console.log(`✅ 재생목록에서 총 ${targetVideoIds.length}개의 영상을 찾았습니다.`);
    } catch (e) {
      console.error('❌ 재생목록을 긁어오지 못했습니다:', e.message);
    }
  }

  // 2. 단일 링크 목록에서 비디오 ID 추출
  if (targetVideoIds.length === 0) {
    targetVideoIds = VIDEO_LINKS.map(link => extractVideoId(link)).filter(id => id !== null);
  }

  if (targetVideoIds.length === 0) {
    console.log('ℹ️ 분석할 동영상 링크나 재생목록 ID가 존재하지 않습니다.');
    console.log('auto_youtube_timeline.js 파일 내부의 VIDEO_LINKS 또는 PLAYLIST_ID 변수를 수정해 주세요.');
    return;
  }

  const outputFilePath = path.join(__dirname, '../extracted_timelines.txt');
  fs.writeFileSync(outputFilePath, `=== 유튜브 자막 자동 분석 타임라인 결과 (${new Date().toLocaleDateString()}) ===\n\n`);

  console.log(`🚀 총 ${targetVideoIds.length}개의 영상을 분석합니다...`);

  for (let idx = 0; idx < targetVideoIds.length; idx++) {
    const videoId = targetVideoIds[idx];
    const videoUrl = `https://youtu.be/${videoId}`;
    console.log(`\n==================================================`);
    console.log(`[분석 중 ${idx + 1}/${targetVideoIds.length}] ID: ${videoId}`);
    
    // 1. 동영상 제목 조회
    const title = await fetchVideoTitle(videoId);
    console.log(`📝 제목: ${title}`);

    // 2. 자막 다운로드
    console.log('📥 자막 추출 중...');
    let transcript;
    try {
      transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ko' });
    } catch (err) {
      try {
        transcript = await YoutubeTranscript.fetchTranscript(videoId);
      } catch (fallbackErr) {
        console.warn(`⚠️ [${videoId}] 자막 추출에 실패했습니다 (자막 비활성화 영상).`);
        
        // 자막이 없는 경우 대체 텍스트 작성
        const failText = `동영상 제목 : ${title}\n내용 타임라인 :\n(자막이 제공되지 않아 타임라인을 자동 생성하지 못했습니다. 수동 확인 필요)\n동영상 링크 : ${videoUrl}\n\n`;
        fs.appendFileSync(outputFilePath, failText);
        continue;
      }
    }

    if (!transcript || transcript.length === 0) {
      console.warn('⚠️ 자막 내용이 비어있습니다.');
      continue;
    }

    // 3. 자막 텍스트 샘플링 (Gemini 토큰 한도 절약)
    const sampledText = transcript
      .slice(0, 600)
      .map(t => `[${formatSecondsToTime(Math.floor(t.start))}] ${t.text}`)
      .join('\n');

    // 4. Gemini API를 이용한 챕터 가공 및 포맷팅
    console.log('🤖 Gemini AI 분석 및 포맷팅 중...');
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
    
    const prompt = `
이 스크립트는 수학 강의 동영상 자막입니다.
자막 텍스트와 시간 정보를 분석하여 강의 내용 주제가 전환되는 주요 타임라인(시작 시간)을 3~8개의 핵심 단원/소주제 챕터로 정리해 주세요.
반드시 고등학교 수학 개념 기준(예: "지수법칙", "로그의 성질")에 입각하여 챕터를 정의하십시오.

[자막 스크립트]
${sampledText}

응답은 반드시 아래에 제시한 텍스트 템플릿 포맷을 한 글자도 어긋나지 않게 철저히 지켜 한국어로만 출력해야 합니다.
마크다운 서식이나 추가 설명, 앞뒤의 안내 멘트(예: "여기 타임라인입니다") 등을 절대 출력하지 말고 오직 템플릿 텍스트만 리턴하십시오.

[출력 템플릿 포맷]
동영상 제목 : ${title}

내용 타임라인 :
(여기에 "분:초: 챕터설명" 목록을 작성하세요. 예:
0:00: 수업 시작 및 도입
1:30: 지수법칙 개념)

동영상 링크 : ${videoUrl}
`;

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'text/plain' }
    };

    try {
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) throw new Error('Gemini API 응답 실패');

      const result = await response.json();
      const outputText = result?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (outputText) {
        fs.appendFileSync(outputFilePath, outputText.trim() + '\n\n\n');
        console.log('✨ 분석 및 파일 저장 완료!');
      } else {
        throw new Error('응답 텍스트 유실');
      }

    } catch (gErr) {
      console.error('❌ Gemini API 호출 및 가공 오류:', gErr.message);
      // API 실패 시 기본 포맷으로 저장
      const failText = `동영상 제목 : ${title}\n내용 타임라인 :\n0:00: 개념 강의 처음부터 (AI 분석 실패로 인한 임시 0초 지정)\n동영상 링크 : ${videoUrl}\n\n`;
      fs.appendFileSync(outputFilePath, failText);
    }
  }

  console.log(`\n==================================================`);
  console.log(`🎉 모든 분석 작업이 종료되었습니다!`);
  console.log(`📁 결과 파일: ${outputFilePath}`);
  console.log(`==================================================`);
}

run();
