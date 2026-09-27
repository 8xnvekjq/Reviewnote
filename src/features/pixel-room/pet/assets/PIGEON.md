# 비둘기 펫 sprite

`pigeon.png` is original artwork created for Reviewnote / Pixel World on 2026-09-27. The design and action sheet were generated with the built-in `image_gen` tool, then cleaned and registered on a native pixel grid with Python 3.12 / Pillow. It is newly generated project artwork, not a downloaded third-party sprite or asset pack. Existing project duck, dog, bear and character artwork was inspected for style and scale; none is copied into the pigeon sheet.

128×192 RGBA transparent PNG, **four columns × six rows**, exactly **32×32 pixels per cell**. One stored pixel equals one logical pixel. Cell origin for column `c`, row `r` is `(32*c, 32*r)`; there are no gutters or variable crop bounds. Intended display footprint: **2×2 world cells**, the same logical canvas as the duck. The neutral silhouette is 23×21 px, distinctly shorter than the person. All colors are flat, with no antialiasing, dithering, gradients or semitransparent pixels. Alpha is exclusively 0 or 255. No ground shadow is included.

The pigeon has a plump blue-gray breast, a short beak, tiny dark eyes, muted green and purple neck patches, two dark bands across the visible wing, a short tail and small coral feet. It looks front-left in three-quarter view, showing its near flank; consumers can mirror horizontally for right-facing movement. There are no accessories or asymmetric props.

Rows and columns below are **zero-based**, read left to right.

| Row | Action | c0 | c1 | c2 | c3 |
| --- | --- | --- | --- | --- | --- |
| 0 | idle | Standing | Curious head tilt / raised crown | Standing, identical to c0 | Blink |
| 1 | walk | Left foot forward, head forward | Passing, right foot contacts | Right foot forward, head back | Opposite passing, left foot contacts |
| 2 | peck | Upright | Bend toward ground | Beak touches ground | Recover upward |
| 3 | rest | Fluff breast and begin crouching | Resting crouch | Same rest, eyes closed | Resting, eyes open |
| 4 | takeoff & land | Crouch before launch | Wings raised, feet tucked | Braking wings, feet partly lowered | Landed, wings folding |
| 5 | fly | Wings up | Wings midway | Wings down | Wings midway on return |

Idle c0/c2 are identical; hold the open-eye poses longer than c3 for a natural blink. Walk uses all four distinct poses, alternating foot contact with a one-pixel forward/back head bob. Peck is c0 → c1 → c2 → c3, then idle. Rest enters through c0 and holds c1/c3, with c2 as a brief blink.

Row 4 is **two transitions**, not a repeating four-frame animation: takeoff c0 → c1 → row 5; landing from row 5 → row 4 c2 → c3 → idle. Row 5 loops c0 → c1 → c2 → c3 → c0; c1 and c3 intentionally share the middle wing pose. Takeoff c1 and fly c0 are pixel-identical. Timing and world altitude belong to the consuming code.

All **18 grounded frames** (rows 0–3 and row 4 c0/c3) place the bottom opaque contact-foot pixel at **cell-local y=30** (zero-based, inclusive). Row 31 remains transparent in every cell. The nominal canvas center is x=15.5 and the torso registration anchor is `(16, 23)`. Walking moves only the head and feet; the one-pixel variation in silhouette bounds is intentional, not a shift of the body.

All **six airborne frames** (row 4 c1/c2 and all of row 5) retain the neutral standing torso at **y=17–28**, with the same `(16, 23)` anchor and crown at y=10. A visible breast patch at x=10–15, y=22–26 and the head/neck region at x=10–16, y=10–20 are byte-identical to idle c0 in all six frames. The sprite never translates its torso upward to imply altitude.

Airborne feet fold against the belly: coral toe pixels are at y=27 and their outline ends at y=28. Row 4 c2 begins lowering the still-bent feet in preparation for contact: coral toes move to y=28, the outline ends at y=29, and the bird remains airborne. Only c3 restores full y=30 contact. Raised wings reach y=2; the downstroke wing reaches y=30 while its feet remain tucked. **Do not use the full alpha bbox bottom as a flight-foot anchor**: it may describe a wingtip. World elevation must be applied externally by the consuming code.

Measured opaque bounds in cell-local **inclusive** coordinates, including outline, beak, wings, tail and feet:

