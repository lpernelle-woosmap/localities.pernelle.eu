// mobile-ui.js — DOM rendering for the mobile experience.
// Pure functions: build DOM from data, attach listeners. State lives in mobile-app.js.

import { escapeHtml, boldMatchedSubstring } from "./utils.js";
import { deepEqual } from "./diff-utils.js";

// ─── tiny createElement helper ────────────────────────────────
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

// ─── env display in glass header ──────────────────────────────
const ENV_COLORS = { dev: "#b71c1c", prod: "#1565C0", pr: "#F59E0B" };
const ENV_LABELS = { dev: "DEV", prod: "PROD", pr: "PR" };

export function renderEnvDisplay({ target, compare, targetLatency, compareLatency }) {
  const root = document.getElementById("env-display");
  if (!root) return;
  root.innerHTML = "";

  const dot = (env) => h("div", { class: "shrink-0", style: { width: "7px", height: "7px", borderRadius: "4px", background: ENV_COLORS[env] } });
  const label = (env, latency) => h("div", { class: "flex items-center gap-1.5 shrink-0" },
    dot(env),
    h("span", { class: "text-[11px] font-bold tracking-wide text-gray-900" }, ENV_LABELS[env]),
    latency != null ? h("span", { class: "text-[10px] font-medium text-[#8E8E93] font-mono" }, `${latency}ms`) : null,
  );

  root.appendChild(label(target, targetLatency));
  if (compare && compare !== "none") {
    root.appendChild(h("div", { class: "shrink-0 mx-1.5", style: { width: "12px", height: "0.5px", background: "#C7C7CC" } }));
    root.appendChild(label(compare, compareLatency));
  } else {
    root.appendChild(h("div", { class: "ml-2 text-[11px] text-[#8E8E93] font-medium shrink-0" }, "+ Compare"));
  }
}

export function renderEndpointDisplay(endpoint) {
  const el = document.getElementById("endpoint-display");
  if (el) el.textContent = endpoint;
}

// ─── active chips above sheet content ─────────────────────────
export function renderActiveChips({ types, excludedTypes, countries, extended, bias, language }) {
  const root = document.getElementById("active-chips");
  if (!root) return;
  root.innerHTML = "";
  const chip = (text, variant = "active") => h("span", {
    class: variant === "active"
      ? "px-2.5 py-1 rounded-[12px] bg-[#E7F6FE] text-[#005A8A] text-[12px] font-semibold tracking-tight border border-[#B6E1F5]"
      : "px-2.5 py-1 rounded-[12px] bg-[#F1F1F3] text-[#5A5A5F] text-[12px] font-medium tracking-tight",
  }, text);

  for (const t of types) root.appendChild(chip(t));
  for (const c of countries) root.appendChild(chip(`${flagEmoji(c.id)} ${c.id}`));
  if (excludedTypes.length) root.appendChild(chip(`-${excludedTypes.length} excl`, "muted"));
  if (extended) root.appendChild(chip("extended"));
  if (bias) root.appendChild(chip("bias"));
  if (language) root.appendChild(chip(language));
}

function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return "";
  const base = 127397;
  return String.fromCodePoint(...cc.toUpperCase().split("").map(c => base + c.charCodeAt(0)));
}

