# Riding artwork

Original Pixel World artwork, 2026-10-18. Production pixels are drawn directly at
native resolution by `audit/build_ride_art.py`, using Pillow integer-coordinate
shapes and pixel edits. The built-in image generation tool supplied a pigeon
design concept; it was visually interpreted and redrawn, not shipped or resized
into a production sheet. Other sheets are original native-grid drawings.
Existing PNGs are palette/style references, not copied pet silhouettes.

## Shared geometry and playback

**All six sheets are 192 x 192 RGBA, four columns by four rows, 48 x 48 cells.**
No gutters. All coordinates below are zero-based cell-local pixel coordinates,
unless explicitly described as an avatar coordinate or displacement. One stored
pixel is one logical pixel. Alpha is exactly 0 or 255; transparent pixels are
transparent black. No smoothing, gradients, dithering, cast shadows or water tiles.

The layout matches the actual `bear_ride.png` slicing in `WorldScene.ts`:

| Row | c0 | c1 | c2 | c3 |
| --- | --- | --- | --- | --- |
| 0 | Left motion 0 | Left motion 1 | Left motion 2 | Left motion 3 |
| 1 | Front motion 0 | Front motion 1 | Front motion 2 | Front motion 3 |
| 2 | Back motion 0 | Back motion 1 | Back motion 2 | Back motion 3 |
| 3 | Left idle | Front idle | Back idle | Left idle duplicate |

Linear frame index: `row*4+column`. Motion loops 0,1,2,3,0 within the facing row.
The existing bear idle lookup is **12 + rideRow(facing)**, not the facing row's
c0. Row 3 c0/c1/c2 duplicate r0c0/r1c0/r2c0 exactly. Row 3 c3 duplicates r0c0.
For hovering pigeons or a stationary dog-carry running effect, loop the appropriate
motion row even when world position is stationary; the idle cells are available
for the existing code contract. Suggested rates appear below.

Right-facing uses **horizontal mirroring of row 0**, including the corresponding
foreground/effect frame. Mirror only the selected 48px cell, never the full atlas.
An anchor pixel `(x,y)` becomes `(47-x,y)`; a vector `(dx,dy)` becomes `(-dx,dy)`.
Use the student's Right avatar frame, keeping the student's appearance. Mirroring
the pet does not require mirroring a whole composed scene or another facing row.

## Anchor convention

The avatar frame is 32 x 32. Its foot reference is **(16,32)**, the boundary just
below its bottom pixel, not the alpha-bounds center. The preview uses existing
body/eyes/bottoms/shoes/top/hair layers, default bottom row 3, other rows 0,
with the same free-default garment palette recoloring as `avatarPixels.ts`.
It demonstrates a sample outfit, not a new shipped avatar texture.

An avatar origin listed below is its **top-left in pet-cell coordinates**. Add
the pet cell's world top-left to obtain a world position. All anchors stay fixed
for every motion column and the matching idle cell; do not recalculate by bbox.

### pigeon_ride.png

Large pigeon, approximately 38px wingspan versus the normal 23px-wide pigeon.
Gray torso, two wing bands, green/purple neck patches, goofy uneven eyes, coral
legs extending straight down. Columns: high upstroke, open passing stroke,
power downstroke, folded recovery. Suggested loop **9 fps** in motion or hover.
Only wings change shape; the two long legs and hand targets remain fixed.

| Facing row | Two grip pixels | Grip midpoint | Avatar origin | Avatar feet |
| --- | --- | --- | --- | --- |
| 0 Left | (21,40), (27,40) | (24,40) | (8,37) | (24,69) |
| 1 Front | (21,40), (27,40) | (24,40) | (8,37) | (24,69) |
| 2 Back | (21,40), (27,40) | (24,40) | (8,37) | (24,69) |

Raised avatar palms should be at **avatar-local (13,3) and (19,3)**, so they meet
the pigeon foot pixels exactly. The preview adds simple raised arms using the
sample avatar's skin color; these arms are **preview only**, not embedded in
the pet PNG. Runtime must supply an equivalent raised-arm pose from the student's
avatar. Draw bird, then hanging avatar/arms. The avatar extends below the 48px
pet cell intentionally; reserve about 70px vertical composite bounds.
For Right, mirrored grips are (20,40)/(26,40), midpoint (23,40); avatar origin
(7,37) places the same pair of local palms on those grips.

### duck_ride.png and duck_ride_front.png

Low, broad swimming duck, warm yellow, orange bill, two dark head feathers and
a slightly puzzled face. Four slow wing/flank paddles, **6 fps**. The body does
not translate and the seat stays fixed; motion is internal pixel movement.
No baked water or ground shadow. The head faces left/front/back as appropriate.

| Facing row | Seat / avatar hip | Avatar origin | Avatar feet |
| --- | --- | --- | --- |
| 0 Left | (26,27) | (10,2) | (26,34) |
| 1 Front | (26,27) | (10,2) | (26,34) |
| 2 Back | (26,27) | (10,2) | (26,34) |

Avatar hip reference is **avatar-local (16,25)**. Draw **wake, duck base, avatar,
duck foreground**, in that order. Both duck sheets use identical frame indices,
origins, mirroring and scales. The foreground contains only the near breast/flank
and, for Front, the duck's face/head ahead of the rider. It covers the avatar's
lower legs and keeps the Front duck face visible. The base is a complete duck;
the foreground is intentional overdraw of its near parts. Never independently
center/crop the foreground on its opaque bounds.
Right seat is (21,27), avatar origin (5,2), avatar feet (21,34).

