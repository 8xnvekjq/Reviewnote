import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HelpTab } from '../../src/features/peerHelp/helper/HelpTab';
import { HelpAdminPanel } from '../../src/features/peerHelp/admin/HelpAdminPanel';
import '../../src/index.css';
import '../../src/styles/design-system.css';

createRoot(document.getElementById('root')!).render(<StrictMode>{location.search.includes('admin') ? <HelpAdminPanel /> : <HelpTab userId="11111111-1111-4111-8111-111111111111" onPointsChanged={() => { document.body.dataset.pointsChanged = 'true'; }} />}</StrictMode>);
