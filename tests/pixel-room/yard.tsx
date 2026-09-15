import { createRoot } from 'react-dom/client';
import PixelRoom from '../../src/features/pixel-room/PixelRoom';
import '../../src/index.css';
import '../../src/styles/design-system.css';
createRoot(document.getElementById('root')!).render(<main style={{ height: 'calc(100dvh - 48px)', padding: 16 }}><PixelRoom userId="yard-test" onExit={() => {}} /></main>);
