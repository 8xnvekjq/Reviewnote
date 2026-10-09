// 시험지 고르기 화면의 구역별 필터 칩(모의고사 연도·월 / 내신 연도·학기·중간기말·학교 / 학교 프린트 단원).
// 순수 함수만 둔다 — 값은 시험지 메타(ExamPaperMetadata·examDate)에서만 뽑고 제목은 파싱하지 않는다.
import type { ExamPaperSummary } from '../contract.ts';

export type FilterSection = 'csat' | 'school' | 'worksheet';
export type FilterKey = 'year' | 'month' | 'semester' | 'term' | 'school' | 'unit';
/** 구역별 선택 상태. 키가 없으면 "전체". */
export type FilterSelection = Partial<Record<FilterKey, string>>;

export interface FilterOption { value: string; label: string }
export interface PaperFilter { key: FilterKey; label: string; options: FilterOption[] }

const SECTION_KEYS: Record<FilterSection, FilterKey[]> = {
  csat: ['year', 'month'],
  school: ['year', 'semester', 'term', 'school'],
  worksheet: ['unit'],
};
const FILTER_LABEL: Record<FilterKey, string> = { year: '연도', month: '월', semester: '학기', term: '중간·기말', school: '학교', unit: '단원' };

export function isFilterSection(kind: string): kind is FilterSection {
  return kind === 'csat' || kind === 'school' || kind === 'worksheet';
}

function examMonth(paper: ExamPaperSummary): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})/.exec(paper.examDate ?? '');
  return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
}

/** 수능·모평 연도는 학년도. 평가원 6·9월 모평·수능은 시행 이듬해 학년도 이름을 쓴다(예: 2024-06-04 시행 = 2025학년도 6월).
 *  csat 행은 year 컬럼이 비어 있어(운영 DB) examDate 로 계산하고, year 가 채워져 있으면 그 값을 학년도로 본다. */
export function csatAcademicYear(paper: ExamPaperSummary): number | null {
  if (paper.year != null) return paper.year;
  const date = examMonth(paper);
  return date ? date.year + 1 : null;
}

/** 시험지 하나의 필터 값(문자열). 값을 모르면 null — "전체"에서만 보인다. */
export function paperFilterValue(paper: ExamPaperSummary, key: FilterKey): string | null {
  switch (key) {
    case 'year': {
      const year = (paper.kind ?? 'csat') === 'csat' ? csatAcademicYear(paper) : paper.year ?? null;
      return year == null ? null : String(year);
    }
    case 'month': { const date = examMonth(paper); return date ? String(date.month) : null; }
    case 'semester': return paper.semester == null ? null : String(paper.semester);
    case 'term': return paper.examTerm ?? null;
    case 'school': return paper.schoolName?.trim() || null;
    case 'unit': return paper.unitName?.trim() || null;
  }
}

function optionLabel(section: FilterSection, key: FilterKey, value: string): string {
  if (key === 'year') return section === 'csat' ? `${value}학년도` : `${value}년`;
  if (key === 'month') return value === '11' ? '수능' : value === '6' || value === '9' ? `${value}월 모평` : `${value}월`;
  if (key === 'semester') return `${value}학기`;
  if (key === 'term') return value === 'final' ? '기말' : '중간';
  return value;
}

/** 값 정렬: 연도·월·학기는 최신(큰 값) 먼저, 중간·기말은 기말(나중 시험) 먼저, 학교·단원은 가나다. */
function compareValues(key: FilterKey, a: string, b: string): number {
  if (key === 'year' || key === 'month' || key === 'semester') return Number(b) - Number(a);
  if (key === 'term') return (b === 'final' ? 1 : 0) - (a === 'final' ? 1 : 0);
  return a.localeCompare(b, 'ko');
}

