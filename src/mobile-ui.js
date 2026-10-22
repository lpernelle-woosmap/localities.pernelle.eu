// mobile-ui.js — DOM rendering for the mobile experience.
// Pure functions: build DOM from data, attach listeners. State lives in mobile-app.js.

import { escapeHtml, boldMatchedSubstring } from "./utils.js";
import { deepEqual } from "./diff-utils.js";
import { flagCode } from "./countries.js";

// ─── tiny createElement helper ────────────────────────────────
export function h(tag, attrs = {}, ...children) {
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

export function htmlSvg(svgStr) {
  const span = document.createElement("span");
  span.innerHTML = svgStr;
  span.style.display = "inline-flex";
  return span;
}

export function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return "";
  const base = 127397;
  return String.fromCodePoint(...cc.toUpperCase().split("").map(c => base + c.charCodeAt(0)));
}

const ICON = {
  copy: (color = "#111") => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="12" height="12" rx="2" stroke="${color}" stroke-width="1.6" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" stroke="${color}" stroke-width="1.6" /></svg>`,
  check: (color = "#00B0FF") => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4 10-10" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" /></svg>`,
  compare: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M7 4l-3 3 3 3M4 7h12M17 14l3 3-3 3M20 17H8" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>`,
  back: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M15 6l-6 6 6 6" stroke="#00B0FF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" /></svg>`,
  chevron: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="#C7C7CC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>`,
  pin: (color) => `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z" stroke="${color}" stroke-width="1.6" /><circle cx="12" cy="9" r="2.4" stroke="${color}" stroke-width="1.6" /></svg>`,
  target: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4" stroke="#92400E" stroke-width="1.8" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#92400E" stroke-width="1.8" stroke-linecap="round" /></svg>`,
};

// ─── env display in glass header ──────────────────────────────
export const ENV_COLORS = { dev: "#b71c1c", prod: "#1565C0", pr: "#F59E0B", none: "#8E8E93" };
const ENV_LABELS = { dev: "DEV", prod: "PROD" };
// Target and compare may point to different PRs, so their labels are kept per role
const PR_LABELS = { target: "PR", compare: "PR" };

/**
 * Sets the PR label of a role once a PR number is chosen (e.g. "PR 1234")
 * @param {string} role - "target" | "compare"
 * @param {string} label - Short label
 */
export function setPrLabel(role, label) {
  PR_LABELS[role] = label;
}

/**
 * Short label of an environment
 * @param {string} env - "dev" | "prod" | "pr"
 * @param {string} role - "target" | "compare", only matters for PR environments
 * @returns {string}
 */
export function envLabel(env, role = "target") {
  if (env === "pr") return PR_LABELS[role];
  return ENV_LABELS[env] || String(env).toUpperCase();
}

export function renderEnvDisplay({ target, compare }) {
  const root = document.getElementById("env-display");
  if (!root) return;
  root.innerHTML = "";

  const dot = (env) => h("div", { class: "shrink-0", style: { width: "7px", height: "7px", borderRadius: "4px", background: ENV_COLORS[env] } });
  const label = (env, role) => h("div", { class: "flex items-center gap-1.5 shrink-0" },
    dot(env),
    h("span", { class: "text-[11px] font-bold tracking-wide text-gray-900 whitespace-nowrap" }, envLabel(env, role)),
  );

  root.appendChild(label(target, "target"));
  if (compare && compare !== "none") {
    root.appendChild(h("div", { class: "shrink-0 mx-1.5", style: { width: "12px", height: "0.5px", background: "#C7C7CC" } }));
    root.appendChild(label(compare, "compare"));
  } else {
    root.appendChild(h("div", { class: "ml-2 text-[11px] text-[#8E8E93] font-medium shrink-0 whitespace-nowrap" }, "+ Compare"));
  }
}

export function renderEndpointDisplay(endpoint) {
  const el = document.getElementById("endpoint-display");
  if (el) el.textContent = endpoint;
}

// ─── active chips under the search bar ────────────────────────
export function renderActiveChips({ types, excludedTypes, countries, extended, bias, shape, geometryOnly, language }, onClick) {
  const root = document.getElementById("active-chips");
  if (!root) return;
  root.innerHTML = "";
  const chip = (text, variant = "active") => h("button", {
    class: variant === "active"
      ? "px-2.5 py-1 rounded-[12px] bg-[#E7F6FE] text-[#005A8A] text-[12px] font-semibold tracking-tight border border-[#B6E1F5]"
      : "px-2.5 py-1 rounded-[12px] bg-[#F1F1F3] text-[#5A5A5F] text-[12px] font-medium tracking-tight",
    onclick: onClick,
  }, text);

  for (const t of types) root.appendChild(chip(t));
  for (const c of countries) root.appendChild(chip(`${flagEmoji(flagCode(c.id))} ${c.id}`));
  if (excludedTypes.length) root.appendChild(chip(`-${excludedTypes.length} excl`, "muted"));
  if (extended) root.appendChild(chip("extended"));
  if (bias) root.appendChild(chip("bias"));
  if (geometryOnly) root.appendChild(chip("geometry", "muted"));
  if (shape) root.appendChild(chip("shape", "muted"));
  if (language) root.appendChild(chip(language, "muted"));
}

