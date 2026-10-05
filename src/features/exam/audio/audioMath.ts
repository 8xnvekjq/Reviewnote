import type { SolutionAudioClip } from '../contract.ts';

export const AUDIO_SPLIT_BYTES = 45 * 1024 * 1024;
export const AUDIO_MAX_BYTES = 50 * 1024 * 1024;
export const AUDIO_TIMESLICE_MS = 10000;
export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: 1, sampleRate: 48000, noiseSuppression: true,
  autoGainControl: true, echoCancellation: false,
};

export function chooseAudioFormat(supports: (mime: string) => boolean) {
  if (supports('audio/webm;codecs=opus')) return { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 48000 };
  if (supports('audio/mp4')) return { mimeType: 'audio/mp4', audioBitsPerSecond: 96000 };
  return null;
}

export function audioExtension(mime: string) { return mime.startsWith('audio/webm') ? 'webm' : 'm4a'; }
export function shouldSplitAudio(size: number, threshold = AUDIO_SPLIT_BYTES) { return size >= threshold; }
export function isAudioObjectDuplicate(error: { status?: number; statusCode?: string }) {
  return error.status === 409 || ['409', 'Duplicate', 'ResourceAlreadyExists'].includes(error.statusCode ?? '');
}

/** 음성 시작이 첫 획보다 빨라도 잘리지 않도록 전체 시계의 시작을 앞당긴다. */
export function audioTimelineBounds(clips: readonly SolutionAudioClip[], firstStrokeStart = 0) {
  const start = Math.min(0, firstStrokeStart, ...clips.map(clip => clip.offsetMs));
  const end = Math.max(0, ...clips.map(clip => clip.offsetMs + clip.durationMs));
  return { shift: -start, end: end - start };
}

export function clipPosition(clip: SolutionAudioClip, timeMs: number, shift: number) {
  const elapsed = timeMs - shift - clip.offsetMs;
  return { active: elapsed >= 0 && elapsed < clip.durationMs, seconds: Math.max(0, Math.min(clip.durationMs, elapsed)) / 1000 };
}
