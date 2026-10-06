import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const base = `${process.env.EXAM_TEST_BASE_URL || 'http://127.0.0.1:5174'}/tests/exam/practice.html`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const out = `${process.env.EXAM_TEST_ARTIFACT_DIR || '.test-artifacts'}/replay-gaps`;
await mkdir(out, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  await page.getByTestId('exam-start').waitFor();
  await page.locator('.exam-paper-card[data-paper-id="2025-06-math"]').click();
  await page.getByRole('radio', { name: /자유 모드/ }).click();
  await page.getByRole('radio', { name: /확통/ }).click();
  await page.getByTestId('exam-start-button').click();
  await page.getByTestId('exam-solve').waitFor();
  await page.evaluate(() => {
    const original = window.__examClient.getPeerSolutionByKey;
    window.__examClient.getPeerSolutionByKey = async (...args) => {
      const data = await original(...args);
      const teacher = args[2] === 'mock-peer-teacher';
      const hours = 7 * 3600000;
      const strokes = data.strokes.slice(0, 2).map(stroke => ({ ...stroke,
        points: [0, 100, 200].map(t => ({ x: .1 + t / 1000, y: .5, pressure: .5, t })) }));
      const ends = teacher ? [1000, hours + 5000] : [1000, 51200];
      const events = strokes.map((stroke, index) => ({ id: `gap-${index}`, kind: 'draw', at: ends[index],
        removed: [], added: [{ index, stroke }] }));
      return { ...data, strokes, batches: [{ id: 'gap-batch', baseRevision: 0, revision: 1, baseline: [], events }],
        audioOriginMs: 0, audioClips: teacher ? data.audioClips.map((clip, index) => ({ ...clip,
          offsetMs: index ? hours + 4000 : 0, durationMs: 4000 })) : [] };
    };
  });
  await page.locator('.exam-choice[data-choice="3"]').click();
  await page.getByRole('button', { name: '채점해 보기', exact: true }).click();
  const open = async teacher => {
    await page.getByTestId('exam-free-peer').click();
    const rows = page.getByTestId('exam-peer-row');
    await (teacher ? rows.last() : rows.first()).click();
    await page.getByRole('slider', { name: '필기 재생 위치' }).waitFor();
  };
  const seek = async value => {
    await page.getByRole('slider', { name: '필기 재생 위치' }).evaluate((input, next) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(next));
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
  };
  await open(true);
  // 긴 멈춤은 줄여서 재생하지만 막대에 고민 시간 점은 그리지 않는다(무의미한 점이라는 의견).
  assert.equal(await page.getByTestId('exam-replay-pause').count(), 0);
  assert.equal(await page.getByRole('slider').getAttribute('max'), '9500');
  await page.waitForFunction(() => !document.querySelector('audio').paused);
  await page.getByTestId('exam-audio-sound').click();
  await page.waitForFunction(() => !document.querySelector('audio').muted);
  await seek(6500);
  await page.waitForFunction(() => Math.abs(document.querySelector('audio').currentTime - 1) < .1);
  assert.equal(await page.getByTestId('exam-replay-position').getAttribute('data-step'), '2');
  await seek(6000);
  assert.equal(await page.getByTestId('exam-replay-position').getAttribute('data-step'), '1');
  await page.getByRole('button', { name: '2×', exact: true }).click();
  assert.equal(await page.getByTestId('exam-audio-player').evaluate(audio => audio.playbackRate), 2);
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector('[data-testid="exam-replay-position"]').dataset.step) === 2);
  await page.waitForFunction(() => !document.querySelector('audio').paused);
  const elapsed = await page.getByTestId('exam-audio-player').evaluate(audio => audio.currentTime);
  const timelineTime = Number(await page.getByRole('slider').inputValue());
  assert.ok(Math.abs(elapsed - (timelineTime - 5500) / 1000) < .4);
  await page.getByRole('button', { name: '일시정지', exact: true }).click();
  assert.equal(await page.getByTestId('exam-audio-player').evaluate(audio => audio.paused), true);
  await page.screenshot({ path: `${out}/mobile-replay-bar.png` });
  await page.getByRole('button', { name: '마지막', exact: true }).click();
  assert.equal(await page.getByTestId('exam-replay-position').getAttribute('data-step'), '2');
  await page.getByRole('button', { name: '처음', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('audio').currentTime < .1);
  assert.ok(await page.locator('.exam-replay-inline').count());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.getByTestId('exam-peer-back').click();
  await open(false);
  assert.equal(await page.getByTestId('exam-replay-pause').count(), 0);
  await page.getByTestId('exam-peer-back').click();

  // 겹치는 녹음은 둘 다 재생되며, 탐색과 배속도 같은 시계를 따른다.
  await page.evaluate(() => {
    const original = window.__examClient.getPeerSolutionByKey;
    window.__examClient.getPeerSolutionByKey = async (...args) => {
      const data = await original(...args);
      data.audioClips.push({ ...data.audioClips[0], id: 'overlap', offsetMs: 500, durationMs: 3000 });
      return data;
    };
  });
  await open(true);
  assert.equal(await page.getByTestId('exam-audio-player').count(), 2);
  await seek(1500);
  await page.waitForFunction(() => {
    const [a, b] = document.querySelectorAll('audio');
    return Math.abs(a.currentTime - 1.5) < .1 && Math.abs(b.currentTime - 1) < .1;
  });
  await page.getByRole('button', { name: '4×', exact: true }).click();
  await page.getByTestId('exam-audio-sound').click();
  await page.getByRole('button', { name: '재생', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('audio')].every(audio => !audio.paused && !audio.muted && audio.playbackRate === 4));
  assert.deepEqual(errors, []);
  console.log('Replay gaps browser: seven-hour compression, clip/ink timing, seek, speed, pause/resume, endpoints, no pause markers, ink-only labels and overlapping audio passed.');
} finally { await browser.close(); }