// ─── search results: single env OR compare mode ───────────────
export function renderResults({ devResponse, compareResponse, compareError, endpoint, target, compare, latlng, onResultClick, onCoordinatesClick }) {
  const content = document.getElementById("sheet-content");
  content.innerHTML = "";
  content.scrollTop = 0;

  if (latlng) content.appendChild(coordinatesRow(latlng, onCoordinatesClick));
  if (compareError) content.appendChild(errorBanner(compareError, `${envLabel(compare, "compare")} search failed`));

  const devItems = extractItems(devResponse, endpoint);
  const compareItems = extractItems(compareResponse, endpoint);

  if (!devItems.length && !compareItems.length) {
    if (!latlng) content.appendChild(h("div", { class: "py-10 px-8 text-center text-sm text-[#8E8E93]" }, "No results."));
    return;
  }

  if (!compareResponse) {
    content.appendChild(h("div", { class: "px-5 pt-1.5 pb-2 text-[12px] font-bold tracking-wider text-[#8E8E93] uppercase" },
      `${devItems.length} result${devItems.length > 1 ? "s" : ""} · ${envLabel(target)}`));
    for (const item of devItems) content.appendChild(buildResultRow(item, endpoint, target, onResultClick));
    return;
  }

  const merged = mergeResults(devItems, compareItems);
  content.appendChild(resultsBanner(merged, target, compare));
  for (const m of merged) content.appendChild(buildCompareResultRow(m, endpoint, target, compare, onResultClick));
}

/**
 * "Reverse geocode these coordinates" suggestion shown when the input parses as lat,lng
 */
function coordinatesRow(latlng, onClick) {
  return h("div", {
    class: "mx-4 mt-1 mb-2 p-2.5 rounded-[10px] flex items-center gap-2.5 cursor-pointer",
    style: { background: "#FFF7E6", border: "0.5px solid #F6D89C" },
    onclick: () => onClick && onClick(latlng),
  },
    h("div", { class: "w-[30px] h-[30px] rounded-full bg-[#FDE68A] flex items-center justify-center shrink-0" }, htmlSvg(ICON.target)),
    h("div", { class: "flex-1 min-w-0" },
      h("div", { class: "text-[13px] font-semibold text-[#92400E] leading-tight" },
        "Reverse geocode ", h("span", { class: "font-mono" }, `${latlng.lat}, ${latlng.lng}`)),
      h("div", { class: "text-[11px] text-[#B45309] mt-0.5 font-mono" }, "geocode?latlng"),
    ),
    htmlSvg(ICON.chevron),
  );
}

function resultsBanner(merged, target, compare) {
  const diffCount = merged.filter(m => m.status !== "same").length;
  const devCount = merged.filter(m => m.devRank != null).length;
  const prodCount = merged.filter(m => m.prodRank != null).length;
  const tone = diffCount === 0
    ? { bg: "#ECFDF5", border: "#A7F3D0", badge: "#059669", text: "#065F46", sub: "#047857" }
    : { bg: "#FFF7E6", border: "#F6D89C", badge: "#F59E0B", text: "#92400E", sub: "#B45309" };

  return h("div", { class: "mx-4 mt-1 mb-2 p-2.5 rounded-[10px] flex items-center gap-2.5", style: { background: tone.bg, border: `0.5px solid ${tone.border}` } },
    h("div", { class: "w-[22px] h-[22px] rounded-full text-white text-[11px] font-bold flex items-center justify-center shrink-0", style: { background: tone.badge } }, String(diffCount)),
    h("div", { class: "flex-1 min-w-0" },
      h("div", { class: "text-[13px] font-semibold leading-tight", style: { color: tone.text } }, diffCount === 0 ? "Result lists match" : "Result lists differ"),
      h("div", { class: "text-[11px] mt-0.5 font-mono whitespace-nowrap", style: { color: tone.sub } },
        h("span", { style: { color: ENV_COLORS[target], fontWeight: 700 } }, `${devCount} ${envLabel(target)}`),
        " · ",
        h("span", { style: { color: ENV_COLORS[compare], fontWeight: 700 } }, `${prodCount} ${envLabel(compare, "compare")}`),
        " · ",
        h("span", {}, `${diffCount}Δ`),
      ),
    ),
  );
}

