// 🧪 MP4 내보내기 시험용 가짜 긴 녹음(관리자). 실제 덱 슬라이드 위에 매 분 8획을 쓰고, 2분마다 슬라이드를 넘기고,
// 1/3·3/4 지점에서 일시정지한 것처럼 음성 클립을 3개로 나눈다. 음성은 매 분 시작에 0.4초 '삐' 소리(싱크 확인용).
// 확인이 끝나면 이 파일과 관리 화면 버튼을 지운다.
import type { InkStroke } from '../exam/contract.ts';
import type { LectureDeck } from './lectureDecks.ts';
import type { RecordingBackend } from './lectureRecordings.ts';
import {
  audioFileName, chunkFileName, createManifest, encodeChunkFile, splitIntoChunks, type TimelineEntry,
} from './lectureRecordingModel.ts';

const RATE = 48_000;
const BEEP_MS = 400;

/** 녹음 시각별 기록: 매 분 8획(1.5초씩 그린 지그재그 글씨), 2분마다 다음 슬라이드. */
export function testRecordingEntries(slideIds: string[], minutes: number): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const counts: Record<string, number> = {};
  for (let m = 0; m < minutes; m++) {
    const slideId = slideIds[Math.floor(m / 2) % slideIds.length];
    if (m % 2 === 0 && m > 0) entries.push({ type: 'slide', at: m * 60_000, slideId });
    for (let k = 0; k < 8; k++) {
      const at = m * 60_000 + 5000 + k * 6000;
      // 슬라이드 오른쪽 빈칸(필기 자리)에, 두 번째 분은 아래쪽 줄에.
      const x0 = 0.55, y = 0.1 + (m % 2) * 0.22 + k * 0.025;
      const points = Array.from({ length: 40 }, (_, i) => ({
        x: +(x0 + i * 0.008).toFixed(5), y: +(y + (i % 2 ? 0.01 : 0)).toFixed(5), pressure: 0.6, t: Math.round(i * 1500 / 39),
      }));
      const index = counts[slideId] = (counts[slideId] ?? 0) + 1;
      const highlight = k === 7;
      const stroke: InkStroke = {
        id: `t${m}-${k}`, tool: highlight ? 'highlighter' : 'pen', color: highlight ? '#facc15' : k % 3 === 2 ? '#dc2626' : '#1f2937',
        size: highlight ? 6 : 4, points,
      };
      entries.push({ type: 'ink', at, slideId, event: { id: `te${m}-${k}`, kind: 'draw', at, removed: [], added: [{ index: index - 1, stroke }] } });
    }
  }
  return entries;
}

/** 녹음 시각 기준 [offsetMs, offsetMs + durationMs)의 음성(WebM Opus). */
async function beepClip(offsetMs: number, durationMs: number): Promise<Blob> {
  const mb = await import('mediabunny');
  const output = new mb.Output({ format: new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
  const source = new mb.AudioBufferSource({ codec: 'opus', quality: mb.QUALITY_MEDIUM });
  output.addAudioTrack(source);
  await output.start();
  const step = 10 * RATE;
  const total = Math.round(durationMs * RATE / 1000);
  for (let s0 = 0; s0 < total; s0 += step) {
    const length = Math.min(step, total - s0);
    const data = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      const ms = offsetMs + (s0 + i) * 1000 / RATE;
      if (ms % 60_000 < BEEP_MS) data[i] = 0.4 * Math.sin(2 * Math.PI * 660 * ms / 1000);
    }
    const buffer = new AudioBuffer({ length, numberOfChannels: 1, sampleRate: RATE });
    buffer.copyToChannel(data, 0);
    await source.add(buffer);
  }
  await output.finalize();
  return new Blob([output.target.buffer!], { type: 'audio/webm' });
}

export async function createTestRecording(backend: RecordingBackend, deck: LectureDeck, minutes: number, onStep?: (text: string) => void) {
  const recordingId = crypto.randomUUID();
  const total = minutes * 60_000;
  const title = `🧪 테스트 녹음 ${minutes}분 (매 분 시작에 삐 소리)`;
  await backend.insertRow({ id: recordingId, deck_id: deck.id, title, duration_ms: 0, status: 'recording' });
  const manifest = createManifest({ recordingId, deckId: deck.id, title, slides: deck.slides, initialSlideId: deck.slides[0].id });

  const cuts = [0, Math.round(total / 3), Math.round(total * 3 / 4), total];
  for (let c = 0; c < 3; c++) {
    onStep?.(`음성 ${c + 1}/3 만드는 중…`);
    const offsetMs = cuts[c], durationMs = cuts[c + 1] - cuts[c];
    const blob = await beepClip(offsetMs, durationMs);
    const file = audioFileName(c + 1, 'audio/webm;codecs=opus');
    await backend.upload(`${recordingId}/${file}`, blob);
    manifest.clips.push({ id: crypto.randomUUID(), offsetMs, durationMs, mime: 'audio/webm;codecs=opus', files: [file], bytes: blob.size });
  }

  onStep?.('필기 기록 올리는 중…');
  for (const chunk of splitIntoChunks(testRecordingEntries(deck.slides.map(s => s.id), minutes), 1)) {
    const { blob, encoding } = await encodeChunkFile(chunk);
    const file = chunkFileName(chunk.seq);
    await backend.upload(`${recordingId}/${file}`, blob);
    manifest.chunks.push({ file, seq: chunk.seq, fromMs: chunk.fromMs, toMs: chunk.toMs, entries: chunk.entries.length, encoding, bytes: blob.size });
  }

  manifest.status = 'done';
  manifest.durationMs = total;
  manifest.updatedAt = new Date().toISOString();
  await backend.upload(`${recordingId}/manifest.json`, new Blob([JSON.stringify(manifest)], { type: 'application/json' }), { cacheControl: '0' });
  await backend.updateRow(recordingId, { duration_ms: total, status: 'done' });
  return recordingId;
}
