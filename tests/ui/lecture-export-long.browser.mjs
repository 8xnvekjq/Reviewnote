import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';

// 긴 수업 MP4 내보내기 검사: 코드로 만든 가짜 녹음(기본 60분, 30슬라이드, 획 수백 개, 클립 3개 = 일시정지 2번)을
// 전체 영상으로 만들고, 결과 파일을 다시 열어 길이·소리 위치(매 분 시작의 삐 소리)·필기 장면을 검사한다.
// 길이 바꾸기: LONG_MIN=10 node tests/ui/lecture-export-long.browser.mjs
// 실제 교재 슬라이드로: SLIDES_DIR="reference/lecture_out/…" (스캔 그림은 인코딩이 더 무겁다), 실제 크롬 창: HEADED=1
const slidesDir = process.env.SLIDES_DIR;
const slideFiles = slidesDir ? readdirSync(slidesDir).filter(name => /\.(png|webp|jpe?g)$/i.test(name)).sort() : [];
const minutes = Number(process.env.LONG_MIN ?? 60);
const port = 5178;
const base = `http://127.0.0.1:${port}`;
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'pipe', windowsHide: true });
let output = '';
vite.stdout.on('data', value => { output += value; });
vite.stderr.on('data', value => { output += value; });
let browser;
try {
  for (let i = 0; i < 100 && !output.includes(String(port)); i++) {
    if (vite.exitCode !== null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: !process.env.HEADED, channel: process.env.HEADED ? 'chrome' : undefined, args: ['--enable-precise-memory-info'] });
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.text().startsWith('[long]')) console.log(message.text()); });
  await page.route('**/rest/v1/**', route => route.fulfill({ json: [] }));
  await page.route('**/__slides/**', route => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split('/__slides/')[1]);
    return route.fulfill({ body: readFileSync(`${slidesDir}/${name}`), contentType: name.endsWith('.webp') ? 'image/webp' : 'image/png' });
  });
  // 화면 숨김(앱 전환·화면 꺼짐)을 흉내 낼 수 있게 한다.
  await page.addInitScript(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vis ?? 'visible' });
  });
  await page.goto(base + '/tests/ui/lecture-deck.html');

  const result = await page.evaluate(async ({ minutes, slideFiles, busyMs, repaint, repaintSlow }) => {
    const { buildLectureReplay } = await import('/src/features/lectures/lectureRecordingModel.ts');
    const { exportLectureMp4 } = await import('/src/features/lectures/lectureExport.ts');
    const mb = await import('/@id/mediabunny');
    const total = minutes * 60_000;
    const RATE = 48_000;
    const BEEP_MS = 400;
    const setupStarted = performance.now();

    // 슬라이드 30장(1920×1080 PNG)
    const slides = [], slideUrls = [];
    for (let n = 1; n <= 30; n++) {
      if (slideFiles.length) {
        slideUrls.push(`/__slides/${encodeURIComponent(slideFiles[(n - 1) % slideFiles.length])}`);
        slides.push({ id: `s${n}`, path: `deck/s${n}.png`, section: '', label: `슬라이드 ${n}`, bookPage: 100 + n });
        continue;
      }
      const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fbfaf6'; ctx.fillRect(0, 0, 1920, 1080);
      ctx.fillStyle = '#111'; ctx.font = 'bold 72px sans-serif'; ctx.fillText(`슬라이드 ${n}`, 60, 110);
      ctx.fillStyle = '#e2e8f0'; ctx.fillRect(60, 150, 1100, 6);
      slideUrls.push(URL.createObjectURL(await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))));
      slides.push({ id: `s${n}`, path: `deck/s${n}.png`, section: `${Math.ceil(n / 5)}단원`, label: `슬라이드 ${n}`, bookPage: 100 + n });
    }
    const slideAtMinute = m => `s${Math.floor(m / 2) % 30 + 1}`;

    // 필기: 매 분 8획(1.5초씩 그린 지그재그 글씨), 2분마다 슬라이드 넘김. 슬라이드마다 획 순서(index)를 센다.
    const entries = [];
    const counts = {};
    const strokeTimes = [];
    for (let m = 0; m < minutes; m++) {
      const slideId = slideAtMinute(m);
      if (m % 2 === 0 && m > 0) entries.push({ type: 'slide', at: m * 60_000, slideId });
      for (let k = 0; k < 8; k++) {
        const at = m * 60_000 + 5000 + k * 6000;
        const x0 = 0.08 + (m % 2) * 0.45, y = 0.12 + k * 0.05;
        const points = Array.from({ length: 40 }, (_, i) => ({
          x: +(x0 + i * 0.008).toFixed(5), y: +(y + (i % 2 ? 0.012 : 0)).toFixed(5), pressure: 0.6, t: Math.round(i * 1500 / 39),
        }));
        const index = counts[slideId] = (counts[slideId] ?? 0) + 1;
        const stroke = { id: `k${m}-${k}`, tool: k === 7 ? 'highlighter' : 'pen', color: k === 7 ? '#facc15' : '#1f2937', size: k === 7 ? 6 : 4, points };
        entries.push({ type: 'ink', at, slideId, event: { id: `e${m}-${k}`, kind: 'draw', at, removed: [], added: [{ index: index - 1, stroke }] } });
        strokeTimes.push({ m, k, at, x: x0 + 18.5 * 0.008, y: y + 0.006 }); // 지그재그 한 변의 가운데
      }
    }

    // 음성 클립 3개(1/3, 3/4 지점에서 일시정지 → 이어하기). 녹음 시각 기준 매 분 시작에 0.4초 삐 소리.
    const cuts = [0, Math.round(total / 3), Math.round(total * 3 / 4), total];
    const clips = [];
    for (let c = 0; c < 3; c++) {
      const offsetMs = cuts[c], durationMs = cuts[c + 1] - cuts[c];
      const out = new mb.Output({ format: new mb.WebMOutputFormat(), target: new mb.BufferTarget() });
      const source = new mb.AudioBufferSource({ codec: 'opus', quality: mb.QUALITY_MEDIUM });
      out.addAudioTrack(source);
      await out.start();
      const step = 10 * RATE;
      const totalSamples = Math.round(durationMs * RATE / 1000);
      for (let s0 = 0; s0 < totalSamples; s0 += step) {
        const len = Math.min(step, totalSamples - s0);
        const buf = new AudioBuffer({ length: len, numberOfChannels: 1, sampleRate: RATE });
        const data = new Float32Array(len);
        for (let i = 0; i < len; i++) {
          const globalMs = offsetMs + (s0 + i) * 1000 / RATE;
          if (globalMs % 60_000 < BEEP_MS) data[i] = 0.5 * Math.sin(2 * Math.PI * 440 * globalMs / 1000);
        }
        buf.copyToChannel(data, 0);
        await source.add(buf);
      }
      await out.finalize();
      const blob = new Blob([out.target.buffer], { type: 'audio/webm' });
      clips.push({ id: `c${c}`, offsetMs, durationMs, mime: 'audio/webm;codecs=opus', sizeBytes: blob.size, storagePath: '', url: URL.createObjectURL(blob) });
    }
    const setupMs = performance.now() - setupStarted;

    // BUSY_MS=8: 앱의 다른 작업처럼 16ms마다 메인 스레드를 그만큼 붙잡는다(인코딩이 메인 스레드 경쟁에 얼마나 약한지).
    // REPAINT=1: 앱 화면처럼 계속 다시 그려지는 요소(rAF로 글자·폭이 바뀌는 막대) — 크롬 버그 414491381 재현용.
    if (repaint) {
      const bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;left:0;bottom:0;height:12px;background:#6366f1;z-index:99';
      // 앱 화면(#root) 안에 둔다 — 내보내는 동안 숨겨져야 다시 그리기가 멈춘다.
      (document.getElementById('root') ?? document.body).append(bar);
      const tick = now => { bar.style.width = `${(now / 20) % 100}%`; bar.textContent = String(Math.floor(now)); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }
    // REPAINT_SLOW=1: 진행 막대처럼 화면 밖(포털)에서 1초에 한 번 바뀌는 요소 — 이 정도는 괜찮은지.
    if (repaintSlow) {
      const bar = document.createElement('div');
      bar.style.cssText = 'position:fixed;left:0;top:0;height:12px;background:#22c55e;z-index:99';
      document.body.append(bar);
      setInterval(() => { bar.style.width = `${Math.random() * 100}%`; bar.textContent = String(Date.now()); }, 1000);
    }
    if (busyMs) setInterval(() => { const end = performance.now() + busyMs; while (performance.now() < end); }, 16);
    const replay = buildLectureReplay({ slides, initialSlideId: 's1', durationMs: total, clips }, entries);
    let peakHeap = 0, lastLog = -1;
    const heap = () => performance.memory?.usedJSHeapSize ?? 0;
    const startHeap = heap();
    const exported = await exportLectureMp4({
      replay, slideIds: slides.map(s => s.id), slideUrls, clips, fromMs: 0, toMs: total, toFile: true,
      onProgress: p => {
        peakHeap = Math.max(peakHeap, heap());
        // 1/3 지점에서 0.8초 동안 화면을 숨긴다 → 멈추지 않고 계속 만든다(숨긴 시간은 따로 잰다).
        if (!window.__hid && p.doneMs > p.totalMs / 3) {
          window.__hid = true; window.__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
          setTimeout(() => { window.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); }, 800);
        }
        const pct = Math.floor(p.doneMs / p.totalMs * 10);
        if (pct !== lastLog) { lastLog = pct; console.log(`[long] ${pct * 10}% ${(p.elapsedMs / 1000).toFixed(0)}s heap ${(heap() / 1048576).toFixed(0)}MB frames ${p.frames}`); }
      },
    });

    // 결과 파일 다시 열기
    const input = new mb.Input({ source: new mb.BlobSource(exported.blob), formats: mb.ALL_FORMATS });
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    const rms = async (fromS, toS) => {
      let sum = 0, n = 0;
      for await (const { buffer, timestamp } of new mb.AudioBufferSink(audio).buffers(fromS, toS)) {
        const d = buffer.getChannelData(0);
        const t0 = timestamp;
        for (let i = 0; i < d.length; i++) {
          const t = t0 + i / buffer.sampleRate;
          if (t >= fromS && t < toS) { sum += d[i] * d[i]; n++; }
        }
      }
      return n ? Math.sqrt(sum / n) : 0;
    };
    const checkMinutes = [...new Set([0, 1, Math.floor(minutes / 3), Math.floor(minutes / 3) + 1, Math.floor(minutes * 3 / 4), Math.floor(minutes * 3 / 4) + 1, minutes - 1].filter(m => m < minutes))];
    const beeps = [];
    for (const m of checkMinutes) beeps.push({ m, beep: +(await rms(m * 60 + 0.05, m * 60 + 0.35)).toFixed(3), quiet: +(await rms(m * 60 + 20, m * 60 + 20.3)).toFixed(3) });
    // 경계 바로 앞뒤로 삐 소리 위치가 어긋나지 않았는지: 삐 소리 끝(0.4초) 뒤는 조용해야 한다.
    const edge = [];
    for (const m of checkMinutes) edge.push(+(await rms(m * 60 + 0.5, m * 60 + 0.9)).toFixed(3));

    const sink = new mb.CanvasSink(video, { poolSize: 0 });
    const luma = async (sec, x, y) => {
      const frame = await sink.getCanvas(sec);
      const d = frame.canvas.getContext('2d').getImageData(Math.round(x * 1920) - 3, Math.round(y * 1920) - 3, 7, 7).data;
      let min = 255; for (let i = 0; i < d.length; i += 4) min = Math.min(min, (d[i] + d[i + 1] + d[i + 2]) / 3);
      return Math.round(min);
    };
    const inkChecks = [];
    for (const s of strokeTimes.filter(s => [Math.floor(minutes / 2), minutes - 1].includes(s.m) && s.k === 3)) {
      inkChecks.push({ m: s.m, before: await luma((s.at - 1600) / 1000, s.x, s.y), after: await luma((s.at + 100) / 1000, s.x, s.y) });
    }
    return {
      setupS: +(setupMs / 1000).toFixed(1), exportS: +(exported.elapsedMs / 1000).toFixed(1), storage: exported.storage,
      sizeMB: +(exported.blob.size / 1048576).toFixed(1), frames: exported.frames, codecs: [exported.videoCodec, exported.audioCodec],
      duration: await input.computeDuration(), startHeapMB: Math.round(startHeap / 1048576), peakHeapMB: Math.round(peakHeap / 1048576),
      strokes: strokeTimes.length, beeps, edge, inkChecks, timings: exported.timings, encoder: exported.encoder, bench: exported.bench, hiddenMs: Math.round(exported.timings.hidden),
    };
  }, { minutes, slideFiles, busyMs: Number(process.env.BUSY_MS ?? 0), repaint: !!process.env.REPAINT, repaintSlow: !!process.env.REPAINT_SLOW });

  console.log(JSON.stringify(result));
  assert.deepEqual(errors, []);
  assert.ok(result.hiddenMs > 500, '화면이 숨겨진 동안에도 계속 만들었다');
  assert.equal(result.storage, 'opfs', '긴 영상은 브라우저 저장 공간에 쓴다');
  assert.deepEqual(result.codecs, ['avc', 'aac']);
  assert.ok(Math.abs(result.duration - minutes * 60) < 0.5, `영상 길이 ${result.duration}s`);
  for (const b of result.beeps) {
    assert.ok(b.beep > 0.2, `${b.m}분 시작의 삐 소리 ${b.beep}`);
    assert.ok(b.quiet < 0.02, `${b.m}분 20초는 조용 ${b.quiet}`);
  }
  assert.ok(result.edge.every(v => v < 0.05), `삐 소리가 뒤로 밀리지 않았다 ${result.edge}`);
  for (const c of result.inkChecks) {
    assert.ok(c.before > 200 && c.after < 120, `${c.m}분 획: 그리기 전 밝음 ${c.before}, 다 그린 뒤 어두움 ${c.after}`);
  }
  // 메모리: 1시간 녹음 음성을 다 풀면 ~700MB. 조금씩 풀었으면 시작보다 크게 늘지 않는다.
  assert.ok(result.peakHeapMB - result.startHeapMB < 200, `JS 메모리 ${result.startHeapMB}→${result.peakHeapMB}MB`);
  console.log(`PASS: ${minutes}분 가짜 녹음(${result.strokes}획, 클립 3개) → MP4 ${result.sizeMB}MB, ${result.exportS}s, 프레임 ${result.frames}, 메모리 최고 ${result.peakHeapMB}MB`);
} finally {
  await browser?.close();
  vite.kill();
}
