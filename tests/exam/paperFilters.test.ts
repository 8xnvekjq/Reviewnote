import test from 'node:test';
import assert from 'node:assert/strict';
import type { ExamPaperSummary } from '../../src/features/exam/contract.ts';
import {
  applyPaperFilters, browserFilterStorage, buildPaperFilters, csatAcademicYear, filterScope, filterStorageKey, loadSavedFilters,
  normalizeSelection, paperFilterValue, parseSavedFilters, sortPapersNewest, storeSavedFilters,
} from '../../src/features/exam/ui/paperFilters.ts';

const base = { source: '', timeLimitMinutes: 100, electives: [], inProgress: null, lastResult: null, resultCount: 0 } as const;
const csat = (id: string, examDate: string): ExamPaperSummary => ({ ...base, id, title: id, examDate });
const school = (id: string, schoolName: string, year: number, semester: number, examTerm: 'mid' | 'final'): ExamPaperSummary =>
  ({ ...base, id, title: id, examDate: '', kind: 'school', schoolName, year, semester, examTerm, grade: 1 });

const CSAT = [csat('2025-06', '2024-06-04'), csat('2026-11', '2025-11-13'), csat('2025-09', '2024-09-04'), csat('2026-06', '2025-06-04')];
test('고3 10월 학평 칩은 기존 모평·수능과 함께 학년도·월로 필터링한다', () => {
  const october = { ...csat('2025-10-g3-math', '2025-10-14'), kind: 'csat' as const, year: 2026, grade: 3 };
  const papers = [...CSAT, october];
  assert.equal(csatAcademicYear(october), 2026);
  assert.deepEqual(buildPaperFilters('csat', papers).find(f => f.key === 'month')!.options, [
    { value: '11', label: '수능' }, { value: '10', label: '10월 학평' },
    { value: '9', label: '9월 모평' }, { value: '6', label: '6월 모평' },
  ]);
  assert.deepEqual(applyPaperFilters(papers, { year: '2026', month: '10' }).map(p => p.id), [october.id]);
  assert.deepEqual(applyPaperFilters(papers, { month: '6' }).map(p => p.id), ['2025-06', '2026-06']);
});
const SCHOOL = [
  school('a', '동북고', 2026, 2, 'mid'), school('b', '상일여고', 2026, 2, 'mid'),
  school('c', '둔촌고', 2026, 1, 'final'), school('d', '영파여고', 2024, 2, 'mid'),
];

test('수능·모평 연도는 시행일 이듬해 학년도, 월은 시행 월에서 뽑는다(제목 파싱 없음)', () => {
  assert.equal(csatAcademicYear(csat('x', '2024-06-04')), 2025);
  assert.equal(csatAcademicYear(csat('x', '2025-11-13')), 2026);
  assert.equal(csatAcademicYear({ ...csat('x', '2024-06-04'), year: 2030 }), 2030, 'year 컬럼이 있으면 그 값');
  assert.equal(csatAcademicYear(csat('x', '')), null);
  assert.equal(paperFilterValue(csat('x', '2025-11-13'), 'month'), '11');
  const filters = buildPaperFilters('csat', CSAT);
  assert.deepEqual(filters.map(f => f.key), ['year', 'month']);
  assert.deepEqual(filters[0].options, [{ value: '2026', label: '2026학년도' }, { value: '2025', label: '2025학년도' }]);
  assert.deepEqual(filters[1].options.map(o => o.label), ['수능', '9월 모평', '6월 모평']);
});

test('내신: 연도·학기·중간기말·학교 값, 값이 하나뿐인 필터는 숨긴다', () => {
  const filters = buildPaperFilters('school', SCHOOL);
  assert.deepEqual(filters.map(f => f.key), ['year', 'semester', 'term', 'school']);
  assert.deepEqual(filters.find(f => f.key === 'term')!.options, [{ value: 'final', label: '기말' }, { value: 'mid', label: '중간' }]);
  assert.deepEqual(filters.find(f => f.key === 'semester')!.options.map(o => o.label), ['2학기', '1학기']);
  // 한 학교·한 학기·중간뿐이면 학교·학기·중간기말 칩 줄이 없다.
  const one = buildPaperFilters('school', [SCHOOL[0], school('e', '동북고', 2025, 2, 'mid')]);
  assert.deepEqual(one.map(f => f.key), ['year']);
  assert.deepEqual(buildPaperFilters('school', [SCHOOL[0]]), []);
  // 학교 프린트: 단원이 둘 이상일 때만.
  const ws = (id: string, unitName: string): ExamPaperSummary => ({ ...base, id, title: id, examDate: '', kind: 'worksheet', unitName });
  assert.deepEqual(buildPaperFilters('worksheet', [ws('1', '삼각비의 활용'), ws('2', '삼각비의 활용')]), []);
  assert.deepEqual(buildPaperFilters('worksheet', [ws('1', '삼각비의 활용'), ws('2', '미분계수와 도함수')])[0].options.map(o => o.value), ['미분계수와 도함수', '삼각비의 활용']);
});

