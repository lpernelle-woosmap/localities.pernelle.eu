// mobile-app.js — Mobile orchestrator.
// Manages state, wires the mobile DOM to the existing api-service / map-manager / diff-utils.
// Keeps a hidden mirror of the desktop's env-select / compare-select / endpoint-select
// so the existing modules (api-service.js, environment_select.js, endpoint_select.js)
// keep working unchanged.

import { isoCountries } from "./countries.js";
import { isoLanguages } from "./languages.js";
import { debounce } from "./utils.js";
import { autocompleteSearch, getDetails, reverseGeocode } from "./api-service.js";
import {
  initializeMap, getMap, displayLocationOnMap,
  displayCompareLocationOnMap, clearCompareLocationFromMap, addMapClickListener,
} from "./map-manager.js";
import { computeDiff, coordinatesDiffer, viewportDiffers } from "./diff-utils.js";
import {
  getTargetEnvironment, getCompareEnvironment, getTargetLabel, getCompareLabel,
} from "./environment_select.js";
import { CONFIG } from "./config.js";
import {
  renderEnvDisplay, renderEndpointDisplay, renderActiveChips,
  renderResults, renderDetail, renderCompareDetail,
  showEmpty, hideActionBar, showError,
} from "./mobile-ui.js";

// ────────── State ──────────
const TYPES = ["locality", "postal_code", "address", "airport", "tourist_attraction", "amusement_park", "admin_level", "point_of_interest", "train_station", "metro_station", "shopping", "country"];
const EXCLUDED_TYPES = ["suburb", "quarter", "neighbourhood", "village", "hamlet", "borough", "city", "town"];

const state = {
  target: "dev",              // env-select.value
  compare: "prod",            // compare-select.value ("none" to disable)
  endpoint: "autocomplete",   // endpoint-select.value
  types: ["locality"],        // selected types
  excludedTypes: [],
  countries: [],              // [{id, text}]
  extended: false,
  bias: false,
  geometryOnly: false,
  language: "fr",
  customDescription: "",
  // last
  lastDetail: null,           // { result, source: 'dev'|'prod' }
  lastDiff: null,             // computeDiff result, if any
};

// ────────── Boot ──────────
window.initMap = () => {
  const mapContainer = document.getElementById("map");
  if (!mapContainer) return;
  initializeMap(mapContainer);
  addMapClickListener(handleMapClick);
};

// Load Woosmap SDK
const sdkScript = document.createElement("script");
sdkScript.src = `${CONFIG.WOOSMAP.SDK_URL}?key=${CONFIG.WOOSMAP.SDK_KEY}&callback=initMap`;
sdkScript.defer = true;
document.head.appendChild(sdkScript);

// Sync shims with state, render initial chrome
syncShims();
renderChrome();
renderActiveChipsFromState();
buildFilterUI();
buildPickerSheets();
attachListeners();
showEmpty();

// ────────── Sync hidden DOM shims for existing modules ──────────
function syncShims() {
  document.getElementById("env-select").value = state.target;
  document.getElementById("compare-select").value = state.compare;
  document.getElementById("endpoint-select").value = state.endpoint;
  document.getElementById("language-select").value = state.language || "";
  document.getElementById("extended-checkbox").checked = state.extended;
  document.getElementById("bias-checkbox").checked = state.bias;
  document.getElementById("geometry").checked = state.geometryOnly;
  document.getElementById("custom-description-input").value = state.customDescription;
}

function renderChrome() {
  renderEnvDisplay({ target: state.target, compare: state.compare });
  renderEndpointDisplay(state.endpoint);
  const fc = document.getElementById("filter-count");
  const count = state.types.length + state.excludedTypes.length + state.countries.length
    + (state.extended ? 1 : 0) + (state.bias ? 1 : 0) + (state.geometryOnly ? 1 : 0);
  if (count > 0) {
    fc.textContent = String(count);
    fc.classList.remove("hidden");
    fc.classList.add("flex");
  } else {
    fc.classList.add("hidden");
    fc.classList.remove("flex");
  }
}

function renderActiveChipsFromState() {
  renderActiveChips({
    types: state.types,
    excludedTypes: state.excludedTypes,
    countries: state.countries,
    extended: state.extended,
    bias: state.bias,
    language: state.language,
  });
}

