import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQrLoginUrl, normalizeCode, readQrParam, stripQrParam, tokenFromScan } from '../../src/features/qrLogin/helpers.ts';

test('QR 주소는 루트 경로와 인코딩된 토큰을 사용한다', () => {
  assert.equal(buildQrLoginUrl('https://reviewnote.example/old', 'a_b-123'), 'https://reviewnote.example/?qr=a_b-123');
  assert.equal(readQrParam(buildQrLoginUrl('https://reviewnote.example', 'a+b/= x')), 'a+b/= x');
});
test('QR 매개변수 읽기는 빈 값과 없는 값을 구별한다', () => {
  assert.equal(readQrParam('https://reviewnote.example/?qr='), '');
  assert.equal(readQrParam('https://reviewnote.example/?other=1'), null);
  assert.equal(readQrParam('잘못된 주소'), null);
});
test('코드에서 공백과 대시를 지우고 대문자로 바꾼다', () => {
  assert.equal(normalizeCode(' abcd-efgh \n'), 'ABCDEFGH');
  assert.equal(normalizeCode('23 45-67 89'), '23456789');
  assert.equal(normalizeCode(''), '');
  assert.equal(normalizeCode('0o1il!'), '0O1IL!');
});
test('주소 정리 시 다른 매개변수와 해시 및 히스토리 상태를 보존한다', () => {
  const state = { page: 1 };
  let replaced: unknown[] = [];
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: { href: 'https://reviewnote.example/?qr=secret&keep=yes#notes' },
    history: { state, replaceState: (...args: unknown[]) => { replaced = args; } },
  } });
  try {
    assert.equal(stripQrParam(), 'secret');
    assert.deepEqual(replaced, [state, '', '/?keep=yes#notes']);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
test('카메라로 읽은 QR에서 우리 사이트의 로그인 토큰만 꺼낸다', () => {
  const token = 'A'.repeat(20) + '_-' + 'b'.repeat(21); // 43자
  const here = 'https://reviewnote.vercel.app';
  assert.equal(tokenFromScan(buildQrLoginUrl(here, token), here), token);
  assert.equal(tokenFromScan(` ${token}\n`, here), token, '토큰만 있는 QR');
  assert.equal(tokenFromScan(buildQrLoginUrl('http://127.0.0.1:5174', token), 'http://127.0.0.1:5174'), token, '지금 열린 주소');
  assert.equal(tokenFromScan(buildQrLoginUrl('https://reviewnote.vercel.app', token), 'http://localhost:5173'), token, '운영 주소 QR은 어디서든');
  assert.equal(tokenFromScan(buildQrLoginUrl('https://evil.example', token), here), null, '다른 사이트 주소');
  assert.equal(tokenFromScan(`${here}/?qr=short`, here), null, '토큰 모양이 아님');
  assert.equal(tokenFromScan('ABCD-EFGH', here), null);
  assert.equal(tokenFromScan('아무 글자', here), null);
});
