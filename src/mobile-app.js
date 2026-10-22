// mobile-app.js — Mobile orchestrator.
// Owns the state, wires the mobile DOM to the shared api-service / map-manager /
// diff-utils modules and drives the bottom sheet. A hidden mirror of the desktop
// selects (env, compare, endpoint, language) keeps environment_select.js,
// endpoint_select.js and api-service.js working unchanged.

import { isoCountries, buildCountryComponents, matchCountryIds } from "./countries.js";
import { debounce, parseLatLng } from "./utils.js";
import { autocompleteSearch, getDetails, reverseGeocode, getLastRequestUrl } from "./api-service.js";
import {
  initializeMap, getMap, displayLocationOnMap, displayCompareLocationOnMap,
  clearCompareLocationFromMap, addMapClickListener, showBiasCircle, hideBiasCircle, getBiasRadius,
} from "./map-manager.js";
import { computeDiff, coordinatesDiffer, viewportDiffers } from "./diff-utils.js";
import { getCompareEnvironment, isCompareSameAsTarget, setTargetEnvironment, setCompareEnvironment } from "./environment_select.js";
import { maskApiKey, parseRequestUrl } from "./request-url.js";
import { CONFIG } from "./config.js";
import {
  h, htmlSvg, ENV_COLORS, setPrLabel,
  renderEnvDisplay, renderEndpointDisplay, renderActiveChips,
  renderResults, renderDetail, renderCompareDetail, showEmpty, showNotice, hideActionBar, showError,
} from "./mobile-ui.js";
import { renderFilterPage, renderCountryList, renderLangList, renderLangDisplay } from "./mobile-filters.js";
import { initSheet, setSheet, ensureSheet, getSnap, relayoutSheet } from "./mobile-sheet.js";

const ENV_OPTIONS = [
  { value: "dev", label: "Development" },
  { value: "prod", label: "Production" },
  { value: "pr", label: "PR Deploy" },
];
const ENDPOINTS = [
  { value: "autocomplete", label: "Autocomplete / Details" },
  { value: "search", label: "Search / Details" },
  { value: "geocode", label: "Geocode" },
];
const PAGES = ["filter-page", "country-sheet", "lang-sheet"];
const COMPACT_SHEETS = ["env-sheet", "endpoint-sheet", "request-sheet"];
const CHECK_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4 10-10" stroke="#00B0FF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" /></svg>`;

// ────────── State ──────────
const state = {
  target: "dev",
  compare: "prod",
  endpoint: "autocomplete",
  types: ["locality"],
  excludedTypes: [],
  countries: [],              // [{id, text}]
  extended: false,
  bias: false,
  geometryOnly: false,
  shape: false,
  language: new URLSearchParams(window.location.search).get("language") || CONFIG.API.DEFAULT_LANGUAGE,
  customDescription: "",
  lastResults: null,          // args of the last results render, to go back from a detail
  lastLocation: null,         // { main, compare } drawn on the map, redrawn when the map area changes
  lastCompare: null,          // { main, other, diff } of the loaded comparison, for the detail tabs
};

// ────────── Boot ──────────
window.initMap = () => {
  initializeMap(document.getElementById("map"));
  addMapClickListener(handleMapClick);
  if (state.bias) showBiasCircle();
};

const sdkScript = document.createElement("script");
sdkScript.src = `${CONFIG.WOOSMAP.SDK_URL}?key=${CONFIG.WOOSMAP.SDK_KEY}&callback=initMap`;
sdkScript.defer = true;
document.head.appendChild(sdkScript);

syncShims();
renderChrome();
renderFilters();
buildPickerSheets();
attachListeners();
initSheet({ onSnap: refocusMap });
showEmpty();

// ────────── State sync ──────────
/**
 * Applies a state patch and refreshes every view derived from the state
 * @param {Object} patch - State fields to update
 */
function update(patch) {
  Object.assign(state, patch);
  syncShims();
  renderChrome();
  renderFilters();
  relayoutSheet();
}

