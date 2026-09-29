// Pixel World 배경음악의 곡 데이터 — 재생 엔진(engine.ts)과 분리된 순수 TS라 Node 단위 테스트로
// 음역/박자/코드 규칙을 바로 검증한다(tests/pixel-room/bgm.test.ts). 90년대 RPG 마을·집 테마처럼
// 조용한 칩튠: 76 BPM, 8분음표 = 1 step, 한 마디 8 step, 24마디(약 76초) 루프.
//
// 구성(A–B–A'): A는 Fmaj7–Em7–Dm7–Cmaj7 두 번, B는 B♭maj7–Am7–Gm7–C7 두 번, A'는 두 진행을 한
// 번씩 이어 붙여 C7에서 다시 처음의 Fmaj7로 돌아간다. 세 구간은 멜로디·아르페지오 모양·베이스
// 리듬을 모두 다르게 해서 반복 피로를 줄이고, A'는 멜로디를 쉬엄쉬엄 비워 숨 쉴 틈을 둔다.

export type Voice = 'bass' | 'arp' | 'melody';
export interface NoteEvent { voice: Voice; step: number; length: number; midi: number; velocity: number }
export interface Chord { name: string; tones: readonly number[]; scale: readonly number[] }
export interface Song { bpm: number; stepsPerBeat: number; stepsPerBar: number; chords: readonly Chord[]; notes: readonly NoteEvent[] }

