import type { SupabaseClient } from '@supabase/supabase-js';
import type { SolutionAudioClip } from '../exam/contract.ts';
import {
  RECORDING_BUCKET, buildLectureReplay, decodeChunkFile, mergeChunks, parseManifest,
  type LectureRecordingManifest, type LectureReplay, type RecordingStatus, type TimelineEntry,
} from './lectureRecordingModel.ts';

// 녹음 파일은 비공개 버킷(lecture-recordings/<recordingId>/...)에, 목록용으로 작은 행(lecture_recordings)만 DB에 둔다.
export interface LectureRecordingRow {
  id: string; deck_id: string; title: string; created_at: string; duration_ms: number; status: RecordingStatus;
}

/** 녹음 세션이 쓰는 저장소(테스트에서는 가짜로 바꾼다). */
export interface RecordingBackend {
  upload(path: string, blob: Blob, options?: { cacheControl?: string }): Promise<void>;
  insertRow(row: Omit<LectureRecordingRow, 'created_at'>): Promise<void>;
  updateRow(id: string, patch: Partial<Pick<LectureRecordingRow, 'duration_ms' | 'status' | 'title'>>): Promise<void>;
}

const RECORDING_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;

export function supabaseRecordingBackend(client: SupabaseClient): RecordingBackend {
  return {
    async upload(path, blob, options) {
      if (!RECORDING_PATH.test(path)) throw new Error('잘못된 녹음 경로');
      // 같은 이름으로 다시 올려도(재시도·manifest 갱신) 되게 upsert.
      const { error } = await client.storage.from(RECORDING_BUCKET).upload(path, blob, {
        upsert: true, contentType: blob.type || 'application/octet-stream', cacheControl: options?.cacheControl ?? '3600',
      });
      if (error) throw error;
    },
    async insertRow(row) {
      const { error } = await client.from('lecture_recordings').insert(row);
      if (error) throw error;
    },
    async updateRow(id, patch) {
      const { error } = await client.from('lecture_recordings').update(patch).eq('id', id);
      if (error) throw error;
    },
  };
}

export async function listLectureRecordings(client: SupabaseClient, deckId: string): Promise<LectureRecordingRow[]> {
  const { data, error } = await client.from('lecture_recordings')
    .select('id,deck_id,title,created_at,duration_ms,status').eq('deck_id', deckId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LectureRecordingRow[];
}

/** 녹음 폴더의 파일을 모두 지운 뒤 행을 지운다(manifest에 아직 안 적힌 조각까지). */
export async function deleteLectureRecording(client: SupabaseClient, id: string): Promise<void> {
  const bucket = client.storage.from(RECORDING_BUCKET);
  for (;;) {
    const { data, error } = await bucket.list(id, { limit: 1000 });
    if (error) throw error;
    const paths = (data ?? []).map(item => `${id}/${item.name}`);
    if (!paths.length) break;
    const { error: removeError } = await bucket.remove(paths);
    if (removeError) throw removeError;
    if (paths.length < 1000) break;
  }
  const { error } = await client.from('lecture_recordings').delete().eq('id', id);
  if (error) throw error;
}

/** 덱을 지울 때 그 덱의 녹음도 함께 지운다. */
export async function deleteDeckRecordings(client: SupabaseClient, deckId: string): Promise<void> {
  for (const row of await listLectureRecordings(client, deckId)) await deleteLectureRecording(client, row.id);
}

export interface LoadedRecording {
  manifest: LectureRecordingManifest;
  entries: TimelineEntry[];
  replay: LectureReplay;
  /** 재생용 음성(클립 조각을 이어 붙인 blob 주소). */
  clips: SolutionAudioClip[];
  /** 닫을 때 blob 주소를 정리한다. */
  release(): void;
}

/** 저장된 파일만으로 녹음을 다시 연다. */
export async function loadLectureRecording(client: SupabaseClient, id: string): Promise<LoadedRecording> {
  const bucket = client.storage.from(RECORDING_BUCKET);
  const get = async (name: string, fresh = false) => {
    const { data, error } = await bucket.download(`${id}/${name}`, fresh ? { cacheNonce: String(Date.now()) } : undefined);
    if (error || !data) throw error ?? new Error(`${name}을 받지 못했습니다.`);
    return data;
  };
  const manifest = parseManifest(await (await get('manifest.json', true)).text());
  const chunks = await Promise.all(manifest.chunks.map(async chunk => decodeChunkFile(await get(chunk.file), chunk.encoding)));
  const entries = mergeChunks(chunks);
  const urls: string[] = [];
  const clips: SolutionAudioClip[] = [];
  try {
    for (const clip of manifest.clips) {
      if (!clip.files.length) continue;
      const parts = await Promise.all(clip.files.map(file => get(file)));
      const url = URL.createObjectURL(new Blob(parts, { type: clip.mime }));
      urls.push(url);
      clips.push({ id: clip.id, offsetMs: clip.offsetMs, durationMs: clip.durationMs, mime: clip.mime,
        sizeBytes: parts.reduce((sum, part) => sum + part.size, 0), storagePath: `${id}/${clip.files[0]}`, url });
    }
  } catch (error) { urls.forEach(url => URL.revokeObjectURL(url)); throw error; }
  return { manifest, entries, replay: buildLectureReplay(manifest, entries), clips, release: () => urls.forEach(url => URL.revokeObjectURL(url)) };
}
