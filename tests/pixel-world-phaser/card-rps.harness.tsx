import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CardRpsGame, CardRpsRules } from '../../src/features/pixel-world-phaser/ui/CardRpsGame';
import { createMockCardRpsAdapter } from '../../src/features/pixel-world-phaser/ui/cardRpsAdapterMock';
import '../../src/features/pixel-world-phaser/gameShell.css';

const adapter = createMockCardRpsAdapter({ seed: 9 });
function Harness() {
  const [rules, setRules] = useState(false);
  return <main className="pwp-root" style={{ minHeight: '100dvh', background: '#203c35' }}>
    <button type="button" data-testid="rules" onClick={() => setRules(true)}>설명서 보기</button>
    {rules ? <CardRpsRules onClose={() => setRules(false)} /> : <CardRpsGame adapter={adapter} onClose={() => {}} />}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
