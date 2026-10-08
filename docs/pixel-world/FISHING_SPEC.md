# FISHING SPEC — "강가의 하루" vertical slice (shared contract for all workers)

The teacher approved this on 2026-10-08. Every worker builds against this contract. Do **not** change names or shapes defined here; if you need something extra, add it in your own files and list it in your report.

The game lives in `src/features/pixel-world-phaser/` (Phaser 4 + React HUD), which is now live for all students. Read `logic/scenes.ts`, `game/WorldScene.ts`, `game/YardScene.ts`, `ui/GamePanels.tsx` (`Window`) and `ui/FarmPanels.tsx` (the adapter pattern) first.

## Teacher decisions
- **Art:** only draw what's new (river, fish, turtle, effects) in the existing 16px-tile pixel style. Do not redraw existing characters or scenes.
- **Pets have small perks**, flavour-sized, never points.
- **Night-only fish exist.**
- **No "first discoverer".** Show each catch's **length** (with a "큰 놈!" notice for big ones and "내 기록!" for a personal best) and its **rarity**.
- **Students are anonymous.** Never show a student name. The class board uses anonymous animal faces only, via the existing hash rule used for exam peer solvers. Grep for it, and keep it consistent with the plaza.
- **No points from fishing** and no second currency. Fishing never touches `profiles.point_adjustment` or `bonus_points`.

## World clock (KST)
- Phases by Asia/Seoul local hour: `morning` 06–11, `day` 11–17, `evening` 17–20, `night` 20–06.
- Weather is one value per KST date, from a deterministic hash of the date string `YYYY-MM-DD`: `rain` 25%, `cloudy` 25%, `clear` 50%. The **server is authoritative**. The client uses the server-returned weather/phase, and has a pure TS twin only for visuals before the first response.
- **Admin override** (testing): an admin-only clock and weather override. Client query params `?pwClock=21:30&pwWeather=rain` are honoured **only for admins**, and the server RPCs accept `p_override_clock`/`p_override_weather` only when the caller is admin (check how existing admin RPCs verify admin).

## Fish catalog (12)
`id | 이름 | rarity | phases | weather | length cm (min–max) | shadow`

| id | 이름 | rarity | phases | weather | cm | shadow |
|---|---|---|---|---|---|---|
| `pirami` | 피라미 | common | any | any | 6–12 | S |
| `buri` | 붕어 | common | any | any | 10–25 | M |
| `minnow` | 송사리 | common | morning, day | any | 2–4 | S |
| `catfish_small` | 동자개 | uncommon | evening, night | any | 12–25 | M |
| `carp` | 잉어 | uncommon | any | any | 30–70 | L |
| `mandarin` | 쏘가리 | uncommon | day, evening | clear, cloudy | 20–45 | M |
| `eel` | 뱀장어 | rare | night | any | 40–90 | L |
| `catfish` | 메기 | rare | evening, night | rain | 30–80 | L |
| `goby` | 꺽지 | uncommon | morning, day | any | 10–20 | S |
| `trout` | 산천어 | rare | morning | clear | 20–35 | M |
| `moonfish` | 달빛 피라미 | legendary | night | clear | 8–14 | S |
| `rainbow_koi` | 무지개 잉어 | legendary | any | rain | 40–80 | L |

- Rarity weights when rolling among fish valid for the current phase and weather: common 60, uncommon 28, rare 10, legendary 2.
- Night-only: `eel`, `moonfish`. Rain-only: `catfish`, `rainbow_koi`.
- "큰 놈!" means length ≥ min + 0.8·(max−min). Lengths are rolled server-side, uniform, 1 decimal.
- The catalog lives in **one** SQL seed (server roll) **and** one TS mirror, `logic/fishCatalog.ts`, for UI. A unit test must assert they match by parsing the migration file.

## Daily budget, shadows, pity
- Each student gets **6 catches per KST day** (successful landings). Misses and early taps are free retries and don't use the budget.
- The river shows up to 3 shadows at a time. A shadow's size (S/M/L) is decided when the cast starts (server), so the visible shadows are cosmetic placeholders that hint at size. Keep it simple: the client shows 3 shadows; tapping one calls `start_pixel_cast`, which rolls the fish and returns its shadow size; the client may resize the shadow to match.
- **Pity:** if the student's last 5 landed catches had no new species and an uncaught species is valid now, the server forces one uncaught valid species (weighted by rarity).
- When the budget is used up: the turtle says "오늘은 물고기들이 쉬고 있어요. 내일 또 와요!" and no shadows are shown.