function extractItems(response, endpoint) {
  if (!response) return [];
  if (endpoint === "search" || endpoint === "geocode") return response.results || [];
  return response.localities || [];
}

/**
 * Merges both result lists by public_id and tags each entry: same / reranked / dev-only / prod-only
 */
function mergeResults(devItems, prodItems) {
  const byId = new Map();
  devItems.forEach((item, i) => byId.set(item.public_id, { item, devRank: i + 1, prodRank: null, status: "dev-only" }));
  prodItems.forEach((item, i) => {
    const existing = byId.get(item.public_id);
    if (existing) {
      existing.prodRank = i + 1;
      existing.status = existing.devRank === i + 1 ? "same" : "reranked";
    } else {
      byId.set(item.public_id, { item, devRank: null, prodRank: i + 1, status: "prod-only" });
    }
  });
  return [...byId.values()].sort((a, b) => {
    const ka = Math.min(a.devRank ?? Infinity, a.prodRank ?? Infinity);
    const kb = Math.min(b.devRank ?? Infinity, b.prodRank ?? Infinity);
    return ka - kb;
  });
}

function buildResultRow(item, endpoint, env, onClick) {
  return h("div", {
    class: "px-4 py-3 flex gap-3 items-start cursor-pointer active:bg-blue-50/30",
    style: { borderBottom: "0.5px solid #F1F1F3" },
    onclick: () => onClick && onClick(item, displayName(item, endpoint)),
  },
    h("div", { class: "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5", style: { background: `${ENV_COLORS[env]}14` } },
      htmlSvg(ICON.pin(ENV_COLORS[env]))),
    h("div", { class: "flex-1 min-w-0" },
      h("div", { class: "result-text text-[15px] text-gray-900 tracking-tight leading-snug mb-1 break-words", html: resultTitleHTML(item, endpoint) }),
      resultSubtitle(item, endpoint),
      buildTypeBadges(item),
    ),
  );
}

function buildCompareResultRow(m, endpoint, target, compare, onClick) {
  const { item, status, devRank, prodRank } = m;
  const treat = {
    same: { stripe: "transparent", bg: "transparent" },
    reranked: { stripe: "#F59E0B", bg: "#FFFBEB" },
    "dev-only": { stripe: ENV_COLORS[target], bg: `${ENV_COLORS[target]}08` },
    "prod-only": { stripe: ENV_COLORS[compare], bg: `${ENV_COLORS[compare]}08` },
  }[status];

  return h("div", {
    class: "py-2.5 pl-3 pr-4 flex gap-3 items-start cursor-pointer",
    style: { background: treat.bg, borderLeft: `3px solid ${treat.stripe}`, borderBottom: "0.5px solid #F1F1F3" },
    onclick: () => onClick && onClick(item, displayName(item, endpoint)),
  },
    h("div", { class: "flex flex-col gap-0.5 shrink-0 mt-0.5", style: { minWidth: "38px" } },
      rankCell(ENV_COLORS[target], devRank),
      rankCell(ENV_COLORS[compare], prodRank),
    ),
    h("div", { class: "flex-1 min-w-0" },
      h("div", { class: "result-text text-[14px] text-gray-900 tracking-tight leading-snug mb-1 break-words", html: resultTitleHTML(item, endpoint) }),
      resultSubtitle(item, endpoint),
      h("div", { class: "flex items-center gap-1.5 flex-wrap" },
        buildTypeBadges(item),
        status === "dev-only" && diffBadge(ENV_COLORS[target], `${envLabel(target)} only`),
        status === "prod-only" && diffBadge(ENV_COLORS[compare], `${envLabel(compare, "compare")} only`),
        status === "reranked" && diffBadge("#B45309", `#${devRank} → #${prodRank}`),
      ),
    ),
  );
}

function rankCell(color, rank) {
  const has = rank != null;
  return h("div", {
    class: "flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold",
    style: { background: has ? `${color}14` : "#F1F1F3", opacity: has ? 1 : 0.5 },
  },
    h("div", { style: { width: "5px", height: "5px", borderRadius: "3px", background: has ? color : "#C7C7CC" } }),
    h("span", { style: { color: has ? color : "#8E8E93", minWidth: "12px" } }, has ? `#${rank}` : "—"),
  );
}

function diffBadge(color, text) {
  return h("span", { class: "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide font-mono", style: { background: `${color}14`, color } }, text);
}

function buildTypeBadges(item) {
  const values = item.categories?.length ? [item.categories[0]] : (item.types || []).slice(0, 3);
  return h("div", { class: "flex gap-1 flex-wrap" },
    ...values.map(t => h("span", { class: "text-[9px] font-semibold px-1.5 py-px rounded bg-[#F1F1F3] text-[#5A5A5F] uppercase tracking-wide" }, t.replace(/_/g, " "))),
  );
}

