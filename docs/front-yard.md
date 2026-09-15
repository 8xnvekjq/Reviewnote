# Private front yard

Room → front yard → plaza replaces the direct room/plaza link. The existing room carpet, yard doormat, dirt path and southern plaza sign form one continuous route. A red-roof house sits in the upper left; the right-hand lawn between fence segments is reserved for a future small garden. No farming, pet or new asset download is included: this scene reuses the licensed Kenney Tiny Town atlas and existing doormat.

The yard is local presentation state only. It receives the server-backed avatar appearance from PixelRoom and has no realtime hook or persistence. PixelRoom retains the existing fade/transition lock; Plaza remains the only scene that mounts realtime. The yard remembers whether it was entered from the room or plaza to select the arrival coordinate/direction.

- Room door → yard (6,7), facing down; yard house door at (6,6).
- Plaza entrance → yard (6,10), facing up; yard plaza exit at (6,11).
- Yard → room uses existing (4,6) arrival and (4,7) doorway.
- Yard → plaza uses existing (8,10) arrival and (8,11) entrance.
- Exit cells terminate routes, so a path to another part of the yard cannot walk through an exit accidentally.

Validation: `node --import ./tests/plaza/register-typescript.mjs --test tests/plaza/*.test.ts`, `npm run build`, changed-file oxlint. With Vite at 127.0.0.1:5174, run `node tests/pixel-room/yard.browser.mjs` plus existing plaza reconnect/lifecycle browser tests. The yard fixture renders the actual PixelRoom at 390×700 and 1440×1000, exercises three complete round trips per viewport, verifies safe arrivals, no private-scene realtime, and stable plaza session identity. Service boundaries are mocked; physical devices/live accounts are not claimed.

The presence test fixtures now include `skin:null` to match the appearance contract introduced before this change (PR #88).
