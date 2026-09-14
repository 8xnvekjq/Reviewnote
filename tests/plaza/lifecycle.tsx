import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { usePlazaRealtime } from '../../src/features/pixel-room/plaza/usePlazaRealtime';
import { useSmoothedPlayerPositions } from '../../src/features/pixel-room/plaza/useSmoothedPlayerPositions';
const appearance = { top: null, bottom: null, shoes: null, hair: null, eyes: null };

function Sender() {
  // PixelRoom.tsx의 sessionId처럼 방문 사이에 재발급되지 않는 안정값 — 여기서는 한 번만 만든다.
  const [sessionId] = useState('sender');
  const realtime = usePlazaRealtime(sessionId, appearance);
  Object.assign(window, { plazaSender: realtime.updateMyState });
  return <div data-ready={realtime.ready} id="sender" />;
}

function Receiver() {
  const { players, paths } = usePlazaRealtime('receiver', appearance);
  const smoothed = useSmoothedPlayerPositions(players, paths);
  return <><pre id="raw">{JSON.stringify(players)}</pre><pre id="smoothed">{JSON.stringify(smoothed)}</pre></>;
}

// PixelRoom.tsx의 `{location === 'plaza' && <Plaza .../>}`와 정확히 같은 모양의 조건부 렌더링 —
// Sender를 mount/unmount해서 실제 "광장 퇴장(문 통과)/재입장" 생애주기를 그대로 재현한다(채널
// 재연결만 흉내내는 reconnect.tsx와 달리, 여기서는 usePlazaRealtime 훅 인스턴스 자체가 완전히
// 파괴되고 새로 생성된다 — sessionId 값만 재사용될 뿐).
function App() {
  const [mounted, setMounted] = useState(true);
  Object.assign(window, {
    plazaLeave: () => setMounted(false),
    plazaEnter: () => setMounted(true),
  });
  return <>{mounted && <Sender />}<Receiver /></>;
}

createRoot(document.getElementById('root')!).render(<App />);