function resultSubtitle(item, endpoint) {
  if (endpoint !== "search" || !item.description) return null;
  return h("div", { class: "text-[12px] text-[#8E8E93] leading-snug mb-1 break-words" }, item.description);
}

function resultTitleHTML(item, endpoint) {
  if (endpoint === "search") return escapeHtml(item.title || "");
  if (endpoint === "geocode") return escapeHtml(item.formatted_address || "");
  if (item.matched_substrings?.description) {
    return boldMatchedSubstring(item.description, item.matched_substrings.description);
  }
  return escapeHtml(item.description || "");
}

function displayName(item, endpoint) {
  if (endpoint === "search") return [item.title, item.description].filter(Boolean).join(", ");
  if (endpoint === "geocode") return item.formatted_address || "";
  return item.description || "";
}

// ─── Detail view (single env, no diff) ────────────────────────
/**
 * Renders a single-environment detail
 * @param {Object} result - Details result
 * @param {string} env - Environment the result comes from
 * @param {Object} options
 * @param {string} options.role - "target" | "compare": which side the result comes from (PR label)
 * @param {Object} options.tabs - Target / compare / diff tabs (see compareTabs), when a comparison is loaded
 * @param {string|null} options.compareWith - Env a comparison can be requested against (shows the CTA)
 * @param {string|null} options.identicalWith - Env the result was found identical on (shows a badge)
 * @param {Error|null} options.compareError - Compare env failure, if any (shows a banner)
 * @param {Function} options.onCompare - Compare CTA handler
 * @param {Function|null} options.onBack - Back-to-results handler (shows the back row when set)
 * @param {Function} options.onAddressClick - Called with a public_id from the addresses list
 */
export function renderDetail(result, env, { role = "target", tabs, compareWith, identicalWith, compareError, onCompare, onBack, onAddressClick } = {}) {
  const content = document.getElementById("sheet-content");
  content.innerHTML = "";

  if (onBack) content.appendChild(backRow(onBack));
  content.appendChild(detailTitle(result, env, role));
  if (tabs) content.appendChild(compareTabs(tabs));
  if (identicalWith) content.appendChild(statusBanner("same", `Identical on ${envLabel(identicalWith, "compare")}`));
  if (compareError) content.appendChild(errorBanner(compareError, `${envLabel(compareWith, "compare")} request failed`, "No comparison available."));
  if (result.geometry) content.appendChild(detailCoordinates(result.geometry));
  if (result.address_components?.length) content.appendChild(detailAddressComponents(result.address_components));
  if (result.addresses?.list?.length) content.appendChild(addressesList(result.addresses, onAddressClick));

  const actionBar = document.getElementById("sheet-action-bar");
  actionBar.innerHTML = "";
  actionBar.appendChild(h("div", { class: "flex gap-2" },
    copyBarButton("Copy public_id", result.public_id || "", false),
    compareWith && !compareError ? h("button", {
      class: "flex-1 h-11 rounded-xl bg-gray-900 text-white text-[13px] font-semibold flex items-center justify-center gap-1.5",
      onclick: () => onCompare && onCompare(),
    }, htmlSvg(ICON.compare), `Compare with ${envLabel(compareWith, "compare")}`) : null,
  ));
  actionBar.classList.remove("hidden");
  content.scrollTop = 0;
}

function backRow(onBack) {
  return h("button", { class: "flex items-center gap-1 px-4 pt-1 pb-2 text-[13px] font-semibold text-[#00B0FF]", onclick: onBack },
    htmlSvg(ICON.back), "Results");
}

function statusBanner(kind, text) {
  const tone = kind === "same"
    ? { bg: "#ECFDF5", border: "#A7F3D0", color: "#065F46" }
    : { bg: "#FFF7E6", border: "#F6D89C", color: "#92400E" };
  return h("div", { class: "mx-4 mb-2.5 px-3 py-2 rounded-[10px] text-[12px] font-semibold", style: { background: tone.bg, border: `0.5px solid ${tone.border}`, color: tone.color } }, text);
}

function errorBanner(error, title, subtitle) {
  const status = errorStatus(error);
  return h("div", { class: "mx-4 mb-2.5 p-3 rounded-[10px] bg-red-50", style: { border: "0.5px solid #FCA5A5" } },
    h("div", { class: "text-[12px] font-semibold text-red-800" }, `${title} (${status})`),
    subtitle ? h("div", { class: "text-[11px] text-red-700 mt-0.5" }, subtitle) : null,
    error?.details ? h("pre", { class: "mt-1.5 text-[10px] bg-white p-2 rounded border border-red-200 overflow-x-auto font-mono" }, JSON.stringify(error.details, null, 2)) : null,
  );
}

function errorStatus(error) {
  if (error?.status) return `HTTP ${error.status}${error.statusText ? " " + error.statusText : ""}`;
  return error?.message || "Network error";
}

