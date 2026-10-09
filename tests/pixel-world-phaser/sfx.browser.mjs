import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { trackReel } from './reel-player.browser-helper.mjs';
const base = process.env.PWP_BASE ?? 'http://127.0.0.1:5177';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.audioCalls = []; window.vibrationCalls = []; window.contexts = 0; window.effectMasters = [];
    const Native = window.AudioContext;
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args); window.contexts++;
        const createOsc = this.createOscillator.bind(this), createGain = this.createGain.bind(this);
        this.createGain = () => {
          const gain = createGain(), connect = gain.connect.bind(gain);
          gain.connect = target => {
            gain.__target = target;
            if (Math.abs(gain.gain.value - .065) < .000001) window.effectMasters.push(gain);
            return connect(target);
          };
          return gain;
        };
        this.createOscillator = () => {
          const osc = createOsc(), connect = osc.connect.bind(osc), start = osc.start.bind(osc);
          osc.connect = target => { osc.__target = target; return connect(target); };
          osc.start = time => {
            if (Math.abs(osc.__target?.__target?.gain?.value - .065) < .000001) window.audioCalls.push({ type: osc.type, time, at: performance.now() });
            return start(time);
          }; return osc;
        };
      }
    };
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value(command) {
      const game = window.hapticReel;
      window.vibrationCalls.push({ command, at: performance.now(), status: game?.status, inside: game && Math.hypot(game.zoneX-game.fishX, game.zone-game.fish) <= game.zoneSize });
      return true;
    } });
    // 릴 "딸깍" 이벤트도 원 안팎 상태와 함께 기록한다.
    window.reelClicks = [];
    window.addEventListener('pixelWorld:sfx', event => {
      if (event.detail !== 'reelClick') return;
      const game = window.hapticReel;
      window.reelClicks.push({ at: performance.now(), status: game?.status, inside: game && Math.hypot(game.zoneX-game.fishX, game.zone-game.fish) <= game.zoneSize, progress: game?.progress ?? 0 });
    });
  });
  // 실제 릴 계산 결과로 진동 순간의 원 안팎 상태를 검증한다.
  await page.route('**/logic/reelGame.ts', route => route.fulfill({ contentType: 'application/javascript', body: `
    export * from '/src/features/pixel-world-phaser/logic/reelGame.ts?sfx-original';
    import { stepReelGame as step } from '/src/features/pixel-world-phaser/logic/reelGame.ts?sfx-original';
    export function stepReelGame(...args) { const result=step(...args); window.hapticReel=result; return result; }
  ` }));
  await page.goto(base + '/tests/pixel-world-phaser/sfx.harness.html');
  await page.waitForFunction(() => window.sfxProbe?.fishing.state);
  assert.equal(await page.evaluate(() => window.contexts), 0);
  await page.getByTestId('sound').click();
  await page.waitForFunction(() => window.contexts === 1);
  await page.getByTestId('cast').click();
  await page.waitForFunction(() => window.sfxProbe.fishing.phase === 'bite');
  assert.equal(await page.evaluate(() => window.audioCalls.length), 3);
  assert.deepEqual(await page.evaluate(() => window.vibrationCalls), []);
  await page.keyboard.press('z'); await page.getByTestId('reel-bar').waitFor();
  await trackReel(page);
  await page.getByTestId('catch').waitFor();
  const clicks = await page.evaluate(() => window.reelClicks);
  assert.ok(clicks.length > 0, '원 안에 있는 동안 릴 소리가 난다');
  assert.ok(clicks.every(call => call.inside && call.status === 'playing'), '원 밖이나 미니게임 밖에서는 릴 소리가 없다');
  for (let i=1; i<clicks.length; i++) assert.ok(clicks[i].at-clicks[i-1].at >= 50);
  // 음표 수: 입질 3 + 딸깍 2개씩 + 낚음 4.
  assert.equal(await page.evaluate(() => window.audioCalls.length), 7 + clicks.length * 2);
  const vibration = await page.evaluate(() => window.vibrationCalls);
  const pulses = vibration.filter(call => call.command > 0);
  assert.ok(pulses.length > 0);
  assert.ok(pulses.every(call => call.inside && call.status === 'playing' && call.command === 15));
  for (let i=1; i<pulses.length; i++) assert.ok(pulses[i].at-pulses[i-1].at >= 175);
  assert.equal(vibration.at(-1).command, 0);
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.vibrationCalls.length), vibration.length);
  await page.evaluate(() => window.sfxProbe.setLevel(2));
  await page.locator('.pwp-level-toast').waitFor();
  assert.equal(await page.evaluate(() => window.audioCalls.length), 14 + clicks.length * 2, 'StrictMode level toast plays once');
  await page.getByTestId('sound').click();
  assert.equal(await page.getByTestId('sound').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.evaluate(() => window.effectMasters.at(-1).gain.value), 0, 'mute silences an already scheduled jingle');
  assert.equal(await page.evaluate(() => localStorage.getItem('pixelWorld:bgm:v1')), 'off');
  await page.evaluate(async () => {
    const { playSoundEffect } = await import('/src/features/pixel-room/bgm/sfx.ts');
    for (const effect of ['bite','catch','fanfare','levelUp']) playSoundEffect(effect);
    window.sfxProbe.setLevel(3);
  });
  await page.getByTestId('cast').click();
  await page.waitForFunction(() => window.sfxProbe.fishing.phase === 'bite');
  assert.equal(await page.evaluate(() => window.audioCalls.length), 14 + clicks.length * 2, '소리를 끄면 효과음이 늘지 않는다');
  assert.equal(await page.evaluate(() => window.vibrationCalls.length), vibration.length);
  await page.keyboard.press('z');
  await page.waitForFunction(count => window.vibrationCalls.length > count, vibration.length);
  assert.equal(await page.evaluate(() => window.vibrationCalls.at(-1).command), 15, 'muting sound leaves reel haptics enabled');
  await page.evaluate(() => window.sfxProbe.fishing.cancel());
  assert.equal(await page.evaluate(() => window.vibrationCalls.at(-1).command), 0, 'cancel stops reel haptics');
  assert.equal(await page.evaluate(() => window.contexts), 1);
  assert.deepEqual(errors, []);
  console.log('PASS SFX: shared gesture-unlocked context, bite/no vibration, reel overlap pulses/stop, catch, level/StrictMode, mute/storage');
  // 진동 API가 없는 기기에서도 조용히 동작한다.
  await page.evaluate(() => { Object.defineProperty(navigator, 'vibrate', { value: undefined }); });
  await page.evaluate(async () => { const { vibrate } = await import('/src/features/pixel-world-phaser/logic/reelHaptics.ts'); vibrate(15); vibrate(0); });
  await page.evaluate(() => localStorage.setItem('pixelWorld:bgm:v1', 'on'));
  await page.reload();
  await page.waitForFunction(() => window.sfxProbe?.fishing.state);
  assert.equal(await page.evaluate(() => window.contexts), 0, 'stored sound preference does not start audio on load');
  await page.getByTestId('cast').click();
  await page.waitForFunction(() => window.sfxProbe.fishing.phase === 'bite');
  assert.equal(await page.evaluate(() => window.contexts), 1);
  assert.equal(await page.evaluate(() => window.audioCalls.length), 3, 'stored sound unlocks through the gameplay gesture');
} finally { await browser.close(); }
