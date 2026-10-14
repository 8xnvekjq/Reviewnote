import type { SupabaseClient } from '@supabase/supabase-js';
import type { GradeLevel } from '../../components/SlideListModal';

// 교재 스캔 슬라이드 덱. 이미지는 비공개 버킷, DB에는 덱 정보와 슬라이드 목록만 둔다.
export const LECTURE_BUCKET = 'lecture-slides';
export const LECTURE_GRADES: GradeLevel[] = ['예비고1', '고1', '고2', '고3'];
/** 슬라이드 좌표계. 이후 수업 녹화의 필기도 이 공간(1920×1080) 기준으로 저장한다. */
export const SLIDE_WIDTH = 1920;
export const SLIDE_HEIGHT = 1080;
export const MAX_SLIDE_BYTES = 5 * 1024 * 1024;
export const TOC_FILE = '목차.json';

export interface LectureTocSlide { no: number; file: string; section: string; label: string; bookPage: number | null }
export interface LectureToc { book: string; chapter: string; slides: LectureTocSlide[] }
export interface LectureSlide { id: string; path: string; section: string; label: string; bookPage: number | null }
export interface LectureDeck {
  id: string; title: string; grade: GradeLevel; book: string; chapter: string;
  slides: LectureSlide[]; created_at: string; published: boolean;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const SLIDE_PATH = new RegExp(`^${UUID}/${UUID}\\.(webp|png|jpg)$`, 'i');
const IMAGE_FILE = /\.(png|webp|jpe?g)$/i;

/** 안드로이드/맥에서 한글 파일명이 자모 분리(NFD)로 들어오는 경우를 맞춘다. */
export const normalizeName = (name: string) => name.normalize('NFC').split(/[\\/]/).pop() ?? '';

const text = (value: unknown, field: string, max = 100): string => {
  if (typeof value !== 'string') throw new Error(`목차.json의 ${field} 값이 문자열이 아닙니다.`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error(`목차.json의 ${field} 값이 너무 깁니다.`);
  return trimmed;
};

/** 목차.json을 검사하고 슬라이드를 번호 순으로 정렬해 돌려준다. */
export function parseLectureToc(raw: unknown): LectureToc {
  const data = typeof raw === 'string' ? (() => {
    try { return JSON.parse(raw.replace(/^﻿/, '')); } catch { throw new Error('목차.json을 읽을 수 없습니다. JSON 형식을 확인해 주세요.'); }
  })() : raw;
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('목차.json 형식이 올바르지 않습니다.');
  const obj = data as Record<string, unknown>;
  const book = text(obj.book ?? '', 'book');
  const chapter = text(obj.chapter ?? '', 'chapter');
  if (!Array.isArray(obj.slides) || !obj.slides.length) throw new Error('목차.json에 slides 목록이 없습니다.');
  if (obj.slides.length > 300) throw new Error('슬라이드는 한 덱에 300장까지 올릴 수 있습니다.');
  const nos = new Set<number>(), files = new Set<string>();
  const slides = obj.slides.map((item, i): LectureTocSlide => {
    if (!item || typeof item !== 'object') throw new Error(`${i + 1}번째 슬라이드 항목이 올바르지 않습니다.`);
    const s = item as Record<string, unknown>;
    const no = s.no;
    if (typeof no !== 'number' || !Number.isInteger(no) || no < 1) throw new Error(`${i + 1}번째 슬라이드의 no가 올바르지 않습니다.`);
    if (nos.has(no)) throw new Error(`슬라이드 번호 ${no}가 중복되었습니다.`);
    nos.add(no);
    const file = normalizeName(text(s.file, `${no}번 file`, 200));
    if (!IMAGE_FILE.test(file)) throw new Error(`${no}번 슬라이드 파일(${file})이 PNG/WebP/JPEG가 아닙니다.`);
    if (files.has(file)) throw new Error(`슬라이드 파일 ${file}이 중복되었습니다.`);
    files.add(file);
    const page = s.bookPage;
    if (page != null && (typeof page !== 'number' || !Number.isInteger(page) || page < 1 || page > 9999)) {
      throw new Error(`${no}번 슬라이드의 bookPage가 올바르지 않습니다.`);
    }
    return { no, file, section: text(s.section ?? '', `${no}번 section`), label: text(s.label ?? '', `${no}번 label`) || file.replace(IMAGE_FILE, ''), bookPage: page ?? null };
  });
  slides.sort((a, b) => a.no - b.no);
  return { book, chapter, slides };
}

/** 선택한 파일에서 목차의 슬라이드 파일을 순서대로 찾는다. 없는 파일은 missing으로 알린다. */
export function matchTocFiles<F extends { name: string }>(toc: LectureToc, files: F[]): { matched: { slide: LectureTocSlide; file: F }[]; missing: string[] } {
  const byName = new Map(files.map(file => [normalizeName(file.name), file]));
  const matched: { slide: LectureTocSlide; file: F }[] = [], missing: string[] = [];
  for (const slide of toc.slides) {
    const file = byName.get(slide.file);
    if (file) matched.push({ slide, file }); else missing.push(slide.file);
  }
  return { matched, missing };
}

export const findTocFile = <F extends { name: string }>(files: F[]) => files.find(file => normalizeName(file.name) === TOC_FILE);

/** 교재 이름으로 학년을 미리 고른다(선생님이 바꿀 수 있다). */
export function guessGrade(book: string): GradeLevel {
  if (/미적분|수학\s*[ⅠⅡ12]|확률|기하|대수/.test(book.replace(/공통수학/g, ''))) return '고2';
  return '고1';
}

export function defaultDeckTitle(toc: LectureToc): string {
  const pages = toc.slides.map(s => s.bookPage).filter((p): p is number => p != null);
  const range = pages.length ? ` (p${Math.min(...pages)}~${Math.max(...pages)})` : '';
  return `${[toc.book, toc.chapter].filter(Boolean).join(' - ') || '교재 슬라이드'}${range}`;
}

/** 목차 패널용: 같은 section이 이어지는 슬라이드를 묶는다(번호는 0부터). */
export function groupSlidesBySection(slides: Pick<LectureSlide, 'section'>[]): { section: string; indexes: number[] }[] {
  const groups: { section: string; indexes: number[] }[] = [];
  slides.forEach((slide, i) => {
    const last = groups[groups.length - 1];
    if (last && last.section === slide.section) last.indexes.push(i);
    else groups.push({ section: slide.section, indexes: [i] });
  });
  return groups;
}

export const isLectureSlidePath = (path: string) => SLIDE_PATH.test(path);

// ── 이미지 변환 (브라우저 전용) ───────────────────────────────────────────────
/**
 * PNG는 Chrome에서 품질 1.0 WebP(무손실)로 바꿔 글자 선명도는 그대로 두고 용량만 줄인다.
 * 무손실 WebP가 더 크거나 WebP 인코딩이 안 되는 브라우저면 원본을 그대로 올린다.
 */
export async function encodeLectureSlide(file: Blob): Promise<Blob> {
  if (file.type === 'image/webp' || file.type === 'image/jpeg') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { bitmap.close(); return file; }
    ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const webp = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 1));
    canvas.width = canvas.height = 0;
    return webp?.type === 'image/webp' && webp.size > 0 && webp.size < file.size ? webp : file;
  } catch { return file; }
}

