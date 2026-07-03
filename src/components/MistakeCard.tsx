import React from 'react';
import type { MistakeEntry } from '../types';
import { formatDate } from '../utils/date';

interface MistakeCardProps {
  entry: MistakeEntry;
  onSelect: (entry: MistakeEntry) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}

export const MistakeCard: React.FC<MistakeCardProps> = ({ entry, onSelect, onDelete }) => {
  return (
    <div 
      onClick={() => onSelect(entry)}
      className="group bg-slate-900/50 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/40 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 transform active:scale-[0.98]"
    >
      <div className="aspect-[16/9] w-full bg-slate-950 relative overflow-hidden flex items-center justify-center">
        <img 
          src={entry.imageUrl} 
          alt={entry.title}
          className="w-full h-full object-cover opacity-80 group-hover:scale-105 transition-transform duration-500" 
        />
        <button
          onClick={(e) => onDelete(entry.id, e)}
          className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 hover:bg-red-600 flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
        >
          🗑️
        </button>
        <div className="absolute top-2 right-2 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-950/80 backdrop-blur-sm border border-slate-800 text-slate-300">
          {formatDate(entry.date)}
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-bold text-white line-clamp-1 group-hover:text-indigo-400 transition-colors">
          {entry.title}
        </h3>
        {entry.analysis ? (
          <p className="text-xs text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
            🔍 {entry.analysis.mistakeDetail}
          </p>
        ) : (
          <p className="text-xs text-amber-400 mt-1.5 font-medium flex items-center">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 animate-pulse"></span>
            AI 분석 미완료 (스캔됨)
          </p>
        )}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-800/60">
          <span className="text-[10px] text-slate-500">
            {entry.analysis ? 'AI 피드백 완료' : '분석 대기 중'}
          </span>
          <span className="text-xs text-indigo-400 font-semibold group-hover:translate-x-1 transition-transform inline-flex items-center">
            {entry.analysis ? '상세보기' : '분석하기'} &rarr;
          </span>
        </div>
      </div>
    </div>
  );
};
