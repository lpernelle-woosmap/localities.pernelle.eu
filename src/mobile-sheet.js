// mobile-sheet.js — Bottom sheet with snap points (peek / half / full).
// The map container only covers the area above the sheet, so markers and
// viewports are always centered in the visible part of the map. The glass
// header stays reachable in every state; map-only controls hide when full.

const SNAPS = ["peek", "half", "full"];
const HALF_RATIO = 0.55;
const SETTLE_DELAY = 300; // ms, matches the CSS height transition

let sheet = null;
let grip = null;
let mapEl = null;
let topBar = null;
let current = "peek";
let onSnapChange = null;
let drag = null;

/**
 * Wires the bottom sheet drag handle and applies the initial snap
 * @param {{ onSnap: (snap: string) => void }} options - Called once the sheet settled on a snap
 */
export function initSheet({ onSnap }) {
  sheet = document.getElementById("bottom-sheet");
  grip = document.getElementById("sheet-grip");
  mapEl = document.getElementById("map");
  topBar = document.getElementById("top-bar");
  onSnapChange = onSnap;

  grip.addEventListener("pointerdown", startDrag);
  grip.addEventListener("pointermove", moveDrag);
  grip.addEventListener("pointerup", endDrag);
  grip.addEventListener("pointercancel", endDrag);
  window.addEventListener("resize", () => applySnap(current, false));
  // On-screen keyboard: the visual viewport shrinks while the layout viewport does not
  window.visualViewport?.addEventListener("resize", () => applySnap(current, false));
  window.visualViewport?.addEventListener("scroll", () => applySnap(current, false));
  applySnap("peek", false);
}

/**
 * Returns the current snap name
 * @returns {string} "peek" | "half" | "full"
 */
export function getSnap() {
  return current;
}

/**
 * Moves the sheet to a snap point
 * @param {string} snap - "peek" | "half" | "full"
 */
export function setSheet(snap) {
  if (SNAPS.includes(snap)) applySnap(snap, true);
}

/**
 * Re-applies the current snap without animation (after the sheet header changed height)
 */
export function relayoutSheet() {
  applySnap(current, false);
}

/**
 * Expands the sheet to at least the given snap (never collapses it)
 * @param {string} snap - Minimum snap wanted
 */
export function ensureSheet(snap) {
  if (SNAPS.indexOf(snap) > SNAPS.indexOf(current)) setSheet(snap);
}

/**
 * Computes the pixel height of each snap point for the current viewport
 * @returns {{peek: number, half: number, full: number}}
 */
function snapHeights() {
  const viewport = window.visualViewport?.height ?? window.innerHeight;
  const header = document.getElementById("sheet-header");
  const peek = grip.offsetHeight + header.offsetHeight + 8;
  const topBarBottom = topBar ? topBar.getBoundingClientRect().bottom + 8 : 0;
  return { peek, half: Math.round(viewport * HALF_RATIO), full: Math.round(viewport - topBarBottom) };
}

/**
 * Space hidden below the visual viewport (on-screen keyboard), in px
 * @returns {number}
 */
function viewportInset() {
  const vv = window.visualViewport;
  return vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
}

/**
 * Applies a snap: sizes the sheet, the map area and map-only controls
 * @param {string} snap - Snap name
 * @param {boolean} animate - Whether to animate the height change
 */
function applySnap(snap, animate) {
  const heights = snapHeights();
  const changed = snap !== current;
  current = snap;

  const inset = viewportInset();
  sheet.style.transition = animate ? "" : "none";
  sheet.style.height = `${heights[snap]}px`;
  sheet.style.bottom = `${inset}px`;
  // Keep the map at its "half" size when the sheet is full, so it never collapses to 0px
  mapEl.style.bottom = `${inset + (snap === "full" ? heights.half : heights[snap])}px`;
  document.querySelectorAll("[data-map-only]").forEach(el => el.classList.toggle("hidden", snap === "full"));

  if (changed && onSnapChange) setTimeout(() => onSnapChange(snap), animate ? SETTLE_DELAY : 0);
}

function startDrag(event) {
  drag = { startY: event.clientY, startHeight: sheet.getBoundingClientRect().height, lastY: event.clientY, lastTime: performance.now(), velocity: 0 };
  grip.setPointerCapture(event.pointerId);
  sheet.style.transition = "none";
}

function moveDrag(event) {
  if (!drag) return;
  const now = performance.now();
  const dt = Math.max(now - drag.lastTime, 1);
  drag.velocity = (event.clientY - drag.lastY) / dt; // px per ms, positive = downwards
  drag.lastY = event.clientY;
  drag.lastTime = now;

  const heights = snapHeights();
  const wanted = drag.startHeight - (event.clientY - drag.startY);
  sheet.style.height = `${Math.min(Math.max(wanted, heights.peek), heights.full)}px`;
}

function endDrag() {
  if (!drag) return;
  const height = sheet.getBoundingClientRect().height;
  const { velocity } = drag;
  drag = null;
  applySnap(pickSnap(height, velocity), true);
}

/**
 * Chooses the snap to settle on: a flick moves one step, otherwise the nearest
 * @param {number} height - Sheet height at release
 * @param {number} velocity - Drag velocity in px/ms (positive = downwards)
 * @returns {string} Snap name
 */
function pickSnap(height, velocity) {
  const index = SNAPS.indexOf(current);
  if (velocity < -0.4) return SNAPS[Math.min(index + 1, SNAPS.length - 1)];
  if (velocity > 0.4) return SNAPS[Math.max(index - 1, 0)];

  const heights = snapHeights();
  return SNAPS.reduce((best, snap) =>
    Math.abs(heights[snap] - height) < Math.abs(heights[best] - height) ? snap : best
  );
}