export const BPM = 76;
export const STEPS_PER_BEAT = 2;
export const STEPS_PER_BAR = 8;
export const VOICE_RANGE: Record<Voice, { low: number; high: number }> = {
  bass: { low: 36, high: 60 },   // C2–C4, 삼각파
  arp: { low: 55, high: 79 },    // G3–G5, 12.5% 펄스
  melody: { low: 65, high: 84 }, // F4–C6, 25% 펄스
};

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'Bb4' → 70. 옥타브 번호는 과학적 음높이 표기(C4 = 60). */
export function noteToMidi(name: string): number {
  const match = /^([A-G])(b|#)?(-?\d)$/.exec(name);
  if (!match) throw new Error(`bad note ${name}`);
  return PITCH[match[1]] + (match[2] === 'b' ? -1 : match[2] === '#' ? 1 : 0) + (Number(match[3]) + 1) * 12;
}
export const pitchClass = (midi: number) => ((midi % 12) + 12) % 12;
const pcs = (...names: string[]) => names.map(name => pitchClass(noteToMidi(`${name}4`)));

const C_MAJOR = pcs('C', 'D', 'E', 'F', 'G', 'A', 'B');
const F_MAJOR = pcs('F', 'G', 'A', 'Bb', 'C', 'D', 'E');
// tones: 코드 구성음. scale: 그 코드 위에서 경과음으로 써도 되는 음. Fmaj7 위의 B(#11)는 이 곡의
// 차분한 분위기에 비해 밝게 튀어서 일부러 뺐다.
const CHORDS = {
  Fmaj7: { name: 'Fmaj7', tones: pcs('F', 'A', 'C', 'E'), scale: pcs('F', 'G', 'A', 'C', 'D', 'E') },
  Em7: { name: 'Em7', tones: pcs('E', 'G', 'B', 'D'), scale: C_MAJOR },
  Dm7: { name: 'Dm7', tones: pcs('D', 'F', 'A', 'C'), scale: C_MAJOR },
  Cmaj7: { name: 'Cmaj7', tones: pcs('C', 'E', 'G', 'B'), scale: C_MAJOR },
  Bbmaj7: { name: 'B♭maj7', tones: pcs('Bb', 'D', 'F', 'A'), scale: F_MAJOR },
  Am7: { name: 'Am7', tones: pcs('A', 'C', 'E', 'G'), scale: F_MAJOR },
  Gm7: { name: 'Gm7', tones: pcs('G', 'Bb', 'D', 'F'), scale: F_MAJOR },
  C7: { name: 'C7', tones: pcs('C', 'E', 'G', 'Bb'), scale: F_MAJOR },
} satisfies Record<string, Chord>;
type ChordId = keyof typeof CHORDS;

// 아르페지오용 보이싱(아래→위 4음, 멜로디보다 낮게)과 베이스 근음.
const VOICING: Record<ChordId, string[]> = {
  Fmaj7: ['A3', 'C4', 'E4', 'F4'], Em7: ['G3', 'B3', 'D4', 'E4'], Dm7: ['A3', 'C4', 'D4', 'F4'], Cmaj7: ['G3', 'B3', 'C4', 'E4'],
  Bbmaj7: ['A3', 'Bb3', 'D4', 'F4'], Am7: ['G3', 'A3', 'C4', 'E4'], Gm7: ['G3', 'Bb3', 'D4', 'F4'], C7: ['G3', 'Bb3', 'C4', 'E4'],
};
const ROOT: Record<ChordId, string> = { Fmaj7: 'F2', Em7: 'E2', Dm7: 'D2', Cmaj7: 'C2', Bbmaj7: 'Bb2', Am7: 'A2', Gm7: 'G2', C7: 'C3' };

// 구간별 반주 모양. arp는 보이싱 인덱스(4~7은 한 옥타브 위), bass는 [근음 기준 반음, 길이] 목록.
interface Section { arp: number[]; bass: [number, number][] }
const SECTION_A: Section = { arp: [0, 2, 1, 3, 0, 2, 1, 3], bass: [[0, 4], [7, 4]] };
const SECTION_B: Section = { arp: [0, 1, 2, 3, 2, 1, 0, 1], bass: [[0, 3], [0, 1], [7, 4]] };
const SECTION_A2: Section = { arp: [0, 1, 2, 3, 4, 3, 2, 1], bass: [[0, 4], [7, 2], [12, 2]] };

// 멜로디: 마디마다 '음:길이(step)' 나열, r은 쉼표. 각 마디의 길이 합은 정확히 8 step.
const BARS: [ChordId, Section, string][] = [
  // A — 잔잔하게 묻고 답하기
  ['Fmaj7', SECTION_A, 'A4:3 C5:1 E5:4'],
  ['Em7', SECTION_A, 'D5:3 B4:1 G4:4'],
  ['Dm7', SECTION_A, 'F4:2 A4:2 C5:3 D5:1'],
  ['Cmaj7', SECTION_A, 'E5:6 r:2'],
  ['Fmaj7', SECTION_A, 'A4:3 C5:1 E5:2 F5:2'],
  ['Em7', SECTION_A, 'G5:3 E5:1 D5:2 B4:2'],
  ['Dm7', SECTION_A, 'C5:2 D5:2 F5:3 E5:1'],
  ['Cmaj7', SECTION_A, 'B4:2 C5:4 r:2'],
  // B — 서브도미넌트 쪽으로 조금 밝아진다
  ['Bbmaj7', SECTION_B, 'D5:3 F5:1 A5:4'],
  ['Am7', SECTION_B, 'G5:2 E5:2 C5:4'],
  ['Gm7', SECTION_B, 'Bb4:3 D5:1 F5:2 E5:2'],
  ['C7', SECTION_B, 'E5:6 r:2'],
  ['Bbmaj7', SECTION_B, 'F5:3 D5:1 A4:2 Bb4:2'],
  ['Am7', SECTION_B, 'C5:3 A4:1 E5:4'],
  ['Gm7', SECTION_B, 'D5:2 F5:2 G5:2 A5:2'],
  ['C7', SECTION_B, 'G5:3 F5:1 E5:2 r:2'],
  // A' — 멜로디를 비우고 아르페지오가 한 옥타브 굴러 올라가며 처음으로 돌아간다
  ['Fmaj7', SECTION_A2, 'r:4 C5:2 A4:2'],
  ['Em7', SECTION_A2, 'B4:6 G4:2'],
  ['Dm7', SECTION_A2, 'r:4 F4:2 A4:2'],
  ['Cmaj7', SECTION_A2, 'G4:8'],
  ['Bbmaj7', SECTION_A2, 'r:2 F4:2 A4:2 C5:2'],
  ['Am7', SECTION_A2, 'E5:4 C5:2 A4:2'],
  ['Gm7', SECTION_A2, 'Bb4:2 A4:2 G4:4'],
  ['C7', SECTION_A2, 'G4:4 r:4'],
];

const VELOCITY: Record<Voice, number> = { bass: 0.9, arp: 0.32, melody: 0.55 };

/** '음:길이' 마디 문자열을 (쉼표 포함) 조각으로. 테스트가 마디별 길이 합을 이걸로 검사한다. */
export function parseBar(text: string): { midi: number | null; length: number }[] {
  return text.trim().split(/\s+/).map(token => {
    const [name, length] = token.split(':');
    return { midi: name === 'r' ? null : noteToMidi(name), length: Number(length) };
  });
}

export function buildSong(): Song {
  const notes: NoteEvent[] = [];
  const chords: Chord[] = [];
  BARS.forEach(([id, section, melody], bar) => {
    const start = bar * STEPS_PER_BAR;
    chords.push(CHORDS[id]);
    const voicing = VOICING[id].map(noteToMidi);
    section.arp.forEach((index, i) => notes.push({ voice: 'arp', step: start + i, length: 1, midi: voicing[index % 4] + (index >= 4 ? 12 : 0), velocity: VELOCITY.arp }));
    let at = start;
    for (const [interval, length] of section.bass) {
      notes.push({ voice: 'bass', step: at, length, midi: noteToMidi(ROOT[id]) + interval, velocity: VELOCITY.bass });
      at += length;
    }
    at = start;
    for (const piece of parseBar(melody)) {
      if (piece.midi !== null) notes.push({ voice: 'melody', step: at, length: piece.length, midi: piece.midi, velocity: VELOCITY.melody });
      at += piece.length;
    }
  });
  return { bpm: BPM, stepsPerBeat: STEPS_PER_BEAT, stepsPerBar: STEPS_PER_BAR, chords, notes };
}

export const MELODY_BARS: readonly string[] = BARS.map(([, , melody]) => melody);
export const loopSteps = (song: Song) => song.chords.length * song.stepsPerBar;
export const stepSeconds = (song: Song) => 60 / song.bpm / song.stepsPerBeat;
export const loopSeconds = (song: Song) => loopSteps(song) * stepSeconds(song);
export const midiToHz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