function detailTitle(result, env, role = "target") {
  return h("div", { class: "px-4 pt-1 pb-3" },
    h("div", { class: "flex items-start justify-between gap-2.5" },
      h("div", { class: "flex-1 min-w-0" },
        h("div", { class: "text-[20px] font-bold tracking-tight text-gray-900 leading-snug break-words" },
          result.formatted_address || result.title || result.name || result.description || "Result"),
        result.public_id ? h("div", { class: "text-[11px] text-[#8E8E93] mt-0.5 font-mono overflow-hidden text-ellipsis whitespace-nowrap" }, result.public_id) : null,
      ),
      copyIconButton(result.public_id || "", "Copy public_id"),
    ),
    h("div", { class: "flex gap-1.5 flex-wrap mt-2 items-center" },
      ...(result.types || []).map(t => h("span", { class: "text-[11px] font-semibold px-2 py-0.5 rounded bg-[#E7F6FE] text-[#005A8A]" }, t.replace(/_/g, " "))),
      ...(result.categories || []).slice(0, 1).map(c => h("span", { class: "text-[11px] font-semibold px-2 py-0.5 rounded bg-purple-100 text-purple-800" }, c.replace(/_/g, " "))),
      h("div", { class: "ml-auto flex items-center gap-1 px-2 py-0.5 rounded bg-[#F1F1F3] text-[11px] font-semibold text-[#5A5A5F]" },
        h("div", { style: { width: "6px", height: "6px", borderRadius: "3px", background: ENV_COLORS[env] } }),
        envLabel(env, role),
      ),
    ),
  );
}

function detailCoordinates(geom) {
  const acc = geom.accuracy ? geom.accuracy.replace(/_/g, " ").toLowerCase() : "";
  return h("div", { class: "mx-4 mb-2.5 rounded-xl bg-[#F7F7F9] px-3.5 pt-3 pb-3" },
    h("div", { class: "flex items-center justify-between mb-2" },
      h("div", { class: "text-[10px] font-bold tracking-wider text-[#8E8E93] uppercase" }, "Coordinates"),
      h("div", { class: "flex items-center gap-2" },
        acc ? h("div", { class: "text-[11px] text-[#5A5A5F] font-semibold" }, acc) : null,
        copyIconButton(`${geom.location.lat},${geom.location.lng}`, "Copy coordinates", "w-6 h-6"),
      ),
    ),
    coordinatesGrid(geom),
  );
}

function coordinatesGrid(geom) {
  return h("div", { class: "grid grid-cols-2 gap-3.5" },
    h("div", {},
      h("div", { class: "text-[10px] text-[#8E8E93] font-semibold tracking-wider uppercase" }, "Lat"),
      h("div", { class: "font-mono text-[15px] text-gray-900 mt-0.5" }, String(geom.location.lat)),
    ),
    h("div", {},
      h("div", { class: "text-[10px] text-[#8E8E93] font-semibold tracking-wider uppercase" }, "Lng"),
      h("div", { class: "font-mono text-[15px] text-gray-900 mt-0.5" }, String(geom.location.lng)),
    ),
  );
}

function detailAddressComponents(components) {
  return h("div", { class: "mx-4 mb-2.5 rounded-xl bg-[#F7F7F9] px-3.5 pt-2.5 pb-1" },
    h("div", { class: "text-[10px] font-bold tracking-wider text-[#8E8E93] uppercase mb-1.5" }, "Address components"),
    ...components.map((c, i) => componentRow(c.types.at(-1), h("span", { class: "text-gray-900 font-medium text-right break-words min-w-0" }, c.long_name), i < components.length - 1)),
  );
}

function componentRow(type, valueEl, hasBorder, highlighted = false) {
  return h("div", {
    class: "flex justify-between items-start gap-3 py-1.5 text-[13px]",
    style: { borderBottom: hasBorder ? "0.5px solid #ECECEE" : "none", background: highlighted ? "#FFF7E6" : "transparent", margin: highlighted ? "0 -8px" : 0, padding: highlighted ? "6px 8px" : "6px 0", borderRadius: highlighted ? "4px" : 0 },
  },
    h("span", { class: "text-[11px] text-[#8E8E93] font-mono shrink-0 pt-0.5" }, type),
    valueEl,
  );
}

/**
 * Sub-addresses of a locality (result.addresses.list), tappable to load their details
 */
