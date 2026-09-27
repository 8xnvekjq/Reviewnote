# 큰 둥근 곰 sprite

`bear.png` is original artwork created for Reviewnote / Pixel World on 2026-09-27. The design was generated with the built-in `image_gen` tool, then cleaned and registered on a native pixel grid with Python 3.12 / Pillow. It is newly generated project artwork, not a downloaded third-party sprite or asset pack. Existing project dog, duck, character and furniture artwork was inspected for style and scale; none is copied into the bear sheet.

192×192 RGBA transparent PNG, four columns × four rows, exactly 48×48 pixels per cell. One stored pixel equals one logical pixel. Cell origin for column `c`, row `r` is `(48*c, 48*r)`; there are no gutters or variable crop bounds. Intended display footprint: 3×3 world cells. All colors are flat, with no antialiasing, dithering, gradients or semitransparent pixels. Alpha is exclusively 0 or 255. No ground shadow is included.

The bear is broad and low, with warm brown fur, a cream muzzle and belly, tiny round ears, short limbs, simple eyes and muted peach cheeks. Its face looks slightly front-left; consumers can mirror horizontally for right-facing movement. There are no accessories, text, teeth or claws.

Rows and columns below are **zero-based**, read left to right.

| Row | Action | c0 | c1 | c2 | c3 |
| --- | --- | --- | --- | --- | --- |
| 0 | idle | Relaxed / exhale | Small inhale | Blink | Return to c0 |
| 1 | walk | Left foot forward | Passing stance | Right foot forward | Opposite passing stance |
| 2 | sit | Lowering into seat | Seated | Seated blink | Seated, eyes open |
| 3 | special | Paw starts lifting | Paw raised | Paw waves outward | Return to neutral |

Idle and walk loop through all four cells. Play sit c0 → c1 once, then hold/alternate c2 ↔ c3 for seated blinking; c1 and c3 share the same seated pose. Special is a **single short paw-wave**, played c0 → c1 → c2 → c3 once before returning to idle. Timing remains the consuming code's choice; a longer eyes-open hold avoids rapid blinking.

All grounded poses share the bottom opaque foot pixel at **cell-local y=46** (zero-based, inclusive). Row 47 stays transparent. The canvas center is x=23.5; breathing and waddling are limited, intentional pixel changes. Seated frames lower the body while preserving ground contact.

Measured opaque body bounds, in cell-local **inclusive** coordinates (ears, limbs and outline included):

| Poses | x range | y range | Width × height |
| --- | --- | --- | --- |
| Idle c0/c2/c3; all walk and special cells | 4–43 | 8–46 | 40×39 px |
| Idle c1, inhale | 3–44 | 8–46 | 42×39 px |
| Sit c0, lowering | 4–43 | 10–46 | 40×37 px |
| Sit c1/c2/c3, seated | 4–43 | 12–46 | 40×35 px |

The 35px seated height is an intentional lowering from the 39px standing body. Every pose's horizontal bounds center stays at x=23.5. During walking, one contact foot remains on y=46 while the opposite foot briefly lifts.

Native cleanup: the generated 1254×1254 concept sheet was cropped by alpha bounds, sampled with nearest-neighbor resizing, mapped without dithering to the seven-color palette below, and thresholded to binary alpha. Facial features and outlines were cleaned directly on the 48px grid. Idle, walk and wave reuse one registered neutral body; feet and the same near forepaw were adjusted in integer pixels. Seated blinking changes only the eyes. Idle c3 and special c3 are pixel-identical to idle c0; sit c1 and c3 are pixel-identical. No sampled high-resolution edges remain.

Validation: all 16 cells are nonempty, contained within their cell, have one connected opaque silhouette and share the y=46 foot baseline. The PNG is RGBA, exactly 192×192, with seven opaque colors plus transparent black. An 8× visual review confirmed the sheet and relative character/pet scale. Runtime integration belongs to the consuming worktree and is not part of this asset commit.

Native palette (opaque RGB hex):

| Color | Role |
| --- | --- |
| `#5B3926` | Dark brown outline, eyes, nose |
| `#95623F` | Fur shade |
| `#B98555` | Main warm brown fur |
| `#D3A16B` | Fur light |
| `#E3B77E` | Cream shade |
| `#F6D6A3` | Cream muzzle and belly |
| `#EAAA94` | Soft peach cheek / paw detail |

Transparent pixels are `#00000000`. The final sheet uses only the listed opaque colors and transparent pixels.

Generation tool: built-in `image_gen` (no CLI/API fallback). Original generation prompt:

```text
Use case: stylized-concept
Asset type: original production pixel-art sprite sheet for Pixel World, a cozy tiny RPG.
Primary request: a big gentle round brown bear pet, a new original character. Full transparent RGBA background. EXACTLY 4 columns by 4 rows of 16 evenly sized cells, no gutters or grid. Logical sheet 192x192, each cell 48x48. If generated larger, treat each logical pixel as a large crisp square block on this exact grid. Final will be cleaned at native 48px per cell.
Subject: warm muted brown fur, large plump belly with cream patch, cream muzzle, SMALL round ears, short thick legs and arms, tiny simple dark eyes, small dusty peach blush cheeks. Very gentle, cute and weighty. Slight front-left three-quarter view in EVERY cell: muzzle and features subtly left of body center, visible right flank. Low center of gravity, broad about 40 logical pixels, 36-40 logical pixels tall. Not a tall human-shaped teddy.
Style: genuine low-resolution pixel art, bold continuous 1-2 logical pixel dark warm brown outlines, solid flat color clusters, no more than 3 fur tones. Palette outline #5B3926, fur #B98555, light fur #D3A16B, shadow #95623F, cream #F6D6A3, shaded cream #E3B77E, blush #EAAA94. Match cozy tan/cream puppy pet and simple furniture art; subdued saturation.
Composition: one complete whole bear per cell, consistent body scale and horizontal center x=24. Bottom of contacting feet must be logical y=46 in ALL 16 cells, leaving one transparent row. Neutral opaque bounds around x=4..43 y=8..46. No ground shadows, no cast shadows, no environment, no floating marks.
Rows, from top to bottom, 4 frames each:
Row 0 idle: neutral; very slight inhale expanding belly by 1px; blink with tiny horizontal closed eyes; return EXACTLY to neutral pose.
Row 1 walk: short left foot forward and right foot slightly lifted; passing stance; right foot forward and left slightly lifted; opposite passing stance. Small waddling body tilt only, feet grounded and torso center stable.
Row 2 sit: midway lowering; fully sitting with short feet forward and broad low rump; IDENTICAL seated pose but blinking; same seated pose eyes open. Sitting baseline stays y=46, torso lowers naturally.
Row 3 special, one short paw-wave: neutral with near forepaw starting to lift; near forepaw raised beside cheek; raised forepaw sways outward by a few pixels; forepaw lowers back to neutral. The other arm and grounded feet stay stable.
Constraints: crisp square stepped edges, binary transparency, no antialiasing, no gradient, no texture/noise, no fur strands, no pseudo-small pixels, no text, numbers, labels, decorative symbols, accessories, asymmetrical props, claws, teeth, angry brows, outlines around cells, background or shadow. Every bear separated and contained in its own cell. Keep a large coherent belly, tiny friendly face, brown fur and cream areas with consistent design in all 16 cells.
```

Review preview, intentionally excluded from the asset commit: `scratch/bear-preview.png`. It contains the whole sheet at 8× nearest-neighbor scale and a shared-baseline comparison with a composited front-facing character frame, the dog, the duck at its existing 32px logical display size, and the 48px bear, all enlarged by the same factor.
