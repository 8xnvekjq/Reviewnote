import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import type { GradeLevel } from './SlideListModal';
import { LectureDeckViewer } from './LectureDeckViewer';
import {
  defaultDeckTitle, deleteLectureDeck, findTocFile, guessGrade, LECTURE_GRADES, listLectureDecks, matchTocFiles,
  parseLectureToc, resolveLectureSlideUrls, uploadLectureDeck, type LectureDeck, type LectureToc, type UploadProgress,
} from '../features/lectures/lectureDecks';
import {
  deleteDeckRecordings, deleteLectureRecording, listLectureRecordings, loadLectureRecording, supabaseRecordingBackend,
  type LectureRecordingRow, type LoadedRecording,
} from '../features/lectures/lectureRecordings';
import { formatDuration } from '../features/lectures/lectureRecordingModel';

interface LectureDeckSectionProps {
  /** 'ALL'이면 모든 학년 */
  grade: 'ALL' | GradeLevel;
}

const formatMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

// 수업자료 모달 안의 '교재' 덱 목록과 올리기(관리자 전용).
export const LectureDeckSection: React.FC<LectureDeckSectionProps> = ({ grade }) => {
  const [decks, setDecks] = useState<LectureDeck[]>([]);
  const [loadError, setLoadError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [viewer, setViewer] = useState<{ deck: LectureDeck; urls: string[]; replay?: LoadedRecording } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [recordingsOf, setRecordingsOf] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<LectureRecordingRow[] | null>(null);
  const [recordingError, setRecordingError] = useState('');
  const backend = useMemo(() => supabaseRecordingBackend(supabase), []);

  const refresh = useCallback(async () => {
    try { setDecks(await listLectureDecks(supabase)); setLoadError(''); }
    catch (err) { console.error('[lecture] 덱 목록 실패:', err); setLoadError('교재 슬라이드 목록을 불러오지 못했습니다.'); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const openDeck = async (deck: LectureDeck) => {
    setOpening(deck.id);
    try { setViewer({ deck, urls: await resolveLectureSlideUrls(supabase, deck.slides) }); }
    catch (err) { console.error('[lecture] 슬라이드 주소 실패:', err); alert('슬라이드를 열지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
    finally { setOpening(null); }
  };

  const loadRecordings = useCallback(async (deckId: string) => {
    try { setRecordings(await listLectureRecordings(supabase, deckId)); setRecordingError(''); }
    catch (err) { console.error('[lecture] 녹음 목록 실패:', err); setRecordings([]); setRecordingError('녹음 목록을 불러오지 못했습니다.'); }
  }, []);
  const toggleRecordings = (deck: LectureDeck) => {
    if (recordingsOf === deck.id) { setRecordingsOf(null); return; }
    setRecordingsOf(deck.id); setRecordings(null); void loadRecordings(deck.id);
  };

  const openRecording = async (deck: LectureDeck, row: LectureRecordingRow) => {
    setOpening(row.id);
    try {
      const replay = await loadLectureRecording(supabase, row.id);
      // 녹음할 때의 슬라이드 목록으로 연다(덱 이미지는 같은 비공개 버킷).
      const slides = replay.manifest.slides;
      setViewer({ deck: { ...deck, slides }, urls: await resolveLectureSlideUrls(supabase, slides), replay });
    } catch (err) { console.error('[lecture] 녹음 열기 실패:', err); alert('녹음을 열지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
    finally { setOpening(null); }
  };

  const removeRecording = async (row: LectureRecordingRow) => {
    if (!confirm(`'${row.title}' 녹음을 삭제할까요? 음성과 필기 기록이 모두 지워집니다.`)) return;
    try { await deleteLectureRecording(supabase, row.id); await loadRecordings(row.deck_id); }
    catch (err) { console.error('[lecture] 녹음 삭제 실패:', err); alert('녹음을 삭제하지 못했습니다.'); }
  };

  const closeViewer = () => {
    viewer?.replay?.release();
    setViewer(null);
    if (recordingsOf) void loadRecordings(recordingsOf);
  };

  const removeDeck = async (deck: LectureDeck) => {
    if (!confirm(`'${deck.title}' 덱과 슬라이드 ${deck.slides.length}장을 삭제할까요? 이 덱의 녹음도 함께 지워집니다.`)) return;
    try { await deleteDeckRecordings(supabase, deck.id).catch(err => console.warn('[lecture] 녹음 삭제 실패:', err)); await deleteLectureDeck(supabase, deck); await refresh(); }
    catch (err) { console.error('[lecture] 덱 삭제 실패:', err); alert('삭제하지 못했습니다.'); }
  };

  const visible = decks.filter(d => grade === 'ALL' || d.grade === grade);

  return (
    <div className="space-y-2.5" data-testid="lecture-deck-section">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center space-x-2">
          <span className="text-lg">📖</span>
          <h4 className="text-xs font-black text-sky-300 tracking-wide">교재 슬라이드</h4>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-sky-500/15 text-sky-300 border-sky-500/30">관리자 전용</span>
        </div>
        <button
          onClick={() => setUploadOpen(open => !open)}
          className="text-[10.5px] font-extrabold text-sky-300 hover:underline"
        >
          {uploadOpen ? '닫기 ▲' : '＋ 교재 슬라이드 올리기'}
        </button>
      </div>

      {uploadOpen && <LectureDeckUploader onUploaded={async () => { setUploadOpen(false); await refresh(); }} />}

      {loadError && <p className="px-1 text-[11px] text-rose-300">{loadError}</p>}
      {!loadError && !visible.length && <p className="px-1 text-[11px] text-slate-500">아직 올린 교재 슬라이드가 없습니다.</p>}

      <div className="grid gap-1.5">
        {visible.map(deck => (
          <div key={deck.id} className="px-3 py-2.5 bg-slate-955/60 hover:bg-slate-900 border border-slate-850 hover:border-slate-700 rounded-xl transition-all duration-200 shadow-sm space-y-1">
            <div className="flex items-center space-x-1.5">
              <span className="flex-none text-[9px] font-black px-1.5 py-0.2 rounded border bg-sky-500/15 text-sky-300 border-sky-500/30">교재</span>
              <span className="flex-none text-[9px] font-black px-1.5 py-0.2 rounded border bg-slate-800 text-slate-300 border-slate-700">{deck.grade}</span>
              <h5 className="text-xs font-bold text-slate-200 leading-snug break-keep line-clamp-2 min-w-0 flex-1">{deck.title}</h5>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[9.5px] text-slate-500 font-mono flex-none">📅 {deck.created_at.slice(0, 10)} · {deck.slides.length}장</span>
              <div className="flex items-center space-x-1.5 flex-none">
                <button
                  onClick={() => toggleRecordings(deck)}
                  aria-expanded={recordingsOf === deck.id}
                  className="text-[10px] font-extrabold text-slate-300 hover:text-rose-300 transition-colors bg-slate-900 px-2.5 py-1 border border-slate-800 rounded-lg hover:border-rose-500/40 active:scale-95"
                >
                  🎙️ 녹음 {recordingsOf === deck.id ? '▲' : '▼'}
                </button>
                <button
                  onClick={() => void openDeck(deck)}
                  disabled={opening === deck.id}
                  className="text-[10px] font-extrabold text-slate-300 hover:text-amber-300 transition-colors bg-slate-900 px-2.5 py-1 border border-slate-800 rounded-lg hover:border-amber-500/40 active:scale-95 disabled:opacity-50"
                >
                  {opening === deck.id ? '여는 중…' : '열기 ▶'}
                </button>
                <button
                  onClick={() => void removeDeck(deck)}
                  aria-label={`${deck.title} 삭제`}
                  className="text-[10px] font-extrabold text-slate-400 hover:text-rose-300 transition-colors bg-slate-900 px-2 py-1 border border-slate-800 rounded-lg hover:border-rose-500/40 active:scale-95"
                >
                  🗑️
                </button>
              </div>
            </div>
            {recordingsOf === deck.id && (
              <div className="pt-1.5 space-y-1" data-testid="lecture-recordings">
                {recordingError && <p className="text-[10.5px] text-rose-300">{recordingError}</p>}
                {recordings === null && <p className="text-[10.5px] text-slate-500">녹음 목록을 불러오는 중…</p>}
                {recordings?.length === 0 && !recordingError && <p className="text-[10.5px] text-slate-500">아직 녹음이 없습니다. 열기 ▶ 후 ● 녹음 시작을 누르세요.</p>}
                {recordings?.map(row => (
                  <div key={row.id} className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-slate-950/70 border border-slate-850">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-slate-200 truncate">{row.title}</div>
                      <div className="text-[9.5px] text-slate-500 font-mono">
                        {new Date(row.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {formatDuration(row.duration_ms)}
                        {row.status === 'recording' && <span className="ml-1 text-amber-300 font-sans font-bold">끝내기 전에 멈춤(저장된 곳까지 재생)</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => void openRecording(deck, row)}
                      disabled={opening === row.id}
                      aria-label={`${row.title} 재생`}
                      className="flex-none text-[10px] font-extrabold text-slate-300 hover:text-amber-300 bg-slate-900 px-2 py-1 border border-slate-800 rounded-lg active:scale-95 disabled:opacity-50"
                    >
                      {opening === row.id ? '여는 중…' : '재생 ▶'}
                    </button>
                    <button
                      onClick={() => void removeRecording(row)}
                      aria-label={`${row.title} 녹음 삭제`}
                      className="flex-none text-[10px] text-slate-400 hover:text-rose-300 bg-slate-900 px-2 py-1 border border-slate-800 rounded-lg active:scale-95"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {viewer && (
        <LectureDeckViewer
          deck={viewer.deck} urls={viewer.urls} onClose={closeViewer} replay={viewer.replay}
          recordingBackend={viewer.replay ? undefined : backend}
          onRecorded={() => { setRecordingsOf(viewer.deck.id); void loadRecordings(viewer.deck.id); }}
        />
      )}
    </div>
  );
};

const LectureDeckUploader: React.FC<{ onUploaded: () => void | Promise<void> }> = ({ onUploaded }) => {
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

  const inputClass = 'text-[11px] font-extrabold text-slate-200 bg-slate-900 px-2.5 py-1.5 border border-slate-700 rounded-lg cursor-pointer active:scale-95';

  return (
    <div className="p-3 rounded-xl border border-sky-500/30 bg-sky-500/5 space-y-2.5">
      <p className="text-[10.5px] text-slate-400 leading-relaxed">
        슬라이드 PNG(1920×1080)와 <b className="text-slate-200">목차.json</b>이 든 폴더를 고르세요. 폴더 선택이 안 되는 기기에서는 파일을 모두 함께 고르면 됩니다.
      </p>
      <div className="flex flex-wrap gap-1.5">
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
        <div className="space-y-2">
          <p className="text-[11px] text-slate-300">
            {toc.book} · {toc.chapter} — 슬라이드 {toc.slides.length}장 중 {match.matched.length}장 확인
          </p>
          {!!match.missing.length && (
            <p className="text-[11px] text-rose-300 break-all">빠진 파일 {match.missing.length}개: {match.missing.slice(0, 5).join(', ')}{match.missing.length > 5 ? ' …' : ''}</p>
          )}
          <label className="block text-[10.5px] text-slate-400">
            제목
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={200}
              disabled={busy}
              className="mt-1 w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100"
            />
          </label>
          <div className="flex items-center gap-1.5" role="radiogroup" aria-label="학년">
            {LECTURE_GRADES.map(g => (
              <button
                key={g}
                role="radio"
                aria-checked={grade === g}
                onClick={() => setGrade(g)}
                disabled={busy}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black border ${grade === g ? 'bg-sky-600 border-sky-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-400'}`}
              >
                {g}
              </button>
            ))}
          </div>
          <button
            onClick={() => void upload()}
            disabled={!ready}
            className="w-full py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-black disabled:opacity-40 active:scale-98"
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
          <p className="text-[10.5px] text-slate-400">
            {progress.done} / {progress.total}장 · 원본 {formatMB(progress.originalBytes)} → 저장 {formatMB(progress.uploadedBytes)}
            {progress.done === progress.total && !busy && !problem ? ' · 완료' : ''}
          </p>
        </div>
      )}
      {problem && <p className="text-[11px] text-rose-300">{problem}</p>}
    </div>
  );
};
