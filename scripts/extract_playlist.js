import { YoutubeTranscript } from '../node_modules/youtube-transcript/dist/esm/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. LaTeX 수식 변환 함수
function convertToLatexMath(text) {
  if (!text) return text;
  let str = text;

  str = str.replace(/(뿔마|플마|풀마)\s*루트\s*(-?\d+|[a-zA-Z])/g, '$\\pm\\sqrt{$2}$');
  str = str.replace(/(뿔마|플마|풀마)\s*(\d+|[a-zA-Z])/g, '$\\pm $2$');
  str = str.replace(/세제곱근\s*루트\s*(-?\d+|[a-zA-Z])/g, '$\\sqrt[3]{$1}$');
  str = str.replace(/네제곱근\s*루트\s*(-?\d+|[a-zA-Z])/g, '$\\sqrt[4]{$1}$');
  str = str.replace(/5제곱근\s*루트\s*(-?\d+|[a-zA-Z])/g, '$\\sqrt[5]{$1}$');
  str = str.replace(/6제곱근\s*루트\s*(-?\d+|[a-zA-Z])/g, '$\\sqrt[6]{$1}$');
  str = str.replace(/([0-9a-zA-Z]+)제곱근\s*루트\s*(-?\d+|[a-zA-Z])/g, '$\\sqrt[$1]{$2}$');
  str = str.replace(/루트\s*(-?\d+|[a-zA-Z])/g, '$\\sqrt{$1}$');
  str = str.replace(/([0-9a-zA-Z]+)\s*의\s*세제곱/g, '$$1^3$');
  str = str.replace(/([0-9a-zA-Z]+)\s*의\s*네제곱/g, '$$1^4$');
  str = str.replace(/([0-9a-zA-Z]+)\s*의\s*제곱/g, '$$1^2$');
  str = str.replace(/([0-9a-zA-Z]+)\s*의\s*([0-9a-zA-Z]+)제곱/g, '$$1^{$2}$');
  str = str.replace(/\b([a-zA-Z])세제곱\b/g, '$$1^3$');
  str = str.replace(/\b([a-zA-Z])네제곱\b/g, '$$1^4$');
  str = str.replace(/\b([a-zA-Z])제곱\b/g, '$$1^2$');
  str = str.replace(/([0-9a-zA-Z\$\^\{\}\_\-]+)\s*분의\s*([0-9a-zA-Z\$\^\{\}\_\-]+)/g, (match, p1, p2) => {
    const cleanP1 = p1.replace(/\$/g, '');
    const cleanP2 = p2.replace(/\$/g, '');
    return `$\\frac{${cleanP2}}{${cleanP1}}$`;
  });
  str = str.replace(/\$\$+/g, '$');

  return str;
}

// 2. 화자 판별 및 LaTeX 변환 처리
function processTranscriptWithSpeakersAndLatex(transcriptItems) {
  let currentSpeaker = '선생님';
  const continuousParagraphs = [];
  let currentParagraph = { speaker: '선생님', text: '' };

  const studentShortResponses = [
    '네', '네.', '응', '아', '예', '아 맞네요', '아 네', '아 그래요', '어', '어 네', 
    '포기로 바꿔도 돼요', '바꿔도 돼요', '2', '풀마 2', '8', '3', '6', '16', '36', '27',
    '갑평이요?', '그건 모르죠', '수학', '루트 10', '풀마 루트 10', '1', '0'
  ];

  transcriptItems.forEach((item) => {
    let rawText = item.text.trim();
    let hasPrefix = false;

    if (rawText.startsWith('>>')) {
      hasPrefix = true;
      rawText = rawText.replace(/^>>\s*/, '').trim();
    }

    if (hasPrefix) {
      if (currentSpeaker === '선생님') {
        if (studentShortResponses.includes(rawText) || rawText.length <= 15) {
          if (rawText.includes('알았죠') || rawText.includes('어때') || rawText.includes('괜찮아') || rawText.includes('질문')) {
            currentSpeaker = '선생님';
          } else {
            currentSpeaker = '학생';
          }
        } else {
          currentSpeaker = '학생';
        }
      } else {
        currentSpeaker = '선생님';
      }
    } else {
      if (currentSpeaker === '학생' && (rawText.length > 20 || rawText.includes('자,') || rawText.includes('거듭제곱') || rawText.includes('함수'))) {
        currentSpeaker = '선생님';
      }
    }

    const latexText = convertToLatexMath(rawText);

    if (currentParagraph.speaker === currentSpeaker) {
      currentParagraph.text += (currentParagraph.text ? ' ' : '') + latexText;
    } else {
      if (currentParagraph.text) {
        continuousParagraphs.push({ ...currentParagraph });
      }
      currentParagraph = { speaker: currentSpeaker, text: latexText };
    }
  });

  if (currentParagraph.text) {
    continuousParagraphs.push({ ...currentParagraph });
  }

  return { continuousParagraphs };
}

