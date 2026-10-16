import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelpTab } from '../../src/features/peerHelp/helper/HelpTab';
import { HelpFeedbackModal } from '../../src/features/peerHelp/helper/HelpFeedbackModal';
import { HelpAdminPanel } from '../../src/features/peerHelp/admin/HelpAdminPanel';
import '../../src/index.css';
import '../../src/styles/design-system.css';

createRoot(document.getElementById('root')!).render(<StrictMode>{location.search.includes('feedback') ? <HelpFeedbackModal feedbacks={[
  { solution_id: 's1', title: '방정식', image_url: null, feedback: 'like', reward: 10, shards: 1 },
  { solution_id: 's2', title: '함수', image_url: null, feedback: 'unclear', reward: 5, shards: 0 },
]} onClose={() => {}} onGoToHelp={() => { document.body.dataset.goToHelp = 'true'; }} /> : location.search.includes('admin') ? <HelpAdminPanel onViewMistake={entry => { document.body.dataset.viewedMistake = entry.id; }} /> : <HelpTab userId="11111111-1111-4111-8111-111111111111" onPointsChanged={() => { document.body.dataset.pointsChanged = 'true'; }} />}</StrictMode>);