const extensionOf = (blob: Blob) => blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : 'png';

export interface UploadProgress { done: number; total: number; originalBytes: number; uploadedBytes: number }

/**
 * 슬라이드를 몇 장씩 나눠 올린 뒤 덱 행을 넣는다. 다시 올리면 항상 새 덱(새 id)이 생기고,
 * 이전 덱은 목록에서 직접 삭제한다. 중간 실패 시 이번에 올린 파일은 지운다.
 */
export async function uploadLectureDeck(client: SupabaseClient, input: {
  toc: LectureToc; files: { slide: LectureTocSlide; file: Blob }[]; title: string; grade: GradeLevel;
}, onProgress?: (p: UploadProgress) => void, options: { concurrency?: number; encode?: (file: Blob) => Promise<Blob> } = {}): Promise<LectureDeck> {
  const { concurrency = 3, encode = encodeLectureSlide } = options;
  const title = input.title.trim();
  if (!title) throw new Error('제목을 입력해 주세요.');
  if (!LECTURE_GRADES.includes(input.grade)) throw new Error('학년을 골라 주세요.');
  if (!input.files.length) throw new Error('올릴 슬라이드가 없습니다.');
  const deckId = crypto.randomUUID();
  const bucket = client.storage.from(LECTURE_BUCKET);
  const slides: LectureSlide[] = new Array(input.files.length);
  const uploaded: string[] = [];
  const progress: UploadProgress = { done: 0, total: input.files.length, originalBytes: 0, uploadedBytes: 0 };
  onProgress?.({ ...progress });
  let next = 0, failed = false;
  const worker = async () => {
    while (!failed && next < input.files.length) {
      const index = next++;
      const { slide, file } = input.files[index];
      const blob = await encode(file);
      if (blob.size > MAX_SLIDE_BYTES) throw new Error(`${slide.file}이 5MB를 넘습니다.`);
      const id = crypto.randomUUID();
      const path = `${deckId}/${id}.${extensionOf(blob)}`;
      const { error } = await bucket.upload(path, blob, { contentType: blob.type || 'image/png', upsert: false });
      if (error) throw error;
      uploaded.push(path);
      slides[index] = { id, path, section: slide.section, label: slide.label, bookPage: slide.bookPage };
      progress.done++; progress.originalBytes += file.size; progress.uploadedBytes += blob.size;
      onProgress?.({ ...progress });
    }
  };
  try {
    // 하나가 실패해도 진행 중인 업로드가 끝난 뒤에 정리해야 남는 파일이 없다.
    const results = await Promise.allSettled(Array.from({ length: Math.min(concurrency, input.files.length) },
      () => worker().catch(error => { failed = true; throw error; })));
    const rejected = results.find((r): r is PromiseRejectedResult => r.status === 'rejected');
    if (rejected) throw rejected.reason;
    const row = { id: deckId, title, grade: input.grade, book: input.toc.book, chapter: input.toc.chapter, slides };
    const { error } = await client.from('lecture_decks').insert(row);
    if (error) throw error;
    return { ...row, created_at: new Date().toISOString(), published: false };
  } catch (error) {
    if (uploaded.length) await bucket.remove(uploaded).catch(() => undefined);
    throw error;
  }
}

