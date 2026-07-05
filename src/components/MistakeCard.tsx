import React from 'react';
import type { MistakeEntry } from '../types';
import { formatDate } from '../utils/date';

import { LaTeXRenderer } from './LaTeXRenderer';

interface MistakeCardProps {
  entry: MistakeEntry;
  onSelect: (entry: MistakeEntry) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  studentName?: string;   // admin 전용: 학생 이름/아이디
  isOwnNote?: boolean;    // 내 오답 여부 (admin이 타인 오답 볼 때 false)
}

export const MistakeCard: React.FC<MistakeCardProps> = ({ entry, onSelect, onDelete, studentName, isOwnNote = true }) => {
  const struggleCount = entry.reviews ? entry.reviews.filter(r => r === 'X' || r === 'star').length : 0;

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
        {/* 삭제 버튼: 내 오답노트일 때만 */}
        {isOwnNote && (
          <button
            onClick={(e) => onDelete(entry.id, e)}
            className="absolute top-2 left-2 w-7 h-7 rounded-full bg-black/60 hover:bg-red-600 flex items-center justify-center text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity"
          >
            🗑️
          </button>
        )}
        {/* 학생 이름 배지 (admin 전용) */}
        {studentName && (
          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600/90 text-white backdrop-blur-sm flex items-center space-x-1">
            <span>👤</span>
            <span>{studentName}</span>
          </div>
        )}
        {/* 과목 및 단원 배지 (좌하단 동그라미 양식) */}
        {(entry.grade || entry.chapter) && (
          <div className="absolute bottom-2 left-2 flex items-center space-x-1.5 z-10">
            {entry.grade && (
              <div className="px-2 py-0.5 rounded-full text-[9px] font-black bg-emerald-600/95 text-white backdrop-blur-sm shadow-sm flex items-center">
                <span>📚</span><span className="ml-1">{entry.grade}</span>
              </div>
            )}
            {entry.chapter && (
              <div className="px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-900/95 text-slate-200 border border-slate-800/80 backdrop-blur-sm shadow-sm truncate max-w-[120px] flex items-center">
                <span>📌</span><span className="ml-1">{entry.chapter}</span>
              </div>
            )}
          </div>
        )}
        <div className="absolute top-2 right-2 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-950/80 backdrop-blur-sm border border-slate-800 text-slate-300">
          {formatDate(entry.date)}
        </div>
      </div>
      <div className="p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-white line-clamp-1 group-hover:text-indigo-400 transition-colors flex-1 min-w-0">
            <LaTeXRenderer 
              text={entry.title} 
              className="text-white font-bold text-sm line-clamp-1 inline-block w-full"
            />
          </h3>
          {struggleCount === 3 && (
            <span className="flex-none px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 text-[9px] font-black tracking-tight animate-pulse flex items-center gap-0.5">
              <span>🚨</span> 집중 공략 약점
            </span>
          )}
        </div>

        {/* AI 분석 요약 & 대책 내용 */}
        <div className="space-y-1">
          {entry.analysis ? (
            <p className="text-xs text-slate-400 line-clamp-1 leading-relaxed">
              🔍 {entry.analysis.mistakeDetail}
            </p>
          ) : (
            <p className="text-xs text-amber-400 font-medium flex items-center">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1.5 animate-pulse"></span>
              AI 분석 미완료 (스캔됨)
            </p>
          )}

          {/* 대책 내용 (작은 글씨로 앞 18글자만) */}
          {entry.userActionPlan && entry.userActionPlan.trim() && (
            <p className="text-[10px] text-slate-500 leading-none truncate flex items-center">
              <span className="text-indigo-400 font-extrabold mr-1">💡대책:</span>
              {entry.userActionPlan.slice(0, 18).trim()}{entry.userActionPlan.length > 18 ? '...' : ''}
            </p>
          )}
        </div>

        {/* 하단 영역: 복습 진척사항 & 틀린이유 체크 이모지 */}
        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-800/60">
          {/* 복습 진척사항 배지 목록 */}
          <div className="flex items-center space-x-1">
            {(entry.reviews || ['', '', '']).slice(0, 3).map((state, idx) => {
              let badgeStyle = "bg-slate-800 text-slate-600 border-slate-700/40";
              let symbol = idx + 1;
              if (state === 'O') {
                badgeStyle = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-extrabold";
              } else if (state === 'X') {
                badgeStyle = "bg-red-500/15 text-red-400 border-red-500/30 font-extrabold";
              } else if (state === 'star') {
                badgeStyle = "bg-amber-500/15 text-amber-400 border-amber-500/30 font-extrabold";
              }
              return (
                <span
                  key={idx}
                  className={`w-[17px] h-[17px] rounded-full border text-[9px] flex items-center justify-center transition-all ${badgeStyle}`}
                >
                  {state === 'star' ? '★' : (state || symbol)}
                </span>
              );
            })}
          </div>

          {/* 틀린이유 이모지만 나열 (한글 텍스트 없이) */}
          {entry.rootCauses && entry.rootCauses.length > 0 && (
            <div className="flex items-center space-x-1 flex-none">
              {entry.rootCauses.map((rcId) => {
                const EMOJI_MAP: Record<string, string> = {
                  calc: '🧮',
                  formula: '📘',
                  misread: '🔍',
                  concept: '🧠',
                  strategy: '🎯'
                };
                const emoji = EMOJI_MAP[rcId];
                if (!emoji) return null;
                return (
                  <span key={rcId} className="text-xs filter drop-shadow-sm" title={rcId}>
                    {emoji}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
