# UI regression checks

Run `npm run dev -- --host 127.0.0.1`, then open `/tests/ui/`.
This fixture uses production components and synthetic problem data. It is not imported by the production entry and is excluded from the Vite production build.

The fixture intercepts external HTTP requests. The automated runners also block external requests and realtime sockets. They never authenticate, upload, equip items, or change actual student data. Use only the local fixture URL for these tests.

With an existing Playwright installation and Microsoft Edge available:

```powershell
# Optional: absolute path to an existing Playwright package.
$env:PLAYWRIGHT_PATH = 'path/to/node_modules/playwright'
# Optional: output screenshots to another folder.
$env:UI_OUTPUT = 'path/to/output'
node tests/ui/verify.mjs
node tests/ui/verify-interactions.mjs
npx tsc -p tests/ui/tsconfig.json --noEmit
```

The first runner checks 320×568, 375×667, 390×844, 430×932, 360×800, 800×1280 and 844×390: dock bounds, touch targets, detail overflow, O/X/★ (using a virtual clock for the existing 60-second cooldown), checklist unlocking, writing viewport, store, sheets, empty and loading states. It writes screenshots and `results.json`.

The second checks image-only zoom, a keyboard-sized viewport and long plan text, two independent writing windows, stroke preservation and undo, restored store subtab, account sheet and reduced motion.

These are Chromium component integration checks. Real iOS/Android standalone safe-area values, the system keyboard, stylus input, authenticated APIs, point deduction and image uploads still require device/account testing. The 390×420 test simulates available keyboard space; it does not open an OS keyboard.
