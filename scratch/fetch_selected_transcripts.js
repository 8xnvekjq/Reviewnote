import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { YoutubeTranscript } from 'youtube-transcript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const videos = [
  { index: 21, videoId: "ksobN_pSjCs", title: "8/7 고2 목토 (미분(다항식미분, 합미분, 곱미분))" },
  { index: 22, videoId: "ddN4A0zi-K4", title: "7/31 고2 목토 (미분(미분가능성과 연속성))" },
  { index: 23, videoId: "7ZJinBn0ii0", title: "8/2 고2 목토 (미분(미분가능성과 연속성 문제풀이))" },
  { index: 24, videoId: "iuDBwmB2ARQ", title: "8/9 고2 목토 (미분(곱미분 활용, 극대극소))" },
  { index: 25, videoId: "8wGvZFewUCE", title: "8/14 고2 목토 (미분(극대극소와 그래프))" },
  { index: 26, videoId: "qTEhp30HPwQ", title: "8/16 고2 목토 (미분(삼차함수 비율관계))" },
  { index: 27, videoId: "qlNs1_2tFU0", title: "8/21 고2 목토 (미분(극대극소 문제풀이, 방정식 부등식의 활용))" },
  { index: 28, videoId: "ByIqHITpk7I", title: "8/23 고2 목토 (미분(방정식 부등식의 활용 문제풀이, 속도와 가속도))" },
  { index: 29, videoId: "dQl94nMHqgg", title: "8/28 고2 목토 (미분(속도와 가속도 문제풀이), 적분(부정적분))" },
  { index: 30, videoId: "uDQIoXSRZD0", title: "8/30 고2 목토 (적분(정적분))" },
  { index: 31, videoId: "nKD-uFMiVLI", title: "9/4 고2 목토 (적분(정적분의 기하학적 의미))" }
];

async function run() {
  const results = [];
  for (const video of videos) {
    console.log(`Fetching ${video.index}: ${video.title} (${video.videoId})...`);
    let transcript = [];
    try {
      transcript = await YoutubeTranscript.fetchTranscript(video.videoId, { lang: 'ko' });
    } catch (e) {
      try {
        transcript = await YoutubeTranscript.fetchTranscript(video.videoId);
      } catch (err) {
        console.error(`Failed to fetch ${video.videoId}:`, err.message);
      }
    }

    const cleanTranscript = transcript.map(t => ({
      seconds: Math.floor(t.offset / 1000),
      text: t.text
    }));

    results.push({
      index: video.index,
      videoId: video.videoId,
      title: video.title,
      transcript: cleanTranscript
    });
  }

  fs.writeFileSync(
    path.join(__dirname, 'transcripts_with_time.json'),
    JSON.stringify(results, null, 2),
    'utf-8'
  );
  console.log("Done!");
}

run();
