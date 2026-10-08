// Pixel World 배경음악 루프 한 바퀴를 wav로 뽑는다 — 사람이 직접 들어보고 판단하기 위한 검토용.
// Node에는 Web Audio가 없어서, Vite dev 서버를 잠깐 띄우고 헤드리스 Edge 안에서 실제 엔진
// (src/features/pixel-room/bgm/engine.ts의 renderLoop)을 OfflineAudioContext로 돌린다.
// 출력: scratch/pixel-bgm-preview.wav (.gitignore 대상, 커밋하지 않음)
//
// 사용: npm run bgm:preview            → 실제 앱 음량(마스터 게인 그대로)
//       npm run bgm:preview -- --loud  → 곡 자체를 듣기 편하게 -1 dBFS로 정규화
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const loud = process.argv.includes('--loud');
const output = 'scratch/pixel-bgm-preview.wav';
const server = await createServer({ server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  // 아무 모듈 URL이나 열어 dev 서버와 같은 origin을 얻은 뒤, 그 안에서 엔진을 import한다.
  await page.goto(new URL('/src/features/pixel-room/bgm/song.ts', server.resolvedUrls.local[0]).href);
  const result = await page.evaluate(async loud => {
    const { renderLoop } = await import('/src/features/pixel-room/bgm/engine.ts');
    const buffer = await renderLoop(44100);
    const data = buffer.getChannelData(0);
    let peak = 0, sumSquares = 0;
    for (const sample of data) { peak = Math.max(peak, Math.abs(sample)); sumSquares += sample * sample; }
    const scale = loud && peak > 0 ? 10 ** (-1 / 20) / peak : 1;
    const pcm = new Int16Array(data.length);
    for (let i = 0; i < data.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(data[i] * scale * 32767)));
    let binary = '';
    const bytes = new Uint8Array(pcm.buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { pcm: btoa(binary), sampleRate: buffer.sampleRate, seconds: buffer.duration, peak, rms: Math.sqrt(sumSquares / data.length) };
  }, loud);

  const pcm = Buffer.from(result.pcm, 'base64');
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(result.sampleRate, 24); header.writeUInt32LE(result.sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  await mkdir('scratch', { recursive: true });
  await writeFile(output, Buffer.concat([header, pcm]));
  const db = value => (20 * Math.log10(value)).toFixed(1);
  console.log(`${output}: ${result.seconds.toFixed(1)}s mono ${result.sampleRate}Hz, app-level peak ${db(result.peak)} dBFS, RMS ${db(result.rms)} dBFS${loud ? ' (normalized to -1 dBFS)' : ''}`);
} finally {
  await browser.close();
  await server.close();
}
