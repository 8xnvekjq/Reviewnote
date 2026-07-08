import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  const jsonPath = path.join(__dirname, 'playlist_transcripts.json');
  const outDir = path.join(__dirname, 'transcripts_split');
  
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`📂 총 ${data.length}개의 자막 파일을 개별 텍스트로 분할합니다...`);

  data.forEach((v, idx) => {
    // 자막 텍스트 가독성 높게 포맷팅 (앞쪽 600줄 정도만 축약하여 파일로 저장)
    const formattedText = v.transcript
      .slice(0, 600)
      .map(t => `[${t.time}] ${t.text}`)
      .join('\n');

    const fileContent = `=== VIDEO INFO ===
Index: ${idx + 1}
Video ID: ${v.videoId}
Title: ${v.title}
URL: https://youtu.be/${v.videoId}

=== TRANSCRIPT ===
${formattedText}
`;

    const fileName = `video_${(idx + 1).toString().padStart(2, '0')}_${v.videoId}.txt`;
    fs.writeFileSync(path.join(outDir, fileName), fileContent, 'utf-8');
  });

  console.log(`✅ 분할 성공! transcripts_split 폴더에 저장되었습니다.`);
} catch (e) {
  console.error('❌ 에러:', e.message);
}
