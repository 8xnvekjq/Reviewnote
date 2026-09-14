# Small plaza interactions

- Three fixed reactions: wave, cheer and rest. A bubble follows the avatar for 3.2 seconds; both sender and receiver apply a 4-second cooldown. No free text, nickname or account ID is broadcast. Unknown reaction kinds, malformed/expired payloads, unknown sessions and duplicate/out-of-order timestamps are ignored. Ephemeral state is bounded and cleared on expiry/departure.
- The existing Realtime channel has one additional `reaction` event. Movement sequence, presence and interpolation are unchanged. Disconnected clients cannot send reactions, and failed sends display feedback. This retains the existing client-broadcast trust model; it does not add server-authenticated sender identity or server rate limiting.
- At the central well, read a date-selected encouragement (14 authored messages rotate, Korea midnight boundary). First reading sends a brief sparkle when connected and outside reaction cooldown. Reading again does not send another sparkle. The activity also works alone/offline. There are no points, streaks or competitive rewards.
- Read state is a single day string per account in localStorage, deliberately device-local, with an in-memory fallback when storage is unavailable. It is not a server reward/attendance record. No database migrations.

Verification: 48 unit tests including payload allowlisting, date rollover and proximity; browser fixture checks two-way reactions, sender/receiver cooldown, expiry, well proximity, refresh persistence, storage failure and reconnect. Existing reconnect and leave/rejoin browser suites pass. TypeScript/build and changed-file oxlint pass. Browser fixtures replace transport and equipment service boundaries, not scene/hooks. Live two-account/device verification is not claimed.

Commands:
```
node --import ./tests/plaza/register-typescript.mjs --test tests/plaza/*.test.ts
node tests/plaza/interactions.browser.mjs
node tests/plaza/reconnect.browser.mjs
node tests/plaza/lifecycle.browser.mjs
npm run build
```
Browser suites require Vite at `http://127.0.0.1:5174` and installed Edge.

Protocol reference: https://supabase.com/docs/guides/realtime/broadcast
