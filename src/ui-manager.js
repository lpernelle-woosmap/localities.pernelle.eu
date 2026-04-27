// ui-manager.js - UI rendering and interaction management

import { escapeHtml, boldMatchedSubstring } from "./utils.js";
import { getTargetEnpoint } from "./endpoint_select.js";
import { deepEqual } from "./diff-utils.js";

/**
 * Returns HTML for a copy-to-clipboard button
 * @param {string} value - The value to copy
 * @param {string} [title="Copy"] - Tooltip text
 * @returns {string} HTML string
 */
function copyButton(value, title = "Copy") {
  return `<button class="copy-btn absolute top-2 right-2 p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors" data-copy-value="${escapeHtml(value)}" title="${escapeHtml(title)}">
    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  </button>`;
}

/**
 * Returns HTML for a copy-to-clipboard button for coordinates
 * @param {string|number} lat
 * @param {string|number} lng
 * @returns {string} HTML string
 */
function coordsCopyButton(lat, lng) {
  return copyButton(`${lat},${lng}`, "Copy coordinates");
}

/**
 * Renders search results in the UI
 * @param {Object} response - API response
 * @param {boolean} isProduction - Whether this is production results
 * @param {Function} onResultClick - Callback when result is clicked
 */
export function renderSearchResults(response, isProduction, onResultClick) {
  const resultsId = isProduction ? "autocomplete-results-compare" : "autocomplete-results";
  const headerId = isProduction ? "prod-header" : "dev-header";
  const results = document.getElementById(resultsId);
  const header = document.getElementById(headerId);
  const wrapper = document.getElementById("results-wrapper");

  if (!results) return;

  const endpoint = getTargetEnpoint();
  results.innerHTML = "";

  const items = endpoint === "search" || endpoint === "geocode"
    ? response.results
    : response.localities;

  if (!items || items.length === 0) {
    if (header) header.classList.add("hidden");
    // Check if both lists are empty to hide wrapper
    checkAndHideWrapper();
    return;
  }

  const html = items.map(item => createResultItem(item, endpoint, isProduction)).join("");

  results.innerHTML = html;
  if (header) header.classList.remove("hidden");
  if (wrapper) wrapper.classList.remove("hidden");

  // Add click listeners (only for non-production results)
  if (!isProduction) {
    attachResultClickListeners(results, onResultClick);
  }
}

/**
 * Renders an error state in one of the result lists (compare or main)
 * @param {Error} error - Error from API call (may carry status/details)
 * @param {boolean} isCompare - Whether to render in the compare list
 */
export function renderSearchError(error, isCompare) {
  const resultsId = isCompare ? "autocomplete-results-compare" : "autocomplete-results";
  const headerId = isCompare ? "prod-header" : "dev-header";
  const results = document.getElementById(resultsId);
  const header = document.getElementById(headerId);
  const wrapper = document.getElementById("results-wrapper");

  if (!results) return;

  const status = error?.status
    ? `HTTP ${error.status}${error.statusText ? ` ${error.statusText}` : ""}`
    : (error?.message || "Network error");
  const detailsText = error?.details
    ? `<div class="text-xs text-red-600 mt-0.5 break-all">${escapeHtml(JSON.stringify(error.details))}</div>`
    : "";

  results.innerHTML = `
    <li class="px-3 py-2 bg-red-50 border-b border-red-200">
      <div class="text-xs font-semibold text-red-700">${escapeHtml(status)}</div>
      ${detailsText}
    </li>
  `;

  if (header) header.classList.remove("hidden");
  if (wrapper) wrapper.classList.remove("hidden");
}

/**
 * Prepends a banner indicating that the compare environment failed to respond
 * @param {Error} error - Error from API call (may carry status/details)
 * @param {string} compareLabel - Display name of compare environment
 */