// ────────── Search ──────────
const search = debounce(performSearch, CONFIG.API.DEBOUNCE_DELAY);

async function performSearch() {
  const input = document.getElementById("input");
  const value = input.value.trim();
  if (!value) {
    showEmpty();
    return;
  }

  const compareEnv = getCompareEnvironment();
  const map = getMap();
  const components = state.countries.map(c => `country:${c.id}`).join("|");
  const params = {
    input: value,
    components,
    types: state.types.join("|"),
    excluded_types: state.excludedTypes.join("|"),
    extended: state.extended,
    location: state.bias && map ? map.getCenter() : null,
    radius: state.bias ? CONFIG.API.GEOGRAPHICAL_BIAS_RADIUS : null,
    custom_description: state.customDescription || null,
  };

  try {
    const promises = [autocompleteSearch(params)];
    if (compareEnv) promises.push(autocompleteSearch(params, compareEnv).catch(err => ({ _error: err })));

    const [mainResponse, compareResponse] = await Promise.all(promises);
    if (compareResponse?._error) {
      // soft-fail compare side; still show main results
      console.warn("Compare search failed:", compareResponse._error);
    }

    renderResults({
      devResponse: mainResponse,
      compareResponse: compareResponse?._error ? null : compareResponse,
      endpoint: state.endpoint,
      target: state.target,
      compare: state.compare,
      onResultClick: handleResultClick,
    });
    hideActionBar();
  } catch (err) {
    showError(err);
  }
}

async function handleResultClick(item, name) {
  // For search/geocode endpoints the result IS the detail. For autocomplete, fetch.
  const input = document.getElementById("input");
  if (input) input.value = name;
  document.getElementById("clear-btn").classList.remove("hidden");
  document.getElementById("clear-btn").classList.add("flex");

  if (state.endpoint === "search" || state.endpoint === "geocode") {
    renderDetailFromResult(item);
    return;
  }
  await requestDetails(item.public_id);
}

async function requestDetails(publicId) {
  const fields = state.geometryOnly ? "geometry" : "";
  const compareEnv = getCompareEnvironment();

  try {
    clearCompareLocationFromMap();
    if (!compareEnv) {
      const response = await getDetails(publicId, fields);
      if (response?.result) {
        renderDetailFromResult(response.result, /* showCompareCTA */ false);
      }
      return;
    }

    const [main, compare] = await Promise.all([
      getDetails(publicId, fields),
      getDetails(publicId, fields, compareEnv).catch(err => ({ _error: err })),
    ]);
    const mainResult = main?.result;
    if (!mainResult) return;

    displayLocationOnMap(mainResult);

    if (compare?._error || !compare?.result) {
      renderDetailFromResult(mainResult, /* showCompareCTA */ true);
      return;
    }

    const compareResult = compare.result;
    const diff = computeDiff(mainResult, compareResult);
    state.lastDetail = { result: mainResult, source: state.target };
    state.lastDiff = diff;

    if (diff.identical) {
      renderDetailFromResult(mainResult, false);
    } else {
      renderCompareDetail(mainResult, compareResult, diff, state.target, state.compare);
      if (coordinatesDiffer(diff) || viewportDiffers(diff)) {
        displayCompareLocationOnMap(compareResult);
      }
    }
  } catch (err) {
    showError(err);
  }
}

function renderDetailFromResult(result, showCompareCTA = true) {
  displayLocationOnMap(result);
  state.lastDetail = { result, source: state.target };
  renderDetail(result, state.target, showCompareCTA && state.compare && state.compare !== "none" ? state.compare : null, {
    onCompare: () => requestDetails(result.public_id),
  });
}

// ────────── Map click → reverse geocode ──────────
async function handleMapClick(event) {
  const components = state.countries.map(c => `country:${c.id}`).join("|");
  const types = state.types.join("|");
  const excluded = state.excludedTypes.join("|");
  try {
    const response = await reverseGeocode(event.latlng, components, types, excluded);
    if (response?.results?.[0]) {
      renderDetailFromResult(response.results[0], true);
    }
  } catch (err) {
    showError(err);
  }
}

