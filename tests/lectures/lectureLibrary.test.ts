import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chapterBase, describeUnit, filterBooks, groupLectureDecks, matchesUnit, readResume, rememberResume, unitPages } from '../../src/features/lectures/lectureLibrary.ts';
import type { LectureDeck } from '../../src/features/lectures/lectureDecks.ts';

let n = 0;
function deck(partial: Partial<LectureDeck> & { sections: [string, number, string?][] }): LectureDeck {
  n++;
  return {
    id: `d${n}`, title: partial.title ?? `deck ${n}`, grade: partial.grade ?? '고1', book: partial.book ?? '개념원리 공통수학2',
    chapter: partial.chapter ?? 'Ⅲ-1 함수 01', created_at: partial.created_at ?? `2026-10-1${n % 10}T00:00:00Z`, published: false,
    slides: partial.sections.map(([section, bookPage, label], i) => ({ id: `s${n}-${i}`, path: 'x', section, label: label ?? `slide ${i}`, bookPage })),
  };
}

test('chapterBase strips the lesson suffix', () => {
  assert.equal(chapterBase('Ⅲ-1 함수 01'), 'Ⅲ-1 함수');
  assert.equal(chapterBase('Ⅱ-3 명제 04~05'), 'Ⅱ-3 명제');
  assert.equal(chapterBase('Ⅲ-3 무리함수 01-02'), 'Ⅲ-3 무리함수');
  assert.equal(chapterBase('Ⅱ-3 명제'), 'Ⅱ-3 명제');
  assert.equal(chapterBase('Ⅱ-2 도함수의 활용 07'), 'Ⅱ-2 도함수의 활용');
});

test('describeUnit gives a short name, pages and the special lecture note', () => {
  const unit = describeUnit(deck({ chapter: 'Ⅲ-1 함수 01', sections: [['01 함수', 206], ['특강 절댓값 기호를 포함한 함수의 그래프', 214], ['연습문제', 216]] }));
  assert.equal(unit.name, '01 함수');
  assert.equal(unit.extra, '특강 절댓값 기호를 포함한 함수의 그래프 포함');
  assert.equal(unitPages(unit), '교재 206–216쪽');
  const many = describeUnit(deck({ chapter: 'Ⅱ-3 명제 01~03', sections: [['01 명제와 조건', 166], ['02 명제 p → q', 171], ["03 '모든'이나 '어떤'을 포함한 명제", 176], ['연습문제', 179]] }));
  assert.equal(many.name, "01 명제와 조건 ~ 03 '모든'이나 '어떤'을 포함한 명제");
  assert.equal(describeUnit(deck({ chapter: 'Ⅲ-1 함수 03', sections: [['연습문제', 232]] })).name, '함수');
  assert.equal(many.extra, '');
});

test('groupLectureDecks groups by grade and book and orders by book page', () => {
  const books = groupLectureDecks([
    deck({ chapter: 'Ⅲ-1 함수 02', sections: [['02 여러 가지 함수', 217]] }),
    deck({ chapter: 'Ⅱ-3 명제 04~05', sections: [['04 명제의 역과 대우', 180]] }),
    deck({ chapter: 'Ⅱ-3 명제', sections: [['01 명제와 조건', 166]] }),
    deck({ chapter: 'Ⅲ-1 함수 01', sections: [['01 함수', 206]] }),
    deck({ grade: '고2', book: '개념원리 미적분1', chapter: 'Ⅲ-1 부정적분 01-02', sections: [['01 부정적분', 154]] }),
  ]);
  assert.deepEqual(books.map(b => [b.grade, b.book, b.deckCount]), [['고1', '개념원리 공통수학2', 4], ['고2', '개념원리 미적분1', 1]]);
  const g1 = books[0];
  assert.deepEqual(g1.chapters.map(c => c.title), ['Ⅱ-3 명제', 'Ⅲ-1 함수']);
  assert.deepEqual(g1.chapters[0].units.map(u => u.name), ['01 명제와 조건', '04 명제의 역과 대우']);
  assert.deepEqual(g1.chapters[1].units.map(u => u.name), ['01 함수', '02 여러 가지 함수']);
});

test('search by words and by book page', () => {
  const [book] = groupLectureDecks([
    deck({ chapter: 'Ⅲ-1 함수 04', sections: [['04 역함수', 234, '필수 14'], ['연습문제', 246]] }),
    deck({ chapter: 'Ⅲ-1 함수 03', sections: [['03 합성함수', 224], ['연습문제', 233]] }),
  ]);
  const [inverse, composite] = book.chapters[0].units.slice().sort((a, b) => (a.pageFrom ?? 0) - (b.pageFrom ?? 0)).reverse();
  assert.ok(matchesUnit(inverse, '역함수'));
  assert.ok(!matchesUnit(composite, '역함수'));
  assert.ok(matchesUnit(inverse, '240'));
  assert.ok(!matchesUnit(inverse, '230'));
  assert.ok(matchesUnit(inverse, '필수 14'));
  assert.equal(filterBooks([book], '합성').flatMap(b => b.chapters.flatMap(c => c.units)).length, 1);
  assert.equal(filterBooks([book], '없는단원').length, 0);
});

test('resume keeps the latest decks first and survives bad storage', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
  rememberResume('a', 3, storage, 1);
  rememberResume('b', 0, storage, 2);
  rememberResume('a', 5, storage, 3);
  assert.deepEqual(readResume(storage).map(e => [e.deckId, e.index]), [['a', 5], ['b', 0]]);
  for (let i = 0; i < 10; i++) rememberResume(`x${i}`, i, storage, 10 + i);
  assert.equal(readResume(storage).length, 6);
  store.set('reviewnote.lecture-resume.v1', '{broken');
  assert.deepEqual(readResume(storage), []);
  assert.deepEqual(readResume(null), []);
  const throwing = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.equal(rememberResume('z', 1, throwing).length, 1);
});
