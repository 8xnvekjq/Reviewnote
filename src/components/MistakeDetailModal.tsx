import React from 'react';
import type { MistakeEntry, ReviewState } from '../types';
import { ROOT_CAUSE_OPTIONS, MATH_CURRICULUM, GRADE_LIST } from '../types';
import { LaTeXRenderer } from './LaTeXRenderer';
import { formatDate } from '../utils/date';
import { supabase } from '../services/supabase';

interface MistakeDetailModalProps {
  selectedEntry: MistakeEntry;
  isAnalyzing: boolean;
  currentUser?: string; // test 학생 한정 배포용
  onClose: () => void;
  onDeleteMistake: (id: string, e: React.MouseEvent) => void;
  onStartAnalysis: (entry: MistakeEntry) => void;
  onUpdateReviews: (id: string, newReviews: ReviewState[]) => void;
  onUpdateEntry: (updated: MistakeEntry) => void;
}

const NORMAL_PHRASES = [
  '문제 분석을 시작합니다...',
  '문제 이미지 분석 중...',
  '수학 수식 및 기호 판독 중...',
  '지문 텍스트 복원 중...',
  '개념 검색 중...',
  '정석 풀이 작성 중...',
  '단계별 힌트 구성 중...',
  '과목 및 단원 분류 중...'
];