// ────────── Filter sheet UI ──────────
function buildFilterUI() {
  // Types pills
  const typesRoot = document.getElementById("types-pills");
  typesRoot.innerHTML = "";
  TYPES.forEach(t => typesRoot.appendChild(pillButton(t, state.types.includes(t), () => {
    state.types = toggle(state.types, t);
    refilterUI();
  })));

  const exRoot = document.getElementById("excluded-types-pills");
  exRoot.innerHTML = "";
  EXCLUDED_TYPES.forEach(t => exRoot.appendChild(pillButton(t, state.excludedTypes.includes(t), () => {
    state.excludedTypes = toggle(state.excludedTypes, t);
    refilterUI();
  })));

  // Switches
  const sw = document.getElementById("switches");
  sw.innerHTML = "";
  sw.appendChild(switchRow("Extended postal codes", "extended"));
  sw.appendChild(switchRow("Geographical bias (map center)", "bias"));
  sw.appendChild(switchRow("Geometry only", "geometryOnly"));

  // Countries (in filter sheet — already-added ones)
  refreshCountryPills();
}

function refilterUI() {
  buildFilterUI();
  renderChrome();
  renderActiveChipsFromState();
  syncShims();
}

function refreshCountryPills() {
  const cp = document.getElementById("country-pills");
  // Keep the "+ Add country" button at end
  [...cp.querySelectorAll("[data-country]")].forEach(el => el.remove());
  const addBtn = document.getElementById("add-country-btn");
  state.countries.forEach(c => {
    const pill = h("button", {
      "data-country": c.id,
      class: "px-3 py-1.5 rounded-[18px] bg-gray-900 text-white text-[13px] font-medium tracking-tight flex items-center gap-1.5",
      onclick: () => {
        state.countries = state.countries.filter(x => x.id !== c.id);
        refilterUI();
      },
    },
      `${flagEmoji(c.id)} ${c.text}`,
      h("span", { class: "text-[14px] leading-none" }, "×"),
    );
    cp.insertBefore(pill, addBtn);
  });
}

function pillButton(label, active, onClick) {
  return h("button", {
    class: `px-3 py-1.5 rounded-[18px] text-[13px] font-medium tracking-tight ${active ? "bg-gray-900 text-white" : "bg-[#F1F1F3] text-gray-900"}`,
    onclick: onClick,
  }, label.replace(/_/g, " "));
}

function switchRow(label, stateKey) {
  const on = state[stateKey];
  const row = h("div", { class: "flex items-center justify-between py-3", style: { borderBottom: "0.5px solid #ECECEE" } },
    h("span", { class: "text-[15px] text-gray-900" }, label),
    h("button", {
      class: "w-[51px] h-[31px] rounded-[16px] p-0.5 flex transition-colors",
      style: { background: on ? "#30D158" : "#E5E5EA", justifyContent: on ? "flex-end" : "flex-start" },
      onclick: () => { state[stateKey] = !state[stateKey]; refilterUI(); },
    },
      h("div", {
        class: "w-[27px] h-[27px] rounded-full bg-white",
        style: { boxShadow: "0 2px 4px rgba(0,0,0,0.18), 0 0 0 0.5px rgba(0,0,0,0.04)" },
      }),
    ),
  );
  return row;
}

function toggle(arr, item) {
  return arr.includes(item) ? arr.filter(x => x !== item) : [...arr, item];
}

function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return "";
  const base = 127397;
  return String.fromCodePoint(...cc.toUpperCase().split("").map(c => base + c.charCodeAt(0)));
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  return el;
}

