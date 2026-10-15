import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { gunzipSync } from 'node:zlib';

// 교재 슬라이드 필기(S펜) + 수업 녹음 → 저장 → 다시 열어 재생 검사. Supabase는 가짜 응답, 마이크는 크롬 가짜 장치.
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
  browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const objects = new Map();       // lecture-slides 경로 → 이미지
  const recFiles = new Map();      // lecture-recordings 경로 → { body, type }
  const recRows = [];
  const deckId = '11111111-1111-4111-8111-111111111111';
  const slideIds = ['aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000003'];
  const deck = {
    id: deckId, title: '개념원리 공통수학2 - 명제', grade: '고1', book: '개념원리 공통수학2', chapter: '명제', created_at: '2026-10-15T00:00:00Z', published: false,
    slides: slideIds.map((id, i) => ({ id, path: `${deckId}/${id}.png`, section: '01 명제', label: `슬라이드 ${i + 1}`, bookPage: 166 + i })),
  };
  const idOf = url => url.searchParams.get('id')?.slice(3);

  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 800 }, hasTouch: true, permissions: ['microphone'] });
  try {
    await context.routeWebSocket(/supabase/, ws => ws.close());
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === base) return route.continue();
      const path = decodeURIComponent(url.pathname);
      if (path.endsWith('/rest/v1/lecture_decks') && req.method() === 'GET') return route.fulfill({ json: [deck] });
      if (path.endsWith('/rest/v1/lecture_recordings')) {
        if (req.method() === 'GET') {
          const deckFilter = url.searchParams.get('deck_id')?.slice(3);
          return route.fulfill({ json: recRows.filter(r => r.deck_id === deckFilter).reverse() });
        }
        if (req.method() === 'POST') { recRows.push({ ...req.postDataJSON(), created_at: new Date().toISOString() }); return route.fulfill({ status: 201, body: '' }); }
        if (req.method() === 'PATCH') { Object.assign(recRows.find(r => r.id === idOf(url)) ?? {}, req.postDataJSON()); return route.fulfill({ status: 204, body: '' }); }
        if (req.method() === 'DELETE') { recRows.splice(recRows.findIndex(r => r.id === idOf(url)), 1); return route.fulfill({ status: 204, body: '' }); }
      }
      if (path.endsWith('/storage/v1/object/sign/lecture-slides')) {
        const { paths } = req.postDataJSON();
        return route.fulfill({ json: paths.map(p => ({ path: p, signedURL: `/object/sign/lecture-slides/${p}?token=t`, error: null })) });
      }
      if (path.includes('/storage/v1/object/sign/lecture-slides/')) {
        const object = objects.get(path.split('/lecture-slides/')[1]);
        return object ? route.fulfill({ body: object, contentType: 'image/png' }) : route.fulfill({ status: 404, body: '' });
      }
      if (path.endsWith('/storage/v1/object/list/lecture-recordings')) {
        const { prefix } = req.postDataJSON();
        return route.fulfill({ json: [...recFiles.keys()].filter(k => k.startsWith(`${prefix}/`)).map(k => ({ name: k.slice(prefix.length + 1) })) });
      }
      if (path.endsWith('/storage/v1/object/lecture-recordings') && req.method() === 'DELETE') {
        for (const p of req.postDataJSON().prefixes) recFiles.delete(p);
        return route.fulfill({ json: [] });
      }
      if (path.includes('/storage/v1/object/lecture-recordings/')) {
        const p = path.split('/lecture-recordings/')[1];
        if (req.method() === 'GET') {
          const file = recFiles.get(p);
          return file ? route.fulfill({ body: file.body, contentType: file.type }) : route.fulfill({ status: 404, json: { error: 'not found' } });
        }
        const request = new Request(req.url(), { method: 'POST', headers: req.headers(), body: req.postDataBuffer() });
        const form = await request.formData();
        const file = [...form.values()].find(value => typeof value !== 'string');
        recFiles.set(p, { body: Buffer.from(await file.arrayBuffer()), type: file.type });
        return route.fulfill({ json: { Key: `lecture-recordings/${p}` } });
      }
      return route.abort();
    });

    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.goto(base + '/tests/ui/lecture-deck.html');
    // 슬라이드 이미지(1920×1080)를 만들어 가짜 저장소에 넣는다.
    const pngs = await page.evaluate(async count => {
      const out = [];
      for (let n = 1; n <= count; n++) {
        const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fbfaf6'; ctx.fillRect(0, 0, 1920, 1080);
        ctx.fillStyle = '#111'; ctx.font = 'bold 96px sans-serif'; ctx.fillText(`슬라이드 ${n}`, 80, 160);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
        out.push(btoa(binary));
      }
      return out;
    }, 3);
    deck.slides.forEach((s, i) => objects.set(s.path, Buffer.from(pngs[i], 'base64')));
    // 화면 숨김(앱 전환·화면 꺼짐)을 흉내 낼 수 있게 한다.
    await page.addInitScript(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vis ?? 'visible' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => (window.__vis ?? 'visible') === 'hidden' });
    });
    await page.reload();
    await page.getByRole('button', { name: /^📘 고1 · / }).click();
    await page.getByText('01 명제').waitFor();

    const viewer = page.getByRole('dialog');
    const counter = page.getByTestId('slide-counter');
    const phase = () => page.getByTestId('lecture-recording').getAttribute('data-phase');
    const waitPhase = async value => page.waitForFunction(v => document.querySelector('[data-testid=lecture-recording]')?.dataset.phase === v, value);
    const strokeCount = async () => Number(await viewer.locator('[data-testid=slide-ink] .exam-ink').getAttribute('data-stroke-count'));
    const waitStrokes = async n => page.waitForFunction(n => Number(document.querySelector('[data-testid=slide-ink] .exam-ink')?.dataset.strokeCount) === n, n);
    /** 슬라이드 위에 획 하나(비율 좌표). pointerType으로 펜/손가락을 고른다. */
    const draw = async (points, pointerType = 'pen') => page.evaluate(async ({ points, pointerType }) => {
      const canvas = document.querySelector('[data-testid=slide-ink] .exam-ink-input');
      const r = canvas.getBoundingClientRect();
      const fire = (type, [x, y]) => canvas.dispatchEvent(new PointerEvent(type, {
        pointerType, pointerId: pointerType === 'pen' ? 11 : 21, isPrimary: true, bubbles: true, cancelable: true,
        clientX: r.left + x * r.width, clientY: r.top + y * r.height, pressure: pointerType === 'pen' ? 0.6 : 0.5, buttons: type === 'pointerup' ? 0 : 1,
      }));
      fire('pointerdown', points[0]);
      for (const p of points.slice(1)) { await new Promise(resolve => setTimeout(resolve, 16)); fire('pointermove', p); }
      await new Promise(resolve => setTimeout(resolve, 16));
      fire('pointerup', points.at(-1));
    }, { points, pointerType });
    const line = (x0, y0, x1, y1, n = 12) => Array.from({ length: n }, (_, i) => [x0 + (x1 - x0) * i / (n - 1), y0 + (y1 - y0) * i / (n - 1)]);

    await page.getByRole('button', { name: '01 명제 열기' }).click();
    await viewer.waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid=slide-ink] .exam-ink')?.dataset.ready === 'true');
    // 펜 도구 막대는 보기 화면의 펜 자리에 있다.
    assert.equal(await page.locator('[data-slot=pen-toolbar] [data-testid=lecture-pen-toolbar]').count(), 1);

    // 1) 녹음 없이 자유 연습: 펜은 그리고, 손가락은 그리지 않는다.
    await draw(line(0.1, 0.3, 0.4, 0.35));
    await waitStrokes(1);
    await draw(line(0.1, 0.6, 0.4, 0.62), 'touch');
    await page.waitForTimeout(100);
    assert.equal(await strokeCount(), 1, '손가락은 그리지 않는다');
    // 슬라이드를 넘겨도 슬라이드마다 필기가 남는다.
    await page.getByRole('button', { name: '다음 슬라이드' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid=slide-counter]')?.textContent === '2 / 3');
    await waitStrokes(0);
    await page.getByRole('button', { name: '이전 슬라이드' }).click();
    await waitStrokes(1);

    // 2) 녹음 시작 → 그리기 → 일시정지 → 이어하기 → 넘김 → 그리기 → (화면 숨김 자동 일시정지) → 이어하기 → 끝내기
    assert.equal(await phase(), 'idle');
    await page.getByRole('button', { name: '● 녹음 시작' }).click();
    // 먼저 반을 고른다(같은 교재를 월수금반·수토반이 따로 듣는다).
    await page.getByTestId('lecture-class-picker').waitFor();
    assert.equal(await phase(), 'idle', '반을 고르기 전에는 녹음하지 않는다');
    await page.screenshot({ path: '.test-artifacts/lecture-class-picker.png' }).catch(() => {});
    await page.getByRole('button', { name: '● 수토반' }).click();
    await waitPhase('recording');
    assert.equal(await page.getByTestId('lecture-class').innerText(), '수토반');
    await page.getByTestId('recording-indicator').getByText('녹음 중').waitFor();
    assert.equal(recRows.length, 1);
    assert.equal(recRows[0].status, 'recording');
    assert.equal(recRows[0].class_name, '수토반');
    assert.match(recRows[0].title, / · 수토반 · /);
    await page.waitForTimeout(800);
    await draw(line(0.5, 0.2, 0.8, 0.5)); // 슬라이드 1의 녹음 중 획
    await waitStrokes(2);
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: '⏸ 일시정지' }).click();
    await waitPhase('paused');
    await page.waitForFunction(() => document.querySelector('[data-testid=recording-save-state]')?.dataset.save === 'saved');
    const pausedAt = await page.getByTestId('lecture-recording').innerText();
    await page.waitForTimeout(1200);
    assert.equal(await page.getByTestId('lecture-recording').innerText(), pausedAt, '일시정지 중에는 시간이 멈춘다');
    // 멈춘 동안 두 슬라이드에 쓰고 지워도 이어하기 때 결과만 나타난다.
    for (const y of [0.6, 0.7, 0.8]) await draw(line(0.2, y, 0.6, y));
    await waitStrokes(5);
    await page.getByRole('button', { name: '지우개', exact: true }).click();
    await draw(line(0.4, 0.77, 0.4, 0.83));
    await waitStrokes(4);
    await page.getByRole('button', { name: '펜', exact: true }).click();
    await page.getByRole('button', { name: '다음 슬라이드' }).click();
    await waitStrokes(0);
    await draw(line(0.2, 0.4, 0.6, 0.4));
    await waitStrokes(1);
    await page.getByRole('button', { name: '● 이어하기' }).click();
    await waitPhase('recording');
    await page.waitForTimeout(300);
    await page.waitForFunction(() => document.querySelector('[data-testid=slide-counter]')?.textContent === '2 / 3');
    await page.waitForTimeout(300);
    await draw(line(0.2, 0.7, 0.6, 0.7)); // 슬라이드 2의 획
    await waitStrokes(2);
    await page.waitForTimeout(300);
    // 앱 전환·화면 꺼짐 → 저절로 일시정지, 돌아오면 안내
    await page.evaluate(() => { window.__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });
    await waitPhase('paused');
    await page.evaluate(() => { window.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
    await page.getByTestId('recording-notice').getByText('녹음이 일시정지됐어요', { exact: false }).waitFor();
    await page.waitForTimeout(300);
    assert.equal(await phase(), 'paused', '돌아와도 저절로 녹음하지 않는다');
    await page.getByTestId('recording-notice').getByRole('button', { name: '● 이어하기' }).click();
    await waitPhase('recording');
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: '■ 끝내기' }).click();
    await waitPhase('done');
    await page.screenshot({ path: '.test-artifacts/lecture-recording-tablet.png' }).catch(() => {});

    const recId = recRows[0].id;
    assert.equal(recRows[0].status, 'done');
    const manifest = JSON.parse(recFiles.get(`${recId}/manifest.json`).body.toString());
    assert.equal(manifest.status, 'done');
    assert.equal(manifest.className, '수토반');
    assert.equal(manifest.deckId, deckId);
    assert.equal(manifest.initialSlideId, slideIds[0]);
    assert.deepEqual(manifest.slides.map(s => s.id), slideIds);
    assert.equal(manifest.clips.length, 3, '녹음 구간 3개 = 클립 3개');
    for (let i = 1; i < manifest.clips.length; i++) {
      const prev = manifest.clips[i - 1];
      assert.ok(Math.abs(manifest.clips[i].offsetMs - (prev.offsetMs + prev.durationMs)) <= 5, '일시정지 시간은 빠지고 클립이 이어진다');
    }
    assert.ok(manifest.durationMs > 2000 && manifest.durationMs < 15000, `길이 ${manifest.durationMs}`);
    for (const clip of manifest.clips) {
      const first = recFiles.get(`${recId}/${clip.files[0]}`).body;
      assert.deepEqual([...first.subarray(0, 4)], [0x1a, 0x45, 0xdf, 0xa3], 'webm 머리');
    }
    assert.ok(manifest.chunks.length >= 1 && manifest.chunks.every(c => c.encoding === 'gzip'));
    assert.equal(recRows[0].duration_ms, manifest.durationMs);
    const entries = manifest.chunks.flatMap(c => {
      const bytes = recFiles.get(`${recId}/${c.file}`).body;
      return JSON.parse((c.encoding === 'gzip' ? gunzipSync(bytes) : bytes).toString()).entries;
    });
    const resumeAt = manifest.clips[1].offsetMs;
    const resumed = entries.filter(e => e.at === resumeAt);
    assert.deepEqual(resumed.map(e => [e.type, e.slideId]), [['ink', slideIds[0]], ['ink', slideIds[1]], ['slide', slideIds[1]]]);
    assert.deepEqual(resumed.slice(0, 2).map(e => [e.event.kind, e.event.added.length]), [['restore', 4], ['restore', 1]]);
    assert.equal(entries.filter(e => e.type === 'ink' && e.event.kind === 'draw').length, 2, '멈춘 동안의 획은 따로 기록하지 않는다');

    // 3) 닫고 → 녹음 목록 → 다시 열어 재생
    await page.getByRole('button', { name: '닫기', exact: true }).click();
    await viewer.waitFor({ state: 'detached' });
    const list = page.getByTestId('lecture-recordings');
    await list.getByTestId('lecture-recording-group').first().waitFor();
    assert.deepEqual(await list.getByTestId('lecture-recording-group').evaluateAll(els => els.map(e => e.dataset.class)), ['수토반'], '녹음 목록은 반별로 묶인다');
    await page.screenshot({ path: '.test-artifacts/lecture-class-list.png' }).catch(() => {});
    await list.getByRole('button', { name: /녹음 재생$/ }).waitFor();
    assert.match(await list.innerText(), /0:0\d/);
    await list.getByRole('button', { name: /녹음 재생$/ }).click();
    await page.getByTestId('lecture-replay-bar').waitFor();
    assert.equal(await page.getByTestId('lecture-recording').count(), 0, '재생 중에는 녹음 버튼이 없다');
    assert.equal(await page.getByTestId('lecture-pen-toolbar').count(), 0);
    const seek = async ms => page.evaluate(ms => {
      const input = document.querySelector('[data-testid=lecture-replay-bar] input[type=range]');
      // 경계 시각을 검사할 때 100ms 눈금으로 반올림되지 않게 한다.
      input.step = '1';
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(ms));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, ms);
    const replayState = async () => ({ counter: await counter.textContent(), strokes: await strokeCount() });
    await page.waitForFunction(() => document.querySelector('[data-testid=slide-ink] .exam-ink')?.dataset.ready === 'true');
    await seek(0);
    await page.waitForTimeout(100);
    assert.deepEqual(await replayState(), { counter: '1 / 3', strokes: 1 }, '처음: 녹음 전 필기만');
    const firstClipEnd = manifest.clips[0].durationMs;
    await seek(firstClipEnd - 10);
    await page.waitForTimeout(100);
    assert.deepEqual(await replayState(), { counter: '1 / 3', strokes: 2 }, '첫 구간 끝: 녹음 중 획까지');
    await seek(resumeAt);
    await page.waitForTimeout(100);
    assert.deepEqual(await replayState(), { counter: '2 / 3', strokes: 1 }, '이어하기 순간: 두 번째 슬라이드의 결과 필기가 즉시 보인다');
    await seek(manifest.durationMs);
    await page.waitForTimeout(100);
    assert.deepEqual(await replayState(), { counter: '2 / 3', strokes: 2 }, '끝: 두 번째 슬라이드와 그 필기');
    // 재생하면 시간이 흐르고 음성이 붙는다.
    await seek(0);
    await page.getByRole('button', { name: '재생', exact: true }).click();
    await page.waitForFunction(() => /^0:0[1-9]/.test(document.querySelector('[data-testid=replay-time]')?.textContent ?? ''));
    const audioSrc = await page.locator('[data-testid=exam-audio-player]').first().getAttribute('src');
    assert.match(audioSrc ?? await page.evaluate(() => document.querySelector('[data-testid=exam-audio-player]').src), /^blob:/);
    await page.getByRole('button', { name: '일시정지', exact: true }).click();
    await page.screenshot({ path: '.test-artifacts/lecture-replay-tablet.png' }).catch(() => {});

    // 3-1) MP4 내보내기(전체) → 영상 파일을 다시 열어 길이·소리·장면을 검사한다.
    await seek(0);
    await page.getByRole('button', { name: 'MP4로 저장' }).click();
    const exportPanel = page.getByTestId('lecture-export');
    await exportPanel.getByRole('button', { name: /^전체 영상 만들기/ }).click();
    await page.waitForFunction(() => ['done', 'error'].includes(document.querySelector('[data-testid=lecture-export]')?.dataset.phase), null, { timeout: 60_000 });
    assert.equal(await exportPanel.getAttribute('data-phase'), 'done', await exportPanel.innerText());
    const stats = await page.getByTestId('export-stats').innerText();
    console.log('[export]', stats.replace(/\s+/g, ' '));
    assert.match(stats, /H\.264 \+ Opus/);
    await page.screenshot({ path: '.test-artifacts/lecture-export-tablet.png' }).catch(() => {});
    const download = page.waitForEvent('download');
    await exportPanel.getByRole('link', { name: '⬇ 기기에 저장' }).click();
    const file = await download;
    assert.match(file.suggestedFilename(), /녹음\.mp4$/);
    await file.saveAs('.test-artifacts/lecture-export.mp4').catch(() => {});
    const probe = await page.evaluate(async ({ resumeAt, total }) => {
      const mb = await import('/@id/mediabunny');
      const src = document.querySelector('[data-testid=export-preview]').src;
      const input = new mb.Input({ source: new mb.BlobSource(await (await fetch(src)).blob()), formats: mb.ALL_FORMATS });
      const video = await input.getPrimaryVideoTrack();
      const audio = await input.getPrimaryAudioTrack();
      const sink = new mb.CanvasSink(video, { poolSize: 0 });
      // 지점의 밝기(0 검정 ~ 255 흰색): 슬라이드 비율 좌표.
      const lumaAt = async (sec, points) => {
        const frame = await sink.getCanvas(sec);
        const ctx = frame.canvas.getContext('2d');
        return points.map(([x, y]) => {
          const d = ctx.getImageData(Math.round(x * 1920) - 2, Math.round(y * 1080) - 2, 5, 5).data;
          let min = 255; for (let i = 0; i < d.length; i += 4) min = Math.min(min, (d[i] + d[i + 1] + d[i + 2]) / 3);
          return Math.round(min);
        });
      };
      const pts = [[0.25, 0.325], [0.4, 0.7], [0.4, 0.4]]; // 녹음 전 획(슬라이드1), 녹음 중 획(슬라이드2), 멈춘 동안 쓴 획(슬라이드2)
      let peak = 0;
      for await (const { buffer } of new mb.AudioBufferSink(audio).buffers()) {
        for (const v of buffer.getChannelData(0)) peak = Math.max(peak, Math.abs(v));
      }
      return {
        duration: await input.computeDuration(), size: [video.displayWidth, video.displayHeight],
        videoCodec: video.codec, audioCodec: audio?.codec, audioRate: audio?.sampleRate, peak,
        start: await lumaAt(0.05, pts), afterResume: await lumaAt(resumeAt / 1000 + 0.05, pts), end: await lumaAt(total / 1000 - 0.05, pts),
      };
    }, { resumeAt, total: manifest.durationMs });
    console.log('[export probe]', JSON.stringify(probe));
    assert.deepEqual(probe.size, [1920, 1080]);
    assert.equal(probe.videoCodec, 'avc');
    assert.equal(probe.audioCodec, 'opus');
    assert.ok(Math.abs(probe.duration * 1000 - manifest.durationMs) < 150, `영상 길이 ${probe.duration}s ≈ 녹음 ${manifest.durationMs}ms`);
    assert.ok(probe.peak > 0.01 && probe.peak < 1.5, `가짜 마이크 소리가 들어 있고 튀지 않는다 (최고 ${probe.peak})`);
    const dark = v => v < 120, light = v => v > 200;
    assert.ok(dark(probe.start[0]) && light(probe.start[1]), `처음: 슬라이드1 + 녹음 전 획만 ${probe.start}`);
    assert.ok(light(probe.afterResume[0]) && dark(probe.afterResume[2]), `이어하기 직후: 슬라이드2 + 멈춘 동안 쓴 획 ${probe.afterResume}`);
    assert.ok(dark(probe.end[1]) && dark(probe.end[2]), `끝: 슬라이드2의 두 획 ${probe.end}`);
    await exportPanel.getByRole('button', { name: 'MP4 창 닫기' }).click();
    await page.keyboard.press('Escape');
    await viewer.waitFor({ state: 'detached' });

    // 4) 녹음 삭제: 파일과 행이 함께 사라진다.
    await list.getByRole('button', { name: /녹음 삭제/ }).click();
    await list.getByText('아직 녹음이 없습니다', { exact: false }).waitFor();
    assert.equal(recRows.length, 0);
    assert.equal([...recFiles.keys()].filter(k => k.startsWith(recId)).length, 0);

    assert.deepEqual(errors, []);
    console.log(`PASS: pen-only ink per slide, record→pause→resume→slide→hidden auto-pause→resume→end (${manifest.clips.length} clips, ${manifest.chunks.length} gzip ink chunks, ${manifest.durationMs} ms), reopen replay (slides+strokes at times, audio blob), delete`);
  } finally { await context.close(); }
} finally {
  if (browser) await browser.close();
  if (vite.exitCode === null) { const stopped = new Promise(resolve => vite.once('exit', resolve)); vite.kill(); await stopped; }
}
