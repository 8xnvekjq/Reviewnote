import React from 'react';
import type { MistakeEntry } from '../types';
import { formatDate, formatDateTime } from '../utils/date';
import { GACHA_ITEMS, getRarityTheme } from '../utils/gachaCatalog';

import { LaTeXRenderer } from './LaTeXRenderer';
import { CatPawIcon } from './CatPawIcon';

interface MistakeCardProps {
  entry: MistakeEntry;
  onSelect: (entry: MistakeEntry) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  studentName?: string;   // admin 전용: 학생 이름/아이디
  isOwnNote?: boolean;    // 내 오답 여부 (admin이 타인 오답 볼 때 false)
  equippedStamp?: string; // 학생이 장착한 레어 도장 (예: 🔥, ⭐, 👑, 🐾, 💎)
  hasScaffolding?: boolean; // 선생님이 첨부한 스캐폴딩 힌트가 있는지 여부
}

export const MistakeCard: React.FC<MistakeCardProps> = ({ entry, onSelect, onDelete, studentName, isOwnNote = true, equippedStamp, hasScaffolding }) => {
  const struggleCount = entry.reviews ? entry.reviews.filter(r => r === 'X' || r === 'star').length : 0;
  const isCompleted = entry.reviews && entry.reviews.filter(r => r === 'O').length === 3;

  // 장착한 스탬프의 실제 뽑기 등급(UR/SSR/SR/R)에 맞는 테두리 클래스
  const stampCatalogItem = equippedStamp
    ? GACHA_ITEMS.find(g => g.category === 'STAMP' && g.effectValue === equippedStamp)
    : undefined;
  const stampBorderClass = stampCatalogItem ? getRarityTheme(stampCatalogItem.rarity).border : 'border-transparent';

  return (
    <div 
      onClick={() => onSelect(entry)}
      className="group bg-slate-900/50 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/40 rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 transform active:scale-[0.98]"
    >
      <div className="aspect-[16/9] w-full bg-slate-950 relative overflow-hidden flex items-center justify-center">
        <img 
          src={entry.imageUrl} 
          alt={entry.title}
          loading="lazy"
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
        <div className={`absolute top-2 right-2 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-950/80 backdrop-blur-sm border ${isCompleted ? 'border-emerald-500/50 text-emerald-400' : 'border-slate-800 text-slate-300'}`}>
          {isCompleted
            ? `✅ 완료: ${formatDateTime(entry.updatedAt || entry.date)}`
            : formatDate(entry.date)
          }
        </div>
        {/* 스캐폴딩 힌트 첨부 여부 (우측 하단 초록 마크) */}
        {hasScaffolding && (
          <div
            className="absolute bottom-2 right-2 w-6 h-6 rounded-full bg-emerald-500/90 border border-emerald-300/60 backdrop-blur-sm shadow-sm flex items-center justify-center text-xs z-10"
            title="선생님이 첨부한 스캐폴딩 힌트가 있습니다"
          >
            🧩
          </div>
        )}
      </div>
      <div className="p-3 pb-2.5 space-y-1.5">
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

        {/* 대책 내용(좌) & AI분석 요약/미완료(우) 단일 행 병합 */}
        <div className="flex items-center justify-between text-[10px] text-slate-500 min-w-0 space-x-3">
          {/* Left: Teacher Scaffolding Hint or Student Action Plan */}
          <div className="flex-1 min-w-0 truncate">
            {entry.teacherScaffoldingHint && entry.teacherScaffoldingHint.trim() ? (
              <span className="truncate block text-[9.5px]">
                <span className="text-purple-400 font-bold mr-1">👨‍🏫 힌트:</span>
                {entry.teacherScaffoldingHint.slice(0, 18).trim()}{entry.teacherScaffoldingHint.length > 18 ? '...' : ''}
              </span>
            ) : entry.userActionPlan && entry.userActionPlan.trim() ? (
              <span className="truncate block text-[9.5px]">
                <span className="text-indigo-400 font-bold mr-1">🎓대책:</span>
                {entry.userActionPlan.slice(0, 18).trim()}{entry.userActionPlan.length > 18 ? '...' : ''}
              </span>
            ) : (
              <span className="text-slate-600 block italic text-[9.5px]">대책 작성 대기</span>
            )}
          </div>

          {/* Right: AI Analysis Status/Fuzzy summary */}
          <div className="flex-none text-right text-[9.5px] max-w-[140px] truncate">
            {entry.analysis ? (
              <span className="text-slate-400 truncate block">
                🔍 {entry.analysis.mistakeDetail}
              </span>
            ) : (
              <span className="text-amber-500 font-black flex items-center justify-end flex-none">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1 animate-pulse flex-none"></span>
                미완료
              </span>
            )}
          </div>
        </div>

        {/* 하단 영역: 복습 진척사항 & 틀린이유 체크 이모지 */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60">
          {/* 복습 진척사항 배지 목록 */}
          <div className="flex items-center space-x-1">
            {(entry.reviews || ['', '', '']).slice(0, 3).map((state, idx) => {
              let badgeStyle = "w-[17px] h-[17px] bg-slate-800 text-slate-600 border border-slate-700/40 text-[9px]";
              let symbol = idx + 1;
              if (state === 'O') {
                badgeStyle = equippedStamp
                  ? `w-[19px] h-[19px] bg-transparent border-2 ${stampBorderClass} text-[11px] font-black`
                  : "w-[17px] h-[17px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-extrabold text-[9px]";
              } else if (state === 'X') {
                badgeStyle = "w-[17px] h-[17px] bg-red-500/15 text-red-400 border border-red-500/30 font-extrabold text-[9px]";
              } else if (state === 'star') {
                badgeStyle = "w-[17px] h-[17px] bg-amber-500/15 text-amber-400 border border-amber-500/30 font-extrabold text-[9px]";
              }
              return (
                <span
                  key={idx}
                  className={`rounded-full flex items-center justify-center transition-all ${badgeStyle}`}
                >
                  {state === 'star' ? '★' : (state === 'O' ? (equippedStamp === '🐾' ? <CatPawIcon className="w-3.5 h-3.5" /> : (equippedStamp || 'O')) : (state || symbol))}
                </span>
              );
            })}
          </div>

          {/* 틀린이유 콤팩트 라벨 배지 나열 */}
          {entry.rootCauses && entry.rootCauses.length > 0 && (
            <div className="flex items-center space-x-1 flex-none flex-wrap justify-end gap-y-1 max-w-[150px]">
              {entry.rootCauses.map((rcId) => {
                const MAP: Record<string, { emoji: string; text: string }> = {
                  calc: { emoji: '🧮', text: '실수' },
                  formula: { emoji: '📘', text: '공식' },
                  misread: { emoji: '🔍', text: '오독' },
                  concept: { emoji: '🧠', text: '개념' },
                  strategy: { emoji: '🎯', text: '전략' }
                };
                const info = MAP[rcId];
                if (!info) return null;
                return (
                  <span 
                    key={rcId} 
                    className="text-[8px] font-black text-slate-400 bg-slate-950/70 border border-slate-800/80 px-1 py-0.5 rounded flex items-center space-x-0.5" 
                    title={rcId}
                  >
                    <span>{info.emoji}</span>
                    <span className="text-[7.5px] text-slate-500 font-black">{info.text}</span>
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
