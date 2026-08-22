import React, { useMemo, useState } from 'react';
import type { MistakeEntry } from '../types';
import { formatDate } from '../utils/date';
import { LaTeXRenderer } from './LaTeXRenderer';

interface HiddenMistakesPanelProps {
  mistakes: MistakeEntry[]; // 호출부에서 이미 isHidden === true 인 것만 전달
  onSelectEntry: (entry: MistakeEntry) => void;
  onUnhide: (id: string) => void;
}

const UNCLASSIFIED = '미분류';

export const HiddenMistakesPanel: React.FC<HiddenMistakesPanelProps> = ({ mistakes, onSelectEntry, onUnhide }) => {
  // 과목별 아코디언 펼침 상태 (기본값: 펼침)
  const [expandedGrades, setExpandedGrades] = useState<Record<string, boolean>>({});

  // 과목 > 단원 2단계로 그룹핑 (단원 정보 없으면 "미분류")
  const groups = useMemo(() => {
    const byGrade = new Map<string, Map<string, MistakeEntry[]>>();

    for (const entry of mistakes) {
      const grade = entry.grade || UNCLASSIFIED;
      const chapter = entry.chapter || UNCLASSIFIED;

      if (!byGrade.has(grade)) byGrade.set(grade, new Map());
      const byChapter = byGrade.get(grade)!;
      if (!byChapter.has(chapter)) byChapter.set(chapter, []);
      byChapter.get(chapter)!.push(entry);
    }

    return Array.from(byGrade.entries())
      .map(([grade, byChapter]) => ({
        grade,
        total: Array.from(byChapter.values()).reduce((sum, arr) => sum + arr.length, 0),
        chapters: Array.from(byChapter.entries())
          .map(([chapter, entries]) => ({
            chapter,
            entries: [...entries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
          }))
          .sort((a, b) => a.chapter.localeCompare(b.chapter)),
      }))
      .sort((a, b) => a.grade.localeCompare(b.grade));
  }, [mistakes]);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center space-x-2">
          <span>🙈</span><span>숨긴 카드 관리</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          시험범위 제외 등으로 숨긴 오답 {mistakes.length}개 · 과목/단원별로 확인하고 해제할 수 있습니다.
        </p>
      </div>

      {mistakes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border-2 border-dashed border-slate-800 rounded-2xl p-6 bg-slate-900/20 animate-scale-up">
          <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center text-2xl mb-4 text-slate-500">
            🙈
          </div>
          <p className="text-slate-300 font-medium">숨긴 카드가 없습니다</p>
          <p className="text-xs text-slate-500 mt-1.5 max-w-xs leading-relaxed">
            오답 카드 우측 상단의 🙈 버튼을 누르면 이번 시험범위가 아닌 문제를 메인 리스트에서 숨길 수 있어요.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(gGroup => {
            const isExpanded = expandedGrades[gGroup.grade] !== false; // 기본값: 펼침
            return (
              <div key={gGroup.grade} className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/40">
                {/* 과목 아코디언 헤더 */}
                <button
                  onClick={() => setExpandedGrades(prev => ({ ...prev, [gGroup.grade]: !isExpanded }))}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-950/60 hover:bg-slate-900 transition-colors text-left"
                >
                  <span className="text-xs font-black text-indigo-400 flex items-center space-x-1.5">
                    <span>📚</span><span>{gGroup.grade}</span>
                    <span className="text-[9px] font-bold text-slate-500 bg-slate-900 border border-slate-800 px-1.5 py-0.5 rounded-full">
                      {gGroup.total}개
                    </span>
                  </span>
                  <span className="text-[9px] text-slate-500 font-extrabold flex-none">
                    {isExpanded ? '▲ 접기' : '▼ 펼치기'}
                  </span>
                </button>

                {/* 단원별 카드 목록 */}
                {isExpanded && (
                  <div className="p-3 space-y-4">
                    {gGroup.chapters.map(cGroup => (
                      <div key={cGroup.chapter} className="space-y-1.5">
                        <div className="flex items-center space-x-1.5 px-1">
                          <span className="text-[10px] font-black text-slate-400">📌 {cGroup.chapter}</span>
                          <span className="text-[9px] text-slate-600 font-bold">{cGroup.entries.length}개</span>
                        </div>

                        <div className="space-y-2">
                          {cGroup.entries.map(entry => (
                            <div
                              key={entry.id}
                              onClick={() => onSelectEntry(entry)}
                              className="flex items-center justify-between gap-3 bg-slate-950/50 hover:bg-slate-950 border border-slate-850 hover:border-slate-700 rounded-xl p-3 cursor-pointer transition-all active:scale-[0.99]"
                            >
                              <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                                <img
                                  src={entry.imageUrl}
                                  alt={entry.title}
                                  loading="lazy"
                                  className="w-11 h-11 flex-none rounded-lg object-cover bg-slate-900 opacity-80"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-bold text-slate-200 line-clamp-1">
                                    <LaTeXRenderer text={entry.title} className="text-xs" />
                                  </div>
                                  <p className="text-[9px] text-slate-500 font-semibold mt-0.5">{formatDate(entry.date)}</p>
                                </div>
                              </div>

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUnhide(entry.id);
                                }}
                                className="flex-none px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-slate-900 hover:bg-indigo-600 border border-slate-800 hover:border-indigo-500 text-slate-300 hover:text-white transition-all active:scale-95"
                              >
                                🙈 숨김 해제
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
