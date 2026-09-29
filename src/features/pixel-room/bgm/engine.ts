// Web Audio 칩튠 재생 엔진. 음표는 song.ts가 정하고, 여기는 음색·믹스·스케줄링만 맡는다.
// 실시간 재생(PixelBgm)과 검토용 오프라인 렌더(renderLoop)가 같은 scheduleNote/buildMix를 써서
// 미리 듣는 wav와 실제 소리가 갈라지지 않게 한다.
import { buildSong, loopSeconds, loopSteps, midiToHz, stepSeconds } from './song';
import type { NoteEvent, Song } from './song';

/** 마스터 게인(실제 출력 음량). 브라우저 테스트가 이 값을 상한으로 검사한다. */
export const MASTER_GAIN = 0.05;
export const FADE_SECONDS = 1.5;
const LOOKAHEAD_SECONDS = 0.25;
const TICK_MS = 50;

interface Mix { input: AudioNode; master: GainNode; pulse12: PeriodicWave; pulse25: PeriodicWave }

// 듀티비 d인 펄스파의 푸리에 계수. 배음을 24개로 끊어서 NES처럼 날카롭기보다 한 겹 둥글게 한다.
function pulseWave(ctx: BaseAudioContext, duty: number): PeriodicWave {
  const harmonics = 24;
  const real = new Float32Array(harmonics + 1), imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    real[n] = Math.sin(2 * Math.PI * n * duty) / (n * Math.PI);
    imag[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (n * Math.PI);
  }
  return ctx.createPeriodicWave(real, imag);
}

// voices → 로우패스 → master → destination, 그리고 로우패스 뒤에서 점8분 에코를 약하게 되먹인다.
function buildMix(ctx: BaseAudioContext, song: Song, gain: number): Mix {
  const input = ctx.createGain();
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass'; lowpass.frequency.value = 2400; lowpass.Q.value = 0.4;
  const master = ctx.createGain();
  master.gain.value = gain;
  const delay = ctx.createDelay(1);
  delay.delayTime.value = stepSeconds(song) * 1.5;
  const feedback = ctx.createGain(); feedback.gain.value = 0.28;
  const wet = ctx.createGain(); wet.gain.value = 0.2;
  input.connect(lowpass);
  lowpass.connect(master);
  lowpass.connect(delay);
  delay.connect(feedback); feedback.connect(delay);
  delay.connect(wet); wet.connect(master);
  master.connect(ctx.destination);
  return { input, master, pulse12: pulseWave(ctx, 0.125), pulse25: pulseWave(ctx, 0.25) };
}

// 음 하나 = 오실레이터 + 엔벨로프 게인. 끝나면 스스로 연결을 끊어 노드가 쌓이지 않는다.
function scheduleNote(ctx: BaseAudioContext, mix: Mix, note: NoteEvent, when: number, step: number) {
  const length = note.length * step;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.frequency.value = midiToHz(note.midi);
  const peak = note.velocity;
  env.gain.setValueAtTime(0, when);
  let end: number;
  if (note.voice === 'bass') {
    osc.type = 'triangle';
    end = when + length * 0.92;
    env.gain.linearRampToValueAtTime(peak, when + 0.012);
    env.gain.setTargetAtTime(peak * 0.75, when + 0.012, 0.25);
    env.gain.setTargetAtTime(0, end - 0.06, 0.02);
  } else if (note.voice === 'arp') {
    osc.setPeriodicWave(mix.pulse12);
    end = when + length * 1.6;
    env.gain.linearRampToValueAtTime(peak, when + 0.006);
    env.gain.setTargetAtTime(0, when + 0.006, length * 0.35);
  } else {
    osc.setPeriodicWave(mix.pulse25);
    end = when + length * 0.95;
    env.gain.linearRampToValueAtTime(peak, when + 0.02);
    env.gain.setTargetAtTime(peak * 0.6, when + 0.02, 0.3);
    env.gain.setTargetAtTime(0, end - 0.1, 0.04);
    // 긴 음에만 늦게 들어오는 얕은 비브라토 — 옛 RPG 멜로디 특유의 흔들림.
    if (length >= 0.9) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = 5.2;
      depth.gain.setValueAtTime(0, when);
      depth.gain.linearRampToValueAtTime(osc.frequency.value * 0.004, when + Math.min(0.6, length * 0.5));
      lfo.connect(depth); depth.connect(osc.frequency);
      lfo.start(when); lfo.stop(end + 0.05);
    }
  }
  osc.connect(env); env.connect(mix.input);
  osc.start(when); osc.stop(end + 0.05);
  osc.onended = () => { osc.disconnect(); env.disconnect(); };
}