function addressesList(addresses, onAddressClick) {
  const count = addresses.pagination?.address_count;
  return h("div", { class: "mx-4 mb-2.5 rounded-xl bg-[#EEF2FF] px-3.5 pt-2.5 pb-1" },
    h("div", { class: "flex items-center justify-between mb-1" },
      h("div", { class: "text-[10px] font-bold tracking-wider text-[#4338CA] uppercase" }, "Addresses"),
      count != null ? h("div", { class: "text-[11px] text-[#6366F1]" }, `${count} address${count > 1 ? "es" : ""}`) : null,
    ),
    ...addresses.list.map((addr, i) => h("button", {
      class: "w-full flex items-center justify-between gap-2 py-2 text-left text-[13px] text-gray-900",
      style: { borderBottom: i < addresses.list.length - 1 ? "0.5px solid #E0E7FF" : "none" },
      onclick: () => onAddressClick && onAddressClick(addr.public_id),
    }, h("span", { class: "min-w-0 break-words" }, addr.description), htmlSvg(ICON.chevron))),
  );
}

// ─── Compare detail (with diff) ───────────────────────────────
/**
 * Renders a side-by-side detail when target and compare results differ
 */
export function renderCompareDetail(devResult, prodResult, diff, target, compare, { tabs, onBack, onAddressClick } = {}) {
  const content = document.getElementById("sheet-content");
  content.innerHTML = "";

  const changedKeys = Object.entries(diff.fields).filter(([, v]) => v.status !== "same").map(([k]) => k);

  if (onBack) content.appendChild(backRow(onBack));
  content.appendChild(detailTitle(devResult, target));
  if (tabs) content.appendChild(compareTabs(tabs));
  content.appendChild(h("div", { class: "mx-4 mb-3 p-2.5 rounded-[10px] flex items-center gap-2.5", style: { background: "#FFF7E6", border: "0.5px solid #F6D89C" } },
    h("div", { class: "w-6 h-6 rounded-full bg-[#F59E0B] text-white text-[12px] font-bold flex items-center justify-center shrink-0" }, String(changedKeys.length)),
    h("div", { class: "flex-1 min-w-0" },
      h("div", { class: "text-[13px] font-semibold text-[#92400E] leading-tight" }, `${changedKeys.length} difference${changedKeys.length > 1 ? "s" : ""}`),
      h("div", { class: "text-[11px] text-[#B45309] font-mono mt-0.5 break-words" }, changedKeys.join(" · ")),
    ),
  ));

  content.appendChild(flatFields(diff, target, compare));
  if (diff.fields.geometry) content.appendChild(geometrySection(diff.fields.geometry, target, compare));
  if (diff.fields.address_components) content.appendChild(addressComponentsSection(diff.fields.address_components));
  if (devResult.addresses?.list?.length) content.appendChild(addressesList(devResult.addresses, onAddressClick));

  const actionBar = document.getElementById("sheet-action-bar");
  actionBar.innerHTML = "";
  actionBar.appendChild(h("div", { class: "flex gap-2" },
    copyBarButton("Copy diff", JSON.stringify({ [target]: devResult, [compare]: prodResult, diff: changedKeys }, null, 2), false),
    copyBarButton("Copy public_id", devResult.public_id || "", true),
  ));
  actionBar.classList.remove("hidden");
  content.scrollTop = 0;
}

function flatFields(diff, target, compare) {
  const simpleFields = [
    { key: "formatted_address", label: "formatted_address" },
    { key: "types", label: "types", transform: v => Array.isArray(v) ? v.join(", ") : v },
    { key: "categories", label: "category", transform: v => Array.isArray(v) ? v.join(", ") : v },
    { key: "title", label: "title" },
    { key: "name", label: "name" },
    { key: "description", label: "description" },
  ];
  const container = h("div", { class: "mx-4 mb-1" });
  for (const { key, label, transform } of simpleFields) {
    const f = diff.fields[key];
    if (!f) continue;
    const devVal = transform ? transform(f.devValue) : f.devValue;
    const prodVal = transform ? transform(f.prodValue) : f.prodValue;
    if (f.status === "same") {
      if (devVal != null) container.appendChild(flatRow(label, String(devVal)));
    } else {
      container.appendChild(diffRow(label, devVal, prodVal, target, compare));
    }
  }
  return container;
}

/**
 * Target / compare / diff segmented control shown once a comparison is loaded
 * @param {{active: string, target: string, compare: string, diffCount: number, onSelect: Function}} tabs
 *   active is "target" | "compare" | "diff"; onSelect receives the tapped tab
 */
export function compareTabs({ active, target, compare, diffCount, onSelect }) {
  return h("div", { class: "px-4 mb-2" },
    h("div", { class: "bg-[#EDEDF0] rounded-[9px] p-0.5 flex" },
      segmentedTab(envLabel(target), active === "target", ENV_COLORS[target], null, () => onSelect("target")),
      segmentedTab(envLabel(compare, "compare"), active === "compare", ENV_COLORS[compare], null, () => onSelect("compare")),
      segmentedTab("Compare", active === "diff", null, diffCount, () => onSelect("diff")),
    ),
  );
}

