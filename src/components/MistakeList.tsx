import React, { useEffect, useRef, useState } from 'react';
import '../styles/notes.css';
import type { MistakeEntry } from '../types';
import { MistakeCard } from './MistakeCard';
import { LaTeXRenderer } from './LaTeXRenderer';
import { supabase } from '../services/supabase';
import { getScreenState, setScreenState } from '../app/screenStateStore';

interface StoredMistakeListState {
  scrollTop: number;
  visibleCount: number;
  selectedStudent: string;
  filterGrade: string;
  filterChapter: string;
}

// MistakeList 자신은 스크롤 컨테이너를 갖지 않는다 — 실제 스크롤은 AppShell의 <main
// overflow-y-auto>에서 일어난다. AppShell 구조를 건드리지 않고도 그 실제 스크롤 요소를 찾기 위해
// DOM을 위로 타고 올라가며 overflow-y가 auto/scroll인 첫 조상을 찾는다(못 찾으면 문서 전체 스크롤
// 요소로 폴백) — 모바일 뷰포트든 데스크톱이든 어떤 형태의 스크롤 컨테이너 구조에도 동작한다.
function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node && node !== document.body) {
    const overflowY = window.getComputedStyle(node).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return node;
    }
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

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
  equippedStamp?: string;
  profilesStampMap?: Record<string, string>;
  scaffoldedMistakeIds?: Set<string>;
  onToggleHidden?: (id: string, hidden: boolean) => void; // 시험범위 제외 등으로 카드 숨기기/해제
  checkpointRegenStatusMap?: Record<string, 'generating' | 'success' | 'failed'>; // 정리하기(초기화) 후 체크리스트 재생성 진행 상태
  onRetryCheckpointGeneration?: (entry: MistakeEntry) => void; // 재생성 실패 시 "다시 시도"
  onlineUsers?: { id: string; display_name: string; nickname?: string; username: string }[]; // 함께 공부 중인 학생 — App.tsx가 이미 계산해 BottomNavigation에도 넘기는 것과 동일한 배열을 재사용(신규 로직 없음)
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
  equippedStamp,
  profilesStampMap = {},
  scaffoldedMistakeIds,
  onToggleHidden,
  checkpointRegenStatusMap = {},
  onRetryCheckpointGeneration,
  onlineUsers = [],
}) => {
  const [showOnlinePopup, setShowOnlinePopup] = useState(false);
  // 'notes' 탭은 viewMode 생략(card 기본값), 'completed' 탭은 'list'를 넘겨서 두 사용처가
  // 이미 서로 다른 값을 쓰고 있으므로 이걸 그대로 저장 키로 재사용한다(새 prop 추가 없이 두
  // 인스턴스의 스크롤/필터 기억을 서로 침범하지 않게 분리).
  const screenKey = `mistakeList:${viewMode}`;
  // 마운트 시점에 저장된 스냅샷을 딱 한 번만 읽어 온다(ref) — 이후 리렌더에서 다시 읽지 않는다.
  const saved = useRef(getScreenState<StoredMistakeListState>(screenKey)).current;

  const [selectedStudent, setSelectedStudent] = useState<string>(() => saved?.selectedStudent ?? 'all');
  const [filterGrade, setFilterGrade] = useState<string>(() => saved?.filterGrade ?? 'all');
  const [filterChapter, setFilterChapter] = useState<string>(() => saved?.filterChapter ?? 'all');
  const [visibleCount, setVisibleCount] = useState<number>(() => saved?.visibleCount ?? 10);
  const [isLoadingActivity, setIsLoadingActivity] = useState<string | null>(null);

  // 언마운트 시점에 최신 값을 저장하기 위한 ref들. effect의 cleanup 클로저가 마운트 시점 값에
  // 고정되지 않도록(stale closure 방지), 매 렌더마다 최신 state를 동기적으로 반영해둔다.
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef<number>(saved?.scrollTop ?? 0);
  const hasRestoredScrollRef = useRef(false);
  const visibleCountRef = useRef(visibleCount);
  visibleCountRef.current = visibleCount;
  const selectedStudentRef = useRef(selectedStudent);
  selectedStudentRef.current = selectedStudent;
  const filterGradeRef = useRef(filterGrade);
  filterGradeRef.current = filterGrade;
  const filterChapterRef = useRef(filterChapter);
  filterChapterRef.current = filterChapter;

  // 스크롤 컨테이너에 리스너를 붙여 scrollTop을 ref로만 추적(리렌더 유발 방지)하고, 언마운트 시
  // 그 시점의 스크롤/필터/더보기 상태를 스냅샷으로 저장한다.
  useEffect(() => {
    const container = findScrollableAncestor(rootRef.current);
    if (!container) return;

    const handleScroll = () => {
      scrollTopRef.current = container.scrollTop;
    };
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      setScreenState<StoredMistakeListState>(screenKey, {
        scrollTop: scrollTopRef.current,
        visibleCount: visibleCountRef.current,
        selectedStudent: selectedStudentRef.current,
        filterGrade: filterGradeRef.current,
        filterChapter: filterChapterRef.current,
      });
    };
  }, [screenKey]);

  // 저장된 스크롤 위치 복원 시도. mistakes가 아직 다 안 실려서 스크롤할 만큼 콘텐츠가 없으면
  // (scrollHeight <= clientHeight) 이번엔 건너뛰고, mistakes.length가 바뀔 때(예: 뒤늦게 도착한
  // 데이터) 다시 한번만 시도한다 — 한 번이라도 성공하면(hasRestoredScrollRef) 이후 realtime
  // 갱신 등으로 목록 길이가 바뀌어도 사용자가 이미 스크롤한 위치를 다시 잡아채지 않는다.
  useEffect(() => {
    if (hasRestoredScrollRef.current) return;
    const target = saved?.scrollTop ?? 0;
    if (target <= 0) {
      hasRestoredScrollRef.current = true;
      return;
    }
    const container = findScrollableAncestor(rootRef.current);
    if (!container) return;

    const raf = requestAnimationFrame(() => {
      if (container.scrollHeight <= container.clientHeight) return; // 아직 콘텐츠 부족 — 다음 기회에 재시도
      container.scrollTop = target;
      hasRestoredScrollRef.current = true;
    });
    return () => cancelAnimationFrame(raf);
  }, [mistakes.length, saved]);

  const handleActivityClick = async (act: any) => {
    if (!act.mistake_id) return;
    setIsLoadingActivity(act.mistake_id);
    try {
      // 1. 로컬 리스트에서 탐색
      const localFind = mistakes.find(m => m.id === act.mistake_id);
      if (localFind) {
        onSelectEntry(localFind);
        return;
      }
      // 2. 리모트 단건 SELECT 땡기기
      const { data, error } = await supabase
        .from('mistakes')
        .select('*')
        .eq('id', act.mistake_id)
        .single();

      if (error) throw error;
      if (data) {
        const remoteEntry: MistakeEntry = {
          id: data.id,
          userId: data.user_id,
          title: data.title,
          imageUrl: data.image_url,
          date: data.date,
          analysis: data.analysis || undefined,
          reviews: data.reviews || ['', '', ''],
          rootCauses: data.root_causes || [],
          userActionPlan: data.user_action_plan || undefined,
          grade: data.grade || undefined,
          chapter: data.chapter || undefined,
        };
        onSelectEntry(remoteEntry);
      }
    } catch (err: any) {
      console.error('활동 오답 로드 실패:', err);
      alert('오답 카드를 불러오는데 실패했습니다: ' + err.message);
    } finally {
      setIsLoadingActivity(null);
    }
  };

  // 필터나 뷰모드가 변경되면 표시 개수를 10개로 리셋. 단, 마운트 직후 첫 실행은 건너뛴다 —
  // 그렇지 않으면 위에서 저장된 스냅샷으로 복원한 visibleCount를 이 effect가 마운트되자마자
  // 다시 10으로 되돌려버린다(React는 deps 배열과 무관하게 마운트 시 한 번은 항상 effect를 실행함).
  const isFirstFilterEffectRef = useRef(true);
  React.useEffect(() => {
    if (isFirstFilterEffectRef.current) {
      isFirstFilterEffectRef.current = false;
      return;
    }
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
    <div className="rn-notes space-y-5" ref={rootRef}>
      <header className="rn-notes-header">
        <div>
          <p className="rn-eyebrow">{viewMode === 'list' ? 'MY PROGRESS' : 'DAILY PRACTICE'}</p>
          <h2 className="rn-title">{title}</h2>
          <p className="rn-caption">{isAdmin ? `전체 ${mistakes.length}개 · 표시 ${filtered.length}개` : viewMode === 'list' ? `${mistakes.length}개의 도전이 기록되었어요` : '한 문제씩, 어제보다 확실하게.'}</p>
        </div>
        <div className="rn-notes-header-actions">
          {/* 함께 공부 중인 학생 수 — 전체메뉴로 옮겨갔던 정보를 오답노트 패널로 복귀. 큰 summary
              카드가 아니라 작은 floating badge, 누르면 예전처럼 목록 팝업. onlineUsers는
              App.tsx가 이미 계산해 BottomNavigation에도 넘기는 것과 같은 배열 재사용(신규 로직 없음). */}
          {onlineUsers.length > 0 && (
            <div className="rn-online-wrap">
              <button type="button" className="rn-online-badge" onClick={() => setShowOnlinePopup(v => !v)} aria-expanded={showOnlinePopup} aria-label={`함께 공부 중인 학생 ${onlineUsers.length}명, 목록 보기`}>
                <span className="rn-online-dot" aria-hidden="true" />
                <span aria-hidden="true">👥</span>
                <span>{onlineUsers.length}</span>
              </button>
              {showOnlinePopup && (
                <div className="rn-online-popup" role="dialog" aria-label="함께 공부 중인 학생 목록">
                  <div className="rn-online-popup-title"><span>공부 중인 친구들</span><span className="rn-online-live">● Live</span></div>
                  {onlineUsers.length === 0 ? (
                    <p className="rn-caption" style={{ textAlign: 'center', padding: '4px 0' }}>지금은 혼자 공부 중이에요.</p>
                  ) : (
                    <ul className="rn-online-popup-list">
                      {onlineUsers.map(u => (
                        <li key={u.id}><span className="rn-online-dot" aria-hidden="true" /><span>{u.nickname || u.display_name || u.username}</span></li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
          {!hideAddButton && <button type="button" onClick={onAddClick} className="rn-button rn-button-primary rn-button-compact">+ 문제 추가</button>}
        </div>
      </header>
      {onPrintClick && mistakes.length > 0 && (
        <div className="rn-notes-print">
          <span className="rn-caption">{selectedPrintIds.length}개 선택</span>
          {onToggleAllPrintSelect && <button type="button" onClick={onToggleAllPrintSelect} className="rn-button rn-button-secondary">{selectedPrintIds.length === mistakes.length ? '전체 해제' : '전체 선택'}</button>}
          <button type="button" onClick={onPrintClick} disabled={selectedPrintIds.length === 0} className="rn-button rn-button-primary">PDF 인쇄</button>
        </div>
      )}
      {/* 실시간 친구들의 복습 현황 위젯 */}
      {viewMode === 'list' && peerActivities && peerActivities.length > 0 && (
        <div className="rn-peer-activity rn-surface p-4 space-y-3">
          <div className="flex items-center space-x-1.5">
            <span className="text-sm" aria-hidden="true">✦</span>
            <span className="rn-caption">친구들도 한 문제씩 도전 중</span>
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
                const isOnline = act.last_seen_at && (Date.now() - new Date(act.last_seen_at).getTime() < 300000); // 5분

                const isLoadingThis = isLoadingActivity === act.mistake_id;

                return (
                  <div
                    key={act.mistake_id || idx}
                    onClick={() => isAdmin && handleActivityClick(act)}
                    role={isAdmin ? 'button' : undefined}
                    tabIndex={isAdmin ? 0 : undefined}
                    aria-busy={isLoadingThis}
                    onKeyDown={e => {
                      if (isAdmin && !isLoadingThis && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        void handleActivityClick(act);
                      }
                    }}
                    className={`text-[10px] text-slate-300 leading-normal flex items-center justify-between space-x-2 ${
                      idx > 0 ? 'pt-2' : ''
                    } ${
                      isAdmin 
                        ? 'hover:bg-slate-800/40 cursor-pointer p-1.5 -mx-1.5 rounded-lg active:scale-[0.99] transition-all' 
                        : 'py-1'
                    } ${
                      isLoadingThis ? 'opacity-50 pointer-events-none animate-pulse' : ''
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                      <div className="flex items-center space-x-1 flex-none min-w-0">
                        <span className="font-bold text-indigo-300 truncate max-w-[70px] flex-none" title={studentName}>
                          👤 {studentName}
                        </span>
                        {isOnline && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-none" title="온라인 상태" />
                        )}
                      </div>
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

      {/* 어드민 학생 필터 셀렉트 — 여러 학생을 빠르게 훑을 수 있도록 폭을 줄이고, 문제카드
          영역에 시각적 우선순위를 더 준다(기존 select 기능/옵션 구성 그대로, compact화만). */}
      {isAdmin && studentOptions.length > 0 && (
        <div className="rn-student-select-row">
          <label htmlFor={`${screenKey}-student`} className="rn-caption">학생</label>
          <select
            id={`${screenKey}-student`} value={selectedStudent}
            onChange={e => setSelectedStudent(e.target.value)}
            className="rn-student-select"
          >
            <option value="all">전체 ({mistakes.length}개)</option>
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
        <div className="rn-notes-filters">
          <div className="space-y-1">
            <label htmlFor={`${screenKey}-grade`} className="rn-caption">과목</label>
            <select
              id={`${screenKey}-grade`} value={filterGrade}
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
            <label htmlFor={`${screenKey}-chapter`} className="rn-caption">단원</label>
            <select
              id={`${screenKey}-chapter`} value={filterChapter}
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
        <div className="rn-empty rn-notes-empty">
          <div className="rn-notes-empty-icon" aria-hidden="true">✦</div>
          <p className="rn-title">{mistakes.length ? '조건에 맞는 문제가 없어요' : viewMode === 'list' ? '복습의 발자국을 남겨보세요' : '첫 문제부터 시작해요'}</p>
          <p className="rn-caption">{mistakes.length ? '필터를 바꾸면 다른 문제를 볼 수 있어요.' : emptyMessage}</p>
          {!hideAddButton && !mistakes.length && <button type="button" className="rn-button rn-button-primary" onClick={onAddClick}>문제 촬영하기 →</button>}
        </div>      ) : (
        <>
          {viewMode === 'list' ? (
            <div className="rn-records">
              {filtered.slice(0, visibleCount).map(entry => {
                const studentName = isAdmin && entry.userId ? (profilesMap[entry.userId] || entry.userId.slice(0, 8)) : undefined;
                return (
                  <article className="rn-record" key={entry.id}>
                    {onTogglePrintSelect && <label className="rn-record-select">
                      <input type="checkbox" checked={selectedPrintIds.includes(entry.id)} onChange={() => onTogglePrintSelect(entry.id)} aria-label={`${entry.title} 인쇄 선택`} />
                    </label>}
                    <button type="button" className="rn-record-open" onClick={() => onSelectEntry(entry)}>
                      <span className="rn-note-subject">{entry.grade || '수학'}{entry.chapter ? ` · ${entry.chapter}` : ''}</span>
                      <span className="rn-record-title"><LaTeXRenderer text={entry.title} className="line-clamp-2" /></span>
                      <span className="rn-note-meta">{studentName && <span>{studentName}</span>}<span>{entry.date ? entry.date.slice(5, 10).replace(/-/g, '/') : '—/—'}</span>{entry.analysis?.printed && <span className="rn-note-hint">인쇄 완료</span>}</span>
                      <span className="rn-record-bottom">
                        <span className="rn-review-dots">
                          {(entry.reviews || ['', '', '']).slice(0, 3).map((state, idx) => <span key={idx} title={`${idx + 1}차 복습`} className={`rn-review-dot ${state === 'O' ? 'is-success' : state === 'X' ? 'is-retry' : state === 'star' ? 'is-star' : ''}`}>{state === 'star' ? '★' : state || idx + 1}</span>)}
                        </span>
                        <span className="rn-note-continue">기록 보기 →</span>
                      </span>
                    </button>
                    {onTogglePrintAsText && <button type="button" className="rn-record-print rn-button rn-button-secondary" onClick={() => onTogglePrintAsText(entry.id)} aria-pressed={!!printAsTextMap[entry.id]} title={printAsTextMap[entry.id] ? '지문 텍스트로 인쇄' : '사진 이미지로 인쇄'}>{printAsTextMap[entry.id] ? '텍스트 인쇄' : '이미지 인쇄'}</button>}
                  </article>
                );
              })}
            </div>          ) : (
            <div className="rn-notes-grid">
              {filtered.slice(0, visibleCount).map((entry) => (
                <MistakeCard
                  key={entry.id}
                  entry={entry}
                  onSelect={onSelectEntry}
                  onDelete={onDeleteMistake}
                  studentName={isAdmin && entry.userId ? (profilesMap[entry.userId] || entry.userId.slice(0, 8)) : undefined}
                  isOwnNote={!isAdmin || entry.userId === currentUserId}
                  equippedStamp={entry.userId ? profilesStampMap[entry.userId] : equippedStamp}
                  hasScaffolding={scaffoldedMistakeIds?.has(entry.id)}
                  onToggleHidden={onToggleHidden}
                  checkpointRegenStatus={checkpointRegenStatusMap[entry.id]}
                  onRetryCheckpointGeneration={onRetryCheckpointGeneration ? () => onRetryCheckpointGeneration(entry) : undefined}
                />
              ))}
            </div>
          )}

          {/* 더 보기 버튼 */}
          {filtered.length > visibleCount && (
            <div className="pt-4 flex justify-center">
              <button
                onClick={() => setVisibleCount(prev => prev + 10)}
                className="rn-button rn-button-secondary"
              >
                <span aria-hidden="true">+</span>
                <span>오답 기록 더 보기 ({filtered.length - visibleCount}개 남음)</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