/** Mirrors the state into the hidden desktop selects read by the shared modules */
function syncShims() {
  document.getElementById("env-select").value = state.target;
  document.getElementById("compare-select").value = state.compare;
  document.getElementById("endpoint-select").value = state.endpoint;
  document.getElementById("language-select").value = state.language || "";
  if (state.bias) showBiasCircle(); else hideBiasCircle();
}

function renderChrome() {
  renderEnvDisplay({ target: state.target, compare: state.compare });
  renderEndpointDisplay(state.endpoint);
  renderActiveChips(state, openFilters);

  const count = state.types.length + state.excludedTypes.length + state.countries.length
    + ["extended", "bias", "geometryOnly", "shape"].filter(k => state[k]).length;
  const badge = document.getElementById("filter-count");
  badge.textContent = String(count);
  badge.classList.toggle("hidden", count === 0);
  badge.classList.toggle("flex", count > 0);
}

/** Compare environment to query, or null when disabled or identical to the target stack */
function activeCompareEnv() {
  return isCompareSameAsTarget() ? null : getCompareEnvironment();
}

function hasCompare() {
  return Boolean(activeCompareEnv());
}

// ────────── Search ──────────
const search = debounce(performSearch, CONFIG.API.DEBOUNCE_DELAY);

function searchParams(value) {
  const map = getMap();
  return {
    input: value,
    components: buildCountryComponents(state.countries.map(c => c.id)),
    types: state.types.join("|"),
    excluded_types: state.excludedTypes.join("|"),
    extended: state.extended,
    location: state.bias && map ? map.getCenter() : null,
    radius: state.bias ? getBiasRadius() : null,
    custom_description: state.customDescription || null,
  };
}

async function performSearch() {
  const value = document.getElementById("input").value.trim();
  if (!value) {
    state.lastResults = null;
    showEmpty();
    return;
  }

  const params = searchParams(value);
  const compareEnv = activeCompareEnv();
  try {
    const [mainResponse, compareResponse] = await Promise.all([
      autocompleteSearch(params),
      compareEnv ? autocompleteSearch(params, compareEnv).catch(err => ({ _error: err })) : null,
    ]);
    showResults({
      query: value,
      devResponse: mainResponse,
      compareResponse: compareResponse?._error ? null : compareResponse,
      compareError: compareResponse?._error || null,
      latlng: parseLatLng(value),
    });
  } catch (err) {
    console.error("Error performing search:", err);
  }
}

/**
 * Renders a results list (also used to go back to it from a detail)
 * @param {Object} results - { query, devResponse, compareResponse, compareError, latlng }
 */
function showResults(results) {
  state.lastResults = results;
  setInputValue(results.query);
  renderResults({
    ...results,
    endpoint: state.endpoint,
    target: state.target,
    compare: state.compare,
    onResultClick: handleResultClick,
    onCoordinatesClick: handleCoordinatesClick,
  });
  hideActionBar();
  ensureSheet("half");
}

function rerunSearch() {
  if (document.getElementById("input").value.trim()) performSearch();
}

async function handleResultClick(item, name) {
  setInputValue(name);
  // For search/geocode endpoints the result already is the detail; autocomplete needs a details call
  if (state.endpoint === "search" || state.endpoint === "geocode") {
    showDetail(item, { compareWith: hasCompare() ? state.compare : null });
    return;
  }
  await requestDetails(item.public_id);
}

// ────────── Details ──────────
/** Builds the details `fields` param (shape needs geometry alongside it, as on desktop) */
function detailFields() {
  const fields = [];
  if (state.geometryOnly) fields.push("geometry");
  if (state.shape) {
    fields.push("shape");
    if (!state.geometryOnly) fields.push("geometry");
  }
  return fields.join("|");
}

async function requestDetails(publicId) {
  const fields = detailFields();
  const compareEnv = activeCompareEnv();
  try {
    const [main, compare] = await Promise.all([
      getDetails(publicId, fields),
      compareEnv ? getDetails(publicId, fields, compareEnv).catch(err => ({ _error: err })) : null,
    ]);
    if (!main?.result) return;
    showComparison(main.result, compareOutcome(compare, r => r?.result));
  } catch (err) {
    console.error("Error fetching details:", err);
  }
}

