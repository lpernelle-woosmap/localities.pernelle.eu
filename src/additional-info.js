// additional-info.js - Rendering of result.additional_info (transit lines of a station, ...)

import { escapeHtml } from "./utils.js";

const HEX_COLOR = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const DEFAULT_LINE_COLOR = "#E5E7EB";
const DEFAULT_LINE_TEXT_COLOR = "#111827";
// Line keys with a dedicated rendering; any other key is listed as a raw key/value row
const KNOWN_LINE_KEYS = new Set(["name", "mode", "route_type", "color", "text_color", "headsigns"]);

/**
 * Returns a CSS-safe hex color, or the fallback when the value is not a hex color
 * @param {*} value - Color from the API (with or without leading #)
 * @param {string} fallback - Color used when the value is missing or invalid
 * @returns {string} Hex color with leading #
 */
export function safeHexColor(value, fallback) {
  if (typeof value !== "string" || !HEX_COLOR.test(value.trim())) return fallback;
  const hex = value.trim();
  return hex.startsWith("#") ? hex : `#${hex}`;
}

/**
 * @param {*} value - Any JSON value
 * @returns {string} Escaped display text (objects and arrays as JSON)
 */
function formatValue(value) {
  return escapeHtml(typeof value === "object" && value !== null ? JSON.stringify(value) : String(value));
}

/**
 * @param {string} key - Raw API key
 * @param {*} value - Raw API value
 * @returns {string} HTML string
 */
function renderKeyValue(key, value) {
  return `
    <div class="flex justify-between gap-3 py-1 border-b border-gray-100 last:border-b-0">
      <span class="text-xs text-gray-500 font-mono shrink-0">${escapeHtml(key)}</span>
      <span class="text-xs text-gray-900 font-medium text-right break-all min-w-0">${formatValue(value)}</span>
    </div>
  `;
}

/**
 * @param {string} label - Swatch label (API key)
 * @param {*} value - Raw color from the API
 * @returns {string} HTML string, empty when the color is absent
 */
function renderColorSwatch(label, value) {
  if (value == null) return "";
  const color = safeHexColor(value, null);
  const dot = color
    ? `<span class="inline-block w-3 h-3 rounded-sm border border-gray-300" style="background:${color}"></span>`
    : "";
  return `
    <span class="inline-flex items-center gap-1" title="${escapeHtml(label)}">
      ${dot}
      <span class="text-gray-500">${escapeHtml(label)}</span>
      <span class="font-mono text-gray-900">${formatValue(value)}</span>
    </span>
  `;
}

/**
 * @param {Array} headsigns - Line destinations
 * @returns {string} HTML string, empty when there is no headsign
 */
function renderHeadsigns(headsigns) {
  if (!Array.isArray(headsigns) || headsigns.length === 0) return "";
  const chips = headsigns
    .map(sign => `<span class="text-xs text-gray-800 bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded">→ ${formatValue(sign)}</span>`)
    .join("");
  return `
    <div class="mt-2">
      <div class="text-[10px] text-gray-500 font-medium uppercase mb-1">Headsigns (${headsigns.length})</div>
      <div class="flex flex-wrap gap-1">${chips}</div>
    </div>
  `;
}

/**
 * Renders one transit line: colored badge, mode, route type, colors, headsigns and extra keys
 * @param {Object} line - Item of additional_info.lines
 * @returns {string} HTML string
 */
function renderLine(line) {
  const background = safeHexColor(line.color, DEFAULT_LINE_COLOR);
  const textColor = safeHexColor(line.text_color, DEFAULT_LINE_TEXT_COLOR);
  const name = line.name == null || line.name === "" ? "?" : line.name;
  const mode = line.mode == null
    ? ""
    : `<span class="text-sm text-gray-900 font-medium capitalize">${formatValue(line.mode)}</span>`;
  const routeType = line.route_type == null
    ? ""
    : `<span class="text-xs text-gray-500 font-mono">route_type ${formatValue(line.route_type)}</span>`;
  const extras = Object.keys(line)
    .filter(key => !KNOWN_LINE_KEYS.has(key))
    .map(key => renderKeyValue(key, line[key]))
    .join("");

  return `
    <div class="bg-white p-2 rounded-lg border border-gray-200" style="border-left:4px solid ${background}">
      <div class="flex items-center gap-2">
        <span class="inline-flex items-center justify-center min-w-[2rem] h-7 px-2 rounded-md text-sm font-bold shadow-sm shrink-0"
              style="background:${background};color:${textColor}">${formatValue(name)}</span>
        <div class="flex flex-col min-w-0">${mode}${routeType}</div>
      </div>
      <div class="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs">
        ${renderColorSwatch("color", line.color)}
        ${renderColorSwatch("text_color", line.text_color)}
      </div>
      ${renderHeadsigns(line.headsigns)}
      ${extras ? `<div class="mt-2">${extras}</div>` : ""}
    </div>
  `;
}

/**
 * @param {Array} lines - additional_info.lines
 * @returns {string} HTML string
 */
function renderLines(lines) {
  const badges = lines.map(line => {
    const background = safeHexColor(line.color, DEFAULT_LINE_COLOR);
    const textColor = safeHexColor(line.text_color, DEFAULT_LINE_TEXT_COLOR);
    return `<span class="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded text-xs font-bold" style="background:${background};color:${textColor}">${formatValue(line.name ?? "?")}</span>`;
  }).join("");

  return `
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="text-xs text-gray-700 font-medium uppercase">Transit Lines (${lines.length})</div>
      <div class="flex flex-wrap justify-end gap-1">${badges}</div>
    </div>
    <div class="space-y-2">${lines.map(renderLine).join("")}</div>
  `;
}

/**
 * Renders the content of additional_info: transit lines first, then any other key as raw rows
 * @param {Object} info - result.additional_info
 * @returns {string} HTML string, empty when there is nothing to show
 */
export function renderAdditionalInfoContent(info) {
  if (!info || typeof info !== "object") return "";

  const parts = [];
  if (Array.isArray(info.lines) && info.lines.length > 0) {
    parts.push(renderLines(info.lines.filter(line => line && typeof line === "object")));
  }

  const others = Object.keys(info).filter(key => key !== "lines" || !Array.isArray(info.lines));
  if (others.length > 0) {
    parts.push(`<div>${others.map(key => renderKeyValue(key, info[key])).join("")}</div>`);
  }

  return parts.join("");
}