## Pet perks (owned active pet only; the free loan partner has none)
- `pet_dog`: one visible shadow sparkles if a rare+ fish is likely. Server: `start_pixel_cast` returns `hint: 'sparkle'` when the rolled fish is rare+. Client sparkle is cosmetic before the tap: use `get_pixel_fishing_state.sparkleShadow` (index 0–2 or null), which is rolled with the day seed.
- `pet_duck`: bite tap window +200 ms (client).
- `pet_pigeon`: once per day, the turtle panel shows a hint for one uncaught species: "밤에 맑으면 …". Server field `pigeonHint`.
- `pet_bear`: +8% rolled length (server; still capped at max·1.08).
- No pet: a free loan partner ("빌린 오리"), same animation as duck, **no perk**.

## Server API (Supabase, Postgres RPC, SECURITY DEFINER, `auth.uid()` scoped, RLS on)
**Tables** (names fixed):
- `pixel_fish_species` (catalog seed)
- `pixel_fish_catches` (one row per landed catch: `id`, `user_id`, `species_id`, `length_cm`, `caught_at`, `kst_date`, `phase`, `weather`, `pet`)
- `pixel_fish_casts` (pending cast tokens: `id`, `user_id`, `species_id`, `length_cm`, `created_at`, `expires_at`; consumed on finish)

**RPCs** (names and return JSON shapes fixed):
- `get_pixel_fishing_state(p_override_clock text default null, p_override_weather text default null)` →
  `{ kstDate, phase, weather, remaining, sparkleShadow: number|null, pigeonHint: string|null, album: [{ speciesId, count, bestCm, firstAt }] }`
- `start_pixel_cast(p_pet text, p_override_clock text default null, p_override_weather text default null)` →
  - `{ ok: true, castId, shadow: 'S'|'M'|'L', biteDelayMs, pattern: 'quick'|'double'|'long', hint: 'sparkle'|null }`
  - or `{ ok: false, reason: 'budget'|'pending'|'error' }`
  - The fish identity is NOT revealed.
  - A pending cast expires after 90 s, and at most one is pending per user.
  - `p_pet` must be validated against `pixel_pet_equipment.active_pet` owned by the user; otherwise it is treated as no pet.
- `finish_pixel_cast(p_cast_id uuid, p_landed boolean)` →
  - landed: `{ ok: true, landed: true, speciesId, lengthCm, rarity, isNew, isBig, isPersonalBest, remaining }`
  - not landed: `{ ok: true, landed: false }`; the cast is deleted, budget unchanged, and the client may start a new cast.
- `get_class_fish_board()` → the top 10 of this KST week by `length_cm`, one row per species max: `[{ speciesId, lengthCm, animal: string (anonymous face key), caughtAt }]`, plus `classSpecies: number` (distinct species caught by anyone).
  - It never returns `user_id` or names.
  - Use the existing class/cohort scoping the farm contest uses (`get_weekly_crop_contest`).

**Migration file:** `supabase/migrations/supabase_pixel_fishing.sql`, following the existing style.
- The coordinator applies it to production. Workers must NOT touch the DB.
- Include RLS (users can read only their own catches; no direct inserts) and grants.

## Client adapter (fixed interface; `ui/fishingAdapter.ts` exports the type)
```ts
export type FishPhase = 'morning' | 'day' | 'evening' | 'night';
export type FishWeather = 'clear' | 'cloudy' | 'rain';
export interface FishingState { kstDate: string; phase: FishPhase; weather: FishWeather; remaining: number; sparkleShadow: number | null; pigeonHint: string | null; album: { speciesId: string; count: number; bestCm: number; firstAt: string }[] }
export type CastStart = { ok: true; castId: string; shadow: 'S' | 'M' | 'L'; biteDelayMs: number; pattern: 'quick' | 'double' | 'long'; hint: 'sparkle' | null } | { ok: false; reason: 'budget' | 'pending' | 'error' };
export type CastFinish = { ok: true; landed: true; speciesId: string; lengthCm: number; rarity: 'common' | 'uncommon' | 'rare' | 'legendary'; isNew: boolean; isBig: boolean; isPersonalBest: boolean; remaining: number } | { ok: true; landed: false } | { ok: false };
export interface ClassFishBoard { rows: { speciesId: string; lengthCm: number; animal: string; caughtAt: string }[]; classSpecies: number }
export interface FishingAdapter { state(): Promise<FishingState>; start(pet: string | null): Promise<CastStart>; finish(castId: string, landed: boolean): Promise<CastFinish>; board(): Promise<ClassFishBoard> }
```
- `createFishingAdapter(supabase, override?)` lives in `ui/fishingAdapter.ts`.
- `createMockFishingAdapter()` lives in `ui/fishingAdapterMock.ts`; the harness and tests use it.

