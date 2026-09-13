import { createRoot } from 'react-dom/client';
import { usePlazaRealtime } from '../../src/features/pixel-room/plaza/usePlazaRealtime';
import { useSmoothedPlayerPositions } from '../../src/features/pixel-room/plaza/useSmoothedPlayerPositions';
const appearance={top:null,bottom:null,shoes:null,hair:null,eyes:null};
function Sender() {
  const realtime=usePlazaRealtime('sender',appearance);
  Object.assign(window,{plazaSender:realtime.updateMyState});
  return <div data-ready={realtime.ready} id="sender"/>;
}
function Receiver() {
  const {players,paths}=usePlazaRealtime('receiver',appearance);
  const smoothed=useSmoothedPlayerPositions(players,paths);
  return <><pre id="raw">{JSON.stringify(players)}</pre><pre id="smoothed">{JSON.stringify(smoothed)}</pre></>;
}
createRoot(document.getElementById('root')!).render(<><Sender/><Receiver/></>);