function segmentedTab(label, active, dot, badge, onClick) {
  return h("button", {
    class: `flex-1 h-[30px] rounded-[7px] flex items-center justify-center gap-1 text-[12px] font-semibold tracking-tight ${active ? "text-gray-900" : "text-[#5A5A5F]"}`,
    style: active ? { background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)" } : {},
    onclick: onClick,
  },
    dot ? h("div", { style: { width: "6px", height: "6px", borderRadius: "3px", background: dot } }) : null,
    label,
    badge != null ? h("div", { class: "min-w-[17px] h-4 rounded-full text-white text-[10px] font-bold px-1 flex items-center justify-center ml-0.5", style: { background: active ? "#F59E0B" : "#C7C7CC" } }, String(badge)) : null,
  );
}

function flatRow(label, value) {
  return h("div", { class: "py-2", style: { borderBottom: "0.5px solid #ECECEE" } },
    h("div", { class: "text-[10px] font-bold tracking-wider text-[#8E8E93] uppercase font-mono" }, label),
    h("div", { class: "text-[14px] text-gray-900 tracking-tight mt-0.5 break-words" }, value),
  );
}

function diffRow(label, devVal, prodVal, target, compare) {
  return h("div", { class: "rounded-[10px] p-2.5 mb-1.5", style: { background: "#FFFBEB", border: "0.5px solid #FDE68A", borderLeft: "3px solid #F59E0B" } },
    h("div", { class: "flex items-center justify-between mb-1.5" },
      h("div", { class: "text-[11px] font-bold text-[#92400E] tracking-wide font-mono" }, label),
      h("div", { class: "text-[9px] font-bold text-[#92400E] tracking-wider" }, "CHANGED"),
    ),
    h("div", { class: "grid grid-cols-2 gap-1.5" },
      diffSide(ENV_COLORS[target], envLabel(target), devVal),
      diffSide(ENV_COLORS[compare], envLabel(compare, "compare"), prodVal),
    ),
  );
}

function diffSide(color, label, value) {
  return h("div", { class: "px-2 py-1.5 rounded-[7px] bg-white min-w-0", style: { borderLeft: `3px solid ${color}` } },
    h("div", { class: "text-[9px] font-bold tracking-wider uppercase", style: { color } }, label),
    h("div", { class: "text-[12px] text-gray-900 font-medium font-mono mt-0.5 break-all" },
      value != null ? String(value) : h("i", { class: "text-[#8E8E93] not-italic" }, "absent")),
  );
}

function sectionHeader(title, badgeText, same) {
  return h("div", { class: "text-[10px] font-bold tracking-wider text-[#8E8E93] uppercase pt-3 pb-1.5 px-1 flex items-center gap-1.5" },
    title,
    h("span", { class: "text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded", style: same ? { background: "#D1FAE5", color: "#065F46" } : { background: "#FBBF24", color: "#7C2D12" } }, badgeText),
  );
}

function geometrySection(geomDiff, target, compare) {
  const root = h("div", { class: "mx-4" });
  if (geomDiff.status === "same") {
    if (!geomDiff.devValue) return root;
    root.appendChild(sectionHeader("Geometry", "=", true));
    root.appendChild(h("div", { class: "mb-2.5 rounded-xl bg-[#F7F7F9] px-3.5 pt-3 pb-3" }, coordinatesGrid(geomDiff.devValue)));
    return root;
  }
  const dev = geomDiff.devValue, prod = geomDiff.prodValue;
  const accSame = dev?.accuracy === prod?.accuracy;
  const locSame = deepEqual(dev?.location, prod?.location);
  const viewportSame = deepEqual(dev?.viewport, prod?.viewport);
  const diffsHere = (accSame ? 0 : 1) + (locSame ? 0 : 1) + (viewportSame ? 0 : 1);
  root.appendChild(sectionHeader("Geometry", `${diffsHere} DIFF`, false));
  if (!accSame) root.appendChild(diffRow("accuracy", dev?.accuracy, prod?.accuracy, target, compare));
  if (!locSame) {
    root.appendChild(diffRow("location.lat", dev?.location?.lat, prod?.location?.lat, target, compare));
    root.appendChild(diffRow("location.lng", dev?.location?.lng, prod?.location?.lng, target, compare));
  }
  if (!viewportSame) root.appendChild(diffRow("viewport", JSON.stringify(dev?.viewport), JSON.stringify(prod?.viewport), target, compare));
  return root;
}

