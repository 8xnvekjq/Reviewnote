import { useEffect, useRef, useState } from 'react';
import { SCARECROW_CELL } from './farmModel';
import type { FarmSnapshot } from './farmModel';
import { pickScarecrowLine } from './scarecrowLines';
import './farm.css';

// Original tiny pixel illustration, same technique/palette family as TomatoSprite — a friendly
// fixed guide, not meant to be scary or realistic.
export function ScarecrowSprite() {
  return <svg viewBox="0 0 32 40" aria-hidden="true" shapeRendering="crispEdges">
    <path fill="#e0b563" d="M1 12h5v7h-5zM26 12h5v7h-5z" /><path fill="#c99a4a" d="M1 12h5v2h-5zM26 12h5v2h-5z" />
    <path fill="#7a5a35" d="M4 14h24v3h-24z" /><path fill="#8a6338" d="M4 15h24v1h-24z" />
    <path fill="#e0b563" d="M9 15h2v3h-2zM21 15h2v3h-2z" />
    <path fill="#b3946a" d="M9 17h14v14h-14z" /><path fill="#c9a86b" d="M9 17h14v1h-14zM9 17h1v14h-1z" />
    <path fill="#6a8fae" d="M11 22h3v3h-3z" /><path fill="#b5583f" d="M18 25h3v3h-3z" />
    <path fill="#6b4a34" d="M15 19h2v1h-2zM15 22h2v1h-2zM15 29h2v1h-2z" />
    <path fill="#7a5a35" d="M15 30h2v8h-2z" />
    <path fill="#e0b563" d="M11 36h4v4h-4zM17 36h4v4h-4z" /><path fill="#c99a4a" d="M11 38h4v2h-4zM17 38h4v2h-4z" />
    <path fill="#d9bd8a" d="M10 5h12v10h-12z" /><path fill="#c9a86b" d="M10 5h12v1h-12zM10 5h1v10h-1z" />
    <path fill="#e8a9a0" d="M11 10h2v1h-2zM19 10h2v1h-2z" />
    <path fill="#4a3220" d="M13 9h1v2h-1zM18 9h1v2h-1z" />
    <path fill="#4a3220" d="M13 12h1v1h-1zM14 13h4v1h-4zM18 12h1v1h-1z" />
    <path fill="#e0b563" d="M6 3h20v3h-20z" /><path fill="#c99a4a" d="M6 3h20v1h-20z" />
    <path fill="#c99a4a" d="M11 0h10v3h-10z" /><path fill="#b5583f" d="M11 2h10v1h-10z" />
  </svg>;
}

// A fixed decoration, not an NPC that walks — tap it any time (no need to approach first like the
// farm beds' bigger popover) for a short, transient in-world speech bubble, same pattern as the
// player's own "말 걸어보기" bubble in the room (see PixelRoom.tsx's speak()). No persistent
// panel/modal is ever added.
//
// The bubble is a SIBLING of the sprite button, not a child of it — the button needs a row-based
// z-index (SCARECROW_CELL.y+1) so the player/dog can walk in front of or behind the sprite
// correctly, but that same z-index caps every element nested inside it too (it opens a new
// stacking context), which is exactly what used to bury the bubble behind a crop bed drawn with a
// higher fixed z-index. Keeping the bubble outside that button lets it use its own much higher
// z-index (see farm.css) and always render on top, regardless of where the scarecrow stands.
export function Scarecrow({ snapshot, now }: { snapshot: FarmSnapshot | null; now: number }) {
  const [line, setLine] = useState('');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  function poke() {
    window.clearTimeout(timer.current);
    setLine(pickScarecrowLine(snapshot, now));
    timer.current = window.setTimeout(() => setLine(''), 3200);
  }
  return <div className="pr-scarecrow-wrap" style={{ left: `${SCARECROW_CELL.x / 16 * 100}%`, top: `${(SCARECROW_CELL.y - 0.25) / 12 * 100}%` }}>
    <button type="button" className="pr-scarecrow" data-cell={`${SCARECROW_CELL.x}-${SCARECROW_CELL.y}`}
      style={{ zIndex: SCARECROW_CELL.y + 1 }} aria-label="농장 허수아비 · 눌러서 말 걸어보기" onClick={poke}>
      <ScarecrowSprite />
    </button>
    {line && <span className="pr-scarecrow-bubble" role="status">{line}</span>}
  </div>;
}
