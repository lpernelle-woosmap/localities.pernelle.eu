// nearby-modal.js - "Nearby" modal: POIs around coordinates (localities/nearby) on the target and compare
// environments side by side, click one to load its details

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
 * @param {string|null} onlyLabel - Environment label when the other environment does not return this result
 * @returns {string} HTML string
 */
function renderItem(item, center, onlyLabel) {
  const location = item.geometry?.location;
  const distance = location
    ? `<span class="text-xs text-gray-500 font-mono shrink-0">${formatDistance(metersBetween(center.lat, center.lng, location.lat, location.lng))}</span>`
    : "";
  const address = item.formatted_address
    ? `<div class="text-xs text-gray-500 truncate">${escapeHtml(item.formatted_address)}</div>`
    : "";
  const badges = (item.types || [])
    .filter(type => type !== DEFAULT_TYPE)
    .map(type => `<span class="text-[11px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">${escapeHtml(type)}</span>`);
  if (onlyLabel) {
    badges.push(`<span class="text-[11px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">${escapeHtml(onlyLabel)} only</span>`);
  }
  const tone = onlyLabel ? "border-amber-300 bg-amber-50" : "border-gray-200";

  return `
    <button type="button" class="nearby-item w-full text-left px-3 py-2 rounded-lg border ${tone} hover:bg-blue-50 hover:border-blue-300 transition-colors" data-public-id="${escapeHtml(item.public_id)}">
      <div class="flex items-start justify-between gap-3">
        <div class="text-sm text-gray-900 font-medium min-w-0 break-words">${escapeHtml(item.name || item.public_id)}</div>
        ${distance}
      </div>
      ${address}
      ${badges.length > 0 ? `<div class="flex flex-wrap gap-1 mt-1">${badges.join("")}</div>` : ""}
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
 * Renders one environment column
 * @param {HTMLElement} list - Column container
 * @param {{response?: Object, error?: Error}} outcome - Request outcome of this environment
 * @param {Set<string>|null} otherIds - public_ids returned by the other environment (null: no comparison)
 * @param {{center: Object}} state - Modal state
 * @param {string} label - Environment label
 */
function renderColumn(list, outcome, otherIds, state, label) {
  if (outcome.error) {
    list.innerHTML = renderError(outcome.error);
    return;
  }
  const results = outcome.response?.results || [];
  list.innerHTML = results.length > 0
    ? results.map(item => renderItem(item, state.center, otherIds && !otherIds.has(item.public_id) ? label : null)).join("")
    : '<div class="text-sm text-gray-500 py-6 text-center">No result around these coordinates.</div>';
}

/**
 * @param {{response?: Object, error?: Error}} outcome - Request outcome of an environment
 * @returns {Set<string>|null} Returned public_ids, or null when the request failed (nothing to compare with)
 */
function resultIds(outcome) {
  return outcome.error ? null : new Set((outcome.response?.results || []).map(item => item.public_id));
}

/**
 * Lists the results of the page for the map, each tagged with the environments returning it
 * @param {{response?: Object, error?: Error}} target - Target environment outcome
 * @param {{response?: Object, error?: Error}|null} compare - Compare environment outcome, if any
 * @returns {Array<{result: Object, kind: string}>} kind: "target" or "compare" (one env only), else "both"
 */
export function mapItems(target, compare) {
  const targetIds = resultIds(target);
  const compareIds = compare ? resultIds(compare) : null;
  const tag = (outcome, otherIds, side) => (outcome?.response?.results || [])
    .map(result => ({ result, kind: otherIds && !otherIds.has(result.public_id) ? side : "both" }));

  return [
    ...tag(target, compareIds, "target"),
    // Results of both environments are already listed from the target side
    ...tag(compare, targetIds, "compare").filter(({ kind }) => kind === "compare" || !targetIds)
  ];
}

/**
 * Wires the nearby modal: target environment on the left, compare environment on the right
 * @param {Object} options
 * @param {Function} options.getFilters - Returns the controls panel filters ({types, excluded_types})
 * @param {Function} options.getCompare - Returns {env, label} of the compare environment, or null when there is none
 * @param {Function} options.getTargetLabel - Returns the target environment label
 * @param {Function} options.onSelect - Called with the public_id of the clicked result
 * @param {Function} options.onShowOnMap - Called with the results of the page (see mapItems)
 * @returns {Function} open({lat, lng}): runs the nearby requests and shows the modal
 */
export function initNearbyModal({ getFilters, getCompare, getTargetLabel, onSelect, onShowOnMap }) {
  const el = Object.fromEntries([
    ["modal", "nearby-modal"], ["summary", "nearby-summary"], ["columns", "nearby-columns"],
    ["targetLabel", "nearby-target-label"], ["targetList", "nearby-results"],
    ["compareColumn", "nearby-compare-column"], ["compareLabel", "nearby-compare-label"], ["compareList", "nearby-results-compare"],
    ["page", "nearby-page"], ["previous", "nearby-previous"], ["next", "nearby-next"], ["showMap", "nearby-show-map"]
  ].map(([name, id]) => [name, document.getElementById(id)]));
  if (Object.values(el).some(node => !node)) return () => {};

  /** @type {{center: Object, types: string, excluded_types: string, compare: Object|null, targetLabel: string, page: number, hasNext: boolean}|null} */
  let state = null;
  // Ignores the responses of requests superseded by newer ones
  let requestId = 0;
  /** @type {Array<{result: Object, kind: string}>} Results of the displayed page, for the map */
  let pageItems = [];

  const setPageItems = (items) => {
    pageItems = items;
    el.showMap.disabled = items.length === 0;
  };

  const close = () => el.modal.classList.add("hidden");

  const setPagination = (page, hasNext) => {
    state.page = page;
    state.hasNext = hasNext;
    el.page.textContent = `Page ${page}`;
    el.previous.disabled = page <= 1;
    el.next.disabled = !hasNext;
  };

  const loadPage = async (page) => {
    const currentRequest = ++requestId;
    const loading = '<div class="text-sm text-gray-500 py-6 text-center">Loading…</div>';
    el.targetList.innerHTML = loading;
    el.compareList.innerHTML = loading;
    setPagination(page, false);
    setPageItems([]);

    const params = { location: state.center, types: state.types, excluded_types: state.excluded_types, page };
    const settle = (promise) => promise.then(response => ({ response }), error => ({ error }));
    const [target, compare] = await Promise.all([
      settle(nearbySearch(params)),
      state.compare ? settle(nearbySearch(params, state.compare.env)) : null
    ]);
    if (currentRequest !== requestId) return;

    renderColumn(el.targetList, target, compare && resultIds(compare), state, state.targetLabel);
    if (compare) {
      renderColumn(el.compareList, compare, resultIds(target), state, state.compare.label);
    }
    setPageItems(mapItems(target, compare));
    // Both columns share the page number: Next stays available while either environment has more
    setPagination(page, [target, compare].some(outcome => outcome?.response?.pagination?.next_page != null));
  };

  const open = (center) => {
    const filters = getFilters();
    state = {
      center,
      types: filterNearbyTypes(filters.types) || DEFAULT_TYPE,
      excluded_types: filterNearbyTypes(filters.excluded_types),
      compare: getCompare(),
      targetLabel: getTargetLabel(),
      page: 1,
      hasNext: false
    };
    const excluded = state.excluded_types ? ` · excluded: ${state.excluded_types.replaceAll("|", ", ")}` : "";
    el.summary.textContent = `Around ${center.lat}, ${center.lng} · types: ${state.types.replaceAll("|", ", ")}${excluded}`;
    el.targetLabel.textContent = state.targetLabel;
    el.compareLabel.textContent = state.compare?.label || "";
    el.compareColumn.classList.toggle("hidden", !state.compare);
    el.columns.classList.toggle("grid-cols-2", Boolean(state.compare));
    el.modal.classList.remove("hidden");
    loadPage(1);
  };

  el.columns.addEventListener("click", (event) => {
    const item = event.target.closest(".nearby-item");
    if (!item) return;
    close();
    onSelect(item.getAttribute("data-public-id"));
  });
  el.showMap.addEventListener("click", () => {
    close();
    onShowOnMap(pageItems);
  });
  el.previous.addEventListener("click", () => state && state.page > 1 && loadPage(state.page - 1));
  el.next.addEventListener("click", () => state?.hasNext && loadPage(state.page + 1));
  document.getElementById("nearby-modal-close")?.addEventListener("click", close);
  document.getElementById("nearby-modal-backdrop")?.addEventListener("click", close);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  return open;
}