### dog_carry.png

Small puppy in the student's arms, with dangling paws, folded ears that flop
through the loop, cream muzzle/chest and peach tongue. Left and Front show the
face; Back shows the nape and small tail, as viewed behind a chest-carried dog.
Columns have vertical bob **0,-1,0,+1 px**, plus alternate ear flop. **8 fps**.
Each facing has four distinct frames. Do not add another whole-sprite bob.

| Facing row | Sheet foot reference | Dog head center c0 | Relative to avatar feet | Avatar origin |
| --- | --- | --- | --- | --- |
| 0 Left | (24,46) | (24,33) | (0,-13) | (8,14) |
| 1 Front | (24,46) | (24,33) | (0,-13) | (8,14) |
| 2 Back | (24,46) | (24,33) | (0,-13) | (8,14) |

The whole puppy at c0 occupies x15..33, y29..44 (inclusive); bob/ear motion can
reach y27..45. This puts it in front of the chest below the avatar's eyes.
Draw avatar, swirl, puppy, then avatar hands embracing the puppy. Preview hands
are avatar-local x10..12 and x20..22, y23..25, and are not baked into the sheet.
Right sheet foot reference is (23,46), avatar origin (7,14), mirrored dog head
center (23,33). The head-center reference denotes a registration point, not a
required runtime node.

### swirl_legs.png

Two looping cartoon running whirls, cream spirals on flat blue trouser-colored
centers, warm outlines and peach rotating shoe tips. The dark centers are opaque
so the effect covers the leg region. Four quarter-turn phases, **12 fps**.

All three rows use **(24,46)** as the avatar feet reference and **(8,14)** as the
avatar origin. Thus the sheet origin is `avatarFeet + (-24,-46)`. Right mirrors
to reference (23,46), avatar origin (7,14). Row 0 is a narrower side-view pair;
Front/Back have a slightly wider paired silhouette. Visible bounds are roughly
x13..35, y37..46, or displacement x-11..+11, y-9..0 from avatar feet.

Measured source: `Clothing_Bottoms_Idle_Front-Sheet.png` row 3 occupies
x9..22/y25..29; default shoes occupy x10..21/y30..31 (inclusive). The body also
continues through y31. Therefore **mask avatar-local y>=25 before drawing the
swirl**, across body, trousers and shoes. In sheet coordinates these legs lie
y39..45. The whirls cover that region, with the mask preventing walking-shoe
corners or outfit-specific outlines from poking through. Do not mask the head
or upper torso. This instruction is for the integrating worker; no TS is edited.

### duck_wake.png

Small two-line V ripple, muted green and pale blue-gray, four expanding phases,
**6 fps**, synchronized with swimming movement. Rows point the V apex toward
the duck's travel direction: Left, Front/downscreen, Back/upscreen. The V opens
behind the duck. Each cell's apex/attachment is **(24,24)**.

| Facing row | Attach to duck-cell pixel | Wake top-left relative to duck top-left |
| --- | --- | --- |
| 0 Left | (42,33) | (18,9) |
| 1 Front | (24,23) | (0,-1) |
| 2 Back | (24,42) | (0,18) |

Right mirrors the duck-cell target to (5,33), wake anchor to (23,24), and offset
to (-18,9). Place behind all other layers. Show on water while moving; hide
when stationary or on land. Row 3 preserves the shared atlas idle convention
but need not be displayed for still water. No extra water tiles are required.

## Palettes, provenance, and verification

Pigeon uses exactly the existing seven opaque pigeon colors. Dog uses the six
existing dog colors. Duck uses six existing duck colors. Whirls use the existing
dog outline/cream/peach plus default avatar trouser blue #354A6C. Wake reuses
pigeon neck green #71978B and light gray #C3CDD0. Colors are flat fill clusters.

`audit/ride-art-preview.png` shows all six full sheets, all twelve movement cells
at 2x, the matching existing pet at 4x and Left/Front/Back avatar composites at
3x. All enlargement uses nearest neighbor. Preview arm/hand additions and leg
masking illustrate the required code composition without modifying TS sources.
The front-facing avatar is composed from real project layers, not a dummy box.

Reproduce with `python audit/build_ride_art.py` (Pillow). Validation writes
`audit/ride-art-validation.json`: exact dimensions/mode, binary alpha, all 96
nonempty cells, transparent cell borders, per-cell opaque bounds, distinct
movement frames and byte-equivalent idle registration. No browser suite is used.

Pigeon concept prompt (built-in imagegen, not CLI):

> Original pixel RPG sprite concept for a large goofy pigeon carrying a child
> (do not draw child). Transparent background. One pigeon flying left, wings
> flapping hard upward, two coral legs stretched straight vertically downward
> with feet available for a child to grip. Plump blue gray body, dark gray
> one-pixel outline, muted green and purple neck patches, dark wing bands,
> tiny confused eyes, short beak. Strict low resolution 48x48 logical pixel
> style with flat seven-color clusters, no antialiasing, gradients, shadow,
> environment or lettering. Whole bird contained in canvas. Concept will be
> redrawn on native production grid.
