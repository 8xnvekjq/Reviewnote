// "문제카드 보기" 버튼 — 관리자 채점 화면(ReviewCheckAdminOverlay)에서 기존 원본 문제카드
// 상세(MistakeDetailModal)를 그대로 여는 흐름을 검증하는 standalone 마운트 fixture. App.tsx의
// OverlayHost와 정확히 같은 방식(selectedEntry state + onViewMistake=setSelectedEntry)으로
// 두 컴포넌트를 나란히 마운트한다 — 새 모달을 만들지 않고 실제 컴포넌트를 그대로 재사용.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
// MistakeDetailModal은 position/z-index를 포함해 Tailwind 유틸리티 클래스에 크게 의존한다 —
// 다른 reviewCheck fixture들(주로 rn-* 커스텀 클래스만 쓰는 화면)과 달리, main.tsx와 동일하게
// 전역 Tailwind 진입점을 직접 import해야 실제 겹침/포지셔닝이 정확히 재현된다.
import '../../src/index.css';
import { ReviewCheckAdminOverlay } from '../../src/components/reviewCheck/ReviewCheckAdminOverlay';
import { MistakeDetailModal } from '../../src/components/MistakeDetailModal';
import type { MistakeEntry } from '../../src/types';

function Fixture() {
  const [selectedEntry, setSelectedEntry] = useState<MistakeEntry | null>(null);

  return (
    <>
      <ReviewCheckAdminOverlay
        studentId="student-1"
        studentName="테스트 학생"
        onClose={() => { document.body.dataset.closed = 'true'; }}
        onViewMistake={setSelectedEntry}
      />
      {selectedEntry && (
        <MistakeDetailModal
          selectedEntry={selectedEntry}
          isAnalyzing={false}
          onClose={() => setSelectedEntry(null)}
          onDeleteMistake={() => {}}
          onStartAnalysis={() => {}}
          onUpdateReviews={() => {}}
          onUpdateCheckpointStatus={() => {}}
          onSetChecklistItemStatus={() => {}}
          onDeleteAnswerImage={() => {}}
          onUpdateEntry={() => {}}
          isAdmin={true}
        />
      )}
    </>
  );
}

createRoot(document.getElementById('root')!).render(<Fixture />);
