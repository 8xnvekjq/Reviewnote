import { useEffect, useRef, useState } from 'react';
import { PODIUM, rectStyle } from './plazaLayout';
import { PLAZA_HEIGHT, PLAZA_WIDTH } from './types';
import { formatHarvestDate, sizeLabel } from '../farm/farmModel';
import type { TopSubmittedCrop } from '../farm/farmModel';
import { TomatoSprite } from '../farm/TomatoSprite';
import { fetchTopSubmittedCrop } from '../../../utils/pixelFarm';

// The tomato standing on the podium (see plazaLayout.ts's PODIUM for the static stand itself) —
// the single largest 'submitted' pixel_farm_crops row across everyone, resolved server-side
// (get_top_submitted_crop) so this component never touches raw profile rows. Fetched once per Plaza
// mount, same "walk in, see the current state" cadence as fetchEquippedAppearance above it in
// Plaza.tsx — no realtime channel: a bigger submission shows up next time someone walks in, which is
// enough for a slow-changing "who's submitted the biggest tomato so far" board.
export function CropExhibit() {
  const [crop, setCrop] = useState<TopSubmittedCrop | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [opened, setOpened] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTopSubmittedCrop().then(next => { if (!cancelled) { setCrop(next); setLoaded(true); } }).catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!opened) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpened(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [opened]);

  if (!loaded) return null;

  // Sized/positioned to visually rest on the static pedestal's top tier (see plaza.css's
  // .pr-hub-podium-top — a 24%-tall block bottom-anchored in this same PODIUM box), narrower than
  // the full 2-wide stand so it reads as something placed ON it, not spanning it.
  const topStyle = rectStyle({ x: PODIUM.x + 0.35, y: PODIUM.y + PODIUM.h * 0.42, w: PODIUM.w - 0.7, h: PODIUM.h * 0.5 });
  const cardStyle = {
    left: `clamp(120px, ${(PODIUM.x + PODIUM.w / 2) / PLAZA_WIDTH * 100}%, calc(100% - 120px))`,
    top: `${(PODIUM.y + PODIUM.h) / PLAZA_HEIGHT * 100}%`,
  };
  // The tomato is a SIBLING of the button, not a child of it — the button is position:absolute
  // sized against the whole board (via rectStyle), and a percentage-based style on a descendant of
  // an absolutely-positioned element resolves against THAT element's own box, not the board, which
  // silently shrank the tomato to a few px (same class of bug as the farm scarecrow's speech-bubble
  // z-index trap: a nested absolutely-positioned child inherits its containing block from the
  // nearest positioned ancestor, never "the grid" implicitly).
  return <div ref={root} className="pr-crop-exhibit" aria-hidden="true">
    {crop && <span className="pr-crop-exhibit-tomato" style={topStyle}><TomatoSprite stage="ripe" moisture="normal" /></span>}
    <button type="button" className="pr-crop-exhibit-target" style={rectStyle(PODIUM)}
      aria-label={crop ? `전시된 토마토 · ${sizeLabel(crop.sizeScore)} · 눌러서 자세히 보기` : '전시대 · 눌러서 자세히 보기'}
      aria-expanded={opened} onClick={() => setOpened(value => !value)} />
    {opened && <div className="pr-crop-exhibit-card" role="group" aria-label="광장 전시 토마토" style={cardStyle}>
      <strong>{crop ? '🏆 최고의 토마토' : '전시대'}</strong>
      <button type="button" aria-label="닫기" onClick={() => setOpened(false)}>×</button>
      {crop ? <>
        <p className="pr-crop-exhibit-size">{sizeLabel(crop.sizeScore)} · {crop.sizeScore}/100</p>
        <small>출품: {crop.submitterLabel} · {formatHarvestDate(crop.submittedAt)}</small>
      </> : <p>아직 아무도 출품하지 않았어요.<br />농장에서 토마토를 키워 출품해 보세요!</p>}
    </div>}
  </div>;
}