export const MistakeDetailModal: React.FC<MistakeDetailModalProps> = ({
  selectedEntry,
  isAnalyzing,
  currentUser,
  onClose,
  onDeleteMistake,
  onStartAnalysis,
  onUpdateReviews,
  onUpdateEntry,
}) => {
  const [revealedHintCount, setRevealedHintCount] = React.useState(0);
  const [loadingText, setLoadingText] = React.useState('수학 문제 분석을 시작합니다...');

  // Student editable fields
  const [editGrade, setEditGrade] = React.useState(selectedEntry.grade || '');
  const [editChapter, setEditChapter] = React.useState(selectedEntry.chapter || '');
  const [editRootCauses, setEditRootCauses] = React.useState<string[]>(selectedEntry.rootCauses || []);
  const [editActionPlan, setEditActionPlan] = React.useState(selectedEntry.userActionPlan || '');
  const [isSaving, setIsSaving] = React.useState(false);

  // Accordion toggle states
  const [showProblemText, setShowProblemText] = React.useState(false);
  const [showSolvingProcess, setShowSolvingProcess] = React.useState(true); // Default open for study
  const [showMistakeSummary, setShowMistakeSummary] = React.useState(false); // Default collapsed for self-study

  const chaptersForGrade = editGrade ? (MATH_CURRICULUM[editGrade] || []) : [];

  // ★ test 학생용 한정 유튜브 매칭 데이터 세트 & 알고리즘
  const matchedLecture = React.useMemo(() => {
    if (currentUser !== 'test') return null;

    const mockYoutubeLectures = [
      {
        videoId: 'dQ_dkIb1DXo',
        title: '12/23 고1 월수금 삼차방정식의 근과계수, 오메가',
        grade: '공통수학1',
        chapters: [
          { startSeconds: 0, chapterTitle: '삼차방정식의 근과 계수' },
          { startSeconds: 2043, chapterTitle: '오메가' } // 34분 3초
        ]
      }
    ];

    const SYNONYM_MAP: Record<string, string[]> = {
      '오메가': ['omega', '\\omega', 'ω'],
      '로그': ['log'],
      '지수': ['exponent'],
      '행렬': ['matrix'],
      '사인': ['sin', 'sine'],
      '코사인': ['cos', 'cosine'],
      '탄젠트': ['tan', 'tangent']
    };

    const targetGrade = selectedEntry.grade;
    const targetChapter = selectedEntry.chapter || '';
    const problemText = selectedEntry.analysis?.problemText || '';
    const problemTitle = selectedEntry.title || '';

    const matchedVideo = mockYoutubeLectures.find(v => v.grade === targetGrade);
    if (!matchedVideo) return null;

    let bestChapter = matchedVideo.chapters[0];
    const searchPool = (problemTitle + ' ' + targetChapter + ' ' + problemText).toLowerCase();

    for (const ch of matchedVideo.chapters) {
      const chapterTitleClean = ch.chapterTitle.toLowerCase();
      
      // 1. 단순 포함 검사
      if (searchPool.includes(chapterTitleClean)) {
        bestChapter = ch;
        break;
      }

      // 2. 동의어 검사
      let foundSynonym = false;
      for (const [key, synonyms] of Object.entries(SYNONYM_MAP)) {
        if (chapterTitleClean.includes(key.toLowerCase())) {
          if (synonyms.some(syn => searchPool.includes(syn.toLowerCase()))) {
            foundSynonym = true;
            break;
          }
        }
      }

      if (foundSynonym) {
        bestChapter = ch;
        break;
      }
    }

    return {
      videoId: matchedVideo.videoId,
      videoTitle: matchedVideo.title,
      chapterTitle: bestChapter.chapterTitle,
      startSeconds: bestChapter.startSeconds
    };
  }, [selectedEntry, currentUser]);

  // ★ 버그 수정: AI 분석이 끝나서 selectedEntry 데이터가 갱신되면 로컬 상태도 자동으로 갱신 동기화합니다.
  React.useEffect(() => {
    setRevealedHintCount(0);
    setShowProblemText(false);
    setShowSolvingProcess(true);
    setShowMistakeSummary(false); // ID 변경 시 아코디언 닫음
    setEditGrade(selectedEntry.grade || '');
    setEditChapter(selectedEntry.chapter || '');
    setEditRootCauses(selectedEntry.rootCauses || []);
    setEditActionPlan(selectedEntry.userActionPlan || '');
  }, [
    selectedEntry.id, 
    selectedEntry.grade, 
    selectedEntry.chapter, 
    selectedEntry.rootCauses, 
    selectedEntry.userActionPlan
  ]);

  // Loading text cycling effect
  React.useEffect(() => {
    if (!isAnalyzing) {
      setLoadingText('처리 중...');
      return;
    }
    
    setLoadingText('문제 분석을 시작합니다...');

    const interval = setInterval(() => {
      const nextText = NORMAL_PHRASES[Math.floor(Math.random() * NORMAL_PHRASES.length)];
      setLoadingText(nextText);
    }, 1500);

    return () => clearInterval(interval);
  }, [isAnalyzing]);

  const hasStruggled = selectedEntry.reviews?.some(r => r === 'X' || r === 'star');

  const handleReviewToggle = (index: number, state: ReviewState) => {
    const currentReviews = [...(selectedEntry.reviews || ['', '', ''])];
    currentReviews[index] = currentReviews[index] === state ? '' : state;
    onUpdateReviews(selectedEntry.id, currentReviews as ReviewState[]);
  };

  const toggleRootCause = (id: string) => {
    setEditRootCauses(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  // ★ 저장하기 피드백 개선: 완료 알림 띄우고 모달 닫기
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('mistakes')
        .update({
          grade: editGrade || null,
          chapter: editChapter || null,
          root_causes: editRootCauses,
          user_action_plan: editActionPlan || null,
        })
        .eq('id', selectedEntry.id);
      
      if (error) throw error;
      
      onUpdateEntry({
        ...selectedEntry,
        grade: editGrade || undefined,
        chapter: editChapter || undefined,
        rootCauses: editRootCauses,
        userActionPlan: editActionPlan || undefined,
      });

      alert('성공적으로 저장되었습니다! 🎉');
      onClose(); // 저장 완료 후 모달창을 자동으로 닫아 위화감을 없앱니다.
    } catch (err: any) {
      alert('저장 실패: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-3xl bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
        
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/80 sticky top-0">
          <div className="pr-4 flex-1">
            <span className="text-[10px] text-slate-500 font-bold block uppercase tracking-wider">
              {formatDate(selectedEntry.date)}
            </span>
            <h3 className="font-bold text-white text-base line-clamp-1 min-w-0">
              <LaTeXRenderer 
                text={selectedEntry.title} 
                className="text-white font-bold text-base line-clamp-1 inline-block w-full"
              />
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 active:scale-90 flex items-center justify-center text-slate-400 text-lg transition-all flex-none"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Problem Image Preview */}
          <div className="w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center relative p-2 min-h-[200px]">
            <img 
              src={selectedEntry.imageUrl} 
              alt={selectedEntry.title} 
              className="w-full h-auto max-h-[60vh] object-contain rounded-xl" 
            />
          </div>

          {/* 3-Step Review Status Selection Card */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center">
                <span className="mr-1 text-sm">📋</span> 복습 상태 진단 (3회 완료 시 보관함 이동)
              </span>
              <div className="flex-none">
                {selectedEntry.reviews?.filter(r => r === 'O').length === 3 ? (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold">
                    🎉 복습 완료
                  </span>
                ) : (
                  <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full border border-slate-700 font-bold">
                    진행 중
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((index) => {
                const currentVal = selectedEntry.reviews?.[index] || '';
                return (
                  <div key={index} className="bg-slate-900 p-2.5 rounded-xl border border-slate-800 text-center space-y-2">
                    <div className="text-[10px] font-bold text-slate-500">{index + 1}차 복습</div>
                    <div className="flex items-center justify-center space-x-1.5">
                      <button
                        onClick={() => handleReviewToggle(index, 'O')}
                        className={`w-7 h-7 rounded-full text-xs font-bold transition-all flex items-center justify-center ${
                          currentVal === 'O' 
                            ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20' 
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        O
                      </button>
                      <button
                        onClick={() => handleReviewToggle(index, 'X')}
                        className={`w-7 h-7 rounded-full text-xs font-bold transition-all flex items-center justify-center ${
                          currentVal === 'X' 
                            ? 'bg-red-500 text-white shadow-md shadow-red-500/20' 
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        X
                      </button>
                      <button
                        onClick={() => handleReviewToggle(index, 'star')}
                        className={`w-7 h-7 rounded-full text-xs font-bold transition-all flex items-center justify-center ${
                          currentVal === 'star' 
                            ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20' 
                            : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        ★
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedEntry.reviews?.every(r => r !== '') && (
              <button
                onClick={() => {
                  if (confirm('틀리거나 보류한 기록을 정리하고 맞춘(O) 기록만 앞으로 정렬하여 다시 복습하시겠습니까?')) {
                    const oReviews = (selectedEntry.reviews || []).filter(r => r === 'O');
                    const newReviews = [...oReviews, '', ''].slice(0, 3) as ReviewState[];
                    onUpdateReviews(selectedEntry.id, newReviews);
                  }
                }}
                className="w-full py-2.5 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 active:scale-95 border border-indigo-500/20 text-indigo-400 font-bold text-xs transition-all flex items-center justify-center space-x-1.5 mt-1"
              >
                <span>🔄 맞춘 오답 제외하고 복습 기록 정리하기</span>
              </button>
            )}
          </div>

          {/* ⚡ AI 틀린 이유 1줄 진단 */}
          {selectedEntry.analysis?.mistakeSummary &&
            selectedEntry.analysis.mistakeSummary !== '학생 풀이 없음' && (
            <div className="space-y-2 border-l-4 border-red-500 pl-4 py-1">
              <button
                onClick={() => setShowMistakeSummary(!showMistakeSummary)}
                className="w-full flex items-center justify-between text-left focus:outline-none group"
              >
                <h4 className="text-sm font-extrabold text-red-400 flex items-center group-hover:text-red-300 transition-colors">
                  <span className="mr-1.5 text-base">⚡</span> AI 틀린 이유 진단
                </h4>
                <span className="text-xs text-slate-500 font-bold mr-1 group-hover:text-slate-400 transition-colors">
                  {showMistakeSummary ? '▲ 닫기' : '▼ 보기'}
                </span>
              </button>
              {showMistakeSummary && (
                <div className="bg-red-950/20 p-4.5 rounded-2xl border border-red-500/20 animate-scale-up mt-2">
                  <LaTeXRenderer 
                    text={selectedEntry.analysis.mistakeSummary} 
                    className="text-xs sm:text-sm leading-relaxed text-red-200" 
                  />
                </div>
              )}
            </div>
          )}
          {/* ⚡ AI 추천 동영상 딥링크 연동 카드 (test 학생 한정) */}
          {matchedLecture && (
            <div className="bg-slate-950/40 border border-slate-800/80 rounded-2xl p-3.5 flex items-center justify-between space-x-3.5 animate-scale-up">
              <div className="flex items-center space-x-3 min-w-0">
                <span className="text-xl flex-none">📺</span>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-[10px] font-black text-rose-400 uppercase tracking-wider">선생님 추천 강의</p>
                  <h5 className="text-xs font-bold text-slate-200 truncate leading-tight">
                    {matchedLecture.videoTitle}
                  </h5>
                  <p className="text-[10px] text-slate-400 truncate">
                    ⏱️ {matchedLecture.chapterTitle} ({
                      Math.floor(matchedLecture.startSeconds / 60) > 0 
                        ? `${Math.floor(matchedLecture.startSeconds / 60)}분 ${matchedLecture.startSeconds % 60}초` 
                        : `${matchedLecture.startSeconds % 60}초`
                    }부터)
                  </p>
                </div>
              </div>

              <a
                href={`https://youtu.be/${matchedLecture.videoId}?t=${matchedLecture.startSeconds}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 text-rose-300 hover:text-rose-200 font-extrabold text-[10px] border border-rose-500/20 transition-all flex items-center space-x-1 flex-none shadow-md"
              >
                <span>▶️</span>
                <span>바로가기</span>
              </a>
            </div>
          )}


          {hasStruggled && selectedEntry.analysis?.hints && selectedEntry.analysis.hints.length > 0 && (
            <div className="bg-slate-950 p-4.5 rounded-2xl border border-slate-850 space-y-3 animate-scale-up">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-400 flex items-center">
                  <span className="mr-1.5 text-sm">💡</span> 단계별 힌트
                </span>
                <span className="text-[10px] text-slate-500 font-bold">
                  {revealedHintCount} / 3 공개됨
                </span>
              </div>

              <div className="space-y-2.5">
                {selectedEntry.analysis.hints.slice(0, revealedHintCount).map((hint, i) => (
                  <div key={i} className="p-3 bg-slate-900/60 rounded-xl border border-slate-800 animate-scale-up space-y-1">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">힌트 {i + 1}단계</span>
                    <LaTeXRenderer text={hint} className="text-xs md:text-sm leading-relaxed text-slate-300" />
                  </div>
                ))}
              </div>

              {revealedHintCount < 3 ? (
                <button
                  onClick={() => setRevealedHintCount(prev => prev + 1)}
                  className="w-full py-2.5 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 active:scale-95 border border-indigo-500/20 text-indigo-400 font-bold text-xs transition-all flex items-center justify-center space-x-1"
                >
                  <span>🔍 힌트 {revealedHintCount + 1} 보기</span>
                </button>
              ) : (
                <p className="text-[10px] text-slate-500 text-center font-medium py-1">
                  모든 힌트가 공개되었습니다. 아래 풀이를 참고하여 오답을 완벽히 이해해 보세요!
                </p>
              )}
            </div>
          )}

          {/* AI Analysis trigger / solving process rendering */}
          {isAnalyzing ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="text-center min-h-[60px] flex flex-col justify-center">
                <p className="text-sm font-semibold text-white animate-pulse">{loadingText}</p>
                <p className="text-xs text-slate-400 mt-1">AI 수학 클리닉 진단을 작성하고 있습니다.</p>
              </div>
            </div>
          ) : selectedEntry.analysis ? (
            <div className="space-y-6 animate-scale-up">
              
              {/* Card 0: 원본 문제 지문 복원 */}
              {selectedEntry.analysis.problemText && (
                <div className="space-y-2 border-l-4 border-slate-400 pl-4 py-1">
                  <button
                    onClick={() => setShowProblemText(!showProblemText)}
                    className="w-full flex items-center justify-between text-left focus:outline-none group"
                  >
                    <h4 className="text-sm font-extrabold text-slate-300 flex items-center group-hover:text-white transition-colors">
                      <span className="mr-1.5 text-base">📝</span> 원본 문제 지문
                    </h4>
                    <span className="text-xs text-slate-500 font-bold mr-1 group-hover:text-slate-400 transition-colors">
                      {showProblemText ? '▲ 닫기' : '▼ 보기'}
                    </span>
                  </button>
                  {showProblemText && (
                    <div className="bg-slate-950 p-4.5 rounded-2xl border border-slate-850 animate-scale-up mt-2">
                      <LaTeXRenderer text={selectedEntry.analysis.problemText} className="text-sm md:text-base leading-relaxed text-slate-300" />
                    </div>
                  )}
                </div>
              )}

              {/* Card 1: 정석 풀이 과정 */}
              <div className="space-y-2 border-l-4 border-indigo-500 pl-4 py-1">
                <button
                  onClick={() => setShowSolvingProcess(!showSolvingProcess)}
                  className="w-full flex items-center justify-between text-left focus:outline-none group"
                >
                  <h4 className="text-sm font-extrabold text-indigo-400 flex items-center group-hover:text-indigo-300 transition-colors">
                    <span className="mr-1.5 text-base">💡</span> 정석 풀이 과정
                  </h4>
                  <span className="text-xs text-slate-500 font-bold mr-1 group-hover:text-slate-400 transition-colors">
                    {showSolvingProcess ? '▲ 닫기' : '▼ 보기'}
                  </span>
                </button>
                {showSolvingProcess && (
                  <div className="bg-slate-950 p-4.5 rounded-2xl border border-slate-850 animate-scale-up mt-2">
                    <LaTeXRenderer text={selectedEntry.analysis.solvingProcess} className="text-sm md:text-base leading-relaxed" />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="py-8 bg-slate-950/60 rounded-2xl border border-slate-800 p-6 text-center space-y-4">
              <div className="text-3xl">🤖</div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-white">AI 수학 클리닉 진단</p>
                <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                  아직 오답 원인이 분석되지 않았습니다. AI가 설계하는 맞춤형 오답 처방전을 확인해 보세요.
                </p>
              </div>
              <button 
                onClick={() => onStartAnalysis(selectedEntry)}
                className="px-6 py-2.5 rounded-full bg-gradient-to-r from-indigo-600 to-indigo-500 active:scale-95 transition-all text-xs font-bold text-white shadow-md shadow-indigo-600/20"
              >
                AI 분석 시작하기
              </button>
            </div>
          )}

          {/* ── 학생 입력 영역 ── */}
          <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/30">
            <div className="bg-slate-800/50 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-300">✏️ 오답 클리닉 기록</span>
              {(selectedEntry.grade || selectedEntry.rootCauses?.length) && (
                <div className="flex items-center space-x-1.5">
                  {selectedEntry.grade && <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 font-bold">{selectedEntry.grade}</span>}
                  {selectedEntry.chapter && <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 border border-slate-600 font-bold">{selectedEntry.chapter}</span>}
                </div>
              )}
            </div>
            <div className="p-4 space-y-4">

              {/* 과목 / 단원 선택 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 block">과목 (AI 자동분류)</label>
                  <select value={editGrade} onChange={e => { setEditGrade(e.target.value); setEditChapter(''); }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white outline-none focus:border-indigo-500 transition-colors cursor-pointer">
                    <option value="">선택하세요</option>
                    {GRADE_LIST.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-slate-400 block">단원</label>
                  <select value={editChapter} onChange={e => setEditChapter(e.target.value)}
                    disabled={!editGrade}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white outline-none focus:border-indigo-500 transition-colors cursor-pointer disabled:opacity-40">
                    <option value="">선택하세요</option>
                    {chaptersForGrade.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* 실수 원인 체크박스 */}
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 block">실수 원인 (복수 선택 가능)</label>
                <div className="space-y-2">
                  {ROOT_CAUSE_OPTIONS.map(opt => (
                    <label key={opt.id} className="flex items-center space-x-3 cursor-pointer group">
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-none transition-all ${
                          editRootCauses.includes(opt.id)
                            ? 'bg-amber-500 border-amber-500'
                            : 'bg-slate-950 border-slate-700 group-hover:border-amber-500/50'
                        }`}
                        onClick={() => toggleRootCause(opt.id)}
                      >
                        {editRootCauses.includes(opt.id) && <span className="text-white text-[10px] font-black">✓</span>}
                      </div>
                      <div onClick={() => toggleRootCause(opt.id)}>
                        <span className="text-xs font-semibold text-slate-200">{opt.label}</span>
                        <span className="text-[10px] text-slate-500 ml-1.5">{opt.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* 나만의 대책 */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-400 block">나만의 대책 (직접 작성)</label>
                <textarea
                  value={editActionPlan}
                  onChange={e => setEditActionPlan(e.target.value)}
                  placeholder="이번 실수를 통해 앞으로 어떻게 풀겠다는 나만의 대책을 자유롭게 적어보세요..."
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-600 outline-none focus:border-emerald-500 transition-colors resize-none leading-relaxed"
                />
              </div>

            </div>
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 flex space-x-3">
          <button
            onClick={(e) => onDeleteMistake(selectedEntry.id, e)}
            className="py-3 px-4 rounded-xl border border-red-500/20 hover:border-red-500/40 bg-red-500/5 hover:bg-red-500/10 active:scale-95 transition-all text-xs font-bold text-red-400 flex items-center justify-center space-x-1.5"
          >
            <span>🗑️</span>
            <span>삭제</span>
          </button>
          
          <button 
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-slate-800 hover:border-slate-700 active:scale-95 transition-all text-xs font-semibold text-slate-300"
          >
            닫기
          </button>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 active:scale-95 disabled:opacity-50 transition-all text-xs font-bold text-white shadow-md shadow-emerald-600/20"
          >
            {isSaving ? '저장 중...' : '✅ 저장하기'}
          </button>
        </div>

      </div>
    </div>
  );
};
