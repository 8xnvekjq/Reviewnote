// scratch/auto_playlist_to_supabase.js
// 사용법: node scratch/auto_playlist_to_supabase.js

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { YoutubeTranscript } from 'youtube-transcript';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 수동 .env 파일 파싱 헬퍼 (dotenv 의존성 제거)
function loadEnv() {
  const envPath = path.join(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const parts = trimmed.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        let val = parts.slice(1).join('=').trim();
        
        // 따옴표 제거
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    }
  }
}
loadEnv();

const GEMINI_API_KEY = process.env.VITE_GEMINI_API_KEY;
const SUPABASE_URL = 'https://wcvkmdvrowljypueucwx.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 사용자님이 전달해주신 재생목록 ID
const PLAYLIST_ID = 'PLw8NENAKl4HmRrlQLRqIMjutRM8da6zv2'; 

function formatSecondsToTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

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

async function fetchPlaylistVideos(playlistId) {
  const url = `https://www.youtube.com/playlist?list=${playlistId}`;
  console.log(`📡 재생목록 분석 및 비디오 탐색 시작: ${url}`);
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
  return [...new Set(videoIds)];
}

async function run() {
  if (!GEMINI_API_KEY) {
    console.error('❌ 에러: .env 파일에 VITE_GEMINI_API_KEY가 세팅되어 있지 않습니다.');
    return;
  }

  try {
    const videoIds = await fetchPlaylistVideos(PLAYLIST_ID);
    console.log(`✅ 재생목록에서 총 ${videoIds.length}개의 영상을 발견했습니다.`);

    if (videoIds.length === 0) {
      console.log('재생목록에서 발견된 비디오가 없습니다.');
      return;
    }

    const sqlFile = path.join(__dirname, '../import_new_youtube_data.sql');
    fs.writeFileSync(sqlFile, `-- ====================================================\n`);
    fs.writeFileSync(sqlFile, `-- NEW PLAYLIST YOUTUBE DATA IMPORT SQL\n`);
    fs.writeFileSync(sqlFile, `-- Generated At: ${new Date().toLocaleString()}\n`);
    fs.writeFileSync(sqlFile, `-- ====================================================\n\n`);

    for (let idx = 0; idx < videoIds.length; idx++) {
      const videoId = videoIds[idx];
      const videoUrl = `https://youtu.be/${videoId}`;
      console.log(`\n--------------------------------------------------`);
      console.log(`[작업 진행 중 ${idx + 1}/${videoIds.length}] ID: ${videoId}`);

      const title = await fetchVideoTitle(videoId);
      console.log(`📝 제목: ${title}`);

      // 과목 자동 판별 (제목 분석)
      let derivedGrade = '기타';
      const matchPool = title.toLowerCase();
      if (matchPool.includes('공수2') || matchPool.includes('공통수학2')) {
        derivedGrade = '공통수학2';
      } else if (matchPool.includes('공수1') || matchPool.includes('공통수학1') || matchPool.includes('고1')) {
        derivedGrade = '공통수학1';
      } else if (matchPool.includes('대수')) {
        derivedGrade = '대수';
      }

      console.log(`📁 추정 과목 분류: ${derivedGrade}`);

      console.log('📥 자막 추출 중...');
      let transcript;
      try {
        transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ko' });
      } catch (err) {
        try {
          transcript = await YoutubeTranscript.fetchTranscript(videoId);
        } catch (fallbackErr) {
          console.warn(`⚠️ [${videoId}] 자막을 찾을 수 없습니다. (0초 기본 폴백 처리)`);
          
          // 자막이 없는 영상에 대한 SQL 추가
          const sqlFallback = `
-- ${title}
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('${videoId}', '${title.replace(/'/g, "''")}', '선생님 추천 개념 강의영상 (${derivedGrade})')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '개념 강의 처음부터'
FROM public.youtube_lectures
WHERE video_id = '${videoId}'
ON CONFLICT DO NOTHING;
\n`;
          fs.appendFileSync(sqlFile, sqlFallback);

          // Supabase 직접 인서트 시도
          try {
            const { data: lData } = await supabase.from('youtube_lectures').upsert({
              video_id: videoId,
              title: title,
              description: `선생님 추천 개념 강의영상 (${derivedGrade})`
            }, { onConflict: 'video_id' }).select();
            
            if (lData && lData[0]) {
              await supabase.from('youtube_timelines').insert({
                lecture_id: lData[0].id,
                start_seconds: 0,
                chapter_title: '개념 강의 처음부터'
              });
              console.log('✅ Supabase DB에 직접 주입 완료!');
            }
          } catch (dbErr) {
            console.log('ℹ️ DB 직접 쓰기 실패 (RLS 활성화 또는 권한 부족). SQL 스크립트 작성으로 진행합니다.');
          }

          continue;
        }
      }

      const sampledText = transcript
        .slice(0, 600)
        .map(t => `[${formatSecondsToTime(Math.floor(t.start))}] ${t.text}`)
        .join('\n');

      console.log('🤖 Gemini AI를 통해 수학 교육과정 챕터 및 타임라인 자동 요약 중...');
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      
      const prompt = `
이 스크립트는 수학 개념 강의 동영상의 자막입니다.
시간 정보와 대화 내용을 바탕으로 주제가 바뀌는 개념별 챕터 시작 시간(초 단위 정수)과 챕터명(한국어 소주제 명칭)을 추출해 주세요.
반드시 고등학교 수학 교육과정 용어를 준수해야 합니다.

[자막 스크립트]
${sampledText}

응답은 다른 안내 멘트나 마크다운 기호 없이 반드시 오직 아래 구조의 JSON Array 형태만 리턴해야 합니다.
[
  { "start_seconds": 0, "chapter_title": "지수법칙 개념 설명" },
  { "start_seconds": 90, "chapter_title": "거듭제곱근의 부호 처리" }
]
`;

      const requestBody = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { 
          responseMimeType: 'application/json'
        }
      };

      try {
        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) throw new Error('Gemini API 응답 에러');

        const result = await response.json();
        const jsonText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!jsonText) throw new Error('Gemini AI의 분석 JSON 데이터가 비어 있습니다.');

        const chapters = JSON.parse(jsonText);
        console.log(`✨ 추출된 챕터 수: ${chapters.length}개`);

        // SQL 작성
        let sql = `
-- ${title}
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('${videoId}', '${title.replace(/'/g, "''")}', '선생님 추천 개념 강의영상 (${derivedGrade})')
ON CONFLICT (video_id) DO NOTHING;
`;

        for (const ch of chapters) {
          sql += `
INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, ${ch.start_seconds}, '${ch.chapter_title.replace(/'/g, "''")}'
FROM public.youtube_lectures
WHERE video_id = '${videoId}'
ON CONFLICT DO NOTHING;
`;
        }
        sql += `\n`;
        fs.appendFileSync(sqlFile, sql);

        // Supabase 직접 주입 시도
        try {
          const { data: lData } = await supabase.from('youtube_lectures').upsert({
            video_id: videoId,
            title: title,
            description: `선생님 추천 개념 강의영상 (${derivedGrade})`
          }, { onConflict: 'video_id' }).select();

          if (lData && lData[0]) {
            const timelinePayloads = chapters.map(ch => ({
              lecture_id: lData[0].id,
              start_seconds: ch.start_seconds,
              chapter_title: ch.chapter_title
            }));
            await supabase.from('youtube_timelines').insert(timelinePayloads);
            console.log('✅ Supabase DB에 직접 주입 완료!');
          }
        } catch (dbErr) {
          // RLS 에러 발생 시 로그 무시하고 파일 적재 계속 진행
        }

      } catch (err) {
        console.error(`⚠️ ${videoId} 분석 중 오류 발생:`, err.message);
        
        const fallbackSql = `
-- ${title} (AI 분석 실패 폴백)
INSERT INTO public.youtube_lectures (video_id, title, description)
VALUES ('${videoId}', '${title.replace(/'/g, "''")}', '선생님 추천 개념 강의영상 (${derivedGrade})')
ON CONFLICT (video_id) DO NOTHING;

INSERT INTO public.youtube_timelines (lecture_id, start_seconds, chapter_title)
SELECT id, 0, '개념 강의 처음부터'
FROM public.youtube_lectures
WHERE video_id = '${videoId}'
ON CONFLICT DO NOTHING;
\n`;
        fs.appendFileSync(sqlFile, fallbackSql);
      }
    }

    console.log(`\n====================================================`);
    console.log(`🎉 모든 유튜브 강의 분석 및 SQL 생성이 완료되었습니다!`);
    console.log(`📂 생성된 SQL 파일: ${sqlFile}`);
    console.log(`💡 RLS 등으로 DB에 직접 저장되지 않은 데이터는 위 SQL 파일을 Supabase SQL Editor에 복사 붙여넣기 하여 원클릭으로 주입하실 수 있습니다.`);
    console.log(`====================================================`);

  } catch (e) {
    console.error('❌ 실행 에러:', e.message);
  }
}

run();
