import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLectureToc, matchTocFiles, findTocFile, guessGrade, defaultDeckTitle, groupSlidesBySection,
  uploadLectureDeck, resolveLectureSlideUrls, isLectureSlidePath,
} from '../../src/features/lectures/lectureDecks.ts';

const sample = {
  book: '개념원리 공통수학2', chapter: 'Ⅱ-3 명제',
  slides: [
    { no: 3, file: '03-개념2-조건.png', section: '01 명제와 조건', label: '개념 2 · 조건', bookPage: 167 },
    { no: 1, file: '01-개념1-명제.png', section: '01 명제와 조건', label: '개념 1 · 명제', bookPage: 166 },
    { no: 2, file: '02-필수예제01.png', section: '01 명제와 조건', label: '필수예제 01', bookPage: 166 },
    { no: 10, file: '10-개념3-역.png', section: '02 명제의 역', label: '개념 3 · 역', bookPage: 179 },
  ],
};

test('목차를 번호 순으로 정렬하고 값을 정리한다', () => {
  const toc = parseLectureToc(JSON.stringify(sample));
  assert.deepEqual(toc.slides.map(s => s.no), [1, 2, 3, 10]);
  assert.equal(toc.book, '개념원리 공통수학2');
  assert.equal(toc.slides[0].bookPage, 166);
  // BOM이 붙은 파일과 객체 입력도 받는다.
  assert.equal(parseLectureToc('﻿' + JSON.stringify(sample)).slides.length, 4);
  assert.equal(parseLectureToc(sample).slides.length, 4);
});

test('NFD로 들어온 한글 파일명도 같은 이름으로 맞춘다', () => {
  const nfd = { ...sample, slides: [{ ...sample.slides[1], file: sample.slides[1].file.normalize('NFD') }] };
  const toc = parseLectureToc(nfd);
  assert.equal(toc.slides[0].file, '01-개념1-명제.png');
  const files = [{ name: '01-개념1-명제.png'.normalize('NFD') }, { name: '목차.json'.normalize('NFD') }];
  assert.equal(matchTocFiles(toc, files).matched.length, 1);
  assert.ok(findTocFile(files));
  // 폴더 선택 시 경로가 붙어 와도 파일명만 본다.
  assert.ok(findTocFile([{ name: '공통수학2-명제/목차.json' }]));
});

test('잘못된 목차를 한국어 오류로 거절한다', () => {
  const bad: [unknown, RegExp][] = [
    ['{', /JSON 형식/],
    [[], /형식이 올바르지/],
    [{ book: 'a', slides: [] }, /slides 목록/],
    [{ slides: [{ no: 0, file: 'a.png' }] }, /no가 올바르지/],
    [{ slides: [{ no: 1.5, file: 'a.png' }] }, /no가 올바르지/],
    [{ slides: [{ no: 1, file: 'a.png' }, { no: 1, file: 'b.png' }] }, /번호 1가 중복/],
    [{ slides: [{ no: 1, file: 'a.png' }, { no: 2, file: 'a.png' }] }, /a\.png이 중복/],
    [{ slides: [{ no: 1, file: 'a.gif' }] }, /PNG\/WebP\/JPEG/],
    [{ slides: [{ no: 1, file: 3 }] }, /문자열/],
    [{ slides: [{ no: 1, file: 'a.png', bookPage: '166' }] }, /bookPage/],
    [{ slides: Array.from({ length: 301 }, (_, i) => ({ no: i + 1, file: `${i}.png` })) }, /300장/],
  ];
  for (const [input, message] of bad) assert.throws(() => parseLectureToc(input), message);
});

test('라벨이 비면 파일명을, bookPage가 없으면 null을 쓴다', () => {
  const toc = parseLectureToc({ slides: [{ no: 1, file: '01-표지.png' }] });
  assert.deepEqual(toc.slides[0], { no: 1, file: '01-표지.png', section: '', label: '01-표지', bookPage: null });
  assert.equal(toc.book, '');
});

test('목차 순서대로 파일을 찾고 빠진 파일을 알린다', () => {
  const toc = parseLectureToc(sample);
  const files = ['10-개념3-역.png', '01-개념1-명제.png', '03-개념2-조건.png', '목차.json', 'extra.png'].map(name => ({ name }));
  const { matched, missing } = matchTocFiles(toc, files);
  assert.deepEqual(matched.map(m => m.file.name), ['01-개념1-명제.png', '03-개념2-조건.png', '10-개념3-역.png']);
  assert.deepEqual(missing, ['02-필수예제01.png']);
});

test('학년과 제목을 미리 채운다', () => {
  assert.equal(guessGrade('개념원리 공통수학2'), '고1');
  assert.equal(guessGrade('개념원리 공통수학1'), '고1');
  assert.equal(guessGrade('개념원리 미적분1'), '고2');
  assert.equal(guessGrade('개념원리 수학Ⅱ'), '고2');
  assert.equal(defaultDeckTitle(parseLectureToc(sample)), '개념원리 공통수학2 - Ⅱ-3 명제 (p166~179)');
  assert.equal(defaultDeckTitle(parseLectureToc({ slides: [{ no: 1, file: 'a.png' }] })), '교재 슬라이드');
});