/**
 * Normalizes a compare call outcome
 * @param {Object|null} response - Compare response, {_error} marker, or null when no compare ran
 * @param {Function} pick - Extracts the result from a successful response
 * @returns {{error: Error}|{result: Object|null}|null}
 */
function compareOutcome(response, pick) {
  if (!response) return null;
  if (response._error) return { error: response._error };
  return { result: pick(response) ?? null };
}

/**
 * Shows the main result alone, or side by side with the compare result when they differ
 * @param {Object} mainResult - Result from the target environment
 * @param {{error: Error}|{result: Object|null}|null} compare - Normalized compare outcome
 */
function showComparison(mainResult, compare) {
  if (!compare) return showDetail(mainResult, { compareWith: null });
  if (compare.error) return showDetail(mainResult, { compareWith: state.compare, compareError: compare.error });
  if (!compare.result) return showDetail(mainResult, { compareWith: state.compare });

  const diff = computeDiff(mainResult, compare.result);
  if (diff.identical) return showDetail(mainResult, { identicalWith: state.compare });

  state.lastCompare = { main: mainResult, other: compare.result, diff };
  drawLocation(mainResult, coordinatesDiffer(diff) || viewportDiffers(diff) ? compare.result : null);
  showCompareTab("diff");
}

/**
 * Shows one view of the loaded comparison: the diff, or either side alone
 * @param {string} tab - "diff" | "target" | "compare"
 */
function showCompareTab(tab) {
  const { main, other, diff } = state.lastCompare;
  const diffCount = Object.values(diff.fields).filter(f => f.status !== "same").length;
  const tabs = { active: tab, target: state.target, compare: state.compare, diffCount, onSelect: showCompareTab };

  if (tab === "diff") {
    renderCompareDetail(main, other, diff, state.target, state.compare, { tabs, ...detailHandlers() });
  } else if (tab === "target") {
    renderDetail(main, state.target, { tabs, ...detailHandlers() });
  } else {
    renderDetail(other, state.compare, { role: "compare", tabs, ...detailHandlers() });
  }
  ensureSheet("half");
}

/**
 * Shows a single-environment detail
 * @param {Object} result - Result to display
 * @param {Object} options - compareWith / identicalWith / compareError (see renderDetail)
 */
function showDetail(result, options) {
  drawLocation(result, null);
  renderDetail(result, state.target, {
    ...options,
    onCompare: () => requestDetails(result.public_id),
    ...detailHandlers(),
  });
  ensureSheet("half");
}

function detailHandlers() {
  return {
    onBack: state.lastResults ? () => showResults(state.lastResults) : null,
    onAddressClick: (publicId) => requestDetails(publicId),
  };
}

// ────────── Map ──────────
/**
 * Draws the target result (red) and optionally the compare result (blue) on the map
 */
function drawLocation(main, compare) {
  state.lastLocation = { main, compare };
  clearCompareLocationFromMap();
  displayLocationOnMap(main);
  if (compare) displayCompareLocationOnMap(compare);
}

/** Redraws the last location once the sheet settled, so it is centered in the visible map area */
function refocusMap(snap) {
  const map = getMap();
  if (!map || snap === "full") return;
  if (window.woosmap?.map?.event?.trigger) woosmap.map.event.trigger(map, "resize");
  if (state.lastLocation) drawLocation(state.lastLocation.main, state.lastLocation.compare);
}

function restrictions() {
  return {
    components: buildCountryComponents(state.countries.map(c => c.id)),
    types: state.types.join("|"),
    excluded_types: state.excludedTypes.join("|"),
  };
}

async function reverseGeocodeFirst(latlng, env = null) {
  const { components, types, excluded_types } = restrictions();
  const response = await reverseGeocode(latlng, components, types, excluded_types, env);
  return response?.results?.[0] ?? null;
}

async function handleMapClick(event) {
  try {
    const result = await reverseGeocodeFirst(event.latlng);
    if (result) showDetail(result, { compareWith: hasCompare() ? state.compare : null });
    else showNoResult(event.latlng);
  } catch (err) {
    showError(err);
  }
}

