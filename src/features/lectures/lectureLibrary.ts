// 수업자료 화면의 교재 덱 정리: 학년 → 교재 → 단원(장) → 덱(한 수업) 순서로 묶고, 짧은 이름·쪽수 범위·이어서 보기를 만든다.
import type { GradeLevel } from '../../components/SlideListModal';
import type { LectureDeck } from './lectureDecks';

export interface LectureUnit {
  deck: LectureDeck;
  /** 목록에 보이는 짧은 이름(예: '함수 1 · 01 함수') */
  name: string;
  /** 함께 들어 있는 특강 등 부가 설명(없으면 '') */
  extra: string;
  pageFrom: number | null;
  pageTo: number | null;
}
export interface LectureChapter { title: string; units: LectureUnit[] }
export interface LectureBook { grade: GradeLevel; book: string; chapters: LectureChapter[]; slideCount: number; deckCount: number }

const SUFFIX = /\s+\d{2}(?:\s*[~\-–]\s*\d{2})?$/;
/** 'Ⅲ-1 함수 01' → 'Ⅲ-1 함수', 'Ⅱ-3 명제 04~05' → 'Ⅱ-3 명제' */
export const chapterBase = (chapter: string) => chapter.trim().replace(SUFFIX, '').trim();
/** 'Ⅲ-1 함수' → '함수' */
const chapterName = (base: string) => base.replace(/^[ⅠⅡⅢⅣⅤⅥIVX]+(?:-\d+)?\s*/, '').trim() || base;

const isExercise = (section: string) => /^연습문제/.test(section.trim());
const isSpecial = (section: string) => /^특강/.test(section.trim());
const uniq = <T,>(list: T[]) => list.filter((value, index) => list.indexOf(value) === index);

function pageRange(deck: LectureDeck): [number | null, number | null] {
  const pages = deck.slides.map(s => s.bookPage).filter((p): p is number => typeof p === 'number');
  return pages.length ? [Math.min(...pages), Math.max(...pages)] : [null, null];
}

/** 덱 하나를 목록 한 줄로: 교재의 소단원 이름(예: '04 역함수')을 잇고, 특강은 부가 설명으로 뺀다.
 *  올린 덱 순번은 쓰지 않는다 — 일부만 올리면 교재 번호와 어긋난다. */
export function describeUnit(deck: LectureDeck): LectureUnit {
  const sections = uniq(deck.slides.map(s => s.section.trim()).filter(Boolean));
  const main = sections.filter(s => !isExercise(s) && !isSpecial(s));
  const special = sections.filter(isSpecial).map(s => s.replace(/^특강\s*/, ''));
  const label = main.length > 2 ? `${main[0]} ~ ${main[main.length - 1]}` : main.join(' · ');
  const [pageFrom, pageTo] = pageRange(deck);
  return {
    deck,
    name: label || chapterName(chapterBase(deck.chapter)) || deck.title,
    extra: special.length ? `특강 ${special.join(' · ')} 포함` : '',
    pageFrom, pageTo,
  };
}

export const unitPages = (unit: Pick<LectureUnit, 'pageFrom' | 'pageTo'>) =>
  unit.pageFrom == null ? '' : unit.pageFrom === unit.pageTo ? `교재 ${unit.pageFrom}쪽` : `교재 ${unit.pageFrom}–${unit.pageTo}쪽`;

const firstPage = (deck: LectureDeck) => pageRange(deck)[0] ?? Number.MAX_SAFE_INTEGER;
const byPage = (a: LectureDeck, b: LectureDeck) => firstPage(a) - firstPage(b) || a.created_at.localeCompare(b.created_at);