export function displayCompareErrorBanner(error, compareLabel) {
  const detailsHTML = document.querySelector(".addressDetails");
  if (!detailsHTML) return;

  const status = error?.status
    ? `HTTP ${error.status}${error.statusText ? ` ${error.statusText}` : ""}`
    : (error?.message || "Network error");
  const detailsBlock = error?.details
    ? `<pre class="mt-2 text-xs bg-white p-2 rounded border border-red-200 overflow-x-auto">${escapeHtml(JSON.stringify(error.details, null, 2))}</pre>`
    : "";

  const banner = `
    <div class="bg-red-50 p-3 rounded-lg border border-red-300">
      <div class="text-xs font-semibold text-red-800">
        ${escapeHtml(compareLabel)} request failed (${escapeHtml(status)})
      </div>
      <div class="text-xs text-red-700 mt-1">No comparison available — only ${escapeHtml(compareLabel)} side is missing.</div>
      ${detailsBlock}
    </div>
  `;

  detailsHTML.insertAdjacentHTML("afterbegin", banner);
}

/**
 * Checks if both result lists are empty and hides wrapper if so
 */
function checkAndHideWrapper() {
  const devResults = document.getElementById("autocomplete-results");
  const prodResults = document.getElementById("autocomplete-results-compare");
  const wrapper = document.getElementById("results-wrapper");

  if (!devResults || !prodResults || !wrapper) return;

  const devEmpty = !devResults.innerHTML.trim();
  const prodEmpty = !prodResults.innerHTML.trim();

  if (devEmpty && prodEmpty) {
    wrapper.classList.add("hidden");
  }
}

/**
 * Creates HTML for a single result item with Tailwind classes
 * @param {Object} item - Result item
 * @param {string} endpoint - Current endpoint
 * @param {boolean} isProduction - Whether this is production result
 * @returns {string} HTML string
 */
function createResultItem(item, endpoint, isProduction) {
  const predictionId = escapeHtml(item.public_id);
  const predictionTypes = item.types.join(" | ");

  let formattedName = "";
  let formattedDescription = "";

  if (endpoint === "search") {
    formattedName = escapeHtml(item.title || "");
    formattedDescription = escapeHtml(item.description || "");
  } else if (endpoint === "geocode") {
    formattedName = escapeHtml(item.formatted_address || "");
  } else if (item.matched_substrings?.description) {
    formattedName = boldMatchedSubstring(item.description, item.matched_substrings.description);
  } else {
    formattedName = escapeHtml(item.description || "");
  }

  const typeClass = item.categories ? "category" : "type";
  const typeValue = item.categories
    ? escapeHtml(item.categories[0])
    : escapeHtml(predictionTypes);

  const cursorClass = isProduction ? "" : "cursor-pointer hover:bg-blue-50";
  const opacityClass = isProduction ? "opacity-60" : "";

  return `
    <li
      prediction-id="${predictionId}"
      class="prediction px-3 py-2 border-b border-gray-200 last:border-b-0 ${cursorClass} ${opacityClass} ${isProduction ? "disabled" : ""} transition-colors"
    >
      <div class="localities-result-title">
        <div class="localities-result-name text-sm text-gray-900 mb-0.5">${formattedName}</div>
        ${formattedDescription ? `<div class="localities-result-description text-xs text-gray-600 mb-0.5">${formattedDescription}</div>` : ''}
        <div class="localities-result-${typeClass} text-xs text-gray-500">${typeValue}</div>
      </div>
    </li>`;
}

/**
 * Attaches click listeners to result items
 * @param {HTMLElement} resultsContainer - Results container
 * @param {Function} onResultClick - Click callback
 */
