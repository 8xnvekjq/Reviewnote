import React from 'react';
import type { MistakeEntry, ReviewState } from '../types';
import { LaTeXRenderer } from './LaTeXRenderer';
import { formatDate } from '../utils/date';

interface MistakeDetailModalProps {
  selectedEntry: MistakeEntry;
  isAnalyzing: boolean;
  onClose: () => void;
  onDeleteMistake: (id: string, e: React.MouseEvent) => void;
  onStartAnalysis: (entry: MistakeEntry) => void;
  onUpdateReviews: (id: string, newReviews: ReviewState[]) => void;
}

const NORMAL_PHRASES = [
  '문제 분석을 시작합니다...',
  '문제 이미지 분석 중...',
  '수학 수식 및 기호 판독 중...',
  '지문 텍스트 복원 중...',
  '문제 해결을 위한 핵심 개념 탐색 중...',
  '변수 및 조건 추출하는 중...',
  '오답 원인 분석 중...',
  '정석 풀이 흐름 설계 중...',
  '실수 유발 지점 파악 중...',
  '발상 및 개념 클리닉 처방 중...',
  '단계별 힌트 작성 중...',
  'LaTeX 수식 가독성 다듬는 중...'
];

const GAG_PHRASES = [
  '귀여운 강아지 쓰다듬는 중...',
  '당 보충용 초콜릿 까먹는 중...',
  '수식 계산기 기름칠하는 중...',
  '인공지능 뉴런 스트레칭 중...',
  '커피 원두 가는 중...',
  '조금만 더 힘내라고 수식 격려하는 중...',
  '연필심 깎는 중...',
  '답안지 슬쩍 엿보는 중... (은 장난입니다)',
  '수학 요정 소환하는 중...',
  '우주 에너지를 수식으로 모으는 중...'
];

