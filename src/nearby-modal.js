// nearby-modal.js - "Nearby" modal: POIs around coordinates (localities/nearby), click one to load its details

import { nearbySearch } from "./api-service.js";
import { metersBetween } from "./map-manager.js";
import { escapeHtml } from "./utils.js";

const DEFAULT_TYPE = "point_of_interest";
// Roots of the types accepted by localities/nearby (sub-types such as transit.station.rail are accepted too)
const NEARBY_TYPE_ROOTS = new Set([
  DEFAULT_TYPE, "beach", "government", "park", "place_of_worship", "police", "post_office",
  "sports", "transit", "business", "education", "hospitality", "medical", "tourism"
]);

/**
 * Keeps the types localities/nearby accepts (the controls panel also lists autocomplete-only types)
 * @param {string} types - Pipe-separated types
 * @returns {string} Pipe-separated nearby types, possibly empty
 */
export function filterNearbyTypes(types) {
  return (types || "")
    .split("|")
    .filter(type => NEARBY_TYPE_ROOTS.has(type.split(".")[0]))
    .join("|");
}

/**
 * @param {number} meters - Distance in meters
 * @returns {string} e.g. "85 m" or "1.2 km"
 */
function formatDistance(meters) {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

/**
 * @param {Object} item - Nearby result
 * @param {{lat: number, lng: number}} center - Search center
 * @returns {string} HTML string
 */
function renderItem(item, center) {
  const location = item.geometry?.location;
  const distance = location
    ? `<span class="text-xs text-gray-500 font-mono shrink-0">${formatDistance(metersBetween(center.lat, center.lng, location.lat, location.lng))}</span>`
    : "";
  const address = item.formatted_address
    ? `<div class="text-xs text-gray-500 truncate">${escapeHtml(item.formatted_address)}</div>`
    : "";
  const badges = (item.types || [])
    .filter(type => type !== DEFAULT_TYPE)
    .map(type => `<span class="text-[11px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">${escapeHtml(type)}</span>`)
    .join("");

  return `
    <button type="button" class="nearby-item w-full text-left px-3 py-2 rounded-lg border border-gray-200 hover:bg-blue-50 hover:border-blue-300 transition-colors" data-public-id="${escapeHtml(item.public_id)}">
      <div class="flex items-start justify-between gap-3">
        <div class="text-sm text-gray-900 font-medium min-w-0 break-words">${escapeHtml(item.name || item.public_id)}</div>
        ${distance}
      </div>
      ${address}
      ${badges ? `<div class="flex flex-wrap gap-1 mt-1">${badges}</div>` : ""}
    </button>
  `;
}

/**
 * @param {Error} error - Error thrown by the API service
 * @returns {string} HTML string
 */
function renderError(error) {
  const details = error.details ? `<pre class="mt-1 overflow-x-auto">${escapeHtml(JSON.stringify(error.details, null, 2))}</pre>` : "";
  return `
    <div class="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
      Nearby request failed: ${escapeHtml(error.message || "network error")}${details}
    </div>
  `;
}

/**
 * Wires the nearby modal
 * @param {Object} options
 * @param {Function} options.getFilters - Returns the controls panel filters ({types, excluded_types})
 * @param {Function} options.onSelect - Called with the public_id of the clicked result
 * @returns {Function} open({lat, lng}): runs the nearby request and shows the modal
 */
export function initNearbyModal({ getFilters, onSelect }) {
  const modal = document.getElementById("nearby-modal");
  const summary = document.getElementById("nearby-summary");
  const list = document.getElementById("nearby-results");
  const pageLabel = document.getElementById("nearby-page");
  const previousBtn = document.getElementById("nearby-previous");
  const nextBtn = document.getElementById("nearby-next");
  if (!modal || !summary || !list || !pageLabel || !previousBtn || !nextBtn) return () => {};

  /** @type {{center: Object, types: string, excluded_types: string, previous: number|null, next: number|null}|null} */
  let state = null;
  // Ignores the response of a request superseded by a newer one
  let requestId = 0;

  const close = () => modal.classList.add("hidden");

  const setPagination = (page, pagination) => {
    state.previous = pagination?.previous_page ?? null;
    state.next = pagination?.next_page ?? null;
    pageLabel.textContent = `Page ${page}`;
    previousBtn.disabled = state.previous == null;
    nextBtn.disabled = state.next == null;
  };

  const loadPage = async (page) => {
    const currentRequest = ++requestId;
    list.innerHTML = '<div class="text-sm text-gray-500 py-6 text-center">Loading…</div>';
    setPagination(page, null);

    try {
      const response = await nearbySearch({ location: state.center, types: state.types, excluded_types: state.excluded_types, page });
      if (currentRequest !== requestId) return;
      const results = response?.results || [];
      list.innerHTML = results.length > 0
        ? results.map(item => renderItem(item, state.center)).join("")
        : '<div class="text-sm text-gray-500 py-6 text-center">No result around these coordinates.</div>';
      setPagination(page, response?.pagination);
    } catch (error) {
      if (currentRequest !== requestId) return;
      list.innerHTML = renderError(error);
    }
  };

  const open = (center) => {
    const filters = getFilters();
    state = {
      center,
      types: filterNearbyTypes(filters.types) || DEFAULT_TYPE,
      excluded_types: filterNearbyTypes(filters.excluded_types),
      previous: null,
      next: null
    };
    const excluded = state.excluded_types ? ` · excluded: ${state.excluded_types.replaceAll("|", ", ")}` : "";
    summary.textContent = `Around ${center.lat}, ${center.lng} · types: ${state.types.replaceAll("|", ", ")}${excluded}`;
    modal.classList.remove("hidden");
    loadPage(1);
  };

  list.addEventListener("click", (event) => {
    const item = event.target.closest(".nearby-item");
    if (!item) return;
    close();
    onSelect(item.getAttribute("data-public-id"));
  });
  previousBtn.addEventListener("click", () => state?.previous != null && loadPage(state.previous));
  nextBtn.addEventListener("click", () => state?.next != null && loadPage(state.next));
  document.getElementById("nearby-modal-close")?.addEventListener("click", close);
  document.getElementById("nearby-modal-backdrop")?.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  return open;
}
