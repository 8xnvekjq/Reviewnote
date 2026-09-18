import { useEffect, useRef, useState } from 'react';
import { PODIUM, rectStyle } from './plazaLayout';
import { PLAZA_HEIGHT, PLAZA_WIDTH } from './types';
import { sizeLabel, weeklyRankLabel } from '../farm/farmModel';
import type { WeeklyCropContest } from '../farm/farmModel';
import { TomatoSprite } from '../farm/TomatoSprite';
import { fetchWeeklyCropContest } from '../../../utils/pixelFarm';

// The tomato standing on the podium (see plazaLayout.ts's PODIUM for the static stand itself) — this
// KST week's #1 (or tied-for-1st) submitted size, resolved server-side (get_weekly_crop_contest) so
// this component never touches raw profile rows or other students' farm/review data. Fetched once
// per Plaza mount, same "walk in, see the current state" cadence as fetchEquippedAppearance above it
// in Plaza.tsx — no realtime channel: the board updates next time someone walks in, which is enough
// for a slow-changing "who's growing the biggest tomato this week" contest, not a live scoreboard.
export function CropExhibit() {
  const [contest, setContest] = useState<WeeklyCropContest | null>(null);
  const [opened, setOpened] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchWeeklyCropContest().then(next => { if (!cancelled) setContest(next); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!opened) return;
    const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpened(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [opened]);

  if (!contest) return null;

  const topRanks = contest.top.map(entry => entry.rank);
  const leader = contest.top[0]; // rank 1, or one of several tied for it
  // Tie annotation only works within the top list (that's the only place we can see sibling ranks) —
  // a rank outside it still shows the correct number, just without a possible "공동" prefix.
  const myRankLabel = contest.mine.rank === null ? null
    : contest.mine.rank <= 3 ? weeklyRankLabel(contest.mine.rank, topRanks)
    : `${contest.mine.rank}위`;

  // Sized/positioned to visually rest on the static pedestal's top tier (see plaza.css's
  // .pr-hub-podium-top — a 24%-tall block bottom-anchored in this same PODIUM box), narrower than
  // the full 2-wide stand so it reads as something placed ON it, not spanning it.
  const topStyle = rectStyle({ x: PODIUM.x + 0.35, y: PODIUM.y + PODIUM.h * 0.42, w: PODIUM.w - 0.7, h: PODIUM.h * 0.5 });
  const cardStyle = {
    // Clamp margin must be >= half the card's own max width (260px, see .pr-crop-exhibit-card) so
    // the centered card can never overflow either edge — narrower than that and it clips off-board
    // exactly the way the farm scarecrow's speech bubble once did.
    left: `clamp(132px, ${(PODIUM.x + PODIUM.w / 2) / PLAZA_WIDTH * 100}%, calc(100% - 132px))`,
    top: `${(PODIUM.y + PODIUM.h) / PLAZA_HEIGHT * 100}%`,
  };
  // The tomato is a SIBLING of the button, not a child of it — the button is position:absolute
  // sized against the whole board (via rectStyle), and a percentage-based style on a descendant of
  // an absolutely-positioned element resolves against THAT element's own box, not the board, which
  // would silently shrink the tomato to a few px (same class of bug as the farm scarecrow's speech-
  // bubble z-index trap: a nested absolutely-positioned child inherits its containing block from the
  // nearest positioned ancestor, never "the grid" implicitly).
  return <div ref={root} className="pr-crop-exhibit" aria-hidden="true">
    {leader && <span className="pr-crop-exhibit-tomato" style={topStyle}><TomatoSprite stage="ripe" moisture="normal" /></span>}
    <button type="button" className="pr-crop-exhibit-target" style={rectStyle(PODIUM)}
      aria-label={leader ? `이번 주 대회 · ${weeklyRankLabel(1, topRanks)} ${sizeLabel(leader.sizeScore)} · 눌러서 자세히 보기` : '이번 주 토마토 대회 게시판 · 눌러서 자세히 보기'}
      aria-expanded={opened} onClick={() => setOpened(value => !value)} />
    {opened && <div className="pr-crop-exhibit-card" role="group" aria-label="이번 주 토마토 대회" style={cardStyle}>
      <strong>🏆 이번 주 토마토 대회</strong>
      <button type="button" aria-label="닫기" onClick={() => setOpened(false)}>×</button>
      {contest.top.length === 0 ? <p>아직 이번 주 출품이 없어요.<br />농장에서 토마토를 키워 출품해 보세요!</p> : <ol className="pr-crop-exhibit-ranking">
        {contest.top.map((entry, index) => <li key={index}>
          <span className="pr-crop-exhibit-rank">{weeklyRankLabel(entry.rank, topRanks)}</span>
          <span className="pr-crop-exhibit-name">{entry.submitterLabel}</span>
          <span className="pr-crop-exhibit-score">{entry.sizeScore}/100</span>
        </li>)}
      </ol>}
      <small className="pr-crop-exhibit-mine">
        {myRankLabel ? `내 이번 주 최고 기록 · ${contest.mine.sizeScore}/100 · ${myRankLabel}` : '이번 주 내 출품 기록이 아직 없어요.'}
      </small>
    </div>}
  </div>;
}
