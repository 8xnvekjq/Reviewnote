import React from 'react';
import '../styles/notes.css';
import type { MistakeEntry } from '../types';
import { SOLVING_PLACEHOLDER_TEXT, resolveNeedsHelp } from '../types';
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
  hasScaffolding?: boolean; // 스캐폴딩 힌트(선생님 또는 본인)가 있는지 여부
  onToggleHidden?: (id: string, hidden: boolean) => void; // 시험범위 제외 등으로 카드 숨기기 (전달 안 되면 버튼 자체를 숨김)
  checkpointRegenStatus?: 'generating' | 'success' | 'failed'; // 정리하기(초기화) 후 단계형 체크리스트 재생성 진행 상태
  onRetryCheckpointGeneration?: () => void; // 재생성 실패 시 "다시 시도"
}

export const MistakeCard: React.FC<MistakeCardProps> = ({ entry, onSelect, onDelete, studentName, isOwnNote = true, equippedStamp, hasScaffolding, onToggleHidden, checkpointRegenStatus, onRetryCheckpointGeneration }) => {
  const needsHelp = resolveNeedsHelp(entry.reviews, entry.analysis?.needsHelp);
  const completedCount = (entry.reviews || []).filter(r => r === 'O').length;
  const isCompleted = completedCount === 3;
  const isAnalyzed = !!entry.analysis?.solvingProcess && entry.analysis.solvingProcess !== SOLVING_PLACEHOLDER_TEXT;
  const stampCatalogItem = equippedStamp ? GACHA_ITEMS.find(g => g.category === 'STAMP' && g.effectValue === equippedStamp) : undefined;
  const stampBorderClass = stampCatalogItem ? getRarityTheme(stampCatalogItem.rarity).border : 'border-transparent';
  // 예외적인 상태만 배지로 띄운다 — "이어 풀기" CTA와 아래 복습 dot이 이미 기본 진행 상태를
  // 말해주므로, 평범히 진행 중인 카드에는 뱃지를 더하지 않는다(정보 밀도 축소).
  const statusBadge = isCompleted ? { text: '완료', cls: 'is-complete' } : needsHelp ? { text: '도움 필요', cls: 'is-help' } : !isAnalyzed ? { text: '분석 중', cls: '' } : null;

  return (
    <article className="rn-note-card">
      <div className="rn-note-topline">
        {studentName && <span className="rn-note-student">{studentName}</span>}
        {(onToggleHidden || isOwnNote) && (
          <div className="rn-note-utilities">
            {onToggleHidden && (
              <button
                type="button"
                className="rn-note-utility"
                aria-pressed={!!entry.isHidden}
                onClick={() => onToggleHidden(entry.id, !entry.isHidden)}
                title={entry.isHidden ? '숨김 해제' : '시험범위 제외 (숨기기)'}
                aria-label={entry.isHidden ? '숨김 해제' : '시험범위 제외로 숨기기'}
              >
                <span aria-hidden="true">🙈</span>
              </button>
            )}
            {isOwnNote && (
              <button type="button" className="rn-note-utility rn-note-delete" onClick={e => onDelete(entry.id, e)} aria-label={`${entry.title} 삭제`} title="삭제">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" /></svg>
              </button>
            )}
          </div>
        )}
      </div>
      <button type="button" className="rn-note-open" onClick={() => onSelect(entry)} aria-label={`${entry.title} 문제 열기`}>
        <div className="rn-note-image">
          <img src={entry.imageUrl} alt={entry.title} loading="lazy" />
        </div>
        <div className="rn-note-body">
          <h3 className="rn-note-title"><LaTeXRenderer text={entry.title} className="line-clamp-2" /></h3>
          <div className="rn-note-context">
            {entry.chapter && <span className="rn-note-subject">{entry.chapter}</span>}
            <span className="rn-note-date">{isCompleted ? formatDateTime(entry.updatedAt || entry.date) : formatDate(entry.date)}</span>
            {(hasScaffolding || entry.teacherScaffoldingHint?.trim()) && <span className="rn-note-hint-icon" title="힌트 있음" aria-label="힌트 있음">💡</span>}
            {statusBadge && <span className={`rn-note-status ${statusBadge.cls}`}>{statusBadge.text}</span>}
          </div>
          <div className="rn-note-practice">
            <div className="rn-review-dots" aria-label={`복습 ${completedCount}회 성공`}>
              {(entry.reviews || ['', '', '']).slice(0, 3).map((state, idx) => (
                <span key={idx} title={`${idx + 1}차: ${state === 'O' ? '성공' : state === 'X' ? '다시 도전' : state === 'star' ? '별표' : '시작 전'}`}
                  className={`rn-review-dot ${state === 'O' ? 'is-success' : state === 'X' ? 'is-retry' : state === 'star' ? 'is-star' : ''} ${state === 'O' && equippedStamp ? `border-2 ${stampBorderClass}` : ''}`}>
                  {state === 'star' ? '★' : state === 'O' ? (equippedStamp === '🐾' ? <CatPawIcon className="w-4 h-4" /> : (equippedStamp || 'O')) : (state || idx + 1)}
                </span>
              ))}
            </div>
            <span className="rn-note-continue">{isCompleted ? '기록 보기' : '이어 풀기'} <span aria-hidden="true">→</span></span>
          </div>
        </div>
      </button>
      {checkpointRegenStatus && (
        <div className={`rn-note-regeneration ${checkpointRegenStatus === 'failed' ? 'is-failed' : ''}`} role="status">
          <span>{checkpointRegenStatus === 'generating' ? '새로운 학습 진단을 만들고 있어요…' : checkpointRegenStatus === 'success' ? '새로운 진단이 준비됐어요' : '진단을 만들지 못했어요'}</span>
          {checkpointRegenStatus === 'failed' && onRetryCheckpointGeneration && <button type="button" className="rn-button rn-button-secondary" onClick={onRetryCheckpointGeneration}>다시 시도</button>}
        </div>
      )}
    </article>
  );
};
