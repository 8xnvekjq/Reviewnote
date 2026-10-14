import type { SupabaseClient } from '@supabase/supabase-js';

export const IMAGE_BUCKET = 'scaffolding-images';
const PREFIX = `storage:${IMAGE_BUCKET}/`;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PATH = new RegExp(`^${UUID}/${UUID}/${UUID}\\.(webp|jpg)$`, 'i');

export function parseScaffoldingRef(value: string): string | null {
  const path = value.startsWith(PREFIX) ? value.slice(PREFIX.length) : '';
  return PATH.test(path) ? path : null;
}

// 클라이언트별 캐시를 사용하고 만료 전에 갱신한다.
const caches = new WeakMap<SupabaseClient, Map<string, { url: string; expires: number }>>();
export function clearScaffoldingImageCache(client: SupabaseClient): void { caches.delete(client); }
export async function resolveScaffoldingImages<T extends { image_url: string }>(client: SupabaseClient, rows: T[]): Promise<T[]> {
  let cache = caches.get(client);
  if (!cache) { cache = new Map(); caches.set(client, cache); }
  const now = Date.now();
  for (const [path, item] of cache) if (item.expires <= now) cache.delete(path);
  const paths = [...new Set(rows.map(row => parseScaffoldingRef(row.image_url)).filter((path): path is string => !!path))];
  const missing = paths.filter(path => !cache.has(path));
  if (missing.length) {
    const { data, error } = await client.storage.from(IMAGE_BUCKET).createSignedUrls(missing, 3600);
    if (error) throw error;
    for (const item of data ?? []) {
      if (!item.path || !item.signedUrl || item.error) throw new Error('이미지 접근 주소를 만들지 못했습니다.');
      cache.set(item.path, { url: item.signedUrl, expires: now + 55 * 60 * 1000 });
    }
  }
  return rows.map(row => ({ ...row, image_url: row.image_url.startsWith('storage:')
    ? cache.get(parseScaffoldingRef(row.image_url) ?? '')?.url ?? '' : row.image_url }));
}

async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('빈 이미지입니다.');
    return image;
  } finally { URL.revokeObjectURL(url); }
}

export async function compressScaffoldingImage(source: Blob | string): Promise<Blob> {
  const blob = typeof source === 'string' ? await (await fetch(source)).blob() : source;
  const image = await loadImage(blob);
  const ratio = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이미지를 압축할 수 없습니다.');
  // 투명 필기도 JPEG 대체 인코딩에서 흰 배경으로 보존한다.
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const encode = (type: string) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, 0.8));
  let encoded = await encode('image/webp');
  if (encoded?.type !== 'image/webp') encoded = await encode('image/jpeg');
  if (!encoded?.size || !['image/webp', 'image/jpeg'].includes(encoded.type)) throw new Error('이미지 압축에 실패했습니다.');
  return encoded;
}

export async function verifyScaffoldingImage(blob: Blob): Promise<void> {
  if (!blob.size) throw new Error('업로드된 이미지가 비어 있습니다.');
  await loadImage(blob);
}

export async function uploadScaffoldingImage(client: SupabaseClient, source: Blob | string, studentId: string, mistakeId: string,
  compress = compressScaffoldingImage, verify = verifyScaffoldingImage): Promise<string> {
  const blob = await compress(source);
  const path = `${studentId}/${mistakeId}/${crypto.randomUUID()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
  if (!PATH.test(path)) throw new Error('이미지 저장 경로가 올바르지 않습니다.');
  const bucket = client.storage.from(IMAGE_BUCKET);
  const { error } = await bucket.upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
  try {
    const { data, error: downloadError } = await bucket.download(path);
    if (downloadError || !data) throw downloadError ?? new Error('이미지를 확인할 수 없습니다.');
    await verify(data);
  } catch (error) {
    await bucket.remove([path]);
    throw error;
  }
  return PREFIX + path;
}

export async function migrateScaffoldingStep(client: SupabaseClient, id: string,
  upload = uploadScaffoldingImage): Promise<'migrated' | 'skipped'> {
  const { data: row, error } = await client.from('mistake_scaffoldings')
    .select('id,student_id,mistake_id,image_url').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!row || !row.image_url.startsWith('data:image/')) return 'skipped';
  const ref = await upload(client, row.image_url, row.student_id, row.mistake_id);
  // 업로드 검증 후 원본이 그대로인 행만 교체한다. 통신 실패 시 객체는 보존한다.
  const { data: updated, error: updateError } = await client.rpc('migrate_scaffolding_image', {
    p_id: id, p_original: row.image_url, p_reference: ref,
  });
  if (updateError) throw updateError;
  return updated ? 'migrated' : 'skipped';
}
