import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { YoutubeTranscript } from 'youtube-transcript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputDir = path.join(__dirname, 'transcripts_split');
const outputDir = path.join(__dirname, 'transcripts_timed');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Format seconds to [MM:SS]
function formatSeconds(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `[${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}]`;
}

async function run() {
  const files = fs.readdirSync(inputDir).filter(f => f.startsWith('video_') && f.endsWith('.txt'));
  files.sort();

  // We only process index 1 to 10
  const targetFiles = files.slice(0, 10);
  console.log(`Processing files:`, targetFiles);

  for (const file of targetFiles) {
    const filePath = path.join(inputDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');

    // Parse Video ID and Title from the file header
    const idMatch = content.match(/Video ID:\s*([^\r\n]+)/);
    const titleMatch = content.match(/Title:\s*([^\r\n]+)/);

    if (!idMatch) {
      console.warn(`No Video ID found in ${file}`);
      continue;
    }

    const videoId = idMatch[1].trim();
    const title = titleMatch ? titleMatch[1].trim() : 'Unknown';

    console.log(`Fetching transcript for ${videoId} (${title})...`);

    let transcript = [];
    try {
      transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ko' });
    } catch (err) {
      try {
        transcript = await YoutubeTranscript.fetchTranscript(videoId);
      } catch (err2) {
        console.error(`Failed to fetch transcript for ${videoId}:`, err2.message);
        continue;
      }
    }

    // Format the transcript with correct offsets
    const formattedLines = transcript.map(t => {
      const sec = Math.floor(t.offset / 1000);
      return `${formatSeconds(sec)} (${sec}s) ${t.text}`;
    });

    const outContent = `=== VIDEO INFO ===
Video ID: ${videoId}
Title: ${title}

=== TRANSCRIPT ===
${formattedLines.join('\n')}
`;

    const outPath = path.join(outputDir, file.replace('.txt', '_timed.txt'));
    fs.writeFileSync(outPath, outContent, 'utf-8');
    console.log(`Saved timed transcript to ${outPath}`);
  }
}

run().catch(e => console.error('Global error:', e));
