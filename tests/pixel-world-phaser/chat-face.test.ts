import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_MAX_CHARS, CHAT_SHOW_MS, chatAccepted, normalizeChat, parseChat } from '../../src/features/pixel-room/plaza/plazaChat.ts';
import { CLOUD_PAD_X, CLOUD_PAD_Y, cloudMask } from '../../src/features/pixel-world-phaser/logic/cloudBubble.ts';
import { facePixels } from '../../src/features/pixel-world-phaser/logic/avatarPixels.ts';

// ── 광장 한마디 ──
test('chat: trims, collapses whitespace/newlines, strips hidden direction marks, caps at 40 code points', () => {
  assert.equal(normalizeChat('   '), '');
  assert.equal(normalizeChat('  안녕\n\n  친구들 \t'), '안녕 친구들');
  assert.equal(normalizeChat('a\u202eb\u0000c'), 'a b c');
  const long = '가'.repeat(60);
  assert.equal(Array.from(normalizeChat(long)).length, CHAT_MAX_CHARS);
  assert.equal(Array.from(normalizeChat('😀'.repeat(50))).length, CHAT_MAX_CHARS, 'emoji count as one');
});
test('chat: parse keeps only well-formed messages and never keeps extra fields', () => {
  const ok = parseChat({ sessionId: 's1', text: ' 같이 가자 ', sentAt: 123, name: '실명', html: '<b>' });
  assert.deepEqual(ok, { sessionId: 's1', text: '같이 가자', sentAt: 123 });
  for (const bad of [null, 'hi', { sessionId: '', text: 'a', sentAt: 1 }, { sessionId: 's', text: 3, sentAt: 1 },
    { sessionId: 's', text: '   ', sentAt: 1 }, { sessionId: 's', text: 'a', sentAt: NaN }, { sessionId: 's', text: 'a', sentAt: Infinity },
    { sessionId: 's', text: 'a', sentAt: '1' }, { sessionId: 's', text: 'x'.repeat(500), sentAt: 1 }]) {
    assert.equal(parseChat(bad), null);
  }
});
test('chat: a sender clock skewed ±10 minutes is still accepted and paced by the receiver clock', () => {
  const now = 1_700_000_000_000;
  for (const skew of [-10 * 60_000, 10 * 60_000]) {
    // 보낸 쪽 시계가 10분 빠르거나 느려도 첫 말은 받는다(parseChat은 내 시계와 비교하지 않는다).
    const first = parseChat({ sessionId: 's', text: '안녕', sentAt: now + skew });
    assert.ok(first);
    assert.equal(chatAccepted(undefined, first.sentAt, now), true);
    const prev = { sentAt: now + skew, receivedAt: now };
    // 다음 말: 1.5초 뒤(보낸 쪽 시계도 1.5초 흐름) → 받는다. 같은 말 재전송/1초 안 → 버린다.
    assert.equal(chatAccepted(prev, now + skew + 1500, now + 1500), true);
    assert.equal(chatAccepted(prev, now + skew, now + 2000), false, 'duplicate');
    assert.equal(chatAccepted(prev, now + skew + 800, now + 800), false, 'faster than the receive gap');
  }
});
test('chat: a sender whose clock jumps backwards is only held back while the old bubble is showing', () => {
  const now = 1_700_000_000_000, prev = { sentAt: now + 600_000, receivedAt: now };
  // 보낸 기기 시계가 10분 뒤로 맞춰짐 → 5초 안에는 늦게 온 옛 말로 보고 버리지만, 그 뒤로는 다시 받는다.
  assert.equal(chatAccepted(prev, now + 2000, now + 2000), false);
  assert.equal(chatAccepted(prev, now + CHAT_SHOW_MS, now + CHAT_SHOW_MS), true);
  assert.equal(chatAccepted(prev, now + 60_000, now + 60_000), true);
});

