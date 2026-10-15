import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import type { GradeLevel } from './SlideListModal';
import { LectureDeckViewer } from './LectureDeckViewer';
import {
  defaultDeckTitle, deleteLectureDeck, findTocFile, guessGrade, LECTURE_GRADES, listLectureDecks, matchTocFiles,
  parseLectureToc, resolveLectureSlideUrls, updateLectureDeckGrade, uploadLectureDeck, type LectureDeck, type LectureToc, type UploadProgress,
} from '../features/lectures/lectureDecks';
import {
  countLectureRecordings, deleteDeckRecordings, deleteLectureRecording, listLectureRecordings, loadLectureRecording, supabaseRecordingBackend,
  type LectureRecordingRow, type LoadedRecording,
} from '../features/lectures/lectureRecordings';
import { formatDuration } from '../features/lectures/lectureRecordingModel';
import {
  groupLectureDecks, groupRecordingsByClass, readResume, rememberResume, unitPages, type LectureBook, type LectureClass, type LectureUnit, type ResumeEntry,
} from '../features/lectures/lectureLibrary';

const formatMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

// ── 데이터·동작(수업자료 화면 하나가 함께 쓴다) ────────────────────────────────
export interface LectureLibrary {
  enabled: boolean;
  books: LectureBook[];
  units: Map<string, LectureUnit>;
  loadError: string;
  loaded: boolean;
  recordingCounts: Record<string, number>;
  resume: ResumeEntry[];
  opening: string | null;
  refresh: () => Promise<void>;
  openDeck: (deck: LectureDeck, index?: number, className?: LectureClass | null) => Promise<void>;
  openRecording: (deck: LectureDeck, row: LectureRecordingRow) => Promise<void>;
  removeDeck: (deck: LectureDeck) => Promise<void>;
  changeGrade: (deck: LectureDeck, grade: GradeLevel) => Promise<void>;
  viewer: React.ReactNode;
  recordingsVersion: number;
  /** 방금 녹음을 끝낸 덱(그 녹음 목록을 펼친다) */
  recordedDeckId: string | null;
}