| Row | Frame | x range | y range | Width × height |
| --- | --- | --- | --- | --- |
| 0 | c0 | 5–27 | 10–30 | 23×21 px |
| 0 | c1 | 5–27 | 9–30 | 23×22 px |
| 0 | c2 | 5–27 | 10–30 | 23×21 px |
| 0 | c3 | 5–27 | 10–30 | 23×21 px |
| 1 | c0 | 4–27 | 10–30 | 24×21 px |
| 1 | c1 | 5–27 | 10–30 | 23×21 px |
| 1 | c2 | 6–27 | 10–30 | 22×21 px |
| 1 | c3 | 5–27 | 10–30 | 23×21 px |
| 2 | c0 | 5–27 | 10–30 | 23×21 px |
| 2 | c1 | 4–27 | 15–30 | 24×16 px |
| 2 | c2 | 5–27 | 17–30 | 23×14 px |
| 2 | c3 | 4–27 | 12–30 | 24×19 px |
| 3 | c0 | 5–27 | 12–30 | 23×19 px |
| 3 | c1 | 5–27 | 14–30 | 23×17 px |
| 3 | c2 | 5–27 | 14–30 | 23×17 px |
| 3 | c3 | 5–27 | 14–30 | 23×17 px |
| 4 | c0 | 4–27 | 15–30 | 24×16 px |
| 4 | c1 | 2–30 | 2–28 | 29×27 px |
| 4 | c2 | 1–30 | 10–29 | 30×20 px |
| 4 | c3 | 4–27 | 10–30 | 24×21 px |
| 5 | c0 | 2–30 | 2–28 | 29×27 px |
| 5 | c1 | 2–30 | 10–28 | 29×19 px |
| 5 | c2 | 2–27 | 10–30 | 26×21 px |
| 5 | c3 | 2–30 | 10–28 | 29×19 px |

The shorter peck/rest bounds reflect intentional head lowering and crouching. Flight bounds are wider/taller because wings unfold; the torso does not grow or move upward. Every cell retains a transparent outer border.

Native cleanup: the generated 1024×1536 concept sheet was separated by pose, alpha-thresholded at 128, cropped to its main connected silhouette and sampled with nearest-neighbor resizing onto a 32px canvas. A first seven-color, no-dither draft was inspected at 8×. The generated contours and flat regions were then traced and redrawn at integer pixel coordinates to remove broken outlines, muddy color clusters and inconsistent eyes/wing bands. The finished animation reuses one registered torso and head, with controlled head/foot changes for walking, lowered head/rest poses, and cleaned up/middle/down/braking wing silhouettes. All final drawing and palette application occur directly at native resolution; no supersampling or resampled antialiased edges remain.

Validation with Pillow / NumPy: 128×192 RGBA; exactly seven opaque colors plus transparent black; alpha set exactly {0, 255}; all 24 cells nonempty with one four-connected silhouette each; transparent cell borders; all 18 ground-contact baselines at y=30; exact common head/breast registration in all six airborne frames; expected toe heights; four distinct walk frames; three wing extremes and intentional repeated frames. The full-sheet region of the review image was checked pixel-for-pixel against an 8× nearest-neighbor enlargement. Visual inspection covered the whole sheet and the shared-scale lineup.

Native palette (opaque RGB hex):

| Color | Role |
| --- | --- |
| `#49413F` | Warm dark gray-brown outline, eyes, beak and wing bands |
| `#65727F` | Slate-blue wing/tail shade and small beak detail |
| `#94A4B0` | Main soft blue-gray body |
| `#C3CDD0` | Light breast |
| `#71978B` | Muted green neck patch |
| `#8B7A98` | Muted purple neck patch |
| `#CF8A82` | Small coral feet |

Transparent pixels are `#00000000`. The final sheet uses only the listed opaque colors and transparent pixels.

Generation tool: built-in `image_gen` (no CLI/API fallback). Cleanup, palette enforcement, registration, measurements and preview: Python 3.12 / Pillow, with NumPy for validation. Original generation prompt:

