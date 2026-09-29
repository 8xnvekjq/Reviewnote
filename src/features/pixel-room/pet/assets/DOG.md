# 강아지 펫 sprite

`dog.png` is original artwork created for Reviewnote / Pixel World on 2026-09-30. It is newly drawn project artwork, not a downloaded third-party sprite or asset pack. It replaces the 2026-09-16 procedurally supersampled dog sheet, which had soft edges (186 alpha levels, 2,534 colors) beside the bear and pigeon. The new sheet keeps that dog's identity: warm tan and cream fur, peach cheeks, large simple eyes and a round chibi body. Existing project dog, duck, pigeon, bear and character artwork was inspected for style and scale; none is copied into the dog sheet.

192×192 RGBA transparent PNG, **six columns × six rows**, exactly **32×32 pixels per cell**. One stored pixel equals one logical pixel. Cell origin for column `c`, row `r` is `(32*c, 32*r)`; there are no gutters or variable crop bounds. Intended display footprint: **2×2 world cells**. All colors are flat, with no antialiasing, dithering, gradients or semitransparent pixels. Alpha is exclusively 0 or 255. No ground shadow is included. The geometry is identical to the previous sheet, so `Dog.tsx` needed no change.

The puppy has a large round head, small folded ears in the fur-shade color, a cream muzzle with a dark nose and `ω` mouth, 2×2 dark eyes, peach cheeks, a cream chest, short legs with cream paws and a round puff tail. It looks front-left in three-quarter view: the face sits left of the head's center and the body extends to the right. Consumers can mirror it horizontally for right-facing movement. There are no accessories, text or one-sided markings.

Rows and columns below are **zero-based**, read left to right. Unused cells are fully transparent.

| Row | Action | Frames | Playback (`Dog.tsx`) | Frames |
| --- | --- | --- | --- | --- |
| 0 | bark | 4 | 150ms/frame while barking | c0 brace, head dips 1px · c1 body leans 1px forward, mouth open, ears up · c2 head up 1px, wide open mouth with tongue · c3 upright, mouth closing |
| 1 | walk (indoor) | 6 | 90ms/frame loop | Diagonal pairs alternate (near-front + far-back vs far-front + near-back). Legs pivot at the hip and slant: the foot swings from 2px forward to 2px back, and lifts 1–2px on the return swing. The body bobs 1px up at c1/c4, the head dips 1px at the c0/c3 contact, and the tail sways |
| 2 | run (yard) | 6 | 90ms/frame loop | Bounding gait: slanted legs reach 3px forward and push 3px back; each pair tucks 3px off the ground in turn; far legs lag the near legs by one frame. The body rises 2px at full extension (c0/c5) and crouches at the gather (c2/c3, head 1px down). The ears flap |
| 3 | sit transition | 3 | ~450ms, once | c0 crouch (rear lowered 1px) · c1 seated, head still 1px high · c2 fully seated (= row 4 c0) |
| 4 | idle sit | 4 | 3800ms loop after the 450ms transition: c0 1200 · c1 1200 · c2 1200 · c3 200 | c0 seated · c1 inhale (head and ears 1px up) · c2 = c0 · c3 blink |
| 5 | idle stand | 4 | 3600ms loop: c0 1200 · c1 1200 · c2 1000 · c3 200 | **c0 neutral: shop preview frame (elapsed 0)** · c1 exhale (head 1px down, tail 1px down) · c2 tail sways left · c3 blink |

Repeated frames: r3c2, r4c0 and r4c2 are pixel-identical.

Revision 2026-09-30: after checking in the real app at 390px width (about 2 screen px per sprite pixel indoors, 1.4 in the yard), rows 1 and 2 were redrawn with a longer, slanted leg swing, higher foot lift and a larger run bob, because the first 1px leg shifts read as shuffling. Rows 0 and 3–5 are unchanged.

