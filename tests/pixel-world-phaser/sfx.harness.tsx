import { StrictMode, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useBgm } from '../../src/features/pixel-room/bgm/useBgm';
import { useFishing } from '../../src/features/pixel-world-phaser/ui/useFishing';
import { LevelToast } from '../../src/features/pixel-world-phaser/ui/LevelBadge';
import { ReelBar } from '../../src/features/pixel-world-phaser/ui/ReelBar';
import { ReelJoystick } from '../../src/features/pixel-world-phaser/ui/ReelJoystick';
import type { FishingAdapter } from '../../src/features/pixel-world-phaser/ui/fishingAdapter';
import '../../src/features/pixel-world-phaser/gameShell.css';
const adapter: FishingAdapter = {
  state: async () => ({ kstDate: '2026-10-09', phase: 'day', weather: 'clear', remaining: 100, sparkleShadow: null, pigeonHint: null, album: [], rod: { id: null, tier: 0 } }),
  start: async () => ({ ok: true, castId: 'sfx-cast', shadow: 'S', biteDelayMs: 500, difficulty: 1, pattern: 'long', hint: null }),
  finish: async (_id, landed) => landed ? { ok: true, landed: true, speciesId: 'pirami', lengthCm: 10, rarity: 'common', isNew: false, isBig: false, isPersonalBest: false, remaining: 99 } : { ok: true, landed: false },
  board: async () => ({ rows: [], classSpecies: 0 }),
};
function Harness() {
  const root = useRef<HTMLDivElement>(null), handle = useRef({ cancelWalk() {} });
  const bgm = useBgm(root);
  const fishing = useFishing({ adapter, handle, scene: 'river', pet: null, freeze() {} });
  const [level, setLevel] = useState<number | null>(null);
  Object.assign(window, { sfxProbe: { fishing, setLevel } });
  return <div ref={root} className="pwp-root" style={{ width: '100vw', height: '100vh' }}>
    <button data-testid="sound" aria-pressed={bgm.enabled} onClick={bgm.toggle}>{'\uC18C\uB9AC'}</button>
    <button data-testid="cast" onClick={() => void fishing.onShadowTap(0)}>{'\uB0DA\uC2DC \uC2DC\uC791'}</button>
    <output data-testid="phase">{fishing.phase}</output>
    {fishing.reelState && <><ReelBar game={fishing.reelState} /><ReelJoystick onAxis={fishing.setReelX} /></>}
    {fishing.caught && <output data-testid="catch">{fishing.caught.speciesId}</output>}
    {level !== null && <LevelToast level={level} />}
  </div>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>);