test('여러 필터는 AND, 결과가 없으면 빈 배열', () => {
  assert.deepEqual(applyPaperFilters(CSAT, {}).length, 4);
  assert.deepEqual(applyPaperFilters(CSAT, { year: '2025' }).map(p => p.id), ['2025-06', '2025-09']);
  assert.deepEqual(applyPaperFilters(CSAT, { year: '2026', month: '6' }).map(p => p.id), ['2026-06']);
  assert.deepEqual(applyPaperFilters(CSAT, { year: '2025', month: '11' }), []);
  assert.deepEqual(applyPaperFilters(SCHOOL, { semester: '2', term: 'mid', year: '2026' }).map(p => p.id), ['a', 'b']);
  assert.deepEqual(applyPaperFilters([csat('no-date', '')], { year: '2025' }), [], '값을 모르는 시험지는 "전체"에서만');
});

test('최신 순 정렬: 수능·모평은 시행일, 내신은 연도→학기→기말/중간', () => {
  assert.deepEqual(sortPapersNewest('csat', CSAT).map(p => p.id), ['2026-11', '2026-06', '2025-09', '2025-06']);
  assert.deepEqual(sortPapersNewest('school', [...SCHOOL, school('f', '동북고', 2026, 2, 'final')]).map(p => p.id), ['f', 'a', 'b', 'c', 'd']);
  const ws = [{ ...base, id: 'w2', title: '', examDate: '' }, { ...base, id: 'w1', title: '', examDate: '' }];
  assert.deepEqual(sortPapersNewest('worksheet', ws).map(p => p.id), ['w2', 'w1'], '학교 프린트는 원래 순서');
});

test('선택 저장·복원: 학년·구역별 키, 깨진 값·사라진 값은 "전체"', () => {
  const memory = new Map<string, string>();
  const storage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => { memory.set(k, v); } };
  const saved = { [filterScope(3, 'csat')]: { year: '2025' }, [filterScope(1, 'school')]: { term: 'final', school: '둔촌고' } };
  storeSavedFilters(storage, 'u1', saved);
  assert.ok(memory.has(filterStorageKey('u1')));
  assert.deepEqual(loadSavedFilters(storage, 'u1'), saved);
  assert.deepEqual(loadSavedFilters(storage, 'u2'), {}, '다른 사용자는 기본값');
  assert.deepEqual(parseSavedFilters('{broken'), {});
  assert.deepEqual(parseSavedFilters('[1]'), {});
  assert.deepEqual(parseSavedFilters('{"3:csat":{"year":2025,"month":"6","bogus":"x"}}'), { '3:csat': { month: '6' } });
  // 저장소가 막혀 있어도 터지지 않는다.
  const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); } };
  assert.deepEqual(loadSavedFilters(throwing, 'u1'), {});
  assert.doesNotThrow(() => storeSavedFilters(throwing, 'u1', saved));
  assert.deepEqual(loadSavedFilters(undefined, 'u1'), {});
  // 복원한 값이 지금 목록에 없거나 그 필터가 숨겨졌으면 "전체"로.
  const filters = buildPaperFilters('csat', CSAT);
  assert.deepEqual(normalizeSelection(filters, { year: '2019', month: '9' }), { month: '9' });
  assert.deepEqual(normalizeSelection(buildPaperFilters('csat', [CSAT[0]]), { year: '2025' }), {});
});

test('localStorage 객체 접근 자체가 거부되어도 복원·저장이 실패하지 않는다', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  try {
    assert.deepEqual(loadSavedFilters(browserFilterStorage(), 'u1'), {});
    assert.doesNotThrow(() => storeSavedFilters(browserFilterStorage(), 'u1', { '3:csat': { month: '6' } }));
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
