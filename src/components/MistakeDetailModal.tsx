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

export const MistakeDetailModal: React.FC<MistakeDetailModalProps> = ({
  selectedEntry,
  isAnalyzing,
  onClose,
  onDeleteMistake,
  onStartAnalysis,
  onUpdateReviews,
}) => {
  const handleReviewToggle = (index: number, state: ReviewState) => {
    const currentReviews = [...(selectedEntry.reviews || ['', '', ''])];
    currentReviews[index] = currentReviews[index] === state ? '' : state;
    onUpdateReviews(selectedEntry.id, currentReviews as ReviewState[]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-xl bg-slate-900 border-t sm:border border-slate-800 rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-slide-up">
        
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
          
          {/* Problem Image Preview */}
          <div className="aspect-[16/9] w-full rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center relative">
            <img src={selectedEntry.imageUrl} alt={selectedEntry.title} className="w-full h-full object-cover" />
            <button
              onClick={(e) => onDeleteMistake(selectedEntry.id, e)}
              className="absolute bottom-3 right-3 px-3 py-1.5 rounded-xl bg-red-600/90 hover:bg-red-600 text-white text-xs font-semibold shadow-lg backdrop-blur-sm transition-all"
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
                            ? 'bg-amber-450 text-slate-950 bg-amber-400 shadow-md shadow-amber-400/20' 
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

          {isAnalyzing ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-4">
              <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
              <div className="text-center">
                <p className="text-sm font-semibold text-white">처리 중...</p>
                <p className="text-xs text-slate-400 mt-1">AI 수학 클리닉 진단을 작성하고 있습니다.</p>
              </div>
            </div>
          ) : selectedEntry.analysis ? (
            <div className="space-y-6 animate-scale-up">
              {/* Card 1: 정석 풀이 과정 */}
              <div className="space-y-2 border-l-4 border-indigo-500 pl-4 py-1">
                <h4 className="text-sm font-extrabold text-indigo-400 flex items-center">
                  <span className="mr-1.5 text-base">💡</span> 정석 풀이 과정
                </h4>
                <div className="bg-slate-950 p-4.5 rounded-2xl border border-slate-850">
                  <LaTeXRenderer text={selectedEntry.analysis.solvingProcess} className="text-sm md:text-base leading-relaxed" />
                </div>
              </div>

              {/* Card 2: 실수 & 틀린 이유 분석 (요약 및 강조) */}
              <div className="space-y-2 border-l-4 border-amber-500 pl-4 py-1">
                <h4 className="text-sm font-extrabold text-amber-400 flex items-center">
                  <span className="mr-1.5 text-base">🔍</span> 틀린 이유 분석
                </h4>
                <div className="bg-slate-950 p-4.5 rounded-2xl border border-slate-850 space-y-4">
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
              </div>

              {/* Card 3: 재발 방지 대책 (요약 및 글머리 강조) */}
              <div className="space-y-2 border-l-4 border-emerald-500 pl-4 py-1">
                <h4 className="text-sm font-extrabold text-emerald-400 flex items-center">
                  <span className="mr-1.5 text-base">🛡️</span> 재발 방지 대책
                </h4>
                <div className="bg-slate-950 p-4.5 rounded-2xl border border-slate-850">
                  <LaTeXRenderer text={selectedEntry.analysis.actionPlan} className="text-sm md:text-base leading-relaxed" />
                </div>
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
