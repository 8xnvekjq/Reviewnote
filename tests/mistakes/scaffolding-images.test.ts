import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScaffoldingRef, resolveScaffoldingImages, clearScaffoldingImageCache, migrateScaffoldingStep, uploadScaffoldingImage } from '../../src/features/mistakes/scaffoldingImages.ts';

const student = '11111111-1111-1111-1111-111111111111';
const mistake = '22222222-2222-2222-2222-222222222222';
const path = `${student}/${mistake}/33333333-3333-3333-3333-333333333333.webp`;
const ref = `storage:scaffolding-images/${path}`;
test('참조는 올바른 버킷과 경로만 허용한다', () => {
  assert.equal(parseScaffoldingRef(ref), path);
  assert.equal(parseScaffoldingRef(ref.replace('.webp', '.jpg')), path.replace('.webp', '.jpg'));
  for (const value of ['data:image/png;base64,a', 'https://example.com/a', '', 'storage:other/' + path, ref + '/../a', ref.replace('.webp', '.png')]) assert.equal(parseScaffoldingRef(value), null);
});
test('주소를 일괄 발급하고 중복과 캐시를 처리한다', async () => {
  const calls: string[][] = [];
  const client: any = { storage: { from: () => ({ createSignedUrls: async (paths: string[]) => {
    calls.push(paths); return { data: paths.map(path => ({ path, signedUrl: 'https://signed/' + path })) };
  } }) } };
  const rows = [{ image_url: ref }, { image_url: ref }, { image_url: 'data:image/png;base64,a' }, { image_url: 'https://plain/a' }, { image_url: '' }, { image_url: 'storage:bad/a' }];
  const resolved = await resolveScaffoldingImages(client, rows);
  assert.deepEqual(calls, [[path]]);
  assert.equal(resolved[0].image_url, 'https://signed/' + path);
  assert.equal(resolved[2].image_url, rows[2].image_url);
  assert.equal(resolved[3].image_url, rows[3].image_url);
  assert.equal(resolved[5].image_url, '');
  await resolveScaffoldingImages(client, rows);
  assert.equal(calls.length, 1);
  clearScaffoldingImageCache(client);
  await resolveScaffoldingImages(client, rows);
  assert.equal(calls.length, 2);
});
test('서명 발급 실패를 호출자에게 전달한다', async () => {
  const client: any = { storage: { from: () => ({ createSignedUrls: async () => ({ error: new Error('권한 없음') }) }) } };
  await assert.rejects(resolveScaffoldingImages(client, [{ image_url: ref }]), /권한 없음/);
});
test('캐시 만료 후 주소를 다시 발급한다', async () => {
  let calls = 0;
  const client: any = { storage: { from: () => ({ createSignedUrls: async () => { calls++; return { data: [{ path, signedUrl: `https://signed/${calls}` }] }; } }) } };
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    await resolveScaffoldingImages(client, [{ image_url: ref }]);
    now += 56 * 60 * 1000;
    const rows = await resolveScaffoldingImages(client, [{ image_url: ref }]);
    assert.equal(calls, 2); assert.equal(rows[0].image_url, 'https://signed/2');
  } finally { Date.now = originalNow; }
});
function rowClient(image_url: string, options: { fetchError?: boolean; updateError?: boolean; changed?: boolean; missing?: boolean } = {}) {
  const calls: any[] = [];
  const client: any = { rpc: async (name: string, payload: any) => {
    calls.push(['update', name, payload]);
    return { data: !options.changed, error: options.updateError ? new Error('수정 실패') : null };
  }, from: (table: string) => {
    calls.push(['from', table]);
    let updating = false;
    const query: any = {
      select: (columns: string) => { calls.push(['select', columns]); return query; },
      eq: (key: string, value: string) => { calls.push(['eq', key, value]); return query; },
      maybeSingle: async () => ({ data: options.missing ? null : { id: 'row', student_id: student, mistake_id: mistake, image_url }, error: options.fetchError ? new Error('조회 실패') : null }),
      update: (payload: unknown) => { updating = true; calls.push(['update', payload]); return query; },
      then: (resolve: (value: unknown) => void) => resolve({ data: updating && !options.changed ? [{ id: 'row' }] : [], error: options.updateError ? new Error('수정 실패') : null }),
    }; return query;
  } };
  return { client, calls };
}
test('한 행만 읽고 업로드 검증 완료 후 원본 조건으로 교체한다', async () => {
  const { client, calls } = rowClient('data:image/png;base64,a');
  const upload: any = async (_client: unknown, source: string, sid: string, mid: string) => {
    assert.equal(source, 'data:image/png;base64,a'); assert.equal(sid, student); assert.equal(mid, mistake);
    assert.equal(calls.some(call => call[0] === 'update'), false); calls.push(['verified']); return ref;
  };
  assert.equal(await migrateScaffoldingStep(client, 'row', upload), 'migrated');
  assert.deepEqual(calls.filter(call => call[0] === 'select'), [['select', 'id,student_id,mistake_id,image_url']]);
  assert.ok(calls.findIndex(call => call[0] === 'verified') < calls.findIndex(call => call[0] === 'update'));
  assert.deepEqual(calls.find(call => call[0] === 'update'), ['update', 'migrate_scaffolding_image', { p_id: 'row', p_original: 'data:image/png;base64,a', p_reference: ref }]);
});
test('이미 옮긴 행, 외부 URL, 텍스트 행, 삭제된 행은 건너뛴다', async () => {
  for (const image of [ref, 'https://plain/a', '']) {
    const { client, calls } = rowClient(image);
    assert.equal(await migrateScaffoldingStep(client, 'row', async () => { throw new Error('업로드 금지'); }), 'skipped');
    assert.equal(calls.some(call => call[0] === 'update'), false);
  }
  assert.equal(await migrateScaffoldingStep(rowClient('', { missing: true }).client, 'row'), 'skipped');
});
test('업로드/검증 실패 시 원본을 수정하지 않는다', async () => {
  const { client, calls } = rowClient('data:image/png;base64,a');
  await assert.rejects(migrateScaffoldingStep(client, 'row', async () => { throw new Error('검증 실패'); }), /검증 실패/);
  assert.equal(calls.some(call => call[0] === 'update'), false);
});
test('조회 실패, 수정 실패, 동시 수정은 안전하게 처리한다', async () => {
  await assert.rejects(migrateScaffoldingStep(rowClient('data:image/png;base64,a', { fetchError: true }).client, 'row'), /조회 실패/);
  await assert.rejects(migrateScaffoldingStep(rowClient('data:image/png;base64,a', { updateError: true }).client, 'row', async () => ref), /수정 실패/);
  assert.equal(await migrateScaffoldingStep(rowClient('data:image/png;base64,a', { changed: true }).client, 'row', async () => ref), 'skipped');
});
test('다운로드 검증 실패 시 업로드 파일을 정리한다', async () => {
  const calls: string[] = [];
  const client: any = { storage: { from: () => ({ upload: async () => { calls.push('upload'); return {}; }, download: async () => { calls.push('download'); return { data: new Blob(['a']) }; }, remove: async () => { calls.push('remove'); return {}; } }) } };
  await assert.rejects(uploadScaffoldingImage(client, new Blob(), student, mistake,
    async () => new Blob(['a'], { type: 'image/webp' }), async () => { calls.push('verify'); throw new Error('디코딩 실패'); }), /디코딩 실패/);
  assert.deepEqual(calls, ['upload', 'download', 'verify', 'remove']);
});
test('JPEG 대체 인코딩은 jpg 경로와 MIME으로 업로드한다', async () => {
  let uploaded = '';
  const client: any = { storage: { from: () => ({ upload: async (path: string, _blob: Blob, options: any) => { uploaded = path; assert.equal(options.contentType, 'image/jpeg'); assert.equal(options.upsert, false); return {}; }, download: async () => ({ data: new Blob(['a']) }) }) } };
  const result = await uploadScaffoldingImage(client, new Blob(), student, mistake, async () => new Blob(['a'], { type: 'image/jpeg' }), async () => {});
  assert.ok(uploaded.endsWith('.jpg')); assert.equal(parseScaffoldingRef(result), uploaded);
});