/** Tells the user a reverse geocode found nothing (with the current restrictions) */
function showNoResult({ lat, lng }) {
  showNotice(`No result at ${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)} with the current filters.`);
  ensureSheet("half");
}

/**
 * Reverse geocodes typed coordinates on the target env and, when enabled, the compare env
 * @param {{lat: number, lng: number}} latlng - Coordinates typed in the search input
 */
async function handleCoordinatesClick(latlng) {
  const compareEnv = activeCompareEnv();
  try {
    const [mainResult, compareResponse] = await Promise.all([
      reverseGeocodeFirst(latlng),
      compareEnv ? reverseGeocodeFirst(latlng, compareEnv).then(result => ({ results: [result] }), err => ({ _error: err })) : null,
    ]);
    if (!mainResult) return showNoResult(latlng);
    showComparison(mainResult, compareOutcome(compareResponse, r => r.results[0]));
  } catch (err) {
    showError(err);
  }
}

// ────────── Filters ──────────
function renderFilters() {
  renderFilterPage(state, {
    onToggleType: v => update({ types: toggle(state.types, v) }),
    onToggleExcludedType: v => update({ excludedTypes: toggle(state.excludedTypes, v) }),
    onAddCustomType: v => update({ types: [...new Set([...state.types, v])] }),
    onRemoveCountry: id => update({ countries: state.countries.filter(c => c.id !== id) }),
    onToggleSwitch: key => update({ [key]: !state[key] }),
  });
}

function toggle(arr, item) {
  return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];
}

function resetFilters() {
  update({
    types: ["locality"], excludedTypes: [], countries: [],
    extended: false, bias: false, geometryOnly: false, shape: false,
    customDescription: "",
  });
}

function openFilters() {
  document.getElementById("input").blur();
  renderFilters();
  openPage("filter-page");
}

function closeFilters() {
  closePage("filter-page");
  rerunSearch();
}

// ────────── Pickers (env / endpoint / country / language) ──────────
function buildPickerSheets() {
  const targetRoot = document.getElementById("target-options");
  targetRoot.innerHTML = "";
  ENV_OPTIONS.forEach((opt, i) => targetRoot.appendChild(
    envRow(opt, state.target === opt.value, i < ENV_OPTIONS.length - 1, () => chooseTarget(opt.value))));

  const compareOptions = [{ value: "none", label: "No comparison" }, ...ENV_OPTIONS];
  const compareRoot = document.getElementById("compare-options");
  compareRoot.innerHTML = "";
  compareOptions.forEach((opt, i) => compareRoot.appendChild(
    envRow(opt, state.compare === opt.value, i < compareOptions.length - 1, () => chooseCompare(opt.value))));

  const epRoot = document.getElementById("endpoint-options");
  epRoot.innerHTML = "";
  ENDPOINTS.forEach((opt, i) => epRoot.appendChild(
    envRow({ value: opt.value, label: opt.label, plain: true }, state.endpoint === opt.value, i < ENDPOINTS.length - 1, () => chooseEndpoint(opt.value))));
}

/**
 * Asks which PR to target and returns its segment, or null when cancelled
 * @returns {{prSegment: string, label: string}|null}
 */
function askPr() {
  const prSegment = prompt("Which PR should we target today?");
  if (!prSegment) return null;
  return { prSegment, label: `PR ${/\d+/.exec(prSegment)?.[0] || prSegment}` };
}

function chooseTarget(value) {
  if (value === "pr") {
    const pr = askPr();
    if (!pr) return;
    setTargetEnvironment({ name: "pr", prSegment: pr.prSegment });
    setPrLabel("target", pr.label);
  }
  update({ target: value });
  buildPickerSheets();
  closeSheets();
  rerunSearch();
}

function chooseCompare(value) {
  if (value === "pr") {
    const pr = askPr();
    if (!pr) return;
    setCompareEnvironment({ name: "pr", prSegment: pr.prSegment });
    setPrLabel("compare", pr.label);
  }
  update({ compare: value });
  buildPickerSheets();
  closeSheets();
  rerunSearch();
}

