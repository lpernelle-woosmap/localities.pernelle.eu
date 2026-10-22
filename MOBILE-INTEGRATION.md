# Mobile — Localities testing tool

`mobile.html` is the phone experience of the tool, served next to the desktop
`index.html`. Mobile visitors (narrow viewport + touch) are redirected there by
`src/mobile-redirect.js`; add `?nomobile` to stay on the desktop page.

## Files

```
mobile.html              # Map + bottom sheet + full-screen pages + compact sheets
src/mobile-app.js        # Orchestrator: state, search / details / compare, request URL replay, pickers
src/mobile-ui.js         # Rendering: chips, merged result lists, detail, DEV/PROD/Compare tabs, diff
src/mobile-sheet.js      # Bottom sheet snap points (peek / half / full), drag, map area, keyboard
src/mobile-filters.js    # Filters page (types, countries, options, language, custom description)
src/mobile-redirect.js   # index.html → mobile.html redirect for mobile UAs
```

Shared with the desktop, unchanged: `api-service.js`, `map-manager.js`,
`diff-utils.js`, `environment_select.js`, `endpoint_select.js`,
`request-url.js`, `countries.js`, `languages.js`, `config.js`, `utils.js`.

## Layout

- **Map first.** The sheet starts in `peek` (search bar only). It goes to
  `half` when the input is focused or results/details arrive, and the user can
  drag the handle to `full` to read a diff. The map container stops above the
  sheet, so markers and polygons are always centered in the visible area
  (`refocusMap` redraws the last location after each snap).
- **Filters never compete with the map:** they open as a full-screen page
  (`#filter-page`), as do the country and language pickers. Environments,
  endpoint and Request URL are compact bottom sheets over an overlay.
- The glass header (env / compare, endpoint, Request URL) stays reachable in
  every state; the "locate me" button hides when the sheet is full.
- The hidden `<select>` mirrors (`env-select`, `compare-select`,
  `endpoint-select`, `language-select`) are written by `mobile-app.js` so the
  shared modules keep reading the DOM as on desktop.

## Feature parity with the desktop

- Autocomplete / search / geocode endpoints, target + compare environments
  (dev / prod / PR deploy with a single prompt), comparison skipped when both
  point to the same stack.
- Results merged by `public_id` with rank badges (`DEV only`, `PROD only`,
  `#1 → #3`), compare-side error banner.
- Detail: single env, "Identical on PROD" badge, compare error banner, or diff
  view with DEV / PROD / Compare tabs, geometry and address components diff,
  sub-addresses list, copy public_id / coordinates / diff.
- Back to the previous result list from a detail.
- Filters: types (+ custom), excluded types, countries (UK bundle), language,
  extended postal codes, geographical bias, `fields=geometry`, `fields=shape`
  (boundary polygon on the map), custom description.
- Coordinates typed in the search input → "Reverse geocode" suggestion (target
  + compare); map tap → reverse geocode; "no result" notice.
- Request URL: copy the last target request (key masked) or paste a Localities
  URL and replay it with the app keys.
- Error modal for failing target requests; `?language=` query param honored.

## Run locally

Any static server from the project root (ES modules need `http://`), e.g.
`npx serve`, then open `http://localhost:3000/mobile.html`. Use the browser's
device emulation or a phone on the same network.

## Tuning

- Snap ratio of the `half` state: `HALF_RATIO` in `src/mobile-sheet.js`.
- Colors: `ENV_COLORS` in `src/mobile-ui.js`, brand accent `#00B0FF` in
  `mobile.html`.
- Redirect breakpoint: `(max-width: 768px) and (pointer: coarse)` in
  `src/mobile-redirect.js`.