// ────────── Picker sheets ──────────
function buildPickerSheets() {
  // Env: target options
  const targetRoot = document.getElementById("target-options");
  const compareRoot = document.getElementById("compare-options");
  targetRoot.innerHTML = "";
  compareRoot.innerHTML = "";

  const envOptions = [
    { value: "dev", label: "Development", color: "#b71c1c" },
    { value: "prod", label: "Production", color: "#1565C0" },
    { value: "pr", label: "PR Deploy", color: "#F59E0B" },
  ];

  envOptions.forEach((opt, i) => targetRoot.appendChild(envRow(opt, state.target === opt.value, i < envOptions.length - 1, () => {
    if (opt.value === "pr") {
      const targetPR = prompt("Which PR should we target today?");
      if (!targetPR) return;
      // Reuse existing env logic by setting select value + dispatching change
      const sel = document.getElementById("env-select");
      sel.value = "pr";
      sel.dispatchEvent(new Event("change"));
    }
    state.target = opt.value;
    syncShims(); renderChrome(); refilterUI(); closeAllSheets();
  })));

  const compareOptions = [
    { value: "none", label: "No comparison", color: "#8E8E93" },
    ...envOptions,
  ];
  compareOptions.forEach((opt, i) => compareRoot.appendChild(envRow(opt, state.compare === opt.value, i < compareOptions.length - 1, () => {
    if (opt.value === "pr") {
      const targetPR = prompt("Which PR should we target today?");
      if (!targetPR) return;
      const sel = document.getElementById("compare-select");
      sel.value = "pr";
      sel.dispatchEvent(new Event("change"));
    }
    state.compare = opt.value;
    syncShims(); renderChrome(); closeAllSheets();
  })));

  // Endpoint options
  const epRoot = document.getElementById("endpoint-options");
  epRoot.innerHTML = "";
  const endpoints = [
    { value: "autocomplete", label: "Autocomplete / Details" },
    { value: "search", label: "Search / Details" },
    { value: "geocode", label: "Geocode" },
  ];
  endpoints.forEach((opt, i) => epRoot.appendChild(envRow({ value: opt.value, label: opt.label }, state.endpoint === opt.value, i < endpoints.length - 1, () => {
    state.endpoint = opt.value;
    syncShims(); renderChrome(); closeAllSheets();
  })));

  // Countries list (lazy when opened)
  // Languages list
  buildLangList("");
  buildCountriesList("");
}

function envRow({ value, label, color }, active, hasBorder, onClick) {
  return h("button", {
    class: "w-full flex items-center justify-between py-3 px-3.5",
    style: { borderBottom: hasBorder ? "0.5px solid #ECECEE" : "none" },
    onclick: onClick,
  },
    h("div", { class: "flex items-center gap-2.5" },
      color ? h("div", { style: { width: "8px", height: "8px", borderRadius: "4px", background: color } }) : null,
      h("span", { class: "text-[15px] text-gray-900" }, label),
    ),
    active ? h("span", { class: "text-[#00B0FF]" },
      htmlSvg(`<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4 10-10" stroke="#00B0FF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" /></svg>`)) : null,
  );
}

function htmlSvg(svgStr) {
  const span = document.createElement("span");
  span.innerHTML = svgStr;
  span.style.display = "inline-flex";
  return span;
}

function buildCountriesList(query) {
  const root = document.getElementById("countries-list");
  root.innerHTML = "";
  const q = query.trim().toLowerCase();
  const filtered = isoCountries.filter(c =>
    !q || c.text.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
  );
  filtered.forEach(c => {
    const active = state.countries.some(x => x.id === c.id);
    root.appendChild(h("button", {
      class: "w-full flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50",
      style: { borderBottom: "0.5px solid #ECECEE" },
      onclick: () => {
        if (active) state.countries = state.countries.filter(x => x.id !== c.id);
        else state.countries = [...state.countries, c];
        buildCountriesList(document.getElementById("country-search").value);
      },
    },
      h("span", { class: "text-[20px]" }, flagEmoji(c.id)),
      h("span", { class: "flex-1 text-[15px] text-gray-900" }, c.text),
      h("span", { class: "text-[11px] font-mono text-[#8E8E93]" }, c.id),
      active ? htmlSvg(`<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4 10-10" stroke="#00B0FF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" /></svg>`) : null,
    ));
  });
}

function buildLangList(query) {
  const root = document.getElementById("lang-list");
  root.innerHTML = "";
  const q = query.trim().toLowerCase();
  const items = [{ id: "", text: "No language" }, ...isoLanguages];
  const filtered = items.filter(l => !q || l.text.toLowerCase().includes(q) || l.id.toLowerCase().includes(q));
  filtered.forEach(l => {
    const active = state.language === l.id;
    root.appendChild(h("button", {
      class: "w-full flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50",
      style: { borderBottom: "0.5px solid #ECECEE" },
      onclick: () => {
        state.language = l.id;
        syncShims();
        updateLangDisplay();
        document.getElementById("lang-sheet").classList.add("hidden");
        document.getElementById("lang-sheet").classList.remove("flex");
        renderActiveChipsFromState();
      },
    },
      h("span", { class: "flex-1 text-[15px] text-gray-900" }, l.text),
      l.id ? h("span", { class: "text-[11px] font-mono text-[#8E8E93]" }, l.id) : null,
      active ? htmlSvg(`<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4 10-10" stroke="#00B0FF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" /></svg>`) : null,
    ));
  });
}

