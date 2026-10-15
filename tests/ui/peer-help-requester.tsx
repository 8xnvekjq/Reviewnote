import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HelpRequesterPanel } from '../../src/features/peerHelp/requester/HelpRequesterPanel';
import { MistakeList } from '../../src/components/MistakeList';
import '../../src/index.css';
import '../../src/styles/design-system.css';
import '../../src/styles/detail.css';
const imageUrl = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="white"/><text x="20" y="50">1 + 1 = ?</text></svg>');
const entry = { id: 'mistake', userId: 'student', imageUrl, title: '도움 요청 테스트', date: '2026-10-16', reviews: ['O', 'O', 'O'] as const };
export function Fixture() {
  const [points, setPoints] = useState(0);
  return <main className="p-4 text-white"><output aria-label="포인트 갱신 횟수">{points}</output>
    <MistakeList mistakes={[{ ...entry, reviews: [...entry.reviews] }]} currentUserId="student" onSelectEntry={() => {}} onDeleteMistake={() => {}} onAddClick={() => {}} />
    <HelpRequesterPanel mistakeId="mistake" imageUrl={imageUrl} currentUserId="student" onPointsChanged={() => setPoints(n => n + 1)} />
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Fixture /></StrictMode>);
