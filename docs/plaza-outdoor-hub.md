# Small outdoor plaza

The previous plaza reused the room's wood frame, wall/window and threshold. A uniform green grid and indoor plants reinforced the impression of another room.

This scene uses a central well and noticeboard, a dirt clearing with three paths, benches and irregular groups of trees, shrubs and fence segments. The southern path leads to the existing home entrance; its label walks the player there. Room artwork and realtime subscriptions/protocol are unchanged. Only fixed scenery footprints affect the existing local BFS/keyboard movement.

Reference and artwork: [Kenney Tiny Town](https://kenney.nl/assets/tiny-town), CC0. The original packed 16px atlas is included as `src/features/pixel-room/plaza/assets/tiny-town.png` with its original license. Trees, well, shrubs, grass, flowers, paths and fences use atlas crops. The noticeboard and benches are CSS shapes. No Pokémon artwork is used.

Validation:
- `node --import ./tests/plaza/register-typescript.mjs --test tests/plaza/*.test.ts`
- `npm run build` (includes TypeScript)
- oxlint on changed TS/TSX/MJS files
- With Vite on 127.0.0.1:5174: `node tests/plaza/landscape.browser.mjs`

The browser fixture renders the actual Plaza with mocked service boundaries at 390×844 and 1440×1000. It checks map aspect ratio, movement around scenery, and reaching the home entrance; screenshots cover an empty plaza and five avatars. It does not verify real devices or live multi-account networking.