export const MistakeDetailModal: React.FC<MistakeDetailModalProps> = ({
  selectedEntry,
  isAnalyzing,
  onClose,
  onDeleteMistake,
  onStartAnalysis,
  onUpdateReviews,
}) => {
  const [revealedHintCount, setRevealedHintCount] = React.useState(0);
  const [loadingText, setLoadingText] = React.useState('처리 중...');

  // Accordion toggle states for analysis cards
  const [showProblemText, setShowProblemText] = React.useState(false);
  const [showSolvingProcess, setShowSolvingProcess] = React.useState(false);
  const [showMistakeDetail, setShowMistakeDetail] = React.useState(false);
  const [showActionPlan, setShowActionPlan] = React.useState(false);

  // Reset all states when entry changes
  React.useEffect(() => {
    setRevealedHintCount(0);
    setShowProblemText(false);
    setShowSolvingProcess(false);
    setShowMistakeDetail(false);
    setShowActionPlan(false);
  }, [selectedEntry.id]);

  // Loading text cycling effect
  React.useEffect(() => {
    if (!isAnalyzing) {
      setLoadingText('처리 중...');
      return;
    }
    
    setLoadingText('문제 분석을 시작합니다...');

    const interval = setInterval(() => {
      const isGag = Math.random() < 0.2; // 1/5 probability
      const pool = isGag ? GAG_PHRASES : NORMAL_PHRASES;
      const nextText = pool[Math.floor(Math.random() * pool.length)];
      setLoadingText(nextText);
    }, 1500);

    return () => clearInterval(interval);
  }, [isAnalyzing]);

  
  // Visibility condition: Show hints only when student struggled (marked X or star)
  const hasStruggled = selectedEntry.reviews?.some(r => r === 'X' || r === 'star');

  const handleReviewToggle = (index: number, state: ReviewState) => {
    const currentReviews = [...(selectedEntry.reviews || ['', '', ''])];
    currentReviews[index] = currentReviews[index] === state ? '' : state;
    onUpdateReviews(selectedEntry.id, currentReviews as ReviewState[]);
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
            <h3 className="font-bold text-white text-base line-clamp-1">{selectedEntry.title}</h3>
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
          
          {/* Problem Image Preview - displayed in full, uncropped */}
          <div className="w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center relative p-2 min-h-[200px]">
            <img 
              src={selectedEntry.imageUrl} 
              alt={selectedEntry.title} 
              className="w-full h-auto max-h-[60vh] object-contain rounded-xl" 
            />
            <button
              onClick={(e) => onDeleteMistake(selectedEntry.id, e)}
              className="absolute bottom-3 right-3 px-3 py-1.5 rounded-xl bg-red-600/95 hover:bg-red-600 text-white text-xs font-semibold shadow-lg backdrop-blur-sm transition-all"
            >
              기록 삭제
            </button>
          </div>

          {/* 3-Step Review Status Selection Card */}
          <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 flex items-center">
                <span className="mr-1 text-sm">📋</span> 복습 상태 진단 (3회 완료 시 보관함 이동)
              </span>
              <div className="flex items-center space-x-2">
                {selectedEntry.reviews?.some(r => r !== '') && (
                  <button
                    onClick={() => {
                      if (confirm('이 문제의 3단계 복습 기록을 모두 초기화하고 처음부터 다시 시작하시겠습니까?')) {
                        onUpdateReviews(selectedEntry.id, ['', '', '']);
                      }
                    }}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center space-x-1 bg-indigo-500/10 hover:bg-indigo-500/20 px-2.5 py-1 rounded-lg border border-indigo-500/25 transition-all active:scale-95"
                  >
                    <span>🔄</span>
                    <span>기록 초기화</span>
                  </button>
                )}
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
                      {/* O Button */}
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
                      {/* X Button */}
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
                      {/* Star Button */}
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
          </div>

          {/* Conditional Step-by-Step Hints Card (Shown only when struggling X / Star) */}
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

              {/* Render revealed hints */}
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

          {/* Fallback for older entries without hints or problem text */}
          {selectedEntry.analysis && (!selectedEntry.analysis.problemText || !selectedEntry.analysis.hints || selectedEntry.analysis.hints.length === 0) && (
            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 text-center space-y-3 animate-scale-up">
              <span className="text-xs text-slate-400 block">💡 이 오답 기록은 문제 지문 복원 및 힌트 데이터가 생성되지 않은 이전 버전 항목입니다.</span>
              <button
                onClick={() => onStartAnalysis(selectedEntry)}
                className="px-4 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 active:scale-95 text-[10px] font-bold text-white transition-all border border-slate-700"
              >
                AI 분석 재실행하여 지문 및 힌트 생성하기
              </button>
            </div>
          )}

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

              {/* Card 2: 실수 & 틀린 이유 분석 */}
              <div className="space-y-2 border-l-4 border-amber-500 pl-4 py-1">
                <button
                  onClick={() => setShowMistakeDetail(!showMistakeDetail)}
                  className="w-full flex items-center justify-between text-left focus:outline-none group"
                >
                  <h4 className="text-sm font-extrabold text-amber-400 flex items-center group-hover:text-amber-300 transition-colors">
                    <span className="mr-1.5 text-base">🔍</span> 틀린 이유 분석
                  </h4>
                  <span className="text-xs text-slate-500 font-bold mr-1 group-hover:text-slate-400 transition-colors">
                    {showMistakeDetail ? '▲ 닫기' : '▼ 보기'}
                  </span>
                </button>
                {showMistakeDetail && (
                  <div className="bg-slate-950 p-4.5 rounded-2xl border border-slate-850 space-y-4 animate-scale-up mt-2">
                    {/* 실수 분석 상세 */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">실수 지점</span>
                      <LaTeXRenderer text={selectedEntry.analysis.mistakeDetail} className="text-sm md:text-base leading-relaxed" />
                    </div>
                    
                    {/* 오개념 근본 원인 */}
                    <div className="pt-3.5 border-t border-slate-850 space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">틀린 원인</span>
                      <LaTeXRenderer text={selectedEntry.analysis.rootCause} className="text-sm md:text-base leading-relaxed text-red-300" />
                    </div>
                  </div>
                )}
              </div>

              {/* Card 3: 재발 방지 대책 */}
              <div className="space-y-2 border-l-4 border-emerald-500 pl-4 py-1">
                <button
                  onClick={() => setShowActionPlan(!showActionPlan)}
                  className="w-full flex items-center justify-between text-left focus:outline-none group"
                >
                  <h4 className="text-sm font-extrabold text-emerald-400 flex items-center group-hover:text-emerald-300 transition-colors">
                    <span className="mr-1.5 text-base">🛡️</span> 재발 방지 대책
                  </h4>
                  <span className="text-xs text-slate-500 font-bold mr-1 group-hover:text-slate-400 transition-colors">
                    {showActionPlan ? '▲ 닫기' : '▼ 보기'}
                  </span>
                </button>
                {showActionPlan && (
                  <div className="bg-slate-950 p-4.5 rounded-2xl border border-slate-850 animate-scale-up mt-2">
                    <LaTeXRenderer text={selectedEntry.analysis.actionPlan} className="text-sm md:text-base leading-relaxed" />
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
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 flex space-x-3">
          <button 
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-slate-800 hover:border-slate-700 active:scale-95 transition-all text-xs font-semibold text-slate-300"
          >
            닫기
          </button>
        </div>

      </div>
    </div>
  );
};
