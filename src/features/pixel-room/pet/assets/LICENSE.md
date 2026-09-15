# Dog sprite

`dog.png` is original artwork made for this project (2026-09-16), not a third-party asset.
No external license applies — no attribution required.

It replaces an earlier third-party CC0 sheet (`dog_medium.png` by rmazanek, opengameart.org/content/dog-3)
that was a realistic, fine-lined, muted-palette style mismatched against this project's flat-color,
thick-outline character/furniture art. The new sheet is a procedurally generated (Pillow/Python,
drawn at 10x supersample then downscaled) chibi puppy matched to that same style: warm tan/cream
palette shared with the character sheet, bold dark-brown outline, round low-detail silhouette,
blush cheeks, big simple eyes.

192×192 PNG; six rows of 32×32 cells (same frame size as the avatar sheets). Frames per row:
bark 4, walk 6, run 6, sit transition 3, idle sit 4, idle stand 4 — identical animation set to the
sheet it replaces, so `Dog.tsx`'s row/frame logic needed only a geometry constant update (60×38 →
32×32 cells, 360×228 → 192×192 sheet), no FSM or behavior changes.
Front-facing chibi art, mirrored for right-facing movement; no separate walk-cycle leg poses per
direction (consistent with the previous sheet's approach — see dogModel.ts/dogWorld.ts, unchanged).
