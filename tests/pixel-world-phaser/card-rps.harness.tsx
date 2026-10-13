import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CardRpsGame, CardRpsRules } from '../../src/features/pixel-world-phaser/ui/CardRpsGame';
import { createMockCardRpsAdapter } from '../../src/features/pixel-world-phaser/ui/cardRpsAdapterMock';
import '../../src/features/pixel-world-phaser/gameShell.css';

// ?seed=25 이면 브라우저 테스트의 손 고르기로 승부차기까지 간다.
const adapter = createMockCardRpsAdapter({ seed: Number(new URLSearchParams(location.search).get('seed') ?? 9) });
const appearance = { skin: null, eyes: null, top: null, bottom: null, shoes: null, hair: null } as const;
function Harness() {
  const [rules, setRules] = useState(false);
  return <main className="pwp-root" style={{ minHeight: '100dvh', background: '#203c35' }}>
    <button type="button" data-testid="rules" onClick={() => setRules(true)}>설명서 보기</button>
    {rules ? <CardRpsRules onClose={() => setRules(false)} /> : <CardRpsGame adapter={adapter} appearance={appearance} onClose={() => {}} />}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
