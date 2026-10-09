import { midiToHz } from './song';

export type SoundEffect = 'bite' | 'catch' | 'fanfare' | 'levelUp';
export interface EffectNote { midi: number; at: number; duration: number; wave: OscillatorType; endMidi?: number; volume: number }
export const SFX_GAIN = 0.065;
export const SFX_EVENT = 'pixelWorld:sfx';
const note = (midi: number, at: number, duration: number, wave: OscillatorType = 'square', volume = .5): EffectNote => ({ midi, at, duration, wave, volume });
export function effectNotes(effect: SoundEffect): EffectNote[] {
  if (effect === 'bite') return [
    { ...note(84, 0, .14, 'sine', .7), endMidi: 60 },
    { ...note(57, .09, .21, 'triangle', .65), endMidi: 69 },
    { ...note(100, .01, .07, 'triangle', .18), endMidi: 45 },
  ];
  if (effect === 'levelUp') return [72, 76, 79, 84, 79, 84, 88].map((midi, i) => note(midi, i * .14, i === 6 ? .36 : .13));
  const notes = [72, 76, 79, 84].map((midi, i) => note(midi, i * .14, i === 3 ? .38 : .13));
  if (effect === 'fanfare') notes.push(note(88, .56, .38), note(91, .7, .38), note(72, .7, .38, 'triangle', .3));
  return notes;
}

// 실시간 재생과 오프라인 검증이 같은 음표와 엔벌로프를 사용한다.
export function scheduleEffect(ctx: BaseAudioContext, effect: SoundEffect, when = ctx.currentTime, output: AudioNode = ctx.destination): GainNode {
  const master = ctx.createGain(); master.gain.value = SFX_GAIN; master.connect(output);
  const notes = effectNotes(effect);
  let remaining = notes.length;
  for (const n of notes) {
    const osc = ctx.createOscillator(), env = ctx.createGain();
    const start = when + n.at, end = start + n.duration;
    osc.type = n.wave; osc.frequency.setValueAtTime(midiToHz(n.midi), start);
    if (n.endMidi !== undefined) osc.frequency.exponentialRampToValueAtTime(midiToHz(n.endMidi), end);
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(n.volume, start + .005);
    env.gain.exponentialRampToValueAtTime(.0001, end);
    osc.connect(env); env.connect(master); osc.start(start); osc.stop(end + .01);
    osc.onended = () => { osc.disconnect(); env.disconnect(); if (--remaining === 0) master.disconnect(); };
  }
  return master;
}
export async function renderEffect(effect: SoundEffect, sampleRate = 44100): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, Math.ceil(1.3 * sampleRate), sampleRate);
  scheduleEffect(ctx, effect, 0);
  return ctx.startRendering();
}
// 잠금 해제 전 이벤트를 저장하지 않아 뒤늦게 재생하지 않는다.
export function playSoundEffect(effect: SoundEffect) {
  window.dispatchEvent(new CustomEvent<SoundEffect>(SFX_EVENT, { detail: effect }));
}