// ── 구름 말풍선 ──
test('cloud bubble: puffy (not a square box), outlined, tail at the bottom, text area fully inside', () => {
  for (const [w, h] of [[14, 9], [72, 18], [128, 18]]) {
    const m = cloudMask(w, h);
    const at = (x: number, y: number) => m.cells[y * m.width + x];
    // 네 모서리는 비어 있다(네모 상자가 아님).
    for (const [x, y] of [[0, 0], [m.width - 1, 0], [0, m.bodyHeight - 1], [m.width - 1, m.bodyHeight - 1]]) assert.equal(at(x, y), 0);
    // 윗변이 오르락내리락한다(몽글몽글): 맨 윗줄에 빈칸과 테두리가 섞여 있다.
    const top = Array.from({ length: m.width }, (_, x) => at(x, 0));
    assert.ok(top.includes(0) && top.includes(2));
    // 꼬리: 몸통 아래 줄에도 칠해진 칸이 있다(가운데 근처).
    const tail = Array.from({ length: m.width }, (_, x) => at(x, m.bodyHeight + 1)).findIndex(v => v === 1 || v === 3);
    assert.ok(tail > m.width / 2 - 6 && tail < m.width / 2 + 3);
    // 글자 영역은 전부 바탕색.
    for (let y = CLOUD_PAD_Y; y < CLOUD_PAD_Y + h; y++) for (let x = CLOUD_PAD_X; x < CLOUD_PAD_X + w; x++) assert.notEqual(at(x, y), 0);
    // 바탕은 빈칸과 맞닿지 않는다(항상 테두리로 감싸짐).
    for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) if (at(x, y) === 1 || at(x, y) === 3) {
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) assert.ok(nx >= 0 && ny >= 0 && nx < m.width && ny < m.height && at(nx, ny) !== 0, `fill at ${x},${y} touches empty`);
    }
  }
});

// ── 기본 캐릭터 얼굴 ──
// 원본 시트와 같은 배치: 몸에는 흰자(바깥)+검은 눈동자(안쪽), 눈 시트는 눈동자 칸에 2칸 세로.
const SKIN = [201, 128, 64];
function sheets(direction: 'Front' | 'Left' | 'Right', y = 13) {
  const eyes = new Uint8ClampedArray(32 * 32 * 4), body = new Uint8ClampedArray(32 * 32 * 4);
  const put = (d: Uint8ClampedArray, x: number, yy: number, c: number[]) => d.set([...c, 255], (yy * 32 + x) * 4);
  for (let yy = 8; yy < 20; yy++) for (let x = 9; x < 23; x++) put(body, x, yy, SKIN);
  const pairs = direction === 'Front' ? [[13, 12], [18, 19]] : direction === 'Left' ? [[12, 13]] : [[19, 18]];
  for (const [pupil, white] of pairs) for (const yy of [y, y + 1]) {
    put(body, white, yy, [255, 255, 255]); put(body, pupil, yy, [0, 0, 0]);
    put(eyes, pupil, yy, yy === y ? [48, 79, 140] : [72, 104, 168]);
  }
  return { eyes, body };
}
const dark = (c: readonly number[]) => c.every(v => v < 80);
test('face: front dot eyes sit on the pupils, mirror each other, and whites become skin', () => {
  for (const y of [13, 14]) {
    const { eyes, body } = sheets('Front', y);
    const pixels = facePixels(eyes, 'Front', body);
    const beads = pixels.filter(p => dark(p.color) && p.y <= y + 1).map(p => p.x);
    assert.deepEqual([...new Set(beads)].sort((a, b) => a - b), [13, 18]);
    assert.equal(13 + 18, 31, 'symmetric around the 32px frame centre (15.5)');
    for (const x of [12, 19]) for (const yy of [y, y + 1]) assert.deepEqual(pixels.find(p => p.x === x && p.y === yy)?.color, SKIN);
  }
});
test('face: left and right profiles are mirror images (eye, cheek, mouth)', () => {
  const side = (d: 'Left' | 'Right') => { const { eyes, body } = sheets(d); return facePixels(eyes, d, body).map(p => `${d === 'Right' ? 31 - p.x : p.x},${p.y},${p.color.join('.')}`).sort(); };
  assert.deepEqual(side('Right'), side('Left'));
});
test('face: without the body sheet still draws only the 1×2 dot eyes (no shifted extra column)', () => {
  const { eyes } = sheets('Front');
  const xs = facePixels(eyes, 'Front').filter(p => dark(p.color)).map(p => p.x);
  assert.ok(!xs.includes(17), 'right eye must not move inward next to the original pupil');
});
