# Private tomato farm v1

Two 2×2 beds at (11,4) and (11,7) in the front yard. The same footprints exclude both player and dog paths; the two-cell dog has routes on either side and between the beds. Touching a bed walks to its left edge before opening an in-world action bubble. Moving away, closing, or Escape dismisses it. No extra panel or realtime channel.

Planting is free. Each tomato takes 24 hours of server time: sprout → leaves at 6 hours → green fruit at 18 hours → ripe at 24 hours. Watering is free and recorded once per Korea calendar day while growing. Missing care never delays, kills or removes a crop. **In v1, care records do not change growth time or yield.** Harvest records one tomato, preserves its history, and frees the bed for another cycle. No points are awarded or deducted.

## Server contract

- `pixel_farm_plots`: two allowed indices, current crop reference, monotonically increasing revision.
- `pixel_farm_crops`: unique crop/cycle ID, owner, plot, tomato type, server planting/readiness/harvest timestamps, care count and last care date. Harvested cycles remain immutable through the public API.
- `pixel_farm_care`: timestamped daily watering events keyed by crop and KST day, retained after harvest.
- `get_pixel_farm()`: caller-only snapshot, server time, two plots and total harvest count.
- `act_pixel_farm(plot, action, revision)`: authenticates from `auth.uid()` (no caller-supplied user ID), locks the plot, checks its expected revision, and atomically applies one action. Stale or retried requests return `changed` plus the current snapshot. The revision survives harvesting/replanting, so an old action cannot affect a new crop. Read access is owner-only RLS; direct table writes and anonymous RPC access are revoked. The privileged implementation is in the non-exposed `pixel_private` schema behind an invoker API wrapper.

The client displays elapsed monotonic time from a server snapshot; device clock changes cannot accelerate growth. Reads refresh on entry, focus, visibility restoration and every 60 seconds while visible. The server revalidates every action. After an uncertain write response, UI asks to reload authoritative state, rather than optimistically changing the crop or blindly resending. UI selection, walking and animation remain local; no farm data is saved in localStorage.

## Later extensions

Care events and immutable crop IDs can support diligence scoring and a harvest exhibition. Future crop size/learning modifiers should be computed server-side and frozen on each harvested crop, with a rules version and the relevant learning-data snapshot. Do not infer historical learning activity from a current mutable total. No learning bonuses, random sizes or exhibition UI exist in v1.

## Verification

- `node --import ./tests/plaza/register-typescript.mjs --test tests/plaza/*.test.ts`
- Run `tests/pixel-room/farm-server.sql` as administrator: all verification writes/timestamp changes are enclosed in a rolled-back transaction.
- With Vite at port 5174: `node tests/pixel-room/farm.browser.mjs`, `node tests/pixel-room/yard.browser.mjs`, `node tests/pixel-room/dog.browser.mjs`.
- Browser tests use real rendering/hooks/Supabase client with intercepted REST; they are not real-account or physical-device tests. SQL verification covers actual database permissions and lifecycle rules independently.