// ─── search results: single env OR compare mode ───────────────
export function renderResults({ devResponse, compareResponse, endpoint, target, compare, onResultClick }) {
  const content = document.getElementById("sheet-content");
  content.innerHTML = "";

  const devItems = extractItems(devResponse, endpoint);
  const compareItems = extractItems(compareResponse, endpoint);

  if (!devItems.length && !compareItems.length) {
    content.appendChild(h("div", { class: "flex flex-col items-center justify-center py-12 px-8 text-center" },
      h("p", { class: "text-sm text-[#8E8E93]" }, "No results."),
    ));
    return;
  }

  // No compare mode: simple list
  if (!compareResponse) {
    content.appendChild(h("div", { class: "flex items-center justify-between px-5 pt-1.5 pb-2" },
      h("div", { class: "text-[12px] font-bold tracking-wider text-[#8E8E93] uppercase" },
        `${devItems.length} result${devItems.length > 1 ? "s" : ""} · ${ENV_LABELS[target]}`),
    ));
    for (const item of devItems) {
      content.appendChild(buildResultRow(item, endpoint, target, { active: false, onClick: onResultClick }));
    }
    return;
  }

  // Compare mode: merge by public_id, annotate status
  const merged = mergeResults(devItems, compareItems);
  const diffCount = merged.filter(m => m.status !== "same").length;
  const devCount = merged.filter(m => m.devRank != null).length;
  const prodCount = merged.filter(m => m.prodRank != null).length;

  // Banner
  content.appendChild(h("div", { class: "mx-4 mt-1 mb-2 p-2.5 rounded-[10px] flex items-center gap-2.5", style: { background: "#FFF7E6", border: "0.5px solid #F6D89C" } },
    h("div", { class: "w-[22px] h-[22px] rounded-full bg-[#F59E0B] text-white text-[11px] font-bold flex items-center justify-center shrink-0" }, String(diffCount)),
    h("div", { class: "flex-1 min-w-0" },
      h("div", { class: "text-[13px] font-semibold text-[#92400E] leading-tight" },
        diffCount === 0 ? "Result lists match" : "Result lists differ"),
      h("div", { class: "text-[11px] text-[#B45309] mt-0.5 font-mono whitespace-nowrap" },
        h("span", { style: { color: ENV_COLORS[target], fontWeight: 700 } }, `${devCount} ${ENV_LABELS[target]}`),
        " · ",
        h("span", { style: { color: ENV_COLORS[compare], fontWeight: 700 } }, `${prodCount} ${ENV_LABELS[compare]}`),
        " · ",
        h("span", {}, `${diffCount}Δ`),
      ),
    ),
  ));

  for (const m of merged) {
    content.appendChild(buildCompareResultRow(m, endpoint, target, compare, { onClick: onResultClick }));
  }
}

function extractItems(response, endpoint) {
  if (!response) return [];
  if (endpoint === "search" || endpoint === "geocode") return response.results || [];
  return response.localities || [];
}

function mergeResults(devItems, prodItems) {
  // Key by public_id
  const byId = new Map();
  devItems.forEach((item, i) => byId.set(item.public_id, { item, devRank: i + 1, prodRank: null, status: "dev-only" }));
  prodItems.forEach((item, i) => {
    const existing = byId.get(item.public_id);
    if (existing) {
      existing.prodRank = i + 1;
      // Use most recent (prod) for display when both present
      existing.item = item;
      existing.status = existing.devRank === i + 1 ? "same" : "reranked";
    } else {
      byId.set(item.public_id, { item, devRank: null, prodRank: i + 1, status: "prod-only" });
    }
  });
  // Order: by min(devRank, prodRank)
  return [...byId.values()].sort((a, b) => {
    const ka = Math.min(a.devRank ?? Infinity, a.prodRank ?? Infinity);
    const kb = Math.min(b.devRank ?? Infinity, b.prodRank ?? Infinity);
    return ka - kb;
  });
}

function buildResultRow(item, endpoint, env, { active = false, onClick }) {
  const row = h("div", {
    class: `px-4 py-3 flex gap-3 items-start cursor-pointer transition-colors active:bg-blue-50/30 ${active ? "bg-[#F7FBFD]" : ""}`,
    style: { borderLeft: active ? "3px solid #00B0FF" : "3px solid transparent" },
    onclick: () => onClick && onClick(item, displayName(item, endpoint)),
  },
    h("div", {
      class: "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
      style: { background: `${ENV_COLORS[env]}14`, color: ENV_COLORS[env] },
    },
      pinIcon(ENV_COLORS[env]),
    ),
    h("div", { class: "flex-1 min-w-0" },
      h("div", { class: "result-text text-[15px] text-gray-900 tracking-tight leading-snug mb-1", html: resultTitleHTML(item, endpoint) }),
      buildTypeBadges(item),
    ),
  );
  return row;
}