function chooseEndpoint(value) {
  update({ endpoint: value });
  buildPickerSheets();
  closeSheets();
  rerunSearch();
}

function envRow({ value, label, plain }, active, hasBorder, onClick) {
  return h("button", {
    class: "w-full flex items-center justify-between py-3 px-3.5",
    style: { borderBottom: hasBorder ? "0.5px solid #ECECEE" : "none" },
    onclick: onClick,
  },
    h("div", { class: "flex items-center gap-2.5" },
      plain ? null : h("div", { style: { width: "8px", height: "8px", borderRadius: "4px", background: ENV_COLORS[value] } }),
      h("span", { class: "text-[15px] text-gray-900" }, label),
    ),
    active ? htmlSvg(CHECK_ICON) : null,
  );
}

function openCountryPicker() {
  document.getElementById("country-search").value = "";
  refreshCountryList();
  openPage("country-sheet");
}

function refreshCountryList() {
  renderCountryList(document.getElementById("country-search").value, state.countries, country => {
    const selected = state.countries.some(c => c.id === country.id);
    state.countries = selected ? state.countries.filter(c => c.id !== country.id) : [...state.countries, country];
    refreshCountryList();
  });
}

function openLangPicker() {
  document.getElementById("lang-search").value = "";
  refreshLangList();
  openPage("lang-sheet");
}

function refreshLangList() {
  renderLangList(document.getElementById("lang-search").value, state.language, language => {
    update({ language });
    renderLangDisplay(language);
    closePage("lang-sheet");
  });
}

// ────────── Request URL (copy last / paste and replay) ──────────
function openRequestSheet() {
  const lastUrl = getLastRequestUrl();
  document.getElementById("request-url-input").value = lastUrl ? maskApiKey(lastUrl) : "";
  showRequestError("");
  openSheet("request-sheet");
}

function showRequestError(message) {
  const el = document.getElementById("request-url-error");
  el.textContent = message;
  el.classList.toggle("hidden", !message);
}

async function applyRequestUrl() {
  try {
    const request = parseRequestUrl(document.getElementById("request-url-input").value);
    closeSheets();
    await applyRequest(request);
  } catch (error) {
    openSheet("request-sheet");
    showRequestError(error.message);
  }
}

/**
 * Replays a pasted request: selects its env, fills the controls and runs it with the app keys
 * @param {{environment: Object|null, endpoint: string, params: Object}} request - Parsed request URL
 * @throws {Error} If the endpoint is not supported or a required param is missing
 */
async function applyRequest({ environment, endpoint, params }) {
  if (environment) applyEnvironment(environment);
  applyFieldsParam(params.fields);
  state.language = params.language || "";
  renderLangDisplay(state.language);

  if (endpoint === "details") {
    update({});
    if (!params.public_id) throw new Error("Missing public_id parameter");
    return requestDetails(params.public_id);
  }

  if (endpoint === "geocode" && params.latlng) {
    const latlng = parseLatLng(params.latlng);
    if (!latlng) throw new Error(`Invalid latlng: ${params.latlng}`);
    update({});
    return handleCoordinatesClick(latlng);
  }

  if (!ENDPOINTS.some(e => e.value === endpoint)) throw new Error(`Unsupported endpoint: ${endpoint}`);
  applySearchParams(endpoint, params);
  update({ endpoint });
  buildPickerSheets();
  return performSearch();
}

function applyEnvironment({ name, prSegment }) {
  setTargetEnvironment({ name, prSegment });
  if (name === "pr") setPrLabel("target", `PR ${/\d+/.exec(prSegment)?.[0] || prSegment}`);
  state.target = name;
  buildPickerSheets();
}

/**
 * Sets the fields switches from a fields param (unchanged when undefined)
 * @param {string|undefined} fields - Pipe-separated fields
 */
function applyFieldsParam(fields) {
  if (fields === undefined) return;
  const selected = fields.split("|");
  state.geometryOnly = selected.includes("geometry");
  state.shape = selected.includes("shape");
}

/**
 * Fills the search controls from autocomplete/search/geocode params
 * @param {string} endpoint - Target endpoint
 * @param {Object} params - Request query params
 */
