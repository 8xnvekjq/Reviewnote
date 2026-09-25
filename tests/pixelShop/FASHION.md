# Bootcut jeans and puff blouse

Six catalog products, each 120P: washed blue / charcoal / cream bootcut jeans,
and black / ivory / dusty rose blouses. Existing purchase and equipment RPCs
remain the authority for ownership and equipped item IDs.

The supplied photos informed the silhouette only: flared denim hems, a wide
neckline, puff sleeves and gathered blouse hem. No photo pixels are included.
The new code-native SVG pixel paths use the existing CC0 character body and
denim poses as alignment references. Original atlases and their license notices
are unchanged. Each garment has 32 poses (idle/walk, four directions, four frames)
and four palette layers. All colors share their garment geometry.

Regenerate with `python scripts/build-fashion-paths.py` (Pillow required).
Inspect all poses at `/tests/pixel-room/fashion.html` on the Vite server.

Verification:
- `node --import ./tests/plaza/register-typescript.mjs --test tests/plaza/*.test.ts tests/pixelShop/content.test.ts`
- `node tests/pixelShop/fashion-browser.mjs` with Vite on port 5174: actual
  components, intercepted REST, 390px and 1440px viewports; six purchases,
  color switching, equipment reload, account isolation and overflow checks.
- `fashion-server.sql`: live purchase/equip/charge/duplicate/wrong-slot checks
  inside a transaction that rolls back all account mutations.
- `npm run build` and changed-file oxlint.
