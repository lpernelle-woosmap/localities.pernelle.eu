// mobile-filters.js — Rendering of the full-screen filter page and its pickers.
// Reads the state it is given and reports changes through callbacks; it never
// mutates the state itself.

import { isoCountries, flagCode } from "./countries.js";
import { isoLanguages } from "./languages.js";
import { h, htmlSvg, flagEmoji } from "./mobile-ui.js";

export const TYPES = ["locality", "postal_code", "address", "airport", "tourist_attraction", "amusement_park", "admin_level", "point_of_interest", "train_station", "metro_station", "shopping", "country"];
export const EXCLUDED_TYPES = ["suburb", "quarter", "neighbourhood", "village", "hamlet", "borough", "city", "town"];

const SWITCHES = [
  { key: "extended", label: "Extended postal codes" },
  { key: "bias", label: "Geographical bias (map center)" },
  { key: "geometryOnly", label: "Geometry only", hint: "fields=geometry" },
  { key: "shape", label: "Shape", hint: "boundary polygon" },
];

const CHECK = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4 10-10" stroke="#00B0FF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" /></svg>`;

/**
 * Renders the filter page controls from the state
 * @param {Object} state - Mobile app state
 * @param {{ onToggleType, onToggleExcludedType, onAddCustomType, onRemoveCountry, onToggleSwitch }} handlers
 */
export function renderFilterPage(state, handlers) {
  renderPillGroup("types-pills", TYPES, state.types, handlers.onToggleType, handlers.onAddCustomType);
  renderPillGroup("excluded-types-pills", EXCLUDED_TYPES, state.excludedTypes, handlers.onToggleExcludedType, null);
  renderCountryPills(state.countries, handlers.onRemoveCountry);
  renderSwitches(state, handlers.onToggleSwitch);
  renderLangDisplay(state.language);
  document.getElementById("custom-description-input-mobile").value = state.customDescription || "";
}

/**
 * Pills for a list of known values plus any custom ones currently selected
 */
function renderPillGroup(rootId, known, selected, onToggle, onAddCustom) {
  const root = document.getElementById(rootId);
  root.innerHTML = "";
  const values = [...known, ...selected.filter(v => !known.includes(v))];
  values.forEach(v => root.appendChild(pillButton(v.replace(/_/g, " "), selected.includes(v), () => onToggle(v))));
  if (onAddCustom) {
    root.appendChild(pillButton("+ custom", false, () => {
      const value = prompt("Custom type value");
      if (value?.trim()) onAddCustom(value.trim());
    }, true));
  }
}

function pillButton(label, active, onClick, dashed = false) {
  const tone = active ? "bg-gray-900 text-white" : dashed ? "border border-dashed border-[#C7C7CC] text-[#5A5A5F]" : "bg-[#F1F1F3] text-gray-900";
  return h("button", { class: `px-3 py-1.5 rounded-[18px] text-[13px] font-medium tracking-tight ${tone}`, onclick: onClick }, label);
}

function renderCountryPills(countries, onRemove) {
  const root = document.getElementById("country-pills");
  [...root.querySelectorAll("[data-country]")].forEach(el => el.remove());
  const addBtn = document.getElementById("add-country-btn");
  countries.forEach(c => {
    root.insertBefore(h("button", {
      "data-country": c.id,
      class: "px-3 py-1.5 rounded-[18px] bg-gray-900 text-white text-[13px] font-medium tracking-tight flex items-center gap-1.5",
      onclick: () => onRemove(c.id),
    }, `${flagEmoji(flagCode(c.id))} ${c.text}`, h("span", { class: "text-[14px] leading-none" }, "×")), addBtn);
  });
}

function renderSwitches(state, onToggle) {
  const root = document.getElementById("switches");
  root.innerHTML = "";
  SWITCHES.forEach(({ key, label, hint }, i) => root.appendChild(switchRow(label, hint, state[key], i < SWITCHES.length - 1, () => onToggle(key))));
}

function switchRow(label, hint, on, hasBorder, onClick) {
  return h("div", { class: "flex items-center justify-between py-3", style: { borderBottom: hasBorder ? "0.5px solid #ECECEE" : "none" } },
    h("div", { class: "min-w-0" },
      h("div", { class: "text-[15px] text-gray-900" }, label),
      hint ? h("div", { class: "text-[11px] text-[#8E8E93] font-mono" }, hint) : null,
    ),
    h("button", {
      class: "w-[51px] h-[31px] rounded-[16px] p-0.5 flex transition-colors shrink-0",
      style: { background: on ? "#30D158" : "#E5E5EA", justifyContent: on ? "flex-end" : "flex-start" },
      role: "switch", "aria-checked": on ? "true" : "false",
      onclick: onClick,
    }, h("div", { class: "w-[27px] h-[27px] rounded-full bg-white", style: { boxShadow: "0 2px 4px rgba(0,0,0,0.18), 0 0 0 0.5px rgba(0,0,0,0.04)" } })),
  );
}

/**
 * Updates the language row label
 * @param {string} language - Language code, empty for none
 */
export function renderLangDisplay(language) {
  const el = document.getElementById("lang-display");
  if (!el) return;
  if (!language) { el.textContent = "No language"; return; }
  const found = isoLanguages.find(l => l.id === language);
  el.textContent = found ? `${found.text} (${found.id})` : language;
}

/**
 * Renders the country picker list filtered by a query
 * @param {string} query - Search text
 * @param {Array<{id: string}>} selected - Selected countries
 * @param {Function} onToggle - Called with the country entry
 */
export function renderCountryList(query, selected, onToggle) {
  const root = document.getElementById("countries-list");
  root.innerHTML = "";
  const q = query.trim().toLowerCase();
  isoCountries
    .filter(c => !q || c.text.toLowerCase().includes(q) || c.id.toLowerCase().includes(q))
    .forEach(c => {
      const active = selected.some(x => x.id === c.id);
      root.appendChild(pickerRow(active, () => onToggle(c),
        h("span", { class: "text-[20px]" }, flagEmoji(flagCode(c.id))),
        h("span", { class: "flex-1 text-[15px] text-gray-900" }, c.text),
        h("span", { class: "text-[11px] font-mono text-[#8E8E93]" }, c.id),
      ));
    });
}

/**
 * Renders the language picker list filtered by a query
 * @param {string} query - Search text
 * @param {string} current - Current language code
 * @param {Function} onPick - Called with the language code
 */
export function renderLangList(query, current, onPick) {
  const root = document.getElementById("lang-list");
  root.innerHTML = "";
  const q = query.trim().toLowerCase();
  [{ id: "", text: "No language" }, ...isoLanguages]
    .filter(l => !q || l.text.toLowerCase().includes(q) || l.id.toLowerCase().includes(q))
    .forEach(l => {
      root.appendChild(pickerRow(current === l.id, () => onPick(l.id),
        h("span", { class: "flex-1 text-[15px] text-gray-900" }, l.text),
        l.id ? h("span", { class: "text-[11px] font-mono text-[#8E8E93]" }, l.id) : null,
      ));
    });
}

function pickerRow(active, onClick, ...children) {
  return h("button", {
    class: "w-full flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50",
    style: { borderBottom: "0.5px solid #ECECEE" },
    onclick: onClick,
  }, ...children, active ? htmlSvg(CHECK) : null);
}
