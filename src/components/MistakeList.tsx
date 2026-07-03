import React from 'react';
import type { MistakeEntry } from '../types';
import { MistakeCard } from './MistakeCard';

interface MistakeListProps {
  mistakes: MistakeEntry[];
  onSelectEntry: (entry: MistakeEntry) => void;
  onDeleteMistake: (id: string, e: React.MouseEvent) => void;
  onAddClick: () => void;
  title?: string;
  hideAddButton?: boolean;
  emptyMessage?: string;
}

export const MistakeList: React.FC<MistakeListProps> = ({
  mistakes,
  onSelectEntry,
  onDeleteMistake,
  onAddClick,
  title = "나의 오답노트",
  hideAddButton = false,
  emptyMessage = "아직 등록된 오답이 없습니다. 아래 카메라 버튼을 눌러 수학 문제를 촬영하고 AI의 맞춤 분석을 받아보세요."
}) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <p className="text-xs text-slate-400 mt-1">총 {mistakes.length}개의 기록이 있습니다.</p>
        </div>
        {!hideAddButton && (
          <button 
            onClick={onAddClick}
            className="px-3.5 py-1.5 rounded-full text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white transition-all shadow-md shadow-indigo-600/20"
          >
            + 새 오답 추가
          </button>
        )}
      </div>

      {/* List of Mistakes */}
      {mistakes.length === 0 ? (
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
        <div className="grid gap-4 sm:grid-cols-2">
          {mistakes.map((entry) => (
            <MistakeCard 
              key={entry.id}
              entry={entry}
              onSelect={onSelectEntry}
              onDelete={onDeleteMistake}
            />
          ))}
        </div>
      )}
    </div>
  );
};
