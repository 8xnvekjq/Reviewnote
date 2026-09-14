import { createRoot } from 'react-dom/client';
import Plaza from '../../src/features/pixel-room/plaza/Plaza';
import { useEffect } from 'react';
import { usePlazaRealtime } from '../../src/features/pixel-room/plaza/usePlazaRealtime';
const appearance = { top: null, bottom: null, shoes: null, hair: null, eyes: null };
export function Peer() {
  const realtime = usePlazaRealtime('peer', appearance);
  const { updateMyState } = realtime;
  useEffect(() => { updateMyState({ x: 9, y: 5, direction: 'Front', moving: false }); }, [updateMyState]);
  Object.assign(window, { peerReact: realtime.sendReaction });
  return <output hidden id="peer-reactions">{JSON.stringify([...realtime.reactions.values()])}</output>;
}
// Browser fixture uses the real scene; its runner substitutes only service boundaries.
createRoot(document.getElementById('root')!).render(<main style={{ height: 'calc(100dvh - 48px)', padding: 16, boxSizing: 'border-box', fontFamily: 'sans-serif' }}><div className="pr-shell"><Plaza userId="fixture" sessionId="viewer" onReachEntrance={() => { document.body.dataset.returned = 'true'; }} /></div>{location.search.includes('peer') && <Peer />}</main>);