/** 학년 → 교재 → 장 → 덱. 장과 덱은 교재 쪽 순서, 교재는 이름 순서. */
export function groupLectureDecks(decks: LectureDeck[]): LectureBook[] {
  const books = new Map<string, LectureDeck[]>();
  for (const deck of decks) {
    const key = `${deck.grade}\u0000${deck.book || '교재'}`;
    books.set(key, [...(books.get(key) ?? []), deck]);
  }
  const result: LectureBook[] = [];
  for (const [key, list] of books) {
    const [grade, book] = key.split('\u0000') as [GradeLevel, string];
    const chapters = new Map<string, LectureDeck[]>();
    for (const deck of [...list].sort(byPage)) {
      const base = chapterBase(deck.chapter) || '단원';
      chapters.set(base, [...(chapters.get(base) ?? []), deck]);
    }
    result.push({
      grade, book,
      chapters: [...chapters].map(([title, items]) => ({ title, units: items.map(deck => describeUnit(deck)) })),
      slideCount: list.reduce((sum, deck) => sum + deck.slides.length, 0),
      deckCount: list.length,
    });
  }
  return result.sort((a, b) => a.book.localeCompare(b.book, 'ko'));
}

/** 검색: 이름·장·슬라이드 이름에 글자가 들어 있거나, 숫자면 그 교재 쪽을 포함하는 덱. */
export function matchesUnit(unit: LectureUnit, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (/^\d+$/.test(q)) {
    const page = Number(q);
    return unit.pageFrom != null && unit.pageTo != null && page >= unit.pageFrom && page <= unit.pageTo;
  }
  const text = [unit.name, unit.extra, unit.deck.title, unit.deck.chapter, ...unit.deck.slides.map(s => `${s.section} ${s.label}`)].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every(word => text.includes(word));
}

export function filterBooks(books: LectureBook[], query: string): LectureBook[] {
  if (!query.trim()) return books;
  return books
    .map(book => ({ ...book, chapters: book.chapters.map(ch => ({ ...ch, units: ch.units.filter(u => matchesUnit(u, query)) })).filter(ch => ch.units.length) }))
    .filter(book => book.chapters.length);
}

// ── 반(같은 교재를 두 반이 따로 듣는다) ─────────────────────────────────────────
export const LECTURE_CLASSES = ['월수금반', '수토반'] as const;
export type LectureClass = typeof LECTURE_CLASSES[number];
export const isLectureClass = (value: unknown): value is LectureClass => LECTURE_CLASSES.includes(value as LectureClass);

/** 녹음 목록을 반별로(월수금반 → 수토반 → 반을 고르기 전 녹음). 빈 묶음은 뺀다. */
export function groupRecordingsByClass<T extends { class_name: string | null }>(rows: T[]): { label: string; rows: T[] }[] {
  const groups = LECTURE_CLASSES.map(name => ({ label: name as string, rows: rows.filter(row => row.class_name === name) }));
  groups.push({ label: '반 미지정', rows: rows.filter(row => !isLectureClass(row.class_name)) });
  return groups.filter(group => group.rows.length);
}

// ── 이어서 보기(이 기기에만 기억, 덱 + 반마다 따로) ──────────────────────────────
export interface ResumeEntry { deckId: string; index: number; at: number; className?: LectureClass }
const RESUME_KEY = 'reviewnote.lecture-resume.v1';
const RESUME_MAX = 6;

export function readResume(storage: Pick<Storage, 'getItem'> | null = safeStorage()): ResumeEntry[] {
  try {
    const raw = JSON.parse(storage?.getItem(RESUME_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e): e is ResumeEntry => typeof e?.deckId === 'string' && Number.isInteger(e?.index) && typeof e?.at === 'number')
      .map(({ deckId, index, at, className }) => isLectureClass(className) ? { deckId, index, at, className } : { deckId, index, at });
  } catch { return []; }
}

export function rememberResume(deckId: string, index: number, className: LectureClass | null = null,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage(), now = Date.now()): ResumeEntry[] {
  const entry: ResumeEntry = className ? { deckId, index: Math.max(0, index), at: now, className } : { deckId, index: Math.max(0, index), at: now };
  // 반을 고르면 같은 덱의 '반 없는' 기록은 지운다(열고 나서 녹음 때 반을 고르는 흐름이라 둘이 겹쳐 보였다).
  const same = (e: ResumeEntry) => e.deckId === deckId && ((e.className ?? null) === className || (className !== null && !e.className));
  const next = [entry, ...readResume(storage).filter(e => !same(e))].slice(0, RESUME_MAX);
  try { storage?.setItem(RESUME_KEY, JSON.stringify(next)); } catch { /* 사생활 보호 모드 등 — 기억만 못 한다 */ }
  return next;
}

function safeStorage(): Storage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
