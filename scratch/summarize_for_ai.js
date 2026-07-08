import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'transcripts_with_time.json'), 'utf-8'));

let output = '';
for (const video of data) {
  output += `\n=========================================\n`;
  output += `INDEX: ${video.index} | VIDEO_ID: ${video.videoId} | TITLE: ${video.title}\n`;
  output += `=========================================\n`;
  
  let currentGroup = [];
  let groupStart = 0;
  
  for (const item of video.transcript) {
    const sec = item.seconds;
    if (sec >= groupStart + 30) {
      if (currentGroup.length > 0) {
        output += `[${Math.floor(groupStart / 60)}:${(groupStart % 60).toString().padStart(2, '0')}] ${currentGroup.join(' ')}\n`;
      }
      currentGroup = [item.text];
      groupStart = Math.floor(sec / 30) * 30;
    } else {
      currentGroup.push(item.text);
    }
  }
  if (currentGroup.length > 0) {
    output += `[${Math.floor(groupStart / 60)}:${(groupStart % 60).toString().padStart(2, '0')}] ${currentGroup.join(' ')}\n`;
  }
}

fs.writeFileSync(path.join(__dirname, 'grouped_transcripts.txt'), output, 'utf-8');
console.log("Done writing grouped transcripts!");
