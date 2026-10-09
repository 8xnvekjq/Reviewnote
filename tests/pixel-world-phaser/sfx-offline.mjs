import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto((process.env.PWP_BASE ?? 'http://127.0.0.1:5177') + '/tests/pixel-world-phaser/sfx.harness.html');
    await mkdir('.test-artifacts/pw-sfx', { recursive: true });
    for (const effect of ['bite','catch','fanfare','levelUp','reelClick']) {
      const samples = await page.evaluate(async effect => {
        const { renderEffect } = await import('/src/features/pixel-room/bgm/sfx.ts');
        return Array.from((await renderEffect(effect, 22050)).getChannelData(0));
      }, effect);
      const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
      assert.ok(peak > .005 && peak < .15, `${effect}: peak ${peak}`);
      assert.ok(samples.every(Number.isFinite));
      const wav = Buffer.alloc(44 + samples.length * 2);
      wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(22050, 24); wav.writeUInt32LE(44100, 28);
      wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(samples.length * 2, 40);
      samples.forEach((value, i) => wav.writeInt16LE(Math.round(value * 32767), 44 + i * 2));
      await writeFile(`.test-artifacts/pw-sfx/${effect}.wav`, wav);
    }
  } finally { await browser.close(); }
console.log('PASS OfflineAudioContext: five bounded non-silent effects and WAV previews');
