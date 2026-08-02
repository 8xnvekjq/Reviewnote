import React from 'react';
import type { MistakeEntry } from '../types';

export interface UnseenScaffoldingItem {
  id: string; // mistake_scaffoldings id
  mistakeId: string;
  mistakeTitle: string;
  grade?: string;
  chapter?: string;
  latestCaption?: string;
  created_at: string;
  mistakeEntry: MistakeEntry;
}

interface NewScaffoldingModalProps {
  isOpen: boolean;
  unseenItems: UnseenScaffoldingItem[];
  onClose: () => void;
  onSelectMistake: (entry: MistakeEntry) => void;
  onGoToClinic: () => void;
}

export const NewScaffoldingModal: React.FC<NewScaffoldingModalProps> = ({
  isOpen,
  unseenItems,
  onClose,
  onSelectMistake,
  onGoToClinic,
}) => {
  if (!isOpen || unseenItems.length === 0) return null;

  // 최근 3개만 가벼운 텍스트 카드 형태로 미리보기 표출 (이미지 로딩 X)
  const displayItems = unseenItems.slice(0, 3);
  const extraCount = unseenItems.length - 3;

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
      if (diffSec < 60) return '방금 전';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}분 전`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour}시간 전`;
      const diffDay = Math.floor(diffHour / 24);
      return `${diffDay}일 전`;
    } catch {
      return '최근';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="w-full max-w-sm bg-slate-900 border border-amber-500/40 rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto no-scrollbar animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2.5">
            <span className="text-2xl animate-bounce">💡</span>
            <div>
              <h3 className="text-sm font-black text-white flex items-center space-x-1.5">
                <span>선생님의 맞춤 힌트가 도착했어요!</span>
              </h3>
              <p className="text-[10px] text-amber-400 font-bold">
                새로운 스캐폴딩 풀이 힌트 {unseenItems.length}건
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 rounded-lg transition-colors"
            title="닫기"
          >
            ✕
          </button>
        </div>

        {/* 안내 문구 */}
        <p className="text-[11px] text-slate-300 bg-slate-955 p-2.5 rounded-xl border border-slate-850 leading-relaxed">
          선생님이 막히던 문제에 맞춤 풀이 힌트를 남겨두셨습니다. 확인하고 막힌 부분을 풀어보세요! ✨
        </p>

        {/* 최근 최대 3개 텍스트 기반 콤팩트 카드 목록 (이미지 로딩 없이 빠름) */}
        <div className="space-y-2">
          {displayItems.map((item) => (
            <div
              key={item.id}
              onClick={() => {
                onClose();
                onSelectMistake(item.mistakeEntry);
              }}
              className="p-3 rounded-2xl bg-slate-955 border border-slate-800 hover:border-amber-500/60 transition-all cursor-pointer group flex items-center justify-between space-x-2 shadow-md"
            >
              {/* Problem info */}
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs">🧩</span>
                  {item.grade && (
                    <span className="text-[8.5px] bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded font-bold flex-none">
                      {item.grade}
                    </span>
                  )}
                  <h4 className="text-xs font-extrabold text-slate-200 truncate group-hover:text-white">
                    {item.mistakeTitle}
                  </h4>
                </div>
                
                <div className="flex items-center justify-between pr-1">
                  <p className="text-[10.5px] text-amber-300/90 truncate max-w-[180px]">
                    {item.latestCaption ? `🐶 : ${item.latestCaption}` : '손글씨/자료 힌트 첨부됨'}
                  </p>
                  <span className="text-[9px] text-slate-500 flex-none">
                    {formatRelativeTime(item.created_at)}
                  </span>
                </div>
              </div>

              {/* Action Button */}
              <button className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-1.5 rounded-xl font-black group-hover:bg-amber-400 group-hover:text-slate-950 transition-all flex-none">
                보기 →
              </button>
            </div>
          ))}
        </div>

        {/* 3개 초과시 안내 */}
        {extraCount > 0 && (
          <div className="text-center py-1 bg-amber-500/10 border border-amber-500/20 rounded-xl">
            <span className="text-[11px] font-bold text-amber-300">
              + 외 {extraCount}개의 맞춤 힌트가 더 기다리고 있습니다!
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-xs font-bold transition-all"
          >
            확인 (닫기)
          </button>
          <button
            onClick={() => {
              onClose();
              onGoToClinic();
            }}
            className="flex-1 py-2.5 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-350 hover:to-amber-450 text-slate-950 text-xs font-black transition-all shadow-lg shadow-amber-500/20 flex items-center justify-center space-x-1"
          >
            <span>🧩</span>
            <span>전체 오답클리닉 이동</span>
          </button>
        </div>
      </div>
    </div>
  );
};
