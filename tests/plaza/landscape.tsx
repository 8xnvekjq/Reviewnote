import { createRoot } from 'react-dom/client';
import Plaza from '../../src/features/pixel-room/plaza/Plaza';
// Browser fixture uses the real scene; its runner substitutes only service boundaries.
createRoot(document.getElementById('root')!).render(<main style={{ height: 'calc(100dvh - 48px)', padding: 16, boxSizing: 'border-box', fontFamily: 'sans-serif' }}><div className="pr-shell"><Plaza userId="fixture" sessionId="viewer" onReachEntrance={() => { document.body.dataset.returned = 'true'; }} /></div></main>);
