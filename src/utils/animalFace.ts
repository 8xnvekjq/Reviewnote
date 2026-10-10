export const PEER_ANIMAL_FACES = [
  '🐶', '🐱', '🐰', '🦊', '🐼', '🐨', '🐯', '🦁', '🐻', '🐹', '🐧', '🐥', '🐸', '🐵', '🐷', '🐮', '🐙', '🦄',
  '🐭', '🦔', '🦦', '🦥', '🐳', '🐬', '🦭', '🐢', '🦋', '🐝', '🐞', '🦉', '🦆', '🐤', '🐣',
] as const;

/** SQL의 md5 앞 8자리와 같은 부호 없는 32비트 값. UUID는 SQL처럼 소문자로 정규화한다. */
export function animalFaceHash(userId: string): number {
  const bytes = new TextEncoder().encode('exam-peer-face:' + userId.toLowerCase());
  const size = Math.ceil((bytes.length + 9) / 64) * 64;
  const buffer = new Uint8Array(size); buffer.set(bytes); buffer[bytes.length] = 128;
  const view = new DataView(buffer.buffer); view.setUint32(size - 8, bytes.length * 8, true);
  const shifts = [7,12,17,22, 5,9,14,20, 4,11,16,23, 6,10,15,21];
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let offset = 0; offset < size; offset += 64) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      const round = i >> 4;
      const f = round === 0 ? (b & c) | (~b & d) : round === 1 ? (d & b) | (~d & c) : round === 2 ? b ^ c ^ d : c ^ (b | ~d);
      const g = round === 0 ? i : round === 1 ? (5 * i + 1) % 16 : round === 2 ? (3 * i + 5) % 16 : (7 * i) % 16;
      const sum = (a + f + Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) + view.getUint32(offset + g * 4, true)) | 0;
      const shift = shifts[round * 4 + i % 4];
      a = d; d = c; c = b; b = (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }
  return (((a0 & 255) << 24) | ((a0 & 0xff00) << 8) | ((a0 >>> 8) & 0xff00) | (a0 >>> 24)) >>> 0;
}

/** 서버 목록과 교사가 지정한 기린만 허용하며 여러 이모지나 글은 받지 않는다. */
export function validAnimalFace(value: unknown): value is string {
  return typeof value === 'string' && [...PEER_ANIMAL_FACES, '🦒'].includes(value as typeof PEER_ANIMAL_FACES[number]);
}

/** 서버 재정의가 우선. 계정 정보가 없는 구형 접속자는 익명 세션 UUID를 대신 쓴다. */
export function userAnimalFace(userId: string, override?: unknown): string {
  return validAnimalFace(override) ? override : PEER_ANIMAL_FACES[animalFaceHash(userId) % PEER_ANIMAL_FACES.length];
}