function applySearchParams(endpoint, params) {
  setInputValue((endpoint === "geocode" ? params.address : params.input) || "");
  state.customDescription = params.custom_description || "";
  state.types = params.types ? params.types.split("|") : [];
  state.excludedTypes = params.excluded_types ? params.excluded_types.split("|") : [];
  const codes = (params.components || "").split("|").filter(Boolean).map(c => c.replace(/^country:/i, "").toUpperCase());
  state.countries = matchCountryIds(codes).map(id => isoCountries.find(c => c.id === id)).filter(Boolean);
  state.extended = params.extended === "postal_code";

  // search always sends location=0,0 by default, so it is not a real bias
  const biasLatLng = params.location === "0,0" ? null : parseLatLng(params.location);
  const map = getMap();
  state.bias = Boolean(biasLatLng && map);
  if (state.bias) map.setCenter(biasLatLng);
}

// ────────── Pages & sheets ──────────
function openPage(id) {
  document.getElementById(id).classList.remove("page-hidden");
}

function closePage(id) {
  document.getElementById(id).classList.add("page-hidden");
}

function openSheet(id) {
  const sheet = document.getElementById(id);
  sheet.classList.remove("hidden");
  sheet.classList.add("flex");
  document.getElementById("overlay").classList.remove("hidden");
}

function closeSheets() {
  for (const id of COMPACT_SHEETS) {
    const el = document.getElementById(id);
    el.classList.add("hidden");
    el.classList.remove("flex");
  }
  document.getElementById("overlay").classList.add("hidden");
}

function setInputValue(value) {
  document.getElementById("input").value = value;
  const clear = document.getElementById("clear-btn");
  clear.classList.toggle("hidden", !value);
  clear.classList.toggle("flex", Boolean(value));
}

// ────────── DOM listeners ──────────
function attachListeners() {
  const input = document.getElementById("input");
  input.addEventListener("input", () => { setInputValue(input.value); search(); });
  input.addEventListener("focus", () => ensureSheet("half"));
  document.getElementById("clear-btn").addEventListener("click", () => {
    setInputValue("");
    state.lastResults = null;
    showEmpty();
    input.focus();
  });

  // Glass header
  document.getElementById("env-btn").addEventListener("click", () => openSheet("env-sheet"));
  document.getElementById("endpoint-btn").addEventListener("click", () => openSheet("endpoint-sheet"));
  document.getElementById("request-url-btn").addEventListener("click", openRequestSheet);
  document.getElementById("overlay").addEventListener("click", closeSheets);

  // Map
  document.getElementById("fab-locate").addEventListener("click", locateMe);

  // Filters page
  document.getElementById("fab-filters").addEventListener("click", openFilters);
  document.getElementById("filter-apply").addEventListener("click", closeFilters);
  document.getElementById("filter-reset").addEventListener("click", resetFilters);
  document.getElementById("custom-description-input-mobile").addEventListener("change", e => {
    state.customDescription = e.target.value.trim();
  });
  document.getElementById("add-country-btn").addEventListener("click", openCountryPicker);
  document.getElementById("country-done").addEventListener("click", () => { closePage("country-sheet"); update({}); });
  document.getElementById("country-search").addEventListener("input", refreshCountryList);
  document.getElementById("lang-row").addEventListener("click", openLangPicker);
  document.getElementById("lang-close").addEventListener("click", () => closePage("lang-sheet"));
  document.getElementById("lang-search").addEventListener("input", refreshLangList);

  // Request URL sheet
  document.getElementById("request-url-apply").addEventListener("click", applyRequestUrl);
  document.getElementById("request-url-copy").addEventListener("click", () => {
    navigator.clipboard?.writeText(document.getElementById("request-url-input").value);
  });

  // Error modal
  document.getElementById("close-error-modal").addEventListener("click", () => {
    document.getElementById("error-modal").classList.add("hidden");
  });

  renderLangDisplay(state.language);
}

function locateMe() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(pos => {
    const map = getMap();
    if (!map) return;
    map.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    map.setZoom(13);
    if (getSnap() === "full") setSheet("half");
  });
}
