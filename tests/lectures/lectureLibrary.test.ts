import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chapterBase, describeUnit, filterBooks, groupLectureDecks, groupRecordingsByClass, matchesUnit, readResume, rememberResume, unitPages } from '../../src/features/lectures/lectureLibrary.ts';
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
  rememberResume('a', 3, null, storage, 1);
  rememberResume('b', 0, null, storage, 2);
  rememberResume('a', 5, null, storage, 3);
  assert.deepEqual(readResume(storage).map(e => [e.deckId, e.index]), [['a', 5], ['b', 0]]);
  for (let i = 0; i < 10; i++) rememberResume(`x${i}`, i, null, storage, 10 + i);
  assert.equal(readResume(storage).length, 6);
  store.set('reviewnote.lecture-resume.v1', '{broken');
  assert.deepEqual(readResume(storage), []);
  assert.deepEqual(readResume(null), []);
  const throwing = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.equal(rememberResume('z', 1, null, throwing).length, 1);
});

test('이어서 보기는 덱 + 반마다 따로 기억한다', () => {
  const data = new Map<string, string>();
  const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
  rememberResume('a', 3, '월수금반', storage, 1);
  rememberResume('a', 8, '수토반', storage, 2);
  rememberResume('a', 5, '월수금반', storage, 3);
  rememberResume('a', 1, null, storage, 4);
  assert.deepEqual(readResume(storage).map(e => [e.deckId, e.index, e.className ?? null]), [['a', 1, null], ['a', 5, '월수금반'], ['a', 8, '수토반']]);
  // 반을 고르면 같은 덱의 반 없는 기록은 사라진다.
  rememberResume('a', 6, '수토반', storage, 5);
  assert.deepEqual(readResume(storage).map(e => [e.index, e.className ?? null]), [[6, '수토반'], [5, '월수금반']]);
  // 모르는 반 이름은 버린다(반 없는 항목으로 읽는다).
  data.set('reviewnote.lecture-resume.v1', JSON.stringify([{ deckId: 'b', index: 2, at: 1, className: '화목반' }]));
  assert.deepEqual(readResume(storage), [{ deckId: 'b', index: 2, at: 1 }]);
});

test('녹음 목록을 반별로 묶는다(월수금반 → 수토반 → 반 미지정, 빈 묶음 없음)', () => {
  const rows = [{ id: 1, class_name: '수토반' }, { id: 2, class_name: null }, { id: 3, class_name: '수토반' }, { id: 4, class_name: '이상한반' }];
  assert.deepEqual(groupRecordingsByClass(rows).map(g => [g.label, g.rows.map(r => r.id)]), [['수토반', [1, 3]], ['반 미지정', [2, 4]]]);
  assert.deepEqual(groupRecordingsByClass([]), []);
});
