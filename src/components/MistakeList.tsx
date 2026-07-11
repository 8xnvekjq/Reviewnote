import React, { useState } from 'react';
import type { MistakeEntry } from '../types';
import { MistakeCard } from './MistakeCard';
import { LaTeXRenderer } from './LaTeXRenderer';

interface MistakeListProps {
  mistakes: MistakeEntry[];
  onSelectEntry: (entry: MistakeEntry) => void;
  onDeleteMistake: (id: string, e: React.MouseEvent) => void;
  onAddClick: () => void;
  onPrintClick?: () => void;
  title?: string;
  hideAddButton?: boolean;
  emptyMessage?: string;
  isAdmin?: boolean;
  profilesMap?: Record<string, string>; // userId -> displayName
  currentUserId?: string;
  viewMode?: 'card' | 'list';
  peerActivities?: any[];
  printAsTextMap?: Record<string, boolean>;
  onTogglePrintAsText?: (id: string) => void;
  selectedPrintIds?: string[];
  onTogglePrintSelect?: (id: string) => void;
  onToggleAllPrintSelect?: () => void;
}

export const MistakeList: React.FC<MistakeListProps> = ({
  mistakes,
  onSelectEntry,
  onDeleteMistake,
  onAddClick,
  onPrintClick,
  title = "나의 오답노트",
  hideAddButton = false,
  emptyMessage = "아직 등록된 오답이 없습니다.",
  isAdmin = false,
  profilesMap = {},
  currentUserId,
  viewMode = 'card',
  peerActivities = [],
  printAsTextMap = {},
  onTogglePrintAsText,
  selectedPrintIds = [],
  onTogglePrintSelect,
  onToggleAllPrintSelect,
}) => {
  const [selectedStudent, setSelectedStudent] = useState<string>('all');
  const [filterGrade, setFilterGrade] = useState<string>('all');
  const [filterChapter, setFilterChapter] = useState<string>('all');
  const [visibleCount, setVisibleCount] = useState<number>(10);

  // 필터나 뷰모드가 변경되면 표시 개수를 10개로 리셋
  React.useEffect(() => {
    setVisibleCount(10);
  }, [selectedStudent, filterGrade, filterChapter, viewMode]);

  // 어드민일 때: 학생 목록 추출
  const studentOptions = isAdmin
    ? Array.from(
        new Set(mistakes.map(m => m.userId).filter(Boolean) as string[])
      ).map(uid => ({ uid, name: profilesMap[uid] || uid.slice(0, 8) }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  // 필터 학목 추출 (과목 & 단원)
  const availableGrades = Array.from(new Set(mistakes.map(m => m.grade).filter(Boolean) as string[])).sort();
  const availableChapters = Array.from(
    new Set(
      mistakes
        .filter(m => filterGrade === 'all' || m.grade === filterGrade)
        .map(m => m.chapter)
        .filter(Boolean) as string[]
    )
  ).sort();

  // 필터링 적용
  let filtered = isAdmin && selectedStudent !== 'all'
    ? mistakes.filter(m => m.userId === selectedStudent)
    : mistakes;

  if (viewMode === 'list') {
    filtered = filtered.filter(m => {
      const matchGrade = filterGrade === 'all' || m.grade === filterGrade;
      const matchChapter = filterChapter === 'all' || m.chapter === filterChapter;
      return matchGrade && matchChapter;
    });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <p className="text-xs text-slate-400 mt-1">
            {isAdmin
              ? `전체 ${mistakes.length}개 · 표시 ${filtered.length}개`
              : `총 ${mistakes.length}개의 기록이 있습니다.`}
          </p>
        </div>
        {!hideAddButton && (
          <button
            onClick={onAddClick}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white transition-all shadow-md shadow-indigo-600/20"
          >
            + 새 오답 추가
          </button>
        )}
        {onPrintClick && mistakes.length > 0 && (
          <div className="flex items-center space-x-2">
            {onToggleAllPrintSelect && (
              <button
                onClick={onToggleAllPrintSelect}
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-slate-900 border border-slate-850 text-slate-400 hover:text-slate-200 active:scale-95 transition-all"
              >
                {selectedPrintIds.length === mistakes.length ? '▢ 전체 해제' : '☑ 전체 선택'}
              </button>
            )}
            <button
              onClick={onPrintClick}
              disabled={selectedPrintIds.length === 0}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-200 hover:text-white transition-all shadow-md border border-slate-750 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              🖨️ PDF 인쇄 ({selectedPrintIds.length}개)
            </button>
          </div>
        )}
      </div>

      {/* 실시간 친구들의 복습 현황 위젯 */}
      {viewMode === 'list' && peerActivities && peerActivities.length > 0 && (
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-4 space-y-2.5 shadow-md animate-fade-in">
          <div className="flex items-center space-x-1.5">
            <span className="text-xs animate-pulse">🔥</span>
            <span className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-wider">실시간 공부 자극! 친구들의 복습 현황</span>
          </div>
          <div className="divide-y divide-slate-850 space-y-2">
            {peerActivities
              .filter(act => act.user_id !== currentUserId) // Filter out current user
              .slice(0, 3) // Show max 3 lines
              .map((act, idx) => {
                const reviewsArr = act.reviews || ['', '', ''];
                let lastReview = '';
                for (let i = 2; i >= 0; i--) {
                  if (reviewsArr[i] !== '') {
                    lastReview = reviewsArr[i];
                    break;
                  }
                }
                
                const reviewBadge = 
                  lastReview === 'O' ? <span className="text-emerald-400 font-bold">O 성공!</span> :
                  lastReview === 'X' ? <span className="text-red-400 font-bold">X 도전 중</span> :
                  lastReview === 'star' ? <span className="text-amber-400 font-bold">★ 별표</span> : '—';

                let reviewDateStr = '';
                if (act.updated_at) {
                  const uD = new Date(act.updated_at);
                  reviewDateStr = `${uD.getMonth() + 1}/${uD.getDate()} ${String(uD.getHours()).padStart(2, '0')}:${String(uD.getMinutes()).padStart(2, '0')}`;
                }
                const studentName = act.display_name || act.username || '동료 학생';

                return (
                  <div key={act.mistake_id || idx} className={`text-[10px] text-slate-300 leading-normal flex items-center justify-between space-x-2 ${idx > 0 ? 'pt-2' : ''}`}>
                    <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                      <span className="font-bold text-indigo-300 truncate max-w-[80px] flex-none" title={studentName}>
                        👤 {studentName}
                      </span>
                      <span className="text-slate-500 flex-none">&rarr;</span>
                      <span className="text-slate-200 truncate flex-1 min-w-0 font-bold">
                        {act.title.replace(/\$[^$]+\$/g, '').replace(/[#*`_]/g, '')}
                      </span>
                    </div>
                    <div className="flex-none pl-2 text-right flex items-center space-x-1.5">
                      <span className="font-semibold">{reviewBadge}</span>
                      {reviewDateStr && (
                        <span className="text-[8px] text-slate-500 font-semibold bg-slate-950 px-1 py-0.5 rounded border border-slate-850">
                          {reviewDateStr}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* 어드민 학생 필터 셀렉트 */}
      {isAdmin && studentOptions.length > 0 && (
        <div className="flex items-center space-x-2">
          <span className="text-[11px] text-slate-500 font-bold flex-none">👤 학생 필터</span>
          <select
            value={selectedStudent}
            onChange={e => setSelectedStudent(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white outline-none focus:border-indigo-500 transition-colors cursor-pointer"
          >
            <option value="all">전체 학생 ({mistakes.length}개)</option>
            {studentOptions.map(s => {
              const count = mistakes.filter(m => m.userId === s.uid).length;
              return (
                <option key={s.uid} value={s.uid}>
                  {s.name} ({count}개)
                </option>
              );
            })}
          </select>
        </div>
      )}

      {/* 과목 & 단원 필터 (리스트 뷰 모드 전용) */}
      {viewMode === 'list' && (
        <div className="grid grid-cols-2 gap-3.5 bg-slate-900/60 border border-slate-800 p-3.5 rounded-2xl">
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 font-extrabold uppercase block">과목 필터</span>
            <select
              value={filterGrade}
              onChange={e => {
                setFilterGrade(e.target.value);
                setFilterChapter('all');
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white outline-none focus:border-indigo-500 transition-colors cursor-pointer font-bold"
            >
              <option value="all">전체 과목 ({mistakes.length}개)</option>
              {availableGrades.map(g => {
                const cnt = mistakes.filter(m => m.grade === g).length;
                return <option key={g} value={g}>{g} ({cnt}개)</option>;
              })}
            </select>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 font-extrabold uppercase block">단원 필터</span>
            <select
              value={filterChapter}
              onChange={e => setFilterChapter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white outline-none focus:border-indigo-500 transition-colors cursor-pointer font-bold"
            >
              <option value="all">전체 단원 ({mistakes.filter(m => filterGrade === 'all' || m.grade === filterGrade).length}개)</option>
              {availableChapters.map(ch => {
                const cnt = mistakes.filter(m => m.chapter === ch && (filterGrade === 'all' || m.grade === filterGrade)).length;
                return <option key={ch} value={ch}>{ch} ({cnt}개)</option>;
              })}
            </select>
          </div>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-slate-800 rounded-2xl p-6 bg-slate-900/20 animate-scale-up">
          <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center text-2xl mb-4 text-slate-500">
            📓
          </div>
          <p className="text-slate-300 font-medium">기록이 없습니다</p>
          <p className="text-xs text-slate-500 mt-1.5 max-w-xs leading-relaxed whitespace-pre-line">
            {emptyMessage}
          </p>
        </div>
      ) : (
        <>
          {viewMode === 'list' ? (
            <div className="space-y-2.5">
              {filtered.slice(0, visibleCount).map((entry) => {
                const studentName = isAdmin && entry.userId ? (profilesMap[entry.userId] || entry.userId.slice(0, 8)) : undefined;
                const dateStr = entry.date ? entry.date.slice(5, 10).replace(/-/g, '/') : '—/—';
                return (
                  <div
                    key={entry.id}
                    onClick={() => onSelectEntry(entry)}
                    className="group flex items-center justify-between bg-slate-900/40 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 cursor-pointer transition-all active:scale-[0.99] space-x-3.5 shadow-sm"
                  >
                    {/* Print Selection Checkbox */}
                    {onTogglePrintSelect && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          onTogglePrintSelect(entry.id);
                        }}
                        className="flex-none p-2 -ml-2 select-none cursor-pointer"
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${
                          selectedPrintIds.includes(entry.id)
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-slate-700 bg-slate-950 hover:border-slate-500'
                        }`}>
                          {selectedPrintIds.includes(entry.id) && (
                            <span className="text-[10px] font-black leading-none">✓</span>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center space-x-3.5 min-w-0 flex-1">
                      {/* Left Side: Badges */}
                      <div className="flex flex-col space-y-1 flex-none items-start min-w-[80px]">
                        {entry.grade && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-extrabold block">
                            {entry.grade}
                          </span>
                        )}
                        {entry.chapter && (
                          <span className="text-[8px] text-slate-500 font-bold truncate max-w-[85px] block">
                            {entry.chapter}
                          </span>
                        )}
                      </div>

                      {/* Middle Side: Title & Student Name */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <div className="text-xs font-bold text-slate-200 line-clamp-1 group-hover:text-indigo-400 transition-colors">
                            <LaTeXRenderer text={entry.title} className="text-xs" />
                          </div>
                          {entry.analysis?.printed && (
                            <span className="text-[8px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1 py-0.5 rounded flex-none select-none">
                              🖨️ 인쇄완료
                            </span>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 mt-1">
                          {studentName && (
                            <span className="text-[8px] text-indigo-400 font-semibold block">
                              👤 {studentName}
                            </span>
                          )}
                          {/* 미니 복습 진단 배지 (oox, xo별 등) */}
                          <div className="flex items-center space-x-0.5 select-none">
                            {(entry.reviews || ['', '', '']).slice(0, 3).map((state, idx) => {
                              let badgeStyle = "bg-slate-950 text-slate-700 border-slate-900/60";
                              let text = String(idx + 1);
                              if (state === 'O') {
                                badgeStyle = "bg-emerald-500/20 text-emerald-400 border-emerald-500/20 font-black";
                                text = 'o';
                              } else if (state === 'X') {
                                badgeStyle = "bg-red-500/20 text-red-400 border-red-500/20 font-black";
                                text = 'x';
                              } else if (state === 'star') {
                                badgeStyle = "bg-amber-500/20 text-amber-400 border-amber-500/20 font-black";
                                text = '★';
                              }
                              return (
                                <span
                                  key={idx}
                                  className={`w-[13px] h-[13px] rounded-full border text-[7.5px] flex items-center justify-center font-mono leading-none ${badgeStyle}`}
                                >
                                  {text}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right Side: Date & Arrow */}
                    <div className="flex items-center space-x-3 flex-none pl-2">
                      {onTogglePrintAsText && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onTogglePrintAsText(entry.id);
                          }}
                          className={`px-2 py-1 rounded-lg text-[9px] font-bold border transition-all flex items-center space-x-1 select-none active:scale-95 ${
                            printAsTextMap[entry.id]
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                          title={printAsTextMap[entry.id] ? "지문 텍스트로 인쇄" : "사진 이미지로 인쇄"}
                        >
                          <span>{printAsTextMap[entry.id] ? '📝 텍스트' : '🖼️ 이미지'}</span>
                        </button>
                      )}
                      <span className="text-[9px] text-slate-500 font-semibold">
                        {dateStr}
                      </span>
                      <span className="text-slate-600 group-hover:text-slate-400 transition-colors text-xs font-bold">
                        &rarr;
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filtered.slice(0, visibleCount).map((entry) => (
                <MistakeCard
                  key={entry.id}
                  entry={entry}
                  onSelect={onSelectEntry}
                  onDelete={onDeleteMistake}
                  studentName={isAdmin && entry.userId ? (profilesMap[entry.userId] || entry.userId.slice(0, 8)) : undefined}
                  isOwnNote={!isAdmin || entry.userId === currentUserId}
                />
              ))}
            </div>
          )}

          {/* 더 보기 버튼 */}
          {filtered.length > visibleCount && (
            <div className="pt-4 flex justify-center">
              <button
                onClick={() => setVisibleCount(prev => prev + 10)}
                className="px-6 py-2.5 rounded-full text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-indigo-500/40 active:scale-95 transition-all shadow-lg flex items-center space-x-2 animate-fade-in"
              >
                <span>➕</span>
                <span>오답 기록 더 보기 ({filtered.length - visibleCount}개 남음)</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
