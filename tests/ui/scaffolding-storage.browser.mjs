import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const base = 'http://127.0.0.1:5175';
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5175', '--strictPort'], { stdio: 'pipe', windowsHide: true });
let output = '';
vite.stdout.on('data', value => { output += value; });
vite.stderr.on('data', value => { output += value; });
let browser;
try {
  for (let i = 0; i < 100 && !output.includes('5175'); i++) {
    if (vite.exitCode !== null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const student = '11111111-1111-1111-1111-111111111111';
    const mistake = '22222222-2222-2222-2222-222222222222';
    const ids = Array.from({ length: 7 }, (_, i) => `33333333-3333-3333-3333-${String(i + 1).padStart(12, '0')}`);
    const rows = ids.map(id => ({ id, student_id: student, mistake_id: mistake, image_url: '' }));
    const objects = new Map();
    const events = [];
    let original = '';
    await context.routeWebSocket(/supabase/, ws => ws.close());
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === base) return route.continue();
      if (url.pathname.endsWith('/rpc/is_current_user_admin')) return route.fulfill({ json: true });
      if (url.pathname.endsWith('/rpc/migrate_scaffolding_image')) {
        const payload = req.postDataJSON();
        assert.ok(events.includes('download'));
        const row = rows.find(row => row.id === payload.p_id);
        assert.equal(payload.p_original, row.image_url);
        row.image_url = payload.p_reference; events.push('update');
        return route.fulfill({ json: true });
      }
      if (url.pathname.endsWith('/mistake_scaffoldings')) {
        const id = url.searchParams.get('id')?.slice(3);
        if (url.searchParams.get('select') === 'id') {
          assert.equal(url.searchParams.get('limit'), '3');
          const cursor = url.searchParams.get('id')?.slice(3);
          return route.fulfill({ json: rows.filter(row => !cursor || row.id > cursor).slice(0, 3).map(row => ({ id: row.id })) });
        }
        assert.equal(url.searchParams.get('select'), 'id,student_id,mistake_id,image_url');
        assert.ok(id);
        return route.fulfill({ json: rows.find(row => row.id === id) });
      }
      if (url.pathname.includes('/storage/v1/object/scaffolding-images/')) {
        const path = url.pathname.split('/scaffolding-images/')[1];
        if (req.method() === 'POST') {
          const request = new Request(req.url(), { method: 'POST', headers: req.headers(), body: req.postDataBuffer() });
          const form = await request.formData();
          const file = [...form.values()].find(value => typeof value !== 'string');
          assert.equal(file.type, 'image/webp');
          objects.set(path, Buffer.from(await file.arrayBuffer())); events.push('upload');
          return route.fulfill({ json: { Key: path } });
        }
        if (req.method() === 'GET') {
          assert.ok(objects.get(path)?.length); events.push('download');
          return route.fulfill({ body: objects.get(path), contentType: 'image/webp' });
        }
      }
      if (url.pathname.includes('/storage/v1/object/authenticated/scaffolding-images/')) {
        const path = url.pathname.split('/scaffolding-images/')[1];
        assert.ok(objects.get(path)?.length); events.push('download');
        return route.fulfill({ body: objects.get(path), contentType: 'image/webp' });
      }
      return route.abort();
    });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/tests/ui/scaffolding-storage.html');
    await page.getByRole('button', { name: '스캐폴딩 이미지 저장공간으로 옮기기' }).waitFor();
    const compression = await page.evaluate(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 3200; canvas.height = 2400;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 3200, 2400);
      ctx.fillStyle = '#000'; ctx.font = '80px sans-serif'; ctx.fillText('x² − 5x + 6 = 0', 100, 150);
      const original = canvas.toDataURL('image/png');
      const blob = await window.compressScaffoldingImage(original);
      const bitmap = await createImageBitmap(blob);
      const real = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function(callback, type, quality) { return real.call(this, callback, type === 'image/webp' ? 'image/png' : type, quality); };
      let fallback;
      try { fallback = await window.compressScaffoldingImage(original); } finally { HTMLCanvasElement.prototype.toBlob = real; }
      const result = { original, width: bitmap.width, height: bitmap.height, type: blob.type, size: blob.size, fallback: fallback.type };
      bitmap.close(); return result;
    });
    assert.equal(compression.width, 2000); assert.equal(compression.height, 1500);
    assert.equal(compression.type, 'image/webp'); assert.equal(compression.fallback, 'image/jpeg');
    original = compression.original; rows.forEach(row => { row.image_url = original; });
    const start = page.getByRole('button', { name: '스캐폴딩 이미지 저장공간으로 옮기기' });
    await start.click();
    await page.getByRole('status').filter({ hasText: '이동 1건' }).waitFor();
    await page.getByRole('button', { name: '중단', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '중단:' }).waitFor();
    const partial = rows.filter(row => row.image_url.startsWith('storage:')).length;
    assert.ok(partial >= 1 && partial < 7);
    await start.click();
    await page.getByRole('status').filter({ hasText: '완료:' }).waitFor();
    assert.equal(rows.filter(row => row.image_url.startsWith('storage:')).length, 7);
    assert.equal(objects.size, 7);
    await start.click(); await page.getByRole('status').filter({ hasText: '완료: 확인 7건 · 이동 0건' }).waitFor();
    assert.equal(objects.size, 7); assert.deepEqual(errors, []);
    console.log(`PASS: compression ${compression.width}×${compression.height}, WebP ${compression.size} bytes, JPEG fallback, verified uploads, stop/resume and repeat (7 rows)`);
  } finally { await context.close(); }
  // 기존 학생/관리자 UI 검사도 같은 포트와 서버에서 실행한다.
  const existing = spawn(process.execPath, ['tests/ui/scaffolding.browser.mjs'], { env: { ...process.env, SCAFFOLDING_TEST_URL: base }, stdio: 'inherit', windowsHide: true });
  const [code] = await once(existing, 'exit'); assert.equal(code, 0);
} finally {
  if (browser) await browser.close();
  const stopped = once(vite, 'exit');
  if (vite.exitCode === null) { vite.kill(); await stopped; }
}
