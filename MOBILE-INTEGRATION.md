# Mobile integration — Localities

This folder contains your existing app plus a complete **mobile experience** as
a parallel route. The desktop (`index.html`) is untouched.

## New files

```
mobile.html              # Mobile entry point — bottom sheet + map-first layout
src/mobile-app.js        # Mobile orchestrator (replaces index.js for /mobile.html)
src/mobile-ui.js         # Mobile rendering (replaces ui-manager.js for /mobile.html)
src/mobile-redirect.js   # Auto-redirect mobile UAs from index.html → mobile.html
```

The mobile app **reuses unchanged**:
- `api-service.js`, `diff-utils.js`, `environment_select.js`,
  `endpoint_select.js`, `map-manager.js`, `config.js`, `countries.js`,
  `languages.js`, `utils.js`

## How to integrate into your repo

1. Copy the four new files into your repo at the same paths.
2. Add **one line** at the very end of `index.html`, just before `</body>`:

   ```html
   <script src="src/mobile-redirect.js"></script>
   ```

   That's it. Desktop visitors land on `index.html` as before. Mobile
   visitors (narrow viewport + touch pointer) are sent to `mobile.html`,
   preserving query string and hash.

3. (Optional) If you don't want the redirect, just omit step 2. Users can still
   reach the mobile UI at `/mobile.html` directly, or use `?nomobile` to opt
   out from the redirect.

## How it works

`mobile.html` carries hidden mirrors of the desktop's `<select id="env-select">`,
`compare-select`, `endpoint-select`, `language-select`, plus the
`#error-modal` and a few other compatibility shims so the existing modules keep
working without any changes — they read these elements as they always did.

The mobile UI then sits on top and writes to those shims when the user picks an
environment, endpoint, or language. State lives in `mobile-app.js`.

## Run locally

Same as the desktop — from the project root:

```bash
npx serve
```

Then open:
- Desktop: `http://localhost:3000/`
- Mobile: `http://localhost:3000/mobile.html` (or use DevTools' mobile emulation
  on `/` to trigger the auto-redirect)

## Feature parity

Implemented in the mobile version:

- ✅ Autocomplete / Search / Geocode endpoints
- ✅ Environment switcher (dev / prod / PR — PR uses the same prompt flow)
- ✅ Compare with another environment
- ✅ Compare-aware results list (DEV only / PROD only / reranked badges)
- ✅ Detail view (single env)
- ✅ Detail view with diff treatment (segmented control, diff rows, double markers, copy diff)
- ✅ Filters: types, excluded types, country restrictions, switches, language,
  custom description
- ✅ Map click → reverse geocode
- ✅ "Locate me" FAB
- ✅ Error modal

Not ported (desktop-only):
- Selectize multi-selects (replaced by native iOS-style pill toggles + bottom sheet)
- Inline result diff banner under the search bar (replaced by the in-sheet
  diff banner)

## Customization

- Color tokens are inline in `mobile-ui.js` (`ENV_COLORS`) and `mobile.html`
  (`#00B0FF` for the brand accent).
- Bottom sheet height: `max-height: 62%` on `#bottom-sheet` (change in
  `mobile.html`).
- Breakpoint: `(max-width: 768px) AND (pointer: coarse)` in
  `mobile-redirect.js`.
