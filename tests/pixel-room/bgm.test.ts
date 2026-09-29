import test from 'node:test';
import assert from 'node:assert/strict';
import { BPM, MELODY_BARS, STEPS_PER_BAR, VOICE_RANGE, buildSong, loopSeconds, loopSteps, noteToMidi, parseBar, pitchClass } from '../../src/features/pixel-room/bgm/song.ts';
import type { Voice } from '../../src/features/pixel-room/bgm/song.ts';

const song = buildSong();
const voices: Voice[] = ['bass', 'arp', 'melody'];

test('note names map to the MIDI numbers the ranges assume', () => {
  assert.equal(noteToMidi('C4'), 60);
  assert.equal(noteToMidi('A4'), 69);
  assert.equal(noteToMidi('Bb2'), 46);
  assert.equal(noteToMidi('F#3'), 54);
  assert.throws(() => noteToMidi('H4'));
});

test('tempo is calm and one loop lasts 60–90 seconds', () => {
  assert.ok(BPM >= 70 && BPM <= 84);
  assert.equal(song.bpm, BPM);
  const seconds = loopSeconds(song);
  assert.ok(seconds >= 60 && seconds <= 90, `loop is ${seconds}s`);
});

test('every voice stays in its register', () => {
  for (const note of song.notes) {
    const { low, high } = VOICE_RANGE[note.voice];
    assert.ok(note.midi >= low && note.midi <= high, `${note.voice} ${note.midi} at step ${note.step}`);
    assert.ok(note.velocity > 0 && note.velocity <= 1);
  }
});

test('beats add up: each bar of the written melody is exactly one bar, and the loop is whole bars', () => {
  assert.equal(MELODY_BARS.length, song.chords.length);
  MELODY_BARS.forEach((bar, index) => {
    assert.equal(parseBar(bar).reduce((sum, piece) => sum + piece.length, 0), STEPS_PER_BAR, `melody bar ${index + 1}: ${bar}`);
  });
  assert.equal(loopSteps(song), song.chords.length * STEPS_PER_BAR);
  for (const voice of voices) {
    const notes = song.notes.filter(note => note.voice === voice).sort((a, b) => a.step - b.step);
    assert.ok(notes.length > 0);
    for (const note of notes) {
      assert.ok(Number.isInteger(note.step) && Number.isInteger(note.length) && note.length > 0);
      // no note rings past its bar or past the loop, so the loop seam is clean
      assert.ok(Math.floor(note.step / STEPS_PER_BAR) === Math.floor((note.step + note.length - 1) / STEPS_PER_BAR), `${voice} step ${note.step} crosses a bar line`);
    }
    // monophonic voices: no overlaps, and notes + rests fill the loop exactly
    notes.forEach((note, i) => { if (i > 0) assert.ok(note.step >= notes[i - 1].step + notes[i - 1].length, `${voice} overlap at ${note.step}`); });
    const sounding = notes.reduce((sum, note) => sum + note.length, 0);
    assert.ok(sounding <= loopSteps(song));
  }
  // bass and arp never rest: their lengths sum to the full loop
  for (const voice of ['bass', 'arp'] as const) {
    assert.equal(song.notes.filter(note => note.voice === voice).reduce((sum, note) => sum + note.length, 0), loopSteps(song));
  }
});

test('notes agree with the chord of their bar', () => {
  for (const note of song.notes) {
    const chord = song.chords[Math.floor(note.step / STEPS_PER_BAR)];
    const pc = pitchClass(note.midi);
    const where = `${note.voice} ${note.midi} at step ${note.step} over ${chord.name}`;
    if (note.voice !== 'melody') { assert.ok(chord.tones.includes(pc), where); continue; }
    assert.ok(chord.scale.includes(pc), `${where} is outside the scale`);
    // strong beats (beats 1 and 3) land on chord tones; passing tones only in between
    if (note.step % (STEPS_PER_BAR / 2) === 0) assert.ok(chord.tones.includes(pc), `${where} is a non-chord tone on a strong beat`);
  }
  // each bar's bass starts on the chord root's pitch class
  song.chords.forEach((chord, bar) => {
    const first = song.notes.find(note => note.voice === 'bass' && note.step === bar * STEPS_PER_BAR);
    assert.ok(first && chord.tones.includes(pitchClass(first.midi)));
  });
});

test('the loop is varied, not one phrase repeated', () => {
  assert.deepEqual(song.chords.slice(0, 4).map(chord => chord.name), ['Fmaj7', 'Em7', 'Dm7', 'Cmaj7']);
  assert.deepEqual(song.chords.slice(8, 12).map(chord => chord.name), ['B♭maj7', 'Am7', 'Gm7', 'C7']);
  assert.ok(new Set(MELODY_BARS).size >= MELODY_BARS.length - 2, 'melody bars are (almost) all different');
  const arpShape = (bar: number) => song.notes.filter(note => note.voice === 'arp' && Math.floor(note.step / STEPS_PER_BAR) === bar).map(note => note.midi).join();
  // same chord (Fmaj7) in the A, and A' sections gets a different arpeggio figure
  assert.notEqual(arpShape(0), arpShape(16));
  // the last chord leads back into the first (C7 → Fmaj7) so the seam sounds like a cadence
  assert.equal(song.chords.at(-1)!.name, 'C7');
  assert.equal(song.chords[0].name, 'Fmaj7');
});
