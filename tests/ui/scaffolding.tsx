// AI 진단 유무와 학생/관리자 권한별 학습 기록 표시를 검증한다.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { MistakeList } from '../../src/components/MistakeList';
import { MistakeDetailModal } from '../../src/components/MistakeDetailModal';
import { ScaffoldingListPanel } from '../../src/components/ScaffoldingListPanel';
import type { MistakeEntry } from '../../src/types';

const params = new URLSearchParams(location.search);
const isAdmin = params.has('admin');
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="360" height="90"><rect width="360" height="90" fill="white"/><text x="20" y="50">x² − 5x + 6 = 0</text></svg>');
const entry: MistakeEntry = {
  id: 'scaffold-mistake', userId: 'student-1', title: '진단 없이 학습 기록 보기',
  date: '2026-10-08', imageUrl: image, answerImageUrl: image, reviews: ['', '', ''],
  analysis: params.has('analyzed') ? { solvingProcess: '두 근의 합과 곱을 확인합니다.', modelUsed: '테스트 모델', finalAnswer: '13' } : undefined,
};

export function Fixture() {
  const [selected, setSelected] = useState<MistakeEntry | null>(null);
  const currentUserId = isAdmin ? 'teacher-1' : 'student-1';
  return <div className="rn-app bg-app-main text-slate-100 min-h-screen">
    {params.has('clinic')
      ? <ScaffoldingListPanel currentUserId={currentUserId} isAdmin={isAdmin} onSelectMistake={setSelected} />
      : <MistakeList mistakes={[entry]} currentUserId={currentUserId} isAdmin={isAdmin} scaffoldedMistakeIds={new Set([entry.id])} onSelectEntry={setSelected} onDeleteMistake={() => {}} onAddClick={() => {}} />}
    {selected && <MistakeDetailModal selectedEntry={selected} currentUserId={currentUserId} isAdmin={isAdmin}
      isAnalyzing={false} checkpointRegenStatus="success" onClose={() => setSelected(null)}
      onDeleteMistake={() => {}} onStartAnalysis={() => {}} onUpdateReviews={() => {}}
      onUpdateCheckpointStatus={() => {}} onSetChecklistItemStatus={() => {}}
      onDeleteAnswerImage={() => {}} onUpdateEntry={() => {}} />}
  </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