/** 루프 한 바퀴를 OfflineAudioContext로 렌더링한다(검토용 wav 스크립트 전용). */
export async function renderLoop(sampleRate = 44100, gain = MASTER_GAIN): Promise<AudioBuffer> {
  const song = buildSong();
  const ctx = new OfflineAudioContext(1, Math.ceil(loopSeconds(song) * sampleRate), sampleRate);
  const mix = buildMix(ctx, song, gain);
  const step = stepSeconds(song);
  for (const note of song.notes) scheduleNote(ctx, mix, note, note.step * step, step);
  return ctx.startRendering();
}

/**
 * 실시간 재생기. 짧은 타이머가 AudioContext 시계로 LOOKAHEAD_SECONDS 앞까지 음을 미리 예약한다
 * (setTimeout으로 음을 직접 치지 않음). AudioContext는 play()가 처음 불릴 때 만든다 — 브라우저
 * 자동재생 정책상 사용자 입력 핸들러 안에서 불러야 한다.
 */
export class PixelBgm {
  private ctx: AudioContext | null = null;
  private mix: Mix | null = null;
  private readonly song: Song = buildSong();
  private readonly byStep: NoteEvent[][];
  private timer: number | undefined;
  private suspendTimer: number | undefined;
  private nextStep = 0;
  private nextTime = 0;
  private playing = false;
  private hidden = false;

  constructor() {
    this.byStep = Array.from({ length: loopSteps(this.song) }, () => []);
    for (const note of this.song.notes) this.byStep[note.step].push(note);
  }

  play() {
    if (this.playing) return;
    this.playing = true;
    window.clearTimeout(this.suspendTimer);
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.mix = buildMix(this.ctx, this.song, 0);
      this.nextTime = this.ctx.currentTime + 0.1;
    }
    if (!this.hidden) void this.ctx.resume();
    this.fadeTo(MASTER_GAIN);
    this.startTimer();
  }

  /** 페이드아웃 후 컨텍스트를 멈춘다. 다시 play()하면 멈춘 자리에서 이어진다. */
  stop() {
    if (!this.playing || !this.ctx) return;
    this.playing = false;
    this.fadeTo(0);
    this.suspendTimer = window.setTimeout(() => {
      if (this.playing || !this.ctx) return;
      this.stopTimer();
      void this.ctx.suspend();
    }, FADE_SECONDS * 1000 + 100);
  }

  /**
   * 재생 중이어야 하는데 컨텍스트가 suspended로 남아 있으면(자동재생 정책이 첫 resume을 거절한
   * 경우 등) 다시 resume을 시도한다. 사용자 입력 핸들러에서 매번 불러도 되게 싸게 끝난다.
   */
  ensureRunning() {
    if (!this.playing || this.hidden || !this.ctx || this.ctx.state !== 'suspended') return;
    void this.ctx.resume();
    this.startTimer();
  }

  /** 탭이 숨겨지면 시계째 멈췄다가, 돌아오면 같은 자리에서 이어간다. */
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    if (!this.ctx || !this.playing) return;
    if (hidden) { this.stopTimer(); void this.ctx.suspend(); }
    else { void this.ctx.resume(); this.startTimer(); }
  }

  /** Pixel World를 나갈 때: 스케줄러를 멈추고 AudioContext를 닫는다. */
  dispose() {
    this.playing = false;
    this.stopTimer();
    window.clearTimeout(this.suspendTimer);
    const ctx = this.ctx;
    this.ctx = null; this.mix = null;
    if (ctx && ctx.state !== 'closed') void ctx.close();
  }

  private fadeTo(target: number) {
    const { ctx, mix } = this;
    if (!ctx || !mix) return;
    const now = ctx.currentTime, gain = mix.master.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(target, now + FADE_SECONDS);
  }

  private startTimer() {
    if (this.timer !== undefined || this.hidden) return;
    this.tick();
    this.timer = window.setInterval(() => this.tick(), TICK_MS);
  }
  private stopTimer() { window.clearInterval(this.timer); this.timer = undefined; }

  private tick() {
    const { ctx, mix } = this;
    if (!ctx || !mix || ctx.state !== 'running') return;
    const step = stepSeconds(this.song);
    // 메인 스레드가 오래 막혔다가 돌아오면 밀린 음을 한꺼번에 치지 않고 현재 시각으로 건너뛴다.
    if (this.nextTime < ctx.currentTime - 0.05) {
      const behind = Math.ceil((ctx.currentTime - this.nextTime) / step);
      this.nextStep = (this.nextStep + behind) % this.byStep.length;
      this.nextTime += behind * step;
    }
    while (this.nextTime < ctx.currentTime + LOOKAHEAD_SECONDS) {
      for (const note of this.byStep[this.nextStep]) scheduleNote(ctx, mix, note, this.nextTime, step);
      this.nextStep = (this.nextStep + 1) % this.byStep.length;
      this.nextTime += step;
    }
  }
}