function updateLangDisplay() {
  const el = document.getElementById("lang-display");
  if (!el) return;
  if (!state.language) { el.textContent = "No language"; return; }
  const found = isoLanguages.find(l => l.id === state.language);
  el.textContent = found ? `${found.text} (${found.id})` : state.language;
}

// ────────── Sheet open/close ──────────
function openSheet(id) {
  const sheet = document.getElementById(id);
  const overlay = document.getElementById("overlay");
  if (!sheet) return;
  if (id === "filter-sheet") {
    sheet.classList.remove("sheet-enter");
    sheet.style.transform = "translateY(0)";
  } else {
    sheet.classList.remove("hidden");
    sheet.classList.add("flex");
  }
  overlay.classList.remove("hidden");
}

function closeAllSheets() {
  const filterSheet = document.getElementById("filter-sheet");
  filterSheet.classList.add("sheet-enter");
  filterSheet.style.transform = "translateY(100%)";
  for (const id of ["country-sheet", "env-sheet", "endpoint-sheet", "lang-sheet"]) {
    const el = document.getElementById(id);
    el.classList.add("hidden");
    el.classList.remove("flex");
  }
  document.getElementById("overlay").classList.add("hidden");
}

// ────────── Wire DOM listeners ──────────
function attachListeners() {
  const input = document.getElementById("input");
  input.addEventListener("input", () => {
    const v = input.value;
    document.getElementById("clear-btn").classList.toggle("hidden", !v);
    document.getElementById("clear-btn").classList.toggle("flex", !!v);
    search();
  });
  document.getElementById("clear-btn").addEventListener("click", () => {
    input.value = "";
    document.getElementById("clear-btn").classList.add("hidden");
    document.getElementById("clear-btn").classList.remove("flex");
    showEmpty();
  });

  // Glass header
  document.getElementById("env-btn").addEventListener("click", () => openSheet("env-sheet"));
  document.getElementById("endpoint-btn").addEventListener("click", () => openSheet("endpoint-sheet"));

  // FABs
  document.getElementById("fab-filters").addEventListener("click", () => openSheet("filter-sheet"));
  document.getElementById("fab-locate").addEventListener("click", () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(pos => {
      const map = getMap();
      if (map) {
        map.panTo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        map.setZoom(13);
      }
    });
  });

  // Filter sheet
  document.getElementById("filter-close").addEventListener("click", closeAllSheets);
  document.getElementById("filter-apply").addEventListener("click", () => {
    closeAllSheets();
    if (input.value.trim()) performSearch();
  });
  document.getElementById("filter-reset").addEventListener("click", () => {
    state.types = ["locality"];
    state.excludedTypes = [];
    state.countries = [];
    state.extended = false; state.bias = false; state.geometryOnly = false;
    state.customDescription = "";
    document.getElementById("custom-description-input-mobile").value = "";
    refilterUI();
  });
  document.getElementById("custom-description-input-mobile").addEventListener("change", e => {
    state.customDescription = e.target.value;
    syncShims();
  });

  // Add country opens picker
  document.getElementById("add-country-btn").addEventListener("click", () => openSheet("country-sheet"));
  document.getElementById("country-close").addEventListener("click", closeAllSheets);
  document.getElementById("country-done").addEventListener("click", () => {
    closeAllSheets();
    refilterUI();
  });
  document.getElementById("country-search").addEventListener("input", e => buildCountriesList(e.target.value));

  // Lang picker
  document.getElementById("lang-row").addEventListener("click", () => openSheet("lang-sheet"));
  document.getElementById("lang-close").addEventListener("click", closeAllSheets);
  document.getElementById("lang-search").addEventListener("input", e => buildLangList(e.target.value));

  // Overlay click closes
  document.getElementById("overlay").addEventListener("click", closeAllSheets);

  // Error modal close
  document.getElementById("close-error-modal").addEventListener("click", () => {
    const m = document.getElementById("error-modal");
    m.classList.add("hidden");
    m.classList.remove("flex");
  });

  updateLangDisplay();
}