function attachResultClickListeners(resultsContainer, onResultClick) {
  const predictions = resultsContainer.querySelectorAll(".prediction:not(.disabled)");

  predictions.forEach(result => {
    const titleElement = result.querySelector('.localities-result-title');
    if (!titleElement) return;

    const nameElement = titleElement.querySelector('.localities-result-name');
    const descriptionElement = titleElement.querySelector('.localities-result-description');

    let name = nameElement?.textContent || "";
    if (descriptionElement && descriptionElement.textContent) {
      name += `, ${descriptionElement.textContent}`;
    }

    result.addEventListener("click", () => {
      const predictionId = result.getAttribute("prediction-id");
      onResultClick(predictionId, name);
    });
  });
}

/**
 * Displays location details in the details panel with Tailwind styling
 * @param {Object} result - Location result
 */
export function displayLocationDetails(result) {
  const detailsHTML = document.querySelector(".addressDetails");
  const placeholder = document.querySelector(".addressDetails-placeholder");

  if (!detailsHTML) return;

  const parts = [];

  if (result.public_id) {
    parts.push(`
      <div class="relative bg-gray-50 p-3 rounded-lg border border-gray-200">
        ${copyButton(result.public_id, "Copy Public ID")}
        <div class="text-xs text-gray-500 font-medium uppercase mb-1">Public ID</div>
        <div class="text-sm text-gray-900 font-mono break-all pr-6">${escapeHtml(result.public_id)}</div>
      </div>
    `);
  }

  if (result.formatted_address) {
    parts.push(`
      <div class="relative bg-blue-50 p-3 rounded-lg border border-blue-200">
        ${copyButton(result.formatted_address, "Copy Formatted Address")}
        <div class="text-xs text-blue-700 font-medium uppercase mb-1">Formatted Address</div>
        <div class="text-sm text-gray-900 pr-6">${escapeHtml(result.formatted_address)}</div>
      </div>
    `);
  }

  if (result.title) {
    parts.push(`
      <div>
        <div class="text-xs text-gray-500 font-medium uppercase mb-1">Title</div>
        <div class="text-sm text-gray-900">${escapeHtml(result.title)}</div>
      </div>
    `);
  }

  if (result.name) {
    parts.push(`
      <div>
        <div class="text-xs text-gray-500 font-medium uppercase mb-1">Name</div>
        <div class="text-sm text-gray-900">${escapeHtml(result.name)}</div>
      </div>
    `);
  }

  if (result.description) {
    parts.push(`
      <div>
        <div class="text-xs text-gray-500 font-medium uppercase mb-1">Description</div>
        <div class="text-sm text-gray-900">${escapeHtml(result.description)}</div>
      </div>
    `);
  }

  if (result.types && result.types.length > 0) {
    const typeBadges = result.types.map(t => `<div class="text-sm text-gray-900 bg-green-100 text-green-800 inline-block px-2 py-1 rounded">${escapeHtml(t.replace("_", " "))}</div>`).join(" ");
    parts.push(`
      <div>
        <div class="text-xs text-gray-500 font-medium uppercase mb-1">Type</div>
        <div class="flex flex-wrap gap-1">${typeBadges}</div>
      </div>
    `);
  }

  if (result.categories && result.categories.length > 0) {
    const categoryText = escapeHtml(result.categories[0].replace("_", " "));
    parts.push(`
      <div>
        <div class="text-xs text-gray-500 font-medium uppercase mb-1">Category</div>
        <div class="text-sm text-gray-900 bg-purple-100 text-purple-800 inline-block px-2 py-1 rounded">${categoryText}</div>
      </div>
    `);
  }

  if (result.geometry) {
    if (result.geometry.accuracy) {
      const accuracyText = escapeHtml(result.geometry.accuracy.replace("_", " ").toLowerCase());
      parts.push(`
        <div>
          <div class="text-xs text-gray-500 font-medium uppercase mb-1">Location Type</div>
          <div class="text-sm text-gray-900">${accuracyText}</div>
        </div>
      `);
    }

    const lat = result.geometry.location.lat.toString();
    const lng = result.geometry.location.lng.toString();
    parts.push(`
      <div class="bg-gray-50 p-3 rounded-lg border border-gray-200 relative">
        <div class="text-xs text-gray-500 font-medium uppercase mb-2">Coordinates</div>
        ${coordsCopyButton(lat, lng)}
        <div class="grid grid-cols-2 gap-2 text-sm">
          <div>
            <div class="text-xs text-gray-500">Latitude</div>
            <div class="font-mono text-gray-900">${escapeHtml(lat)}</div>
          </div>
          <div>
            <div class="text-xs text-gray-500">Longitude</div>
            <div class="font-mono text-gray-900">${escapeHtml(lng)}</div>
          </div>
        </div>
      </div>
    `);

    if (result.address_components && result.address_components.length > 0) {
      const componentsHtml = result.address_components.map(compo => {
        const type = escapeHtml(compo.types[compo.types.length - 1]);
        const name = escapeHtml(compo.long_name);
        return `
          <div class="flex justify-between py-1 border-b border-gray-100 last:border-b-0">
            <span class="text-xs text-gray-500">${type}</span>
            <span class="text-xs text-gray-900 font-medium">${name}</span>
          </div>
        `;
      }).join("");

      parts.push(`
        <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
          <div class="text-xs text-gray-700 font-medium uppercase mb-2">Address Components</div>
          <div>${componentsHtml}</div>
        </div>
      `);
    }
  }

  // Addresses list (clickable buttons for sub-addresses)
  if (result.addresses?.list?.length > 0) {
    parts.push(renderAddressesList(result.addresses));
  }

  detailsHTML.innerHTML = parts.join("");
  detailsHTML.classList.remove("hidden");

  if (placeholder) {
    placeholder.classList.add("hidden");
  }

  attachCopyListeners(detailsHTML);

  // Attach click listeners for address buttons
  if (result.addresses?.list?.length > 0) {
    attachAddressButtonListeners(detailsHTML);
  }
}