## Scene contract (river)
- New `SceneId` `'river'`, title "강가".
- Reached from the **yard's east edge** (exit `yard→river`, entry `fromYard`); its west exit returns to the yard (entry `fromRiver`).
- Spec function `riverScene()` in `logic/riverWorld.ts`. Phaser class `game/RiverScene.ts` extends `WorldScene`.
- Layout: bank on the west/centre, river band on the east (not walkable), a small dock, the turtle curator NPC `turtle` (interactable, opens the album panel), a signboard `fishboard` (opens the class board panel).
- `RiverScene` exposes, via the `WorldGameHandle` / ctx hooks pattern already used:
  - `setShadows(shadows: { index: 0|1|2; size: 'S'|'M'|'L'; sparkle: boolean }[] )`: shows or hides fish shadows gliding inside the water.
  - Hook `onShadowTap(index)`: fires when the student taps a shadow (or presses A while facing the water near one).
  - `fishingFx`: a `game/fishingFx.ts` module owned by the minigame worker, which receives the scene and anchors from `RiverScene`: `{ castFrom: Point (rod tip near player), shadowPoint(index): Point }`.
- **World tint:** a day/night/weather overlay for all outdoor scenes (yard, plaza, river). Evening is a warm tint, night a dark blue tint with a soft light circle around the player, rain adds light rain particles. It's driven by `FishingState.phase/weather`, falling back to the pure clock twin. It must never block input and must stay cheap at 30 fps on tablets.

## Assets (art worker; filenames fixed, under `src/features/pixel-world-phaser/assets/fishing/`)
- `river-tiles.png`: 16px tiles in a row: water0, water1, water2 (3-frame shimmer), bank-edge-top, bank-edge-bottom, dock-plank, reeds, lily-pad, stone.
- `fish-icons.png`: 16×16 cells, 12 in catalog order.
- `fish-shadow.png`: S/M/L shadows, 16×8, 24×12 and 32×14 cells in one row, semi-transparent dark.
- `bobber.png`: 8×8 cells: idle, dip, plunk.
- `splash.png`: 16×16 cells, 4 frames.
- `turtle.png`: 32×32 cells, row 0 idle (4 frames), row 1 talk (2 frames). Glasses, a small scarf, friendly.
- `rain.png`: 1×4 drop, plus a 4×1 ground ripple.
- `sparkle.png`: 8×8, 3 frames.
- Every PNG uses binary alpha, crisp pixels, the existing palette feel, and no antialiasing. Include `assets/fishing/ART.md` describing each sheet.
- Non-art workers must tolerate missing files: draw placeholder rectangles when a texture is missing.

## UI (React, reuse `Window` from `ui/GamePanels.tsx`; B/Escape/shade-tap close already works)
- **Catch card:** a small, non-blocking toast or card.
  - It shows the fish icon, "피라미 잡았다!", the length "23.4cm", and rarity stars (common ★, uncommon ★★, rare ★★★, legendary ★★★★ in gold).
  - It adds badges as they apply: "새 친구!", "큰 놈!", "내 기록!".
  - "오늘 남은 낚시 n번".
- **Album panel** (turtle):
  - a 12-slot grid; caught slots show icon, name, count and best cm;
  - uncaught slots show a silhouette and a hint built from the phases/weather ("밤 · 맑음");
  - shows the pigeon hint line when present, and the class progress "우리 반이 찾은 물고기 n/12".
- **Class board panel** (signboard): this week's biggest fish, with an anonymous animal face per row.

## Minigame feel
1. Tap a shadow; the character turns to the water; cast animation, then the bobber lands on the shadow.
2. Fake nibbles:
   - `quick`: none;
   - `double`: 2 small twitches 400–700 ms apart;
   - `long`: 1 twitch, then a longer wait.
3. Then the real bite at `biteDelayMs`: plunk, splash, a "!" above the head, and a short vibration if `navigator.vibrate` exists.
4. Tap windows:
   - real bite: tap within **900 ms** (+200 with the duck) → landed;
   - a tap during a twitch or before the bite → "너무 빨랐어!", the fish swims off, and the shadow stays for a free retry;
   - no tap in time → "놓쳤다…", free retry.
5. A tap anywhere on the game surface, or the A button, counts as the "reel" tap during fishing. Movement is frozen while fishing; B cancels the cast.
6. The first catch of a brand-new student is guaranteed to land: double the window for their first ever cast.

## Testing rules (all workers)
- `node --import ./tests/plaza/register-typescript.mjs --test tests/pixel-world-phaser/*.test.ts` and `npx tsc -p tsconfig.app.json --tsBuildInfoFile .worker-app.tsbuildinfo --incremental` (delete the cache after).
- **Browser:**
  - Browser tests may run only on your own vite port (given in your brief): `npx vite --port <port> --host 127.0.0.1 --strictPort --configLoader runner`, with `cacheDir` inside the worktree if EPERM.
  - Stop only your vite.
  - **Headless only. Never open a visible browser window or an Orca browser tab, and close every browser you start.**
- Korean UI strings and comments; reports in English. No `package.json` version bump.