/** 구역의 필터 목록. 값이 1개 이하인 필터는 숨긴다(목록에서 뺀다). */
export function buildPaperFilters(section: FilterSection, papers: ExamPaperSummary[]): PaperFilter[] {
  return SECTION_KEYS[section].flatMap(key => {
    const values = [...new Set(papers.map(paper => paperFilterValue(paper, key)).filter((value): value is string => value != null))]
      .sort((a, b) => compareValues(key, a, b));
    return values.length > 1 ? [{ key, label: FILTER_LABEL[key], options: values.map(value => ({ value, label: optionLabel(section, key, value) })) }] : [];
  });
}

/** 보이는 필터에 없는 값(지워진 시험지·숨겨진 필터)은 "전체"로 되돌린다. */
export function normalizeSelection(filters: PaperFilter[], selection: FilterSelection | undefined): FilterSelection {
  const next: FilterSelection = {};
  for (const filter of filters) {
    const value = selection?.[filter.key];
    if (value != null && filter.options.some(option => option.value === value)) next[filter.key] = value;
  }
  return next;
}

/** 여러 필터는 AND. */
export function applyPaperFilters(papers: ExamPaperSummary[], selection: FilterSelection): ExamPaperSummary[] {
  const active = Object.entries(selection) as Array<[FilterKey, string]>;
  return papers.filter(paper => active.every(([key, value]) => paperFilterValue(paper, key) === value));
}

const TERM_ORDER = (paper: ExamPaperSummary) => (paper.examTerm === 'final' ? 2 : paper.examTerm === 'mid' ? 1 : 0);

/** 최신 순: 수능·모평은 시행일, 내신은 연도→학기→기말/중간→학교. 값이 없는 시험지는 뒤로. 학교 프린트·한능검은 원래 순서. */
export function sortPapersNewest(section: string, papers: ExamPaperSummary[]): ExamPaperSummary[] {
  if (section === 'csat' || section === 'mock') return [...papers].sort((a, b) => (b.examDate || '').localeCompare(a.examDate || ''));
  if (section === 'school') {
    return [...papers].sort((a, b) => (b.year ?? -1) - (a.year ?? -1) || (b.semester ?? -1) - (a.semester ?? -1)
      || TERM_ORDER(b) - TERM_ORDER(a) || (a.schoolName ?? '').localeCompare(b.schoolName ?? '', 'ko'));
  }
  return papers;
}

// ── 기기에 기억(localStorage). 학년 탭·구역별로 "{학년}:{구역}" 키에 저장한다. ──
export type SavedFilters = Record<string, FilterSelection>;
export function filterStorageKey(userId: string) { return `rn-exam-paper-filters:${userId}`; }
export function filterScope(grade: number | string, section: FilterSection) { return `${grade}:${section}`; }

/** 저장소 메서드뿐 아니라 브라우저의 localStorage 접근 자체도 거부될 수 있다. */
export function browserFilterStorage(): Storage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}

const FILTER_KEYS = new Set<string>(['year', 'month', 'semester', 'term', 'school', 'unit']);
export function parseSavedFilters(raw: string | null): SavedFilters {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: SavedFilters = {};
    for (const [scope, selection] of Object.entries(parsed as Record<string, unknown>)) {
      if (!selection || typeof selection !== 'object' || Array.isArray(selection)) continue;
      const clean: FilterSelection = {};
      for (const [key, value] of Object.entries(selection as Record<string, unknown>)) {
        if (FILTER_KEYS.has(key) && typeof value === 'string') clean[key as FilterKey] = value;
      }
      out[scope] = clean;
    }
    return out;
  } catch { return {}; }
}

export function loadSavedFilters(storage: Pick<Storage, 'getItem'> | undefined, userId: string): SavedFilters {
  try { return parseSavedFilters(storage?.getItem(filterStorageKey(userId)) ?? null); } catch { return {}; }
}
export function storeSavedFilters(storage: Pick<Storage, 'setItem'> | undefined, userId: string, saved: SavedFilters) {
  try { storage?.setItem(filterStorageKey(userId), JSON.stringify(saved)); } catch { /* 저장 실패는 무시 — 다음에 "전체"로 시작 */ }
}