/**
 * Renders a field with diff highlighting showing both values
 * @param {string} label - Field label
 * @param {*} mainVal - Main env value
 * @param {*} compareVal - Compare env value
 * @param {string} status - Diff status: 'changed', 'added', 'removed'
 * @param {string} mainLabel - Display name of main environment
 * @param {string} compareLabel - Display name of compare environment
 * @returns {string} HTML string
 */
function renderDiffField(label, mainVal, compareVal, status, mainLabel, compareLabel) {
  const highlightClasses = {
    changed: "bg-yellow-50 border-yellow-300",
    added: "bg-green-50 border-green-300",
    removed: "bg-red-50 border-red-300"
  };
  const highlightClass = highlightClasses[status] || "";

  const mainDisplay = mainVal != null
    ? escapeHtml(String(mainVal))
    : '<span class="text-gray-400 italic">absent</span>';
  const compareDisplay = compareVal != null
    ? escapeHtml(String(compareVal))
    : '<span class="text-gray-400 italic">absent</span>';

  return `
    <div class="p-3 rounded-lg border ${highlightClass}">
      <div class="text-xs text-gray-500 font-medium uppercase mb-1">${label}</div>
      <div class="grid grid-cols-2 gap-2 text-sm">
        <div>
          <div class="text-xs font-semibold text-red-700 mb-0.5">${escapeHtml(mainLabel)}</div>
          <div class="text-gray-900">${mainDisplay}</div>
        </div>
        <div>
          <div class="text-xs font-semibold text-blue-700 mb-0.5">${escapeHtml(compareLabel)}</div>
          <div class="text-gray-900">${compareDisplay}</div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders geometry comparison section
 * @param {Object} geomDiff - Diff entry for geometry field
 * @param {string} mainLabel - Display name of main environment
 * @param {string} compareLabel - Display name of compare environment
 * @returns {string} HTML string
 */
function renderGeometryComparison(geomDiff, mainLabel, compareLabel) {
  if (!geomDiff || geomDiff.status === "same") {
    const geom = geomDiff?.devValue;
    if (!geom) return "";
    return renderGeometryNormal(geom);
  }

  const mainGeom = geomDiff.devValue;
  const compareGeom = geomDiff.prodValue;
  const parts = [];

  // Accuracy comparison
  const mainAccuracy = mainGeom?.accuracy;
  const compareAccuracy = compareGeom?.accuracy;
  if (mainAccuracy || compareAccuracy) {
    if (mainAccuracy === compareAccuracy) {
      parts.push(`
        <div>
          <div class="text-xs text-gray-500 font-medium uppercase mb-1">Location Type</div>
          <div class="text-sm text-gray-900">${escapeHtml((mainAccuracy || "").replace("_", " ").toLowerCase())}</div>
        </div>
      `);
    } else {
      parts.push(renderDiffField(
        "Location Type",
        mainAccuracy ? mainAccuracy.replace("_", " ").toLowerCase() : null,
        compareAccuracy ? compareAccuracy.replace("_", " ").toLowerCase() : null,
        "changed",
        mainLabel,
        compareLabel
      ));
    }
  }

  // Coordinates comparison
  const mainLoc = mainGeom?.location;
  const compareLoc = compareGeom?.location;
  if (mainLoc || compareLoc) {
    if (deepEqual(mainLoc, compareLoc)) {
      parts.push(`
        <div class="bg-gray-50 p-3 rounded-lg border border-gray-200 relative">
          <div class="text-xs text-gray-500 font-medium uppercase mb-2">Coordinates</div>
          ${coordsCopyButton(mainLoc.lat, mainLoc.lng)}
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div class="text-xs text-gray-500">Latitude</div>
              <div class="font-mono text-gray-900">${escapeHtml(String(mainLoc.lat))}</div>
            </div>
            <div>
              <div class="text-xs text-gray-500">Longitude</div>
              <div class="font-mono text-gray-900">${escapeHtml(String(mainLoc.lng))}</div>
            </div>
          </div>
        </div>
      `);
    } else {
      parts.push(`
        <div class="p-3 rounded-lg border bg-yellow-50 border-yellow-300 relative">
          <div class="text-xs text-gray-500 font-medium uppercase mb-2">Coordinates</div>
          ${mainLoc ? coordsCopyButton(mainLoc.lat, mainLoc.lng) : ''}
          <div class="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div class="text-xs font-semibold text-red-700 mb-1">${escapeHtml(mainLabel)}</div>
              ${mainLoc ? `
                <div class="text-xs text-gray-500">Lat</div>
                <div class="font-mono text-gray-900">${escapeHtml(String(mainLoc.lat))}</div>
                <div class="text-xs text-gray-500 mt-1">Lng</div>
                <div class="font-mono text-gray-900">${escapeHtml(String(mainLoc.lng))}</div>
              ` : '<span class="text-gray-400 italic">absent</span>'}
            </div>
            <div>
              <div class="text-xs font-semibold text-blue-700 mb-1">${escapeHtml(compareLabel)}</div>
              ${compareLoc ? `
                <div class="text-xs text-gray-500">Lat</div>
                <div class="font-mono text-gray-900">${escapeHtml(String(compareLoc.lat))}</div>
                <div class="text-xs text-gray-500 mt-1">Lng</div>
                <div class="font-mono text-gray-900">${escapeHtml(String(compareLoc.lng))}</div>
              ` : '<span class="text-gray-400 italic">absent</span>'}
            </div>
          </div>
        </div>
      `);
    }
  }

  return parts.join("");
}

/**
 * Renders geometry fields normally (no diff)
 * @param {Object} geom - Geometry object
 * @returns {string} HTML string
 */
function renderGeometryNormal(geom) {
  const parts = [];

  if (geom.accuracy) {
    parts.push(`
      <div>
        <div class="text-xs text-gray-500 font-medium uppercase mb-1">Location Type</div>
        <div class="text-sm text-gray-900">${escapeHtml(geom.accuracy.replace("_", " ").toLowerCase())}</div>
      </div>
    `);
  }

  parts.push(`
    <div class="bg-gray-50 p-3 rounded-lg border border-gray-200 relative">
      <div class="text-xs text-gray-500 font-medium uppercase mb-2">Coordinates</div>
      ${coordsCopyButton(geom.location.lat, geom.location.lng)}
      <div class="grid grid-cols-2 gap-2 text-sm">
        <div>
          <div class="text-xs text-gray-500">Latitude</div>
          <div class="font-mono text-gray-900">${escapeHtml(String(geom.location.lat))}</div>
        </div>
        <div>
          <div class="text-xs text-gray-500">Longitude</div>
          <div class="font-mono text-gray-900">${escapeHtml(String(geom.location.lng))}</div>
        </div>
      </div>
    </div>
  `);

  return parts.join("");
}

/**
 * Renders address components comparison
 * @param {Object} acDiff - Diff entry for address_components field
 * @param {string} mainLabel - Display name of main environment
 * @param {string} compareLabel - Display name of compare environment
 * @returns {string} HTML string
 */
function renderAddressComponentsComparison(acDiff, mainLabel, compareLabel) {
  if (!acDiff) return "";

  if (acDiff.status === "same") {
    return renderAddressComponentsNormal(acDiff.devValue);
  }

  const mainComponents = acDiff.devValue || [];
  const compareComponents = acDiff.prodValue || [];

  // Build a map by type for comparison
  const mainByType = {};
  mainComponents.forEach(c => { mainByType[c.types[c.types.length - 1]] = c.long_name; });
  const compareByType = {};
  compareComponents.forEach(c => { compareByType[c.types[c.types.length - 1]] = c.long_name; });

  const allTypes = new Set([...Object.keys(mainByType), ...Object.keys(compareByType)]);

  const rows = [];
  for (const type of allTypes) {
    const mainName = mainByType[type];
    const compareName = compareByType[type];
    const differs = !deepEqual(mainName, compareName);

    if (differs) {
      rows.push(`
        <div class="flex justify-between py-1 border-b border-yellow-200 last:border-b-0 bg-yellow-50 px-1 rounded">
          <span class="text-xs text-gray-500">${escapeHtml(type)}</span>
          <span class="text-xs">
            <span class="text-red-700 font-medium">${mainName != null ? escapeHtml(mainName) : '<i>absent</i>'}</span>
            <span class="text-gray-400 mx-1">|</span>
            <span class="text-blue-700 font-medium">${compareName != null ? escapeHtml(compareName) : '<i>absent</i>'}</span>
          </span>
        </div>
      `);
    } else {
      rows.push(`
        <div class="flex justify-between py-1 border-b border-gray-100 last:border-b-0">
          <span class="text-xs text-gray-500">${escapeHtml(type)}</span>
          <span class="text-xs text-gray-900 font-medium">${escapeHtml(mainName)}</span>
        </div>
      `);
    }
  }

  return `
    <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
      <div class="text-xs text-gray-700 font-medium uppercase mb-2">Address Components</div>
      <div>${rows.join("")}</div>
    </div>
  `;
}

/**
 * Renders address components normally (no diff)
 * @param {Array} components - Address components array
 * @returns {string} HTML string
 */
function renderAddressComponentsNormal(components) {
  if (!components || components.length === 0) return "";

  const rows = components.map(compo => {
    const type = escapeHtml(compo.types[compo.types.length - 1]);
    const name = escapeHtml(compo.long_name);
    return `
      <div class="flex justify-between py-1 border-b border-gray-100 last:border-b-0">
        <span class="text-xs text-gray-500">${type}</span>
        <span class="text-xs text-gray-900 font-medium">${name}</span>
      </div>
    `;
  }).join("");

  return `
    <div class="bg-gray-50 p-3 rounded-lg border border-gray-200">
      <div class="text-xs text-gray-700 font-medium uppercase mb-2">Address Components</div>
      <div>${rows}</div>
    </div>
  `;
}

/**
 * Displays comparison details between two environment results
 * @param {Object} mainResult - Result from main environment
 * @param {Object} compareResult - Result from compare environment
 * @param {Object} diff - Diff result from computeDiff
 * @param {string} mainLabel - Display name of main environment
 * @param {string} compareLabel - Display name of compare environment
 */
export function displayComparisonDetails(mainResult, compareResult, diff, mainLabel, compareLabel) {
  const detailsHTML = document.querySelector(".addressDetails");
  const placeholder = document.querySelector(".addressDetails-placeholder");
  if (!detailsHTML) return;

  const parts = [];

  // Comparison banner
  parts.push(`
    <div class="bg-amber-50 p-3 rounded-lg border border-amber-300">
      <div class="text-xs font-semibold text-amber-800">
        Differences detected between ${escapeHtml(mainLabel)} and ${escapeHtml(compareLabel)}
      </div>
    </div>
  `);

  // Legend
  parts.push(`
    <div class="flex gap-2 text-xs flex-wrap">
      <span class="px-2 py-0.5 rounded bg-yellow-50 border border-yellow-300">Changed</span>
      <span class="px-2 py-0.5 rounded bg-green-50 border border-green-300">${escapeHtml(mainLabel)} only</span>
      <span class="px-2 py-0.5 rounded bg-red-50 border border-red-300">${escapeHtml(compareLabel)} only</span>
    </div>
  `);

  // Simple fields
  const simpleFields = [
    { key: "public_id", label: "Public ID" },
    { key: "formatted_address", label: "Formatted Address" },
    { key: "title", label: "Title" },
    { key: "name", label: "Name" },
    { key: "description", label: "Description" },
    { key: "types", label: "Type", transform: v => Array.isArray(v) && v.length > 0 ? v.map(t => t.replace("_", " ")).join(", ") : v },
    { key: "categories", label: "Category", transform: v => Array.isArray(v) && v.length > 0 ? v[0].replace("_", " ") : v }
  ];

  for (const { key, label, transform } of simpleFields) {
    const fieldDiff = diff.fields[key];
    if (!fieldDiff) continue;

    const mainVal = transform ? transform(fieldDiff.devValue) : fieldDiff.devValue;
    const compareVal = transform ? transform(fieldDiff.prodValue) : fieldDiff.prodValue;

    if (fieldDiff.status === "same") {
      if (mainVal == null) continue;
      const hasCopy = key === "public_id" || key === "formatted_address";
      const bgClass = key === "public_id"
        ? "relative bg-gray-50 p-3 rounded-lg border border-gray-200"
        : key === "formatted_address"
        ? "relative bg-blue-50 p-3 rounded-lg border border-blue-200"
        : "";
      parts.push(`
        <div class="${bgClass}">
          ${hasCopy ? copyButton(String(mainVal), `Copy ${label}`) : ""}
          <div class="text-xs text-gray-500 font-medium uppercase mb-1">${label}</div>
          <div class="text-sm text-gray-900${key === "public_id" ? " font-mono break-all" : ""}${hasCopy ? " pr-6" : ""}">${escapeHtml(String(mainVal))}</div>
        </div>
      `);
    } else {
      parts.push(renderDiffField(label, mainVal, compareVal, fieldDiff.status, mainLabel, compareLabel));
    }
  }

  // Geometry
  parts.push(renderGeometryComparison(diff.fields.geometry, mainLabel, compareLabel));

  // Address components
  parts.push(renderAddressComponentsComparison(diff.fields.address_components, mainLabel, compareLabel));

  // Addresses list (from main result)
  if (mainResult.addresses?.list?.length > 0) {
    parts.push(renderAddressesList(mainResult.addresses));
  }

  detailsHTML.innerHTML = parts.join("");
  detailsHTML.classList.remove("hidden");

  if (placeholder) {
    placeholder.classList.add("hidden");
  }

  attachCopyListeners(detailsHTML);

  // Attach click listeners for address buttons
  if (mainResult.addresses?.list?.length > 0) {
    attachAddressButtonListeners(detailsHTML);
  }
}

/**
 * Hides search results
 */
export function hideSearchResults() {
  const wrapper = document.getElementById("results-wrapper");
  const devHeader = document.getElementById("dev-header");
  const prodHeader = document.getElementById("prod-header");

  if (wrapper) {
    wrapper.classList.add("hidden");
  }

  if (devHeader) {
    devHeader.classList.add("hidden");
  }

  if (prodHeader) {
    prodHeader.classList.add("hidden");
  }
}

/**
 * Renders the addresses list as clickable buttons
 * @param {Object} addresses - Addresses object with pagination and list
 * @returns {string} HTML string
 */
function renderAddressesList(addresses) {
  const buttons = addresses.list.map(addr => {
    const publicId = escapeHtml(addr.public_id);
    const description = escapeHtml(addr.description);
    return `
      <button
        class="address-btn w-full text-left px-3 py-2 text-sm bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 hover:border-indigo-400 cursor-pointer transition-colors"
        data-public-id="${publicId}"
      >${description}</button>
    `;
  }).join("");

  const pagination = addresses.pagination;
  const countInfo = pagination
    ? `<span class="text-xs text-gray-400">${pagination.address_count} address${pagination.address_count > 1 ? "es" : ""}</span>`
    : "";

  return `
    <div class="bg-indigo-50 p-3 rounded-lg border border-indigo-200">
      <div class="flex items-center justify-between mb-2">
        <div class="text-xs text-indigo-700 font-medium uppercase">Addresses</div>
        ${countInfo}
      </div>
      <div class="flex flex-col gap-1.5">${buttons}</div>
    </div>
  `;
}

/**
 * Attaches click listeners to all copy buttons in a container
 * @param {HTMLElement} container - Container with copy buttons
 */
function attachCopyListeners(container) {
  container.querySelectorAll(".copy-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const value = btn.getAttribute("data-copy-value");
      navigator.clipboard.writeText(value).then(() => {
        const svg = btn.querySelector("svg");
        svg.outerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path d="M20 6L9 17l-5-5"/>
        </svg>`;
        setTimeout(() => {
          btn.querySelector("svg").outerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>`;
        }, 1500);
      });
    });
  });
}

/**
 * Attaches click listeners to address buttons
 * @param {HTMLElement} container - Container with address buttons
 */
function attachAddressButtonListeners(container) {
  container.querySelectorAll(".address-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const publicId = btn.getAttribute("data-public-id");
      if (publicId && _onAddressClick) {
        _onAddressClick(publicId);
      }
    });
  });
}

/** @type {Function|null} callback for address button clicks */
let _onAddressClick = null;

/**
 * Registers a callback for when an address button is clicked
 * @param {Function} callback - Called with (publicId)
 */
export function onAddressClick(callback) {
  _onAddressClick = callback;
}

/**
 * Clears search results
 */
export function clearSearchResults() {
  const results = document.getElementById("autocomplete-results");
  const resultsCompare = document.getElementById("autocomplete-results-compare");
  const wrapper = document.getElementById("results-wrapper");
  const devHeader = document.getElementById("dev-header");
  const prodHeader = document.getElementById("prod-header");

  if (results) {
    results.innerHTML = "";
  }

  if (resultsCompare) {
    resultsCompare.innerHTML = "";
  }

  if (wrapper) {
    wrapper.classList.add("hidden");
  }

  if (devHeader) {
    devHeader.classList.add("hidden");
  }

  if (prodHeader) {
    prodHeader.classList.add("hidden");
  }
}
