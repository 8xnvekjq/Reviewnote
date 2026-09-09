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
  // 교재/과정명(grade) + 단원명(chapter)을 "공통수학2 · 경우의 수" 형태 한 줄로 — 예전엔 이미지 위
  // 별도 배지 두 개였다(git history), 지금은 metadata 한 줄로 압축해서 같은 정보를 유지한다.
  const subjectLine = [entry.grade, entry.chapter].filter(Boolean).join(' · ');

  return (
    <article className="rn-note-card">
      {/* 학생 이름은 이미지 overlay로, 숨기기(🙈)는 아래 practice row로 옮겨가서 이 줄에는
          "내 오답노트"일 때의 삭제 버튼만 남는다 — 남는 줄이 없으면 렌더하지 않아 빈 프레임을
          없앤다(높이 축소). */}
      {isOwnNote && (
        <div className="rn-note-topline rn-note-topline-delete-only">
          <button type="button" className="rn-note-utility rn-note-delete" onClick={e => onDelete(entry.id, e)} aria-label={`${entry.title} 삭제`} title="삭제">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7" /></svg>
          </button>
        </div>
      )}
      <button type="button" className="rn-note-open" onClick={() => onSelect(entry)} aria-label={`${entry.title} 문제 열기`}>
        <div className="rn-note-image">
          <img src={entry.imageUrl} alt={entry.title} loading="lazy" />
          {/* 학생 이름 overlay(관리자 전용) — 예전 이미지 좌상단 파란 배지 스타일을 재사용해,
              여러 학생 카드를 훑을 때 이미지와 이름이 바로 연결되게 한다. */}
          {studentName && <span className="rn-note-name-badge"><span aria-hidden="true">👤</span>{studentName}</span>}
          {/* 스캐폴딩 힌트 표시 — 전구(💡)가 아니라 예전부터 쓰던 초록 퍼즐(🧩) 아이콘으로
              복원(MistakeScaffoldingDrawer/ScaffoldingPanel과 같은 의미의 아이콘 통일). */}
          {(hasScaffolding || entry.teacherScaffoldingHint?.trim()) && <span className="rn-note-scaffold-badge" title="스캐폴딩 힌트가 있어요" aria-label="스캐폴딩 힌트가 있어요">🧩</span>}
        </div>
        <div className="rn-note-body">
          <h3 className="rn-note-title"><LaTeXRenderer text={entry.title} className="line-clamp-2" /></h3>
          <div className="rn-note-context">
            {subjectLine && <span className="rn-note-subject">{subjectLine}</span>}
            {statusBadge && <span className={`rn-note-status ${statusBadge.cls}`}>{statusBadge.text}</span>}
          </div>
          {/* 학생이 적은 "대책(userActionPlan)" 미리보기 복원 — git show
              62ec993:src/components/MistakeCard.tsx 기준(PR #46 직전, 🎓대책: 라벨 +
              단일 행 ellipsis). 관리자/학생 화면 구분 없이 동일하게 보이던 기존 동작 그대로
              재사용(새 role 정책 없음). 값이 없으면 이 행 자체를 렌더하지 않고, 예전에 있던
              "대책 작성 대기" placeholder도 이번엔 넣지 않는다(요청사항). AI 생성/저장 로직은
              전혀 건드리지 않고 이미 저장된 entry.userActionPlan을 그대로 읽기만 한다. */}
          {entry.userActionPlan?.trim() && (
            <p className="rn-note-plan">
              <span className="rn-note-plan-label" aria-hidden="true">🎓 대책:</span>
              <span className="rn-note-plan-text">{entry.userActionPlan.trim()}</span>
            </p>
          )}
        </div>
      </button>
      {/* 등록일 + 복습 진행(●●○)을 한 줄로 압축, 숨기기(🙈)를 예전 "이어 풀기"가 있던 우측
          action 자리로 이동 — 별도 review row·중복 CTA 제거. rn-note-open(button) 밖의 형제
          행으로 둔다: 숨기기가 실제 &lt;button&gt;이라 카드 전체를 여는 button 안에 넣으면(중첩
          button은 유효하지 않은 HTML) 클릭/포커스 동작이 깨진다. */}
      <div className="rn-note-practice">
        <span className="rn-note-date">{isCompleted ? formatDateTime(entry.updatedAt || entry.date) : `${formatDate(entry.date)} 등록`}</span>
        <div className="rn-review-dots" aria-label={`복습 ${completedCount}회 성공`}>
          {(entry.reviews || ['', '', '']).slice(0, 3).map((state, idx) => (
            <span key={idx} title={`${idx + 1}차: ${state === 'O' ? '성공' : state === 'X' ? '다시 도전' : state === 'star' ? '별표' : '시작 전'}`}
              className={`rn-review-dot ${state === 'O' ? 'is-success' : state === 'X' ? 'is-retry' : state === 'star' ? 'is-star' : ''} ${state === 'O' && equippedStamp ? `border-2 ${stampBorderClass}` : ''}`}>
              {state === 'star' ? '★' : state === 'O' ? (equippedStamp === '🐾' ? <CatPawIcon className="w-4 h-4" /> : (equippedStamp || 'O')) : (state || idx + 1)}
            </span>
          ))}
        </div>
        {onToggleHidden && (
          <button
            type="button"
            className="rn-note-utility rn-note-practice-hide"
            aria-pressed={!!entry.isHidden}
            onClick={() => onToggleHidden(entry.id, !entry.isHidden)}
            title={entry.isHidden ? '숨김 해제' : '시험범위 제외 (숨기기)'}
            aria-label={entry.isHidden ? '숨김 해제' : '시험범위 제외로 숨기기'}
          >
            <span aria-hidden="true">🙈</span>
          </button>
        )}
      </div>
      {checkpointRegenStatus && (
        <div className={`rn-note-regeneration ${checkpointRegenStatus === 'failed' ? 'is-failed' : ''}`} role="status">
          <span>{checkpointRegenStatus === 'generating' ? '새로운 학습 진단을 만들고 있어요…' : checkpointRegenStatus === 'success' ? '새로운 진단이 준비됐어요' : '진단을 만들지 못했어요'}</span>
          {checkpointRegenStatus === 'failed' && onRetryCheckpointGeneration && <button type="button" className="rn-button rn-button-secondary" onClick={onRetryCheckpointGeneration}>다시 시도</button>}
        </div>
      )}
    </article>
  );
};
