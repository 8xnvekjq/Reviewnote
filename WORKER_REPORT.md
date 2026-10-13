Status: DONE

# rps-art2 — card art redraw + NPC first-win-only reward

## Task 1 — cards.png / duel-bubble.png redraw
- New generator `scripts/art/card_rps_cards.py` (PIL, hand-authored character grids, deterministic). Run: `python scripts/art/card_rps_cards.py`.
- `cards.png` is now 128x88: 32x44 frames, columns rock / scissors / paper / back, row 0 = player (blue frame), row 1 = opponent (red frame). RGBA, alpha only 0/255, rounded corners transparent.
  - Rock: closed fist, a row of 4 knuckles, a fold crease, and the thumb wrapped across.
  - Scissors: V sign with index and middle fingers clearly apart (open gap between them), ring and pinky folded under the thumb.
  - Paper: open palm, 4 fingers with 1px cream gaps between them plus the thumb out to the side.
  - The three silhouettes are clearly different (compact block / V / spiky fan). Each hand has a 1px #2b1a14 outline, 3 skin tones, a cream face, a colored frame with a light/dark bevel and an inner dark line, diamond corner pips, and a sleeve cuff in the frame color.
  - Back: navy/indigo with a gold inner border, a dot pattern, a gold-ringed medallion with a crescent moon, and stars. The frame color follows the row.
- `duel-bubble.png` (48x16, three 16x16 frames) is redrawn with matching mini fist / V / open-palm icons in a cream bubble with a tail.
- `assets/cardRps/index.ts`: `CARD_W = 32`, `CARD_H = 44`. `card-rps-art.test.ts`: the cards spec is now `(128,88),(32,44)`.
- `scripts/draw-card-rps-art.mjs` no longer saves `cards.png` / `duel-bubble.png`, so rerunning it can't overwrite the new art. Its own preview still draws its old internal canvases.
- Preview: `.test-artifacts/cards-preview.png` (not committed). It shows the sheet at 8x, plus the bubble at 8x and the cards at 1x and 2x. I compared it with the old sheet (`git show HEAD:…/cards.png`): the old 24x32 hands were mushy blobs, and the new ones are clearly readable at 1x.

## Task 2 — NPC reward only on first-ever win
New migration `supabase/migrations/20261015000000_card_rps_npc_first_win.sql` (begin/commit):
- `create or replace function public.start_npc_card_rps()`: stake is always 0 and there is no `npc_entry` deduction. `prize = cfg.npc_reward` only when the user has no row in `pixel_private.card_rps_npc_wins` on any date; otherwise prize is 0. The busy check and `unique_violation → busy` handling are kept, along with `security definer set search_path=''`. `revoke all … from public, anon; grant execute … to authenticated` is re-asserted.
- `card_rps_settle` is unchanged. With stake 0, an NPC win with prize>0 pays `+prize` (a_delta = prize) and inserts the win row. A win with prize 0 pays 0 and inserts no row. A loss has a_delta = -0 = 0 and no adjustment.
- Added `comment on column` for `npc_entry` and `npc_daily_reward_wins` saying they are no longer used. No columns were dropped.
- `card-rps-server.test.ts` now also loads the new migration and has a new test. It covers: the first NPC match has stake 0 and prize 20, with no entry fee; a loss costs 0 and the prize is still offered next time; a win pays +20; after that (the win row moved to an older date) the prize is 0 and a win pays 0; a loss costs 0; only one win row is recorded; a different user still gets prize 20. To fix the outcome, the test calls `pixel_private.card_rps_settle` directly instead of relying on the random NPC. The existing friend / NPC-practice / shootout tests still pass.

## Checks
- `node --import ./tests/plaza/register-typescript.mjs --test …card-rps-art… …card-rps-server… …card-rps…` → 26/26 pass.
- `npx tsc -b` → clean.
- Env note: this worktree's node_modules had no `@electric-sql/pglite`, so I added a local (gitignored) junction `node_modules/@electric-sql` → the main checkout's copy to run the PGlite test.
- No DB apply, no push, no browser tests. I did not touch rps-ui2's files; `CardRpsGame.tsx` picks up the new size through `CARD_W`/`CARD_H`.