export function useLectureLibrary(enabled: boolean): LectureLibrary {
  const [decks, setDecks] = useState<LectureDeck[]>([]);
  const [loadError, setLoadError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [recordingCounts, setRecordingCounts] = useState<Record<string, number>>({});
  const [resume, setResume] = useState<ResumeEntry[]>(() => readResume());
  const [viewer, setViewer] = useState<{ deck: LectureDeck; urls: string[]; replay?: LoadedRecording; index: number; className?: LectureClass | null } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [recordingsVersion, setRecordingsVersion] = useState(0);
  const [recordedDeckId, setRecordedDeckId] = useState<string | null>(null);
  const backend = useMemo(() => supabaseRecordingBackend(supabase), []);

  const refreshCounts = useCallback(async () => {
    try { setRecordingCounts(await countLectureRecordings(supabase)); } catch (err) { console.warn('[lecture] 녹음 개수 실패:', err); }
  }, []);
  const refresh = useCallback(async () => {
    if (!enabled) return;
    try { setDecks(await listLectureDecks(supabase)); setLoadError(''); }
    catch (err) { console.error('[lecture] 덱 목록 실패:', err); setLoadError('교재 슬라이드 목록을 불러오지 못했습니다.'); }
    finally { setLoaded(true); }
    void refreshCounts();
  }, [enabled, refreshCounts]);
  useEffect(() => { void refresh(); }, [refresh]);

  const books = useMemo(() => groupLectureDecks(decks), [decks]);
  const units = useMemo(() => {
    const map = new Map<string, LectureUnit>();
    for (const book of books) for (const ch of book.chapters) for (const unit of ch.units) map.set(unit.deck.id, unit);
    return map;
  }, [books]);

  const openDeck = async (deck: LectureDeck, index = 0, className: LectureClass | null = null) => {
    setOpening(deck.id);
    try { setViewer({ deck, urls: await resolveLectureSlideUrls(supabase, deck.slides), index, className }); }
    catch (err) { console.error('[lecture] 슬라이드 주소 실패:', err); alert('슬라이드를 열지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
    finally { setOpening(null); }
  };

  const openRecording = async (deck: LectureDeck, row: LectureRecordingRow) => {
    setOpening(row.id);
    try {
      const replay = await loadLectureRecording(supabase, row.id);
      // 녹음할 때의 슬라이드 목록으로 연다(덱 이미지는 같은 비공개 버킷).
      const slides = replay.manifest.slides;
      setViewer({ deck: { ...deck, slides }, urls: await resolveLectureSlideUrls(supabase, slides), replay, index: 0 });
    } catch (err) { console.error('[lecture] 녹음 열기 실패:', err); alert('녹음을 열지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
    finally { setOpening(null); }
  };

  const removeDeck = async (deck: LectureDeck) => {
    if (!confirm(`'${deck.title}' 덱과 슬라이드 ${deck.slides.length}장을 삭제할까요? 이 덱의 녹음도 함께 지워집니다.`)) return;
    try { await deleteDeckRecordings(supabase, deck.id).catch(err => console.warn('[lecture] 녹음 삭제 실패:', err)); await deleteLectureDeck(supabase, deck); await refresh(); }
    catch (err) { console.error('[lecture] 덱 삭제 실패:', err); alert('삭제하지 못했습니다.'); }
  };

  const changeGrade = async (deck: LectureDeck, grade: GradeLevel) => {
    if (deck.grade === grade) return;
    try { await updateLectureDeckGrade(supabase, deck.id, grade); await refresh(); }
    catch (err) { console.error('[lecture] 학년 변경 실패:', err); alert('학년을 바꾸지 못했습니다.'); }
  };

  const closeViewer = () => {
    viewer?.replay?.release();
    setViewer(null);
    setRecordingsVersion(v => v + 1);
    void refreshCounts();
  };

  const node = viewer ? (
    <LectureDeckViewer
      deck={viewer.deck} urls={viewer.urls} onClose={closeViewer} replay={viewer.replay}
      recordingBackend={viewer.replay ? undefined : backend}
      initialIndex={viewer.index}
      initialClass={viewer.className ?? null}
      onIndexChange={viewer.replay ? undefined : (index, className) => setResume(rememberResume(viewer.deck.id, index, className))}
      onRecorded={() => { setRecordedDeckId(viewer.deck.id); setRecordingsVersion(v => v + 1); void refreshCounts(); }}
    />
  ) : null;

  return { enabled, books, units, loadError, loaded, recordingCounts, resume, opening, refresh, openDeck, openRecording, removeDeck, changeGrade, viewer: node, recordingsVersion, recordedDeckId };
}

// ── 이어서 보기 ──────────────────────────────────────────────────────────────
export const LectureResumeRow: React.FC<{ lib: LectureLibrary; grade: 'ALL' | GradeLevel }> = ({ lib, grade }) => {
  const items = lib.resume
    .map(entry => ({ entry, unit: lib.units.get(entry.deckId) }))
    .filter((x): x is { entry: ResumeEntry; unit: LectureUnit } => !!x.unit && (grade === 'ALL' || x.unit.deck.grade === grade))
    .slice(0, 4);
  if (!items.length) return null;
  return (
    <section className="space-y-2.5" data-testid="lecture-resume">
      <h3 className="text-sm font-black text-slate-400 tracking-wide">이어서 보기</h3>
      <div className="flex gap-3 overflow-x-auto pb-1 no-scrollbar">
        {items.map(({ entry, unit }) => {
          const total = unit.deck.slides.length;
          const at = Math.min(total, entry.index + 1);
          const recs = lib.recordingCounts[unit.deck.id] ?? 0;
          return (
            <button
              key={`${unit.deck.id}:${entry.className ?? ''}`}
              onClick={() => void lib.openDeck(unit.deck, entry.index, entry.className ?? null)}
              disabled={lib.opening === unit.deck.id}
              className="flex-none w-72 text-left p-4 rounded-2xl bg-slate-900 border border-slate-800 hover:border-amber-500/40 transition-colors active:scale-98 disabled:opacity-60"
            >
              <div className="text-base font-black text-slate-100 leading-snug line-clamp-2 break-keep">
                {entry.className && <span className="mr-1.5 align-middle px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[11px]">{entry.className}</span>}
                {unit.name}
              </div>
              <div className="mt-1 text-xs text-slate-400">{unit.deck.book} · {at} / {total}장{recs ? ` · 녹음 ${recs}개` : ''}</div>
              <div className="mt-2.5 h-1.5 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${(at / total) * 100}%` }} /></div>
            </button>
          );
        })}
      </div>
    </section>
  );
};

// ── 교재 카드 ─────────────────────────────────────────────────────────────────
interface BookCardProps { lib: LectureLibrary; book: LectureBook; manage: boolean; defaultOpen: boolean; accent: string }

export const LectureBookCard: React.FC<BookCardProps> = ({ lib, book, manage, defaultOpen, accent }) => {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => { setOpen(defaultOpen); }, [defaultOpen]);
  const recTotal = book.chapters.reduce((sum, ch) => sum + ch.units.reduce((s, u) => s + (lib.recordingCounts[u.deck.id] ?? 0), 0), 0);
  return (
    <div className="rounded-2xl bg-slate-900/80 border border-slate-800 overflow-hidden" data-testid="lecture-book">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-slate-900">
        <span className={`flex-none w-11 h-14 rounded-lg grid place-items-center text-[11px] font-black text-white leading-tight text-center ${accent}`}>개념<br />원리</span>
        <span className="min-w-0 flex-1">
          <span className="block text-base sm:text-lg font-black text-slate-100">{book.book}</span>
          <span className="block text-xs text-slate-400 mt-0.5">수업 {book.deckCount}개 · 슬라이드 {book.slideCount}장{recTotal ? ` · 녹음 ${recTotal}개` : ''}</span>
        </span>
        <span className="flex-none text-xs font-bold text-slate-400">{open ? '접기 ▲' : '펼치기 ▼'}</span>
      </button>
      {open && (
        <div className="px-3 sm:px-4 pb-3 border-t border-slate-800">
          {book.chapters.map(ch => (
            <div key={ch.title}>
              <div className="text-sm font-black text-amber-400/90 mt-3.5 mb-2 px-1">{ch.title}</div>
              <div className="grid gap-2">
                {ch.units.map(unit => <LectureUnitRow key={unit.deck.id} lib={lib} unit={unit} manage={manage} />)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const LectureUnitRow: React.FC<{ lib: LectureLibrary; unit: LectureUnit; manage: boolean }> = ({ lib, unit, manage }) => {
  const { deck } = unit;
  const [recOpen, setRecOpen] = useState(false);
  const [recordings, setRecordings] = useState<LectureRecordingRow[] | null>(null);
  const [recError, setRecError] = useState('');
  const recCount = lib.recordingCounts[deck.id] ?? 0;
  const load = useCallback(async () => {
    try { setRecordings(await listLectureRecordings(supabase, deck.id)); setRecError(''); }
    catch (err) { console.error('[lecture] 녹음 목록 실패:', err); setRecordings([]); setRecError('녹음 목록을 불러오지 못했습니다.'); }
  }, [deck.id]);
  useEffect(() => { if (lib.recordedDeckId === deck.id) setRecOpen(true); }, [lib.recordedDeckId, deck.id]);
  useEffect(() => { if (recOpen) void load(); }, [recOpen, load, lib.recordingsVersion]);

  const removeRecording = async (row: LectureRecordingRow) => {
    if (!confirm(`'${row.title}' 녹음을 삭제할까요? 음성과 필기 기록이 모두 지워집니다.`)) return;
    try { await deleteLectureRecording(supabase, row.id); await load(); await lib.refresh(); }
    catch (err) { console.error('[lecture] 녹음 삭제 실패:', err); alert('녹음을 삭제하지 못했습니다.'); }
  };

  const pill = 'flex-none text-xs font-bold px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-slate-400';
  return (
    <div className="rounded-xl bg-slate-950/70 border border-slate-850 hover:border-slate-700 transition-colors" data-deck-id={deck.id}>
      <div className="flex items-center gap-2.5 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-black text-slate-100 leading-snug break-keep">{unit.name}</div>
          <div className="text-xs text-slate-400 mt-0.5">{[unitPages(unit), unit.extra].filter(Boolean).join(' · ')}</div>
        </div>
        <span className={`${pill} hidden sm:inline`}>{deck.slides.length}장</span>
        <button
          onClick={() => setRecOpen(o => !o)}
          aria-expanded={recOpen}
          aria-label={`${unit.name} 녹음 목록`}
          className={`${pill} ${recCount ? 'text-rose-300 border-rose-500/40' : ''} hover:text-rose-200`}
        >
          🎙️ {recCount}
        </button>
        {manage ? (
          <>
            <select
              value={deck.grade}
              onChange={e => void lib.changeGrade(deck, e.target.value as GradeLevel)}
              aria-label={`${unit.name} 학년`}
              className="flex-none text-xs font-bold bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-2 py-1.5"
            >
              {LECTURE_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            <button
              onClick={() => void lib.removeDeck(deck)}
              aria-label={`${deck.title} 삭제`}
              className="flex-none text-sm text-slate-400 hover:text-rose-300 bg-slate-900 px-2.5 py-1.5 border border-slate-800 rounded-lg active:scale-95"
            >
              🗑️
            </button>
          </>
        ) : (
          <button
            onClick={() => void lib.openDeck(deck)}
            disabled={lib.opening === deck.id}
            aria-label={`${unit.name} 열기`}
            className="flex-none text-sm font-black text-white bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-lg active:scale-95 disabled:opacity-50"
          >
            {lib.opening === deck.id ? '여는 중…' : '열기'}
          </button>
        )}
      </div>
      {recOpen && (
        <div className="px-3.5 pb-3 space-y-1.5" data-testid="lecture-recordings">
          {recError && <p className="text-xs text-rose-300">{recError}</p>}
          {recordings === null && <p className="text-xs text-slate-500">녹음 목록을 불러오는 중…</p>}
          {recordings?.length === 0 && !recError && <p className="text-xs text-slate-500">아직 녹음이 없습니다. 열기 후 ● 녹음 시작을 누르세요.</p>}
          {recordings && groupRecordingsByClass(recordings).map(group => (
            <div key={group.label} className="space-y-1.5" data-testid="lecture-recording-group" data-class={group.label}>
              <div className="pt-1 text-[11px] font-black text-amber-300">{group.label} · {group.rows.length}개</div>
              {group.rows.map(row => (
              <div key={row.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-800">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-bold text-slate-200 truncate">{row.title}</div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    {new Date(row.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {formatDuration(row.duration_ms)}
                    {row.status === 'recording' && <span className="ml-1 text-amber-300 font-sans font-bold">끝내기 전에 멈춤(저장된 곳까지 재생)</span>}
                  </div>
                </div>
                <button
                  onClick={() => void lib.openRecording(deck, row)}
                  disabled={lib.opening === row.id}
                  aria-label={`${row.title} 재생`}
                  className="flex-none text-xs font-extrabold text-slate-200 hover:text-amber-300 bg-slate-950 px-2.5 py-1.5 border border-slate-800 rounded-lg active:scale-95 disabled:opacity-50"
                >
                  {lib.opening === row.id ? '여는 중…' : '재생 ▶'}
                </button>
                <button
                  onClick={() => void removeRecording(row)}
                  aria-label={`${row.title} 녹음 삭제`}
                  className="flex-none text-xs text-slate-400 hover:text-rose-300 bg-slate-950 px-2 py-1.5 border border-slate-800 rounded-lg active:scale-95"
                >
                  🗑️
                </button>
              </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── 올리기(관리) ──────────────────────────────────────────────────────────────
export const LectureDeckUploader: React.FC<{ onUploaded: () => void | Promise<void> }> = ({ onUploaded }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [toc, setToc] = useState<LectureToc | null>(null);
  const [problem, setProblem] = useState('');
  const [title, setTitle] = useState('');
  const [grade, setGrade] = useState<GradeLevel>('고1');
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    setFiles(picked); setToc(null); setProblem(''); setProgress(null);
    if (!picked.length) return;
    const tocFile = findTocFile(picked);
    if (!tocFile) { setProblem('목차.json이 없습니다. 폴더 전체 또는 PNG와 목차.json을 함께 골라 주세요.'); return; }
    try {
      const parsed = parseLectureToc(await tocFile.text());
      setToc(parsed); setTitle(defaultDeckTitle(parsed)); setGrade(guessGrade(parsed.book));
    } catch (err) { setProblem(err instanceof Error ? err.message : '목차.json을 읽을 수 없습니다.'); }
  };

  const match = toc ? matchTocFiles(toc, files) : null;
  const ready = !!toc && !!match && !match.missing.length && !!title.trim() && !busy;

  const upload = async () => {
    if (!toc || !match) return;
    setBusy(true); setProblem('');
    try {
      await uploadLectureDeck(supabase, { toc, files: match.matched, title, grade }, setProgress);
      await onUploaded();
    } catch (err) {
      console.error('[lecture] 업로드 실패:', err);
      setProblem(`올리지 못했습니다: ${err instanceof Error ? err.message : '알 수 없는 오류'}`);
    } finally { setBusy(false); }
  };

  const inputClass = 'text-sm font-extrabold text-slate-200 bg-slate-900 px-3 py-2 border border-slate-700 rounded-lg cursor-pointer active:scale-95';

  return (
    <div className="p-4 rounded-2xl border border-sky-500/30 bg-sky-500/5 space-y-3">
      <p className="text-sm text-slate-400 leading-relaxed">
        슬라이드 PNG(1920×1080)와 <b className="text-slate-200">목차.json</b>이 든 폴더를 고르세요. 폴더 선택이 안 되는 기기에서는 파일을 모두 함께 고르면 됩니다.
      </p>
      <div className="flex flex-wrap gap-2">
        <label className={inputClass}>
          📁 폴더 선택
          <input
            type="file"
            className="sr-only"
            data-testid="lecture-folder-input"
            {...{ webkitdirectory: '', directory: '' } as Record<string, string>}
            onChange={e => void pick(e.target.files)}
            disabled={busy}
          />
        </label>
        <label className={inputClass}>
          🗂️ 파일 여러 개 선택
          <input
            type="file"
            multiple
            accept="image/png,image/webp,image/jpeg,application/json,.json,.png,.webp,.jpg,.jpeg"
            className="sr-only"
            data-testid="lecture-files-input"
            onChange={e => void pick(e.target.files)}
            disabled={busy}
          />
        </label>
      </div>

      {toc && match && (
        <div className="space-y-2.5">
          <p className="text-sm text-slate-300">
            {toc.book} · {toc.chapter} — 슬라이드 {toc.slides.length}장 중 {match.matched.length}장 확인
          </p>
          {!!match.missing.length && (
            <p className="text-sm text-rose-300 break-all">빠진 파일 {match.missing.length}개: {match.missing.slice(0, 5).join(', ')}{match.missing.length > 5 ? ' …' : ''}</p>
          )}
          <label className="block text-sm text-slate-400">
            제목
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={200}
              disabled={busy}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-slate-100"
            />
          </label>
          <div className="flex items-center gap-2" role="radiogroup" aria-label="학년">
            {LECTURE_GRADES.map(g => (
              <button
                key={g}
                role="radio"
                aria-checked={grade === g}
                onClick={() => setGrade(g)}
                disabled={busy}
                className={`px-3 py-1.5 rounded-lg text-sm font-black border ${grade === g ? 'bg-sky-600 border-sky-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
              >
                {g}
              </button>
            ))}
          </div>
          <button
            onClick={() => void upload()}
            disabled={!ready}
            className="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-black disabled:opacity-40 active:scale-98"
          >
            {busy ? '올리는 중…' : `슬라이드 ${match.matched.length}장 올리기`}
          </button>
        </div>
      )}

      {progress && (
        <div className="space-y-1" role="status">
          <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-sky-500 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <p className="text-xs text-slate-400">
            {progress.done} / {progress.total}장 · 원본 {formatMB(progress.originalBytes)} → 저장 {formatMB(progress.uploadedBytes)}
            {progress.done === progress.total && !busy && !problem ? ' · 완료' : ''}
          </p>
        </div>
      )}
      {problem && <p className="text-sm text-rose-300">{problem}</p>}
    </div>
  );
};