export async function listLectureDecks(client: SupabaseClient): Promise<LectureDeck[]> {
  const { data, error } = await client.from('lecture_decks')
    .select('id,title,grade,book,chapter,slides,created_at,published').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LectureDeck[];
}

export async function deleteLectureDeck(client: SupabaseClient, deck: Pick<LectureDeck, 'id' | 'slides'>): Promise<void> {
  const { error } = await client.from('lecture_decks').delete().eq('id', deck.id);
  if (error) throw error;
  const paths = deck.slides.map(s => s.path).filter(isLectureSlidePath);
  if (paths.length) {
    const { error: removeError } = await client.storage.from(LECTURE_BUCKET).remove(paths);
    if (removeError) console.warn('[lecture] 슬라이드 파일 삭제 실패:', removeError.message);
  }
}

// 덱을 열 때 한 번에 서명 주소를 받고, 만료 전까지 재사용한다.
const signed = new WeakMap<SupabaseClient, Map<string, { url: string; expires: number }>>();
export async function resolveLectureSlideUrls(client: SupabaseClient, slides: Pick<LectureSlide, 'path'>[]): Promise<string[]> {
  let cache = signed.get(client);
  if (!cache) { cache = new Map(); signed.set(client, cache); }
  const now = Date.now();
  const missing = [...new Set(slides.map(s => s.path))].filter(path => isLectureSlidePath(path) && (cache.get(path)?.expires ?? 0) <= now);
  if (missing.length) {
    const { data, error } = await client.storage.from(LECTURE_BUCKET).createSignedUrls(missing, 6 * 3600);
    if (error) throw error;
    for (const item of data ?? []) if (item.path && item.signedUrl && !item.error) cache.set(item.path, { url: item.signedUrl, expires: now + 5.5 * 3600 * 1000 });
  }
  return slides.map(s => cache.get(s.path)?.url ?? '');
}
