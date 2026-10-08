# Fishing art

Regenerate all fourteen sheets and the preview from the worktree root:

```sh
node scripts/draw-fishing-art.mjs
```

The generator uses only Node built-ins, readable character pixel maps, a shared 20-color palette, and a small RGBA PNG encoder with zlib. No dependencies, downloaded art, browser, system fonts, or random values are needed. It checks pixel bounds, frame bounds, binary alpha, chunk CRCs, and PNG decompression. Outputs are deterministic.

The style follows the existing tiny-town yard/plaza tiles and pet references: flat colors, warm charcoal outlines (#493c36), sage greens, sandy wood, small cream highlights, and integer pixels. PNGs contain only alpha 0 or 255 and no antialiasing. Use nearest-neighbor filtering and integer scaling.

| Sheet | Image size | Frame rectangles / order |
| --- | --- | --- |
| `river-tiles.png` | 144×16 | Nine 16×16 cells: water0, water1, water2, bank-edge-top, bank-edge-bottom, dock-plank, reeds, lily-pad, stone. Frame n starts at (16n, 0). |
| `fish-icons.png` | 192×16 | Twelve 16×16 cells in catalog order below. Frame n starts at (16n, 0). |
| `fish-shadow.png` | 72×14 | S: (0,0,16,8), M: (16,0,24,12), L: (40,0,32,14). Top aligned, transparent padding below S/M. Register manual frames; these are not uniform cells. |
| `bobber.png` | 24×8 | Three 8×8 cells: idle, dip, plunk. |
| `splash.png` | 64×16 | Four 16×16 cells: small crown, rising crown, falling drops, fading ripple. |
| `turtle.png` | 128×64 | 32×32 cells. Row 0: idle neutral, inhale, blink, settle. Row 1 columns 0–1: talk small mouth, talk open mouth / inhale. Row 1 columns 2–3 are transparent padding. Uniform spritesheet indices: idle 0–3, talk 4–5; skip 6–7. |
| `rain.png` | 5×4 | Drop: (0,0,1,4); ground ripple: (1,0,4,1). Transparent padding below the ripple. Register manual frames. |
| `sparkle.png` | 24×8 | Three 8×8 cells: small star, bright star, fading star. |

Coordinates above are `(x, y, width, height)` in source pixels. Bobber/splash/star frames stay centered in their cells. Turtle feet remain on source y=29 in every frame; head and scarf lift by one pixel for breathing. Suggested turtle origin: (0.5, 30/32).

## Fish icon order (zero-based)

| Index | ID | Visual distinction |
| --- | --- | --- |
| 0 | `pirami` | Slim silver-blue body, forked tail, small dorsal fin. |
| 1 | `buri` | Round sandy-gold body, cream flank, tall triangular fin. |
| 2 | `minnow` | Tiny thin cream/silver body with a short tail. |
| 3 | `catfish_small` | Lavender body, blue underside, fine whiskers. |
| 4 | `carp` | Broad golden body, alternating scale pattern, deep belly. |
| 5 | `mandarin` | Olive/gold mottling and three spiked dorsal rays. |
| 6 | `eel` | Curved sage ribbon body with a tapering curled tail. |
| 7 | `catfish` | Large slate-blue body, broad head, long whiskers. |
| 8 | `goby` | Sandy brown mottling, paired lower fins, twin dorsal rays. |
| 9 | `trout` | Silver flank, coral spotted stripe, blue back. |
| 10 | `moonfish` | Pale blue/cream body, blue eye, discrete luminous halo pixels. |
| 11 | `rainbow_koi` | Broad koi body with coral, gold, green, aqua, blue and lavender scale bands. |

## Integration notes

The spec requests both binary PNG alpha and semi-transparent dark shadows. To preserve binary source alpha, `fish-shadow.png` uses solid dark blue (#305569); set the rendered shadow object's alpha to approximately **0.35**. This is the only required runtime opacity adjustment. Moonfish glow uses opaque pale halo pixels, preserving crisp binary alpha.

Bank-edge-top has grass above water; bank-edge-bottom reverses that arrangement vertically. Water highlights wrap horizontally through the three shimmer frames; top and bottom borders retain the base water color. Reeds, lily pad, and stone are transparent overlays; dock and bank tiles are opaque terrain.

`docs/pixel-world/fishing-art-preview.png` is a 1664×2816 contact sheet. Every source pixel becomes an exact 8×8 block. Checkerboards show transparency; red registration ticks mark frame starts in the preview only. The original PNGs have no ticks or labels.

## Riverside props

Six additional single-frame sheets reuse the palette and binary alpha: `lamp.png` (16×32), `crate.png`, `bucket.png`, `lily-small.png`, `lily-flower.png`, and `flowers.png` (each 16×16). The lamp sits at the cell bottom and receives a small warm overlay during evening/night, above the existing world tint. Crate rods and the bucket handle distinguish the fishing equipment. Two lily silhouettes include a coral blossom variant.

Trees, bushes, and fence sections reuse town/yard/plaza art; the bench uses the existing plaza geometry. Reeds and rocks reuse river tiles. Flowers allow walking; trees, bushes, reeds, equipment, furniture, fence, and the lamp block their base cells. Water props stay inaccessible. Decorations remain static; five water glints share the 650 ms water frame clock without tweens. The generated contact sheet is 1664×4512 pixels.
