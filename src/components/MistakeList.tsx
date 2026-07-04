import React, { useState } from 'react';
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
  isAdmin?: boolean;
  profilesMap?: Record<string, string>; // userId -> displayName
  currentUserId?: string;
}

export const MistakeList: React.FC<MistakeListProps> = ({
  mistakes,
  onSelectEntry,
  onDeleteMistake,
  onAddClick,
  title = "나의 오답노트",
  hideAddButton = false,
  emptyMessage = "아직 등록된 오답이 없습니다.",
  isAdmin = false,
  profilesMap = {},
  currentUserId,
}) => {
  const [selectedStudent, setSelectedStudent] = useState<string>('all');

  // 어드민일 때: 학생 목록 추출
  const studentOptions = isAdmin
    ? Array.from(
        new Set(mistakes.map(m => m.userId).filter(Boolean) as string[])
      ).map(uid => ({ uid, name: profilesMap[uid] || uid.slice(0, 8) }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  // 필터링
  const filtered = isAdmin && selectedStudent !== 'all'
    ? mistakes.filter(m => m.userId === selectedStudent)
    : mistakes;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{title}</h2>
          <p className="text-xs text-slate-400 mt-1">
            {isAdmin
              ? `전체 ${mistakes.length}개 · 표시 ${filtered.length}개`
              : `총 ${mistakes.length}개의 기록이 있습니다.`}
          </p>
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

      {/* 어드민 학생 필터 셀렉트 */}
      {isAdmin && studentOptions.length > 0 && (
        <div className="flex items-center space-x-2">
          <span className="text-[11px] text-slate-500 font-bold flex-none">👤 학생 필터</span>
          <select
            value={selectedStudent}
            onChange={e => setSelectedStudent(e.target.value)}
            className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white outline-none focus:border-indigo-500 transition-colors cursor-pointer"
          >
            <option value="all">전체 학생 ({mistakes.length}개)</option>
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

      {/* List */}
      {filtered.length === 0 ? (
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
          {filtered.map((entry) => (
            <MistakeCard
              key={entry.id}
              entry={entry}
              onSelect={onSelectEntry}
              onDelete={onDeleteMistake}
              studentName={isAdmin && entry.userId ? (profilesMap[entry.userId] || entry.userId.slice(0, 8)) : undefined}
              isOwnNote={!isAdmin || entry.userId === currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
};