test('목차 패널은 이어진 같은 단원끼리 묶는다', () => {
  assert.deepEqual(groupSlidesBySection([{ section: 'A' }, { section: 'A' }, { section: 'B' }, { section: 'A' }]),
    [{ section: 'A', indexes: [0, 1] }, { section: 'B', indexes: [2] }, { section: 'A', indexes: [3] }]);
});

function fakeClient(opts: { failUploadAt?: number; failInsert?: boolean } = {}) {
  const uploads: { path: string; type: string }[] = [], removed: string[][] = [], inserted: any[] = [], signCalls: string[][] = [];
  let active = 0, maxActive = 0;
  const client: any = {
    storage: { from: (bucket: string) => {
      assert.equal(bucket, 'lecture-slides');
      return {
        upload: async (path: string, blob: Blob, o: { contentType: string; upsert: boolean }) => {
          assert.equal(o.upsert, false);
          active++; maxActive = Math.max(maxActive, active);
          await new Promise(r => setTimeout(r, 5));
          active--;
          if (opts.failUploadAt === uploads.length) return { error: new Error('upload failed') };
          uploads.push({ path, type: blob.type }); return { error: null };
        },
        remove: async (paths: string[]) => { removed.push(paths); return { error: null }; },
        createSignedUrls: async (paths: string[]) => { signCalls.push(paths); return { data: paths.map(path => ({ path, signedUrl: 'https://signed/' + path, error: null })), error: null }; },
      };
    } },
    from: (table: string) => {
      assert.equal(table, 'lecture_decks');
      return { insert: async (row: any) => { if (opts.failInsert) return { error: new Error('insert failed') }; inserted.push(row); return { error: null }; } };
    },
  };
  return { client, uploads, removed, inserted, signCalls, get maxActive() { return maxActive; } };
}

const tocWithFiles = () => {
  const toc = parseLectureToc({ book: 'b', chapter: 'c', slides: Array.from({ length: 7 }, (_, i) => ({ no: 7 - i, file: `${7 - i}.png`, section: 's', label: `L${7 - i}`, bookPage: 100 + i })) });
  return { toc, files: toc.slides.map(slide => ({ slide, file: new Blob([new Uint8Array(10)], { type: 'image/png' }) })) };
};

test('몇 장씩 나눠 올리고 순서를 지킨 덱 행을 넣는다', async () => {
  const fake = fakeClient();
  const { toc, files } = tocWithFiles();
  const seen: number[] = [];
  const deck = await uploadLectureDeck(fake.client, { toc, files, title: ' 제목 ', grade: '고1' }, p => seen.push(p.done), { encode: async b => b });
  assert.ok(fake.maxActive <= 3 && fake.maxActive > 1);
  assert.deepEqual(seen, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(fake.inserted.length, 1);
  const row = fake.inserted[0];
  assert.equal(row.title, '제목');
  assert.equal(row.id, deck.id);
  assert.deepEqual(row.slides.map((s: any) => s.label), ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']);
  assert.equal(new Set(row.slides.map((s: any) => s.id)).size, 7);
  for (const s of row.slides) { assert.ok(isLectureSlidePath(s.path)); assert.ok(s.path.startsWith(deck.id + '/')); assert.ok(s.path.endsWith('.png')); }
  assert.equal(fake.removed.length, 0);
});

test('중간 실패나 행 저장 실패 시 올린 파일을 지운다', async () => {
  const a = fakeClient({ failUploadAt: 4 });
  const { toc, files } = tocWithFiles();
  await assert.rejects(uploadLectureDeck(a.client, { toc, files, title: 't', grade: '고2' }, undefined, { encode: async b => b }), /upload failed/);
  assert.equal(a.inserted.length, 0);
  assert.deepEqual(a.removed.flat().sort(), a.uploads.map(u => u.path).sort());
  const b = fakeClient({ failInsert: true });
  await assert.rejects(uploadLectureDeck(b.client, { toc, files, title: 't', grade: '고2' }, undefined, { encode: async x => x }), /insert failed/);
  assert.equal(b.removed.flat().length, 7);
  await assert.rejects(uploadLectureDeck(b.client, { toc, files, title: '  ', grade: '고2' }), /제목/);
  await assert.rejects(uploadLectureDeck(b.client, { toc, files, title: 't', grade: '중3' as any }), /학년/);
  const big = [{ slide: files[0].slide, file: new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' }) }];
  await assert.rejects(uploadLectureDeck(b.client, { toc, files: big, title: 't', grade: '고1' }, undefined, { encode: async x => x }), /5MB/);
});

test('서명 주소는 한 번에 받고 캐시한다', async () => {
  const fake = fakeClient();
  const id = '11111111-1111-1111-1111-111111111111';
  const slides = [`${id}/22222222-2222-2222-2222-222222222222.webp`, `${id}/33333333-3333-3333-3333-333333333333.png`, '../evil.png'].map(path => ({ path }));
  const urls = await resolveLectureSlideUrls(fake.client, slides);
  assert.deepEqual(fake.signCalls, [[slides[0].path, slides[1].path]]);
  assert.deepEqual(urls, ['https://signed/' + slides[0].path, 'https://signed/' + slides[1].path, '']);
  await resolveLectureSlideUrls(fake.client, slides);
  assert.equal(fake.signCalls.length, 1);
});