**Baseline:** in every one of the 27 frames, the lowest opaque pixel (paw or haunch outline) is at **cell-local y=30** (zero-based, inclusive). Row 31 and columns 0/31 stay transparent. At least one paw touches y=30 in every walk and run frame, and lifted paws end at y=27–29. The body's horizontal extent is x=3–27 in nearly every frame (center x=15, canvas center 15.5). Only the intended 1px lean, leg reach and tail sway change it.

Measured opaque bounds in cell-local **inclusive** coordinates (ears, tail, legs and outline included):

| Row | c0 | c1 | c2 | c3 | c4 | c5 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 bark | x3–27 y9–30 (25×22) | x2–26 y8–30 (25×23) | x2–26 y7–30 (25×24) | x3–27 y8–30 (25×23) | — | — |
| 1 walk | x3–27 y9–30 (25×22) | x3–27 y7–30 (25×24) | x3–27 y8–30 (25×23) | x3–26 y9–30 (24×22) | x3–26 y7–30 (24×24) | x3–26 y8–30 (24×23) |
| 2 run | x3–27 y6–30 (25×25) | x3–27 y7–30 (25×24) | x3–27 y9–30 (25×22) | x3–26 y9–30 (24×22) | x3–26 y7–30 (24×24) | x3–27 y5–30 (25×26) |
| 3 sit→ | x3–27 y8–30 (25×23) | x3–27 y9–30 (25×22) | x3–27 y10–30 (25×21) | — | — | — |
| 4 sit idle | x3–27 y10–30 (25×21) | x3–27 y9–30 (25×22) | x3–27 y10–30 (25×21) | x3–27 y10–30 (25×21) | — | — |
| 5 stand idle | x3–27 y8–30 (25×23) | x3–27 y9–30 (25×22) | x3–26 y8–30 (24×23) | x3–27 y8–30 (25×23) | — | — |

Neutral standing body: 25×23 px. Seated body: 25×21 px. The front-facing person is 16×28 px, so the dog is clearly smaller, in the same weight class as the duck and pigeon. Run c0/c5 reach 25–26px tall only at the top of the 2px leap.

Construction: no image-generation tool was available in the production session, so there is no generated concept sheet. The sprite was drawn directly on the native 32px grid with Python 3.12 / Pillow. Parts (head, folded ears, standing torso, seated torso, puff tail) are hand-authored pixel maps. Legs are 4px-wide outlined columns hung from a fixed hip. For walk and run they slant row by row in whole pixels toward the foot offset, so the stride reads as a swing, not a slide. Every frame is composed back to front: tail → far legs (shade) → torso → near legs → head → ears. There is no supersampling, resampling or palette quantization at any step. Face variants (blink, open mouth, wide bark mouth) are pixel edits on the head map.

Validation with Pillow / NumPy: 192×192 RGBA; alpha set exactly {0, 255}; six opaque colors plus transparent black (`#00000000`); nonempty cells per row [4, 6, 6, 3, 4, 4], with all remaining cells fully transparent; each frame is one four-connected silhouette with transparent cell borders; every frame bottoms out at y=30.

Native palette (opaque RGB hex). Outline, cream, cream shade and cheek are shared exactly with `bear.png`:

| Color | Role |
| --- | --- |
| `#5B3926` | Dark brown outline, eyes, nose, mouth (= bear) |
| `#B87A48` | Fur shade: ears, far legs, right flank, haunch |
| `#DDA266` | Main warm tan fur |
| `#E3B77E` | Cream shade: far paws, chest shadow (= bear) |
| `#F6D6A3` | Cream muzzle, chest, paws (= bear) |
| `#EAAA94` | Peach cheeks and tongue (= bear) |

Review preview, intentionally excluded from the asset commit: `scratch/dog-preview.png` (2424×2116). It shows the whole sheet at **8× nearest-neighbor** with row/column labels and y=30 guides. Below it, a shared-baseline lineup at the same 8× factor shows the composited 32px front-facing person, the duck (runtime alpha crop at ~22px logical width), pigeon, 48px bear, the **previous dog** (row 5 c0) and the new dog standing, sitting and walking.