// 3. 재생목록 일괄 추출 메인 함수
export async function extractPlaylist(playlistUrl) {
  if (!playlistUrl) {
    console.error("Usage: node scripts/extract_playlist.js <PLAYLIST_URL>");
    return;
  }

  console.log(`Fetching playlist page: ${playlistUrl}...`);
  const res = await fetch(playlistUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
    }
  });

  if (!res.ok) {
    console.error(`Failed to fetch playlist page: HTTP ${res.status}`);
    return;
  }

  const html = await res.text();
  let playlistTitle = '재생목록_추출';

  const metaTitleMatch = html.match(/<meta name="title" content="([^"]+)">/);
  const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)">/);

  if (ogTitleMatch && ogTitleMatch[1] && ogTitleMatch[1] !== 'YouTube') {
    playlistTitle = ogTitleMatch[1].replace(/ - YouTube$/, '').trim();
  } else if (metaTitleMatch && metaTitleMatch[1]) {
    playlistTitle = metaTitleMatch[1].replace(/ - YouTube$/, '').trim();
  }

  const safePlaylistTitle = playlistTitle.replace(/[\\/:*?"<>|]/g, '_');
  console.log(`Playlist Title: "${playlistTitle}" -> Folder Name: "${safePlaylistTitle}"`);

  const videoMap = new Map();
  const videoIdRegex = /\/watch\?v=([a-zA-Z0-9_-]{11})/g;
  let match;
  while ((match = videoIdRegex.exec(html)) !== null) {
    const vId = match[1];
    if (!videoMap.has(vId)) {
      videoMap.set(vId, `Video_${vId}`);
    }
  }

  const playlistVideoIdRegex = /"playlistVideoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"([^"]+)"\}/g;
  let plMatch;
  while ((plMatch = playlistVideoIdRegex.exec(html)) !== null) {
    videoMap.set(plMatch[1], plMatch[2]);
  }

  const videos = Array.from(videoMap.entries()).map(([vId, title], idx) => ({
    videoId: vId,
    title,
    index: idx + 1
  }));

  console.log(`Found ${videos.length} videos in the playlist.`);
  if (videos.length === 0) return;

  const baseDir = path.resolve(__dirname, '../youtube_scripts');
  const targetFolder = path.join(baseDir, safePlaylistTitle);

  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder, { recursive: true });
  }

  const results = [];

  for (let i = 0; i < videos.length; i++) {
    const item = videos[i];
    const videoUrl = `https://www.youtube.com/watch?v=${item.videoId}`;
    console.log(`\n[${i + 1}/${videos.length}] Processing video: ${item.videoId}...`);

    let title = item.title;
    if (!title || title.startsWith("Video_")) {
      try {
        const oembedRes = await fetch(`https://www.youtube.com/oembed?url=${videoUrl}&format=json`);
        if (oembedRes.ok) {
          const oembedData = await oembedRes.json();
          title = oembedData.title;
        }
      } catch (e) {}
    }

    try {
      const transcript = await YoutubeTranscript.fetchTranscript(item.videoId);
      console.log(`  -> Fetched ${transcript.length} transcript items for: "${title}"`);

      const { continuousParagraphs } = processTranscriptWithSpeakersAndLatex(transcript);

      let continuousTextSection = "## 📖 영상 스크립트\n\n";
      continuousParagraphs.forEach(p => {
        continuousTextSection += `**[${p.speaker}]**: ${p.text}\n\n`;
      });

      const currentDate = new Date().toISOString().split('T')[0];

      const mdContent = `# 📹 ${title}

- **원본 링크**: [${videoUrl}](${videoUrl})
- **Video ID**: \`${item.videoId}\`
- **추출 일시**: ${currentDate}

---

${continuousTextSection}`;

      const safeTitle = `${String(i + 1).padStart(2, '0')}_${title.replace(/[\\/:*?"<>|]/g, '_')}`;
      const filePath = path.join(targetFolder, `${safeTitle}.md`);
      fs.writeFileSync(filePath, mdContent, 'utf-8');

      console.log(`  ✅ Saved: ${filePath}`);
      results.push({ index: i + 1, title, videoId: item.videoId, status: 'SUCCESS', filePath });
    } catch (err) {
      console.error(`  ❌ Failed for ${item.videoId}:`, err.message);
      results.push({ index: i + 1, title, videoId: item.videoId, status: 'FAILED', error: err.message });
    }
  }

  console.log("\n=======================================================");
  console.log(`🎉 Playlist processing complete! (${results.filter(r => r.status === 'SUCCESS').length} succeeded / ${results.filter(r => r.status === 'FAILED').length} failed)`);
  console.log(`Target Folder: ${targetFolder}`);
  console.log("=======================================================");
}

// CLI 실행 처리
const inputUrl = process.argv[2];
if (inputUrl) {
  extractPlaylist(inputUrl);
}