function addressComponentsSection(acDiff) {
  if (acDiff.status === "same") {
    const comps = acDiff.devValue || [];
    return h("div", { class: "mx-4 mt-3 px-3.5 py-2.5 bg-[#F7F7F9] rounded-xl flex items-center justify-between" },
      h("div", {},
        h("div", { class: "text-[10px] font-bold tracking-wider text-[#8E8E93] uppercase" }, "address_components"),
        h("div", { class: "text-[13px] text-gray-900 mt-0.5" }, `${comps.length} components · identical`),
      ),
      h("div", { class: "text-[9px] font-bold text-[#065F46] tracking-wider px-1.5 py-0.5 rounded", style: { background: "#D1FAE5" } }, "="),
    );
  }
  const devMap = Object.fromEntries((acDiff.devValue || []).map(c => [c.types.at(-1), c.long_name]));
  const prodMap = Object.fromEntries((acDiff.prodValue || []).map(c => [c.types.at(-1), c.long_name]));
  const types = [...new Set([...Object.keys(devMap), ...Object.keys(prodMap)])];

  return h("div", { class: "mx-4 mt-3 px-3.5 py-2.5 bg-[#F7F7F9] rounded-xl" },
    h("div", { class: "text-[10px] font-bold tracking-wider text-[#8E8E93] uppercase mb-1.5" }, "address_components"),
    ...types.map((type, i) => {
      const d = devMap[type], p = prodMap[type];
      const same = d === p;
      const value = same
        ? h("span", { class: "text-gray-900 font-medium text-right break-words min-w-0" }, d)
        : h("span", { class: "text-[11px] text-right break-all min-w-0" },
            h("span", { style: { color: "#b71c1c", fontWeight: 600 } }, d ?? h("i", { class: "not-italic text-[#8E8E93]" }, "absent")),
            " | ",
            h("span", { style: { color: "#1565C0", fontWeight: 600 } }, p ?? h("i", { class: "not-italic text-[#8E8E93]" }, "absent")),
          );
      return componentRow(type, value, i < types.length - 1, !same);
    }),
  );
}

// ─── Copy buttons ─────────────────────────────────────────────
function copyIconButton(value, title, size = "w-8 h-8") {
  const btn = h("button", { class: `${size} rounded-full bg-[#F1F1F3] flex items-center justify-center shrink-0`, title }, htmlSvg(ICON.copy()));
  btn.addEventListener("click", () => copyWithFeedback(btn, value, ICON.copy(), ICON.check("#059669")));
  return btn;
}

function copyBarButton(label, value, primary) {
  const btn = h("button", {
    class: `flex-1 h-11 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-1.5 ${primary ? "text-white" : "bg-[#F1F1F3] text-gray-900"}`,
    style: primary ? { background: "#00B0FF", boxShadow: "0 3px 10px rgba(0,176,255,0.28)" } : {},
  }, htmlSvg(ICON.copy(primary ? "white" : "#111")), label);
  btn.addEventListener("click", () => copyWithFeedback(btn, value, ICON.copy(primary ? "white" : "#111"), ICON.check(primary ? "white" : "#059669")));
  return btn;
}

/**
 * Copies a value and swaps the button icon to a check mark for a moment
 */
function copyWithFeedback(btn, value, idleSvg, doneSvg) {
  if (!value || !navigator.clipboard) return;
  navigator.clipboard.writeText(value).then(() => {
    const icon = btn.querySelector("span");
    if (!icon) return;
    icon.innerHTML = doneSvg;
    setTimeout(() => { icon.innerHTML = idleSvg; }, 1500);
  }).catch(() => {});
}

// ─── Helpers ──────────────────────────────────────────────────
export function showEmpty() {
  const content = document.getElementById("sheet-content");
  content.innerHTML = `<div class="flex flex-col items-center justify-center py-10 px-8 text-center">
    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" class="text-gray-300 mb-3">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" stroke="currentColor" d="M21 21l-5-5m1.5-5.5a7 7 0 11-14 0 7 7 0 0114 0z"/>
    </svg>
    <p class="text-sm text-[#8E8E93]">Search for a location or<br/>tap on the map.</p>
  </div>`;
  hideActionBar();
}

/**
 * Replaces the sheet content with a short centered message (e.g. no reverse geocode result)
 * @param {string} text - Message
 */
export function showNotice(text) {
  const content = document.getElementById("sheet-content");
  content.innerHTML = "";
  content.scrollTop = 0;
  content.appendChild(h("div", { class: "py-10 px-8 text-center text-sm text-[#8E8E93]" }, text));
  hideActionBar();
}

export function hideActionBar() {
  document.getElementById("sheet-action-bar").classList.add("hidden");
}

export function showError(error) {
  const modal = document.getElementById("error-modal");
  const msg = document.getElementById("error-message");
  if (!modal || !msg) return;
  const status = errorStatus(error);
  msg.innerHTML = error?.details
    ? `<div class="font-semibold mb-1">${escapeHtml(status)}</div><pre class="text-[11px] overflow-x-auto">${escapeHtml(JSON.stringify(error.details, null, 2))}</pre>`
    : escapeHtml(status);
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}