```text
Use case: stylized-concept
Asset type: original production pixel-art sprite sheet for Pixel World, a cozy tiny RPG.
Primary request: a cute friendly round pigeon pet. Transparent RGBA background. EXACTLY FOUR COLUMNS and SIX ROWS, 24 evenly spaced square cells, no gutters or visible grid. Portrait aspect ratio 2:3. Logical sheet 128x192 pixels, each cell 32x32. If larger, each logical pixel is a crisp square block on this exact grid. Final will be cleaned at native 32px per cell.
Subject: softly rounded blue-gray pigeon, slightly slimmer than a round duck, body approximately 20-24 logical pixels wide, 18-22 pixels tall. Small head merging into a plump breast, tiny short dark beak pointing slightly left, simple dark bead eyes, two small muted green and purple neck patches, TWO dark bands on visible wing, tiny coral-pink feet, short tail. Always front-left THREE-QUARTER view, enough front of breast/face visible; no full profile. No accessories.
Style: native low-resolution pixel art. Bold continuous warm dark gray-brown outline, flat solid color clusters, only 2-3 blue-gray tones. Restrained palette: outline #49413F; deep wing shade #65727F; blue-gray body #94A4B0; light breast #C3CDD0; muted neck green #71978B; muted neck purple #8B7A98; coral feet #CF8A82. Friendly, cozy, understated saturation, simple and readable beside warm yellow ducks and brown bears.
Composition: identical body scale and center in every cell. Grounded feet bottom at local y=30, leaving row 31 transparent; neutral silhouette about x=4..27 y=10..30. Body/torso remains at SAME cell-local height in flight as in standing (belly around y=23..27, shoulder around y=18); DO NOT translate bird upward in flight. Code adds altitude. Fold feet beneath belly while flying; landing c2 partially lowers feet. Raised wings may reach y=2 but must fit within cell; maximum width x=1..30.
Rows from top to bottom, four frames each:
Row 0 idle: standing; gentle curious head tilt; standing identical to c0; blink.
Row 1 walk: left contact foot forward / passing / right contact foot forward / opposite passing, short pigeon steps and subtle head forward-back bob. Stable torso and at least one foot at y=30.
Row 2 peck: upright; head bending forward/down; beak touches ground to peck, body stays plump; recovering.
Row 3 rest: fluff breast and begin crouching; low comfortably resting body; identical resting pose with eyes shut; resting eyes open.
Row 4 takeoff and land: c0 crouch before jump; c1 wings strongly RAISED, tucked feet; c2 wings spread to brake and feet partially lowering in preparation to land; c3 landed feet at y=30 with wings still half folding.
Row 5 fly: four-frame loop wings UP / MIDDLE diagonal / DOWN / MIDDLE returning. Folded feet all four. Body and head remain at same height as neutral standing. Wings visibly change; flight torso must NOT float higher in the cell.
Constraints: one consistent complete pigeon per cell, all 24 cells occupied, grounded baseline y=30, flight torso registered to standing. Crisp square stepped edges. True transparent background, binary alpha. No antialiasing, gradients, dithering, feather texture, subpixel edges, shadows, environment, accessories, text, labels, watermarks, decorative marks, cell outlines or grid.
```

Review preview, intentionally excluded from the asset commit: `scratch/pigeon-preview.png` (1376×2176). It contains the complete sheet at **8× nearest-neighbor** scale, followed by a shared-contact-baseline comparison of the composited 32px front-facing person, duck, 32px dog, 32px pigeon and 48px bear, **all at the same 8× factor**. The person uses the default first frame/row of the existing body, eyes, bottoms, shoes, top and hair layers. The duck uses its existing runtime alpha crop and approximately 22×20 logical display size, rather than its 1254px source-sheet dimensions. The comparison's checkerboard, labels and baseline exist only in the preview.

Runtime integration belongs to the consuming worktree and is not part of this asset commit.

Runtime (`Pigeon.tsx`, `pigeonModel.ts`): drawn in a 2-wide × 3-tall cell box (the extra top cell is flight headroom) over the same 2-cell footprint as the duck. Mostly grounded — quick struts along the dog's collision-aware routes (300ms indoors / 210ms in the yard per step), head bob (idle c0/c1), peck and rest. Now and then (about 7% of decisions indoors, 20% in the yard; never twice in a row) it takes off in place (row 4 c0→c1), flies a straight, low arc to a free cell 2–3 (room) or 2–5 (yard) cells away over furniture (row 5 loop; altitude 7px plus a 3/5px arc, applied outside the sprite with a shrinking ground shadow), then lands (row 4 c2→c3). It only ever lands on cells the dog/duck could stand on, so doors, the carpet, the farm beds and the player stay clear; if the landing cell is taken mid-flight it glides to the nearest free one. Room and yard only, never the plaza; shares the one-active-companion `pixel_pet_equipment.active_pet` row (`pet_dog`, `pet_duck`, `pet_bear`, `pet_pigeon` or null).