function buildCompareResultRow(m, endpoint, target, compare, { onClick }) {
  const { item, status, devRank, prodRank } = m;
  const treat = {
    same:       { stripe: "transparent", bg: "transparent" },
    reranked:   { stripe: "#F59E0B",     bg: "#FFFBEB"     },
    "dev-only": { stripe: ENV_COLORS[target],  bg: `${ENV_COLORS[target]}08`  },
    "prod-only":{ stripe: ENV_COLORS[compare], bg: `${ENV_COLORS[compare]}08` },
  }[status];

  return h("div", {
    class: "py-2.5 pl-3 pr-4 flex gap-3 items-start cursor-pointer",
    style: { background: treat.bg, borderLeft: `3px solid ${treat.stripe}`, borderBottom: "0.5px solid #F1F1F3" },
    onclick: () => onClick && onClick(item, displayName(item, endpoint)),
  },
    // rank pair (mini column)
    h("div", { class: "flex flex-col gap-0.5 shrink-0 mt-0.5", style: { minWidth: "38px" } },
      rankCell(ENV_COLORS[target], devRank),
      rankCell(ENV_COLORS[compare], prodRank),
    ),
    h("div", { class: "flex-1 min-w-0" },
      h("div", { class: "result-text text-[14px] text-gray-900 tracking-tight leading-snug mb-1", html: resultTitleHTML(item, endpoint) }),
      h("div", { class: "flex items-center gap-1.5 flex-wrap" },
        buildTypeBadges(item),
        status === "dev-only" && diffBadge(ENV_COLORS[target], `${ENV_LABELS[target]} only`),
        status === "prod-only" && diffBadge(ENV_COLORS[compare], `${ENV_LABELS[compare]} only`),
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
  return h("span", {
    class: "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide font-mono",
    style: { background: `${color}14`, color },
  }, text);
}

function pinIcon(color) {
  const s = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 22s7-7.5 7-13a7 7 0 10-14 0c0 5.5 7 13 7 13z" stroke="${color}" stroke-width="1.6" /><circle cx="12" cy="9" r="2.4" stroke="${color}" stroke-width="1.6" /></svg>`;
  const span = document.createElement("span");
  span.innerHTML = s;
  return span;
}

function buildTypeBadges(item) {
  const types = item.types || [];
  return h("div", { class: "flex gap-1 flex-wrap" },
    ...types.slice(0, 3).map(t => h("span", {
      class: "text-[9px] font-semibold px-1.5 py-px rounded bg-[#F1F1F3] text-[#5A5A5F] uppercase tracking-wide",
    }, t.replace(/_/g, " "))),
  );
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
  if (endpoint === "search") return item.title || "";
  if (endpoint === "geocode") return item.formatted_address || "";
  return item.description || "";
}

// ─── Detail view (single env, no diff) ────────────────────────
export function renderDetail(result, env, hasCompareAvailable, { onCompare } = {}) {
  const content = document.getElementById("sheet-content");
  content.innerHTML = "";

  // Title block
  content.appendChild(detailTitle(result, env, null));

  // Sections
  if (result.geometry) {
    content.appendChild(detailCoordinates(result.geometry));
  }
  if (result.address_components?.length) {
    content.appendChild(detailAddressComponents(result.address_components));
  }

  // Action bar
  const actionBar = document.getElementById("sheet-action-bar");
  actionBar.innerHTML = "";
  if (hasCompareAvailable) {
    actionBar.appendChild(h("button", {
      class: "w-full h-11 rounded-xl bg-gray-900 text-white text-[14px] font-semibold flex items-center justify-center gap-1.5 mb-2",
      onclick: () => onCompare && onCompare(),
    },
      htmlSvg(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M7 4l-3 3 3 3M4 7h12M17 14l3 3-3 3M20 17H8" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>`),
      `Compare with ${ENV_LABELS[hasCompareAvailable] || "PROD"}`,
    ));
  }
  actionBar.classList.remove("hidden");
}

function detailTitle(result, env, compareEnv) {
  return h("div", { class: "px-4 pt-1 pb-3" },
    h("div", { class: "flex items-start justify-between gap-2.5" },
      h("div", { class: "flex-1 min-w-0" },
        h("div", { class: "text-[22px] font-bold tracking-tight text-gray-900 leading-snug" },
          result.formatted_address || result.title || result.name || result.description || "Result"),
        result.public_id ? h("div", {
          class: "text-[11px] text-[#8E8E93] mt-0.5 font-mono overflow-hidden text-ellipsis whitespace-nowrap",
        }, result.public_id) : null,
      ),
      h("button", {
        class: "w-8 h-8 rounded-full bg-[#F1F1F3] flex items-center justify-center shrink-0",
        onclick: () => result.public_id && navigator.clipboard?.writeText(result.public_id),
      },
        htmlSvg(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="12" height="12" rx="2" stroke="#111" stroke-width="1.6" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" stroke="#111" stroke-width="1.6" /></svg>`),
      ),
    ),
    h("div", { class: "flex gap-1.5 flex-wrap mt-2 items-center" },
      ...(result.types || []).map(t => h("span", {
        class: "text-[11px] font-semibold px-2 py-0.5 rounded bg-[#E7F6FE] text-[#005A8A]",
      }, t)),
      h("div", { class: "ml-auto flex items-center gap-1 px-2 py-0.5 rounded bg-[#F1F1F3] text-[11px] font-semibold text-[#5A5A5F]" },
        h("div", { style: { width: "6px", height: "6px", borderRadius: "3px", background: ENV_COLORS[env] } }),
        ENV_LABELS[env],
      ),
    ),
  );
}

function detailCoordinates(geom) {
  const acc = geom.accuracy ? geom.accuracy.replace(/_/g, " ").toLowerCase() : "";
  return h("div", { class: "mx-4 mb-2.5 rounded-xl bg-[#F7F7F9] px-3.5 pt-3 pb-3" },
    h("div", { class: "flex items-center justify-between mb-2" },
      h("div", { class: "text-[10px] font-bold tracking-wider text-[#8E8E93] uppercase" }, "Coordinates"),
      acc ? h("div", { class: "text-[11px] text-[#5A5A5F] font-semibold" }, acc) : null,
    ),
    h("div", { class: "grid grid-cols-2 gap-3.5" },
      h("div", {},
        h("div", { class: "text-[10px] text-[#8E8E93] font-semibold tracking-wider uppercase" }, "Lat"),
        h("div", { class: "font-mono text-[15px] text-gray-900 mt-0.5" }, String(geom.location.lat)),
      ),
      h("div", {},
        h("div", { class: "text-[10px] text-[#8E8E93] font-semibold tracking-wider uppercase" }, "Lng"),
        h("div", { class: "font-mono text-[15px] text-gray-900 mt-0.5" }, String(geom.location.lng)),
      ),
    ),
  );
}

function detailAddressComponents(components) {
  return h("div", { class: "mx-4 mb-2.5 rounded-xl bg-[#F7F7F9] px-3.5 pt-2.5 pb-1" },
    h("div", { class: "text-[10px] font-bold tracking-wider text-[#8E8E93] uppercase mb-1.5" }, "Address components"),
    ...components.map((c, i) => h("div", {
      class: "flex justify-between items-center py-1.5 text-[13px]",
      style: { borderBottom: i < components.length - 1 ? "0.5px solid #ECECEE" : "none" },
    },
      h("span", { class: "text-[11px] text-[#8E8E93] font-mono" }, c.types[c.types.length - 1]),
      h("span", { class: "text-gray-900 font-medium" }, c.long_name),
    )),
  );
}

// ─── Compare detail (with diff) ───────────────────────────────
export function renderCompareDetail(devResult, prodResult, diff, target, compare) {
  const content = document.getElementById("sheet-content");
  content.innerHTML = "";

  // Title (same as single, but with diff context)
  content.appendChild(detailTitle(devResult, target, compare));

  // Segmented control with diff badge
  const diffCount = Object.values(diff.fields).filter(f => f.status !== "same").length;
  content.appendChild(h("div", { class: "px-4 mb-2" },
    h("div", { class: "bg-[#EDEDF0] rounded-[9px] p-0.5 flex" },
      segmentedTab(ENV_LABELS[target], false, ENV_COLORS[target]),
      segmentedTab(ENV_LABELS[compare], false, ENV_COLORS[compare]),
      segmentedTab("Compare", true, null, diffCount),
    ),
  ));

  // Diff summary banner
  const changedKeys = Object.entries(diff.fields).filter(([, v]) => v.status !== "same").map(([k]) => k);
  content.appendChild(h("div", {
    class: "mx-4 mb-3 p-2.5 rounded-[10px] flex items-center gap-2.5",
    style: { background: "#FFF7E6", border: "0.5px solid #F6D89C" },
  },
    h("div", { class: "w-6 h-6 rounded-full bg-[#F59E0B] text-white text-[12px] font-bold flex items-center justify-center shrink-0" }, String(changedKeys.length)),
    h("div", { class: "flex-1 min-w-0" },
      h("div", { class: "text-[13px] font-semibold text-[#92400E] leading-tight" }, `${changedKeys.length} differences`),
      h("div", { class: "text-[11px] text-[#B45309] font-mono mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis" }, changedKeys.join(" · ")),
    ),
  ));

  // Flat identical fields first
  const simpleFields = [
    { key: "formatted_address", label: "formatted_address" },
    { key: "types", label: "types", transform: v => Array.isArray(v) ? v.join(", ") : v },
    { key: "categories", label: "category", transform: v => Array.isArray(v) ? v.join(", ") : v },
    { key: "title", label: "title" },
    { key: "name", label: "name" },
    { key: "description", label: "description" },
  ];
  const flatContainer = h("div", { class: "mx-4 mb-1" });
  for (const { key, label, transform } of simpleFields) {
    const f = diff.fields[key];
    if (!f) continue;
    const devVal = transform ? transform(f.devValue) : f.devValue;
    const prodVal = transform ? transform(f.prodValue) : f.prodValue;
    if (f.status === "same") {
      if (devVal == null) continue;
      flatContainer.appendChild(flatRow(label, String(devVal), "same"));
    } else {
      flatContainer.appendChild(diffRow(label, devVal, prodVal, target, compare));
    }
  }
  content.appendChild(flatContainer);

  // Geometry section
  const geom = diff.fields.geometry;
  if (geom) {
    content.appendChild(geometrySection(geom, target, compare));
  }

  // Address components — collapse if same, otherwise compact diff
  const ac = diff.fields.address_components;
  if (ac) {
    content.appendChild(addressComponentsSection(ac));
  }

  // Action bar: copy diff + close compare
  const actionBar = document.getElementById("sheet-action-bar");
  actionBar.innerHTML = "";
  actionBar.appendChild(h("div", { class: "flex gap-2 mb-2" },
    h("button", {
      class: "flex-1 h-11 rounded-xl bg-[#F1F1F3] text-gray-900 text-[13px] font-semibold flex items-center justify-center gap-1.5",
      onclick: () => navigator.clipboard?.writeText(JSON.stringify({ dev: devResult, prod: prodResult, diff: changedKeys }, null, 2)),
    },
      htmlSvg(`<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="8" y="8" width="12" height="12" rx="2" stroke="#111" stroke-width="1.6" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" stroke="#111" stroke-width="1.6" /></svg>`),
      "Copy diff",
    ),
    h("button", {
      class: "flex-1 h-11 rounded-xl text-white text-[13px] font-semibold flex items-center justify-center gap-1.5",
      style: { background: "#00B0FF", boxShadow: "0 3px 10px rgba(0,176,255,0.28)" },
      onclick: () => navigator.clipboard?.writeText(devResult.public_id || ""),
    },
      "Copy public_id",
    ),
  ));
  actionBar.classList.remove("hidden");
}

function segmentedTab(label, active, dot, badge) {
  return h("div", {
    class: `flex-1 h-[30px] rounded-[7px] flex items-center justify-center gap-1 text-[12px] font-semibold tracking-tight ${active ? "text-gray-900" : "text-[#5A5A5F]"}`,
    style: active ? { background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)" } : {},
  },
    dot ? h("div", { style: { width: "6px", height: "6px", borderRadius: "3px", background: dot } }) : null,
    label,
    badge != null ? h("div", {
      class: "min-w-[17px] h-4 rounded-full text-white text-[10px] font-bold px-1 flex items-center justify-center ml-0.5",
      style: { background: active ? "#F59E0B" : "#C7C7CC" },
    }, String(badge)) : null,
  );
}

function flatRow(label, value, status) {
  return h("div", { class: "py-2", style: { borderBottom: "0.5px solid #ECECEE" } },
    h("div", { class: "text-[10px] font-bold tracking-wider text-[#8E8E93] uppercase font-mono" }, label),
    h("div", { class: "text-[14px] text-gray-900 tracking-tight mt-0.5 break-words" }, value),
  );
}

function diffRow(label, devVal, prodVal, target, compare) {
  return h("div", {
    class: "rounded-[10px] p-2.5 mb-1.5",
    style: { background: "#FFFBEB", borderLeft: "3px solid #F59E0B", border: "0.5px solid #FDE68A", borderLeftWidth: "3px" },
  },
    h("div", { class: "flex items-center justify-between mb-1.5" },
      h("div", { class: "text-[11px] font-bold text-[#92400E] tracking-wide font-mono" }, label),
      h("div", { class: "text-[9px] font-bold text-[#92400E] tracking-wider" }, "CHANGED"),
    ),
    h("div", { class: "grid grid-cols-2 gap-1.5" },
      diffSide(ENV_COLORS[target], ENV_LABELS[target], devVal),
      diffSide(ENV_COLORS[compare], ENV_LABELS[compare], prodVal),
    ),
  );
}

function diffSide(color, label, value) {
  return h("div", {
    class: "px-2 py-1.5 rounded-[7px] bg-white",
    style: { borderLeft: `3px solid ${color}` },
  },
    h("div", { class: "text-[9px] font-bold tracking-wider uppercase", style: { color } }, label),
    h("div", { class: "text-[12px] text-gray-900 font-medium font-mono mt-0.5 break-all" },
      value != null ? String(value) : h("i", { class: "text-[#8E8E93] not-italic" }, "absent")),
  );
}

function geometrySection(geomDiff, target, compare) {
  const root = h("div", { class: "mx-4" });
  if (geomDiff.status === "same") {
    const g = geomDiff.devValue;
    if (!g) return root;
    root.appendChild(h("div", { class: "text-[10px] font-bold tracking-wider text-[#8E8E93] uppercase pt-3 pb-1.5 px-1 flex items-center gap-1.5" },
      "Geometry",
      h("span", { class: "text-[9px] font-bold text-[#065F46] tracking-wider px-1.5 py-0.5 rounded", style: { background: "#D1FAE5" } }, "="),
    ));
    root.appendChild(detailCoordinatesInline(g));
    return root;
  }
  const dev = geomDiff.devValue, prod = geomDiff.prodValue;
  const accSame = dev?.accuracy === prod?.accuracy;
  const locSame = deepEqual(dev?.location, prod?.location);
  const diffsHere = (accSame ? 0 : 1) + (locSame ? 0 : 1);
  root.appendChild(h("div", { class: "text-[10px] font-bold tracking-wider text-[#8E8E93] uppercase pt-3 pb-1.5 px-1 flex items-center gap-1.5" },
    "Geometry",
    h("span", { class: "text-[9px] font-bold text-[#7C2D12] tracking-wider px-1.5 py-0.5 rounded", style: { background: "#FBBF24" } }, `${diffsHere} DIFF`),
  ));
  if (!accSame) root.appendChild(diffRow("accuracy", dev?.accuracy, prod?.accuracy, target, compare));
  if (!locSame) {
    root.appendChild(diffRow("location.lat", dev?.location?.lat, prod?.location?.lat, target, compare));
    root.appendChild(diffRow("location.lng", dev?.location?.lng, prod?.location?.lng, target, compare));
  }
  return root;
}

function detailCoordinatesInline(geom) {
  return h("div", { class: "mb-2.5 rounded-xl bg-[#F7F7F9] px-3.5 pt-3 pb-3" },
    h("div", { class: "grid grid-cols-2 gap-3.5" },
      h("div", {},
        h("div", { class: "text-[10px] text-[#8E8E93] font-semibold tracking-wider uppercase" }, "Lat"),
        h("div", { class: "font-mono text-[15px] text-gray-900 mt-0.5" }, String(geom.location.lat)),
      ),
      h("div", {},
        h("div", { class: "text-[10px] text-[#8E8E93] font-semibold tracking-wider uppercase" }, "Lng"),
        h("div", { class: "font-mono text-[15px] text-gray-900 mt-0.5" }, String(geom.location.lng)),
      ),
    ),
  );
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
  // Show row-by-row diff
  const dev = acDiff.devValue || [];
  const prod = acDiff.prodValue || [];
  const devMap = Object.fromEntries(dev.map(c => [c.types.at(-1), c.long_name]));
  const prodMap = Object.fromEntries(prod.map(c => [c.types.at(-1), c.long_name]));
  const types = [...new Set([...Object.keys(devMap), ...Object.keys(prodMap)])];

  return h("div", { class: "mx-4 mt-3 px-3.5 py-2.5 bg-[#F7F7F9] rounded-xl" },
    h("div", { class: "text-[10px] font-bold tracking-wider text-[#8E8E93] uppercase mb-1.5" }, "address_components"),
    ...types.map((type, i) => {
      const d = devMap[type], p = prodMap[type];
      const same = d === p;
      return h("div", {
        class: "flex justify-between items-center py-1.5 text-[12px]",
        style: { borderBottom: i < types.length - 1 ? "0.5px solid #ECECEE" : "none", background: same ? "transparent" : "#FFF7E6", margin: same ? 0 : "0 -8px", padding: same ? "6px 0" : "6px 8px", borderRadius: same ? 0 : "4px" },
      },
        h("span", { class: "text-[11px] text-[#8E8E93] font-mono" }, type),
        same
          ? h("span", { class: "text-gray-900 font-medium" }, d)
          : h("span", { class: "text-[11px]" },
              h("span", { style: { color: "#b71c1c", fontWeight: 600 } }, d ?? h("i", { class: "not-italic text-[#8E8E93]" }, "absent")),
              " | ",
              h("span", { style: { color: "#1565C0", fontWeight: 600 } }, p ?? h("i", { class: "not-italic text-[#8E8E93]" }, "absent")),
            ),
      );
    }),
  );
}

// ─── Helpers ──────────────────────────────────────────────────
function htmlSvg(svgStr) {
  const span = document.createElement("span");
  span.innerHTML = svgStr;
  span.style.display = "inline-flex";
  return span;
}

export function showEmpty() {
  const content = document.getElementById("sheet-content");
  content.innerHTML = `<div class="flex flex-col items-center justify-center py-12 px-8 text-center">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" class="text-gray-300 mb-3">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6" stroke="currentColor" d="M21 21l-5-5m1.5-5.5a7 7 0 11-14 0 7 7 0 0114 0z"/>
    </svg>
    <p class="text-sm text-[#8E8E93]">Search for a location or<br/>tap on the map.</p>
  </div>`;
  document.getElementById("sheet-action-bar").classList.add("hidden");
}

export function hideActionBar() {
  document.getElementById("sheet-action-bar").classList.add("hidden");
}

export function showError(error) {
  const modal = document.getElementById("error-modal");
  const msg = document.getElementById("error-message");
  if (!modal || !msg) return;
  const status = error?.status ? `HTTP ${error.status}${error.statusText ? " " + error.statusText : ""}` : (error?.message || "Network error");
  msg.innerHTML = error?.details
    ? `<div class="font-semibold mb-1">${escapeHtml(status)}</div><pre class="text-[11px] overflow-x-auto">${escapeHtml(JSON.stringify(error.details, null, 2))}</pre>`
    : escapeHtml(status);
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}
