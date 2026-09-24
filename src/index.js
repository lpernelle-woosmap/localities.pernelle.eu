// index.js - Main application entry point

import { isoCountries } from "./countries.js";
import { isoLanguages } from "./languages.js";
import { debounce, parseLatLng } from "./utils.js";
import { autocompleteSearch, getDetails, reverseGeocode } from "./api-service.js";
import { initializeMap, getMap, displayLocationOnMap, displayCompareLocationOnMap, clearCompareLocationFromMap, addMapClickListener, showBiasCircle, hideBiasCircle, getBiasRadius } from "./map-manager.js";
import { renderSearchResults, renderSearchError, displayLocationDetails, displayComparisonDetails, displayCompareErrorBanner, hideSearchResults, clearSearchResults, onAddressClick, renderCoordinatesSuggestion } from "./ui-manager.js";
import { computeDiff, coordinatesDiffer, viewportDiffers } from "./diff-utils.js";
import { getCompareEnvironment, getTargetLabel, getCompareLabel, isCompareSameAsTarget, setTargetEnvironment } from "./environment_select.js";
import { initRequestModal } from "./request-modal.js";
import { CONFIG } from "./config.js";

// Application state
let componentsRestriction = [];
let extended = false;
let biasEnabled = false;

/**
 * Displays the main result and, when it differs, a comparison with the compare env result
 * @param {Object|undefined} mainResult - Result from the target environment
 * @param {Error|undefined} compareError - Error from the compare environment, if any
 * @param {Object|undefined} compareResult - Result from the compare environment
 */
function displayWithComparison(mainResult, compareError, compareResult) {
  if (!mainResult) {
    console.warn("No result from main environment");
    return;
  }

  // Always show main result on map as primary
  displayLocationOnMap(mainResult);

  if (compareError) {
    // Compare env failed (HTTP error or network) -- show main + visible error banner
    displayLocationDetails(mainResult);
    displayCompareErrorBanner(compareError, getCompareLabel());
    return;
  }

  if (!compareResult) {
    // Compare env returned nothing -- show main only
    displayLocationDetails(mainResult);
    return;
  }

  // Compare
  const diff = computeDiff(mainResult, compareResult);

  if (diff.identical) {
    displayLocationDetails(mainResult);
  } else {
    const mainLbl = getTargetLabel();
    const compareLbl = getCompareLabel();
    displayComparisonDetails(mainResult, compareResult, diff, mainLbl, compareLbl);

    if (coordinatesDiffer(diff) || viewportDiffers(diff)) {
      displayCompareLocationOnMap(compareResult);
    }
  }
}

/**
 * Requests and displays details for a location
 * @param {string} publicId - Public ID of the location
 */
async function requestDetails(publicId) {
  const selectedFields = [...document.querySelectorAll('input[name="fields"]:checked')]
    .map(e => e.value);

  // The shape field needs geometry alongside it for the marker position and
  // viewport-based bounds fitting (see the Localities shape sample).
  if (selectedFields.includes("shape") && !selectedFields.includes("geometry")) {
    selectedFields.push("geometry");
  }

  const fields = selectedFields.join("|");

  const compareEnv = isCompareSameAsTarget() ? null : getCompareEnvironment();

  try {
    // Always clear previous comparison markers
    clearCompareLocationFromMap();

    if (!compareEnv) {
      // No comparison -- single env request
      const response = await getDetails(publicId, fields);
      if (response?.result) {
        displayLocationDetails(response.result);
        displayLocationOnMap(response.result);
      }
      return;
    }

    // Fetch from both environments in parallel
    const [mainResponse, compareResponse] = await Promise.all([
      getDetails(publicId, fields),
      getDetails(publicId, fields, compareEnv).catch((err) => ({ _error: err }))
    ]);

    displayWithComparison(mainResponse?.result, compareResponse?._error, compareResponse?.result);
  } catch (error) {
    console.error("Error fetching details:", error);
  }
}

/**
 * Reads the country/type restrictions from the controls panel
 * @returns {{components: string, types: string, excluded_types: string}} Pipe-separated filters
 */
function getRestrictions() {
  const selectedValues = (id) => Array.from(document.getElementById(id).selectedOptions)
    .map(o => o.value)
    .join("|");

  return {
    components: componentsRestriction.map(({ id }) => `country:${id}`).join("|"),
    types: selectedValues("types-select"),
    excluded_types: selectedValues("excluded-types-select")
  };
}

/**
 * Performs search and displays results from both dev and prod
 */
async function performSearch() {
  const input = document.getElementById("input");
  if (!input) return;

  const value = input.value.trim();
  if (!value) {
    clearSearchResults();
    return;
  }

  const { components, types, excluded_types } = getRestrictions();

  const map = getMap();
  const customDescriptionInput = document.getElementById("custom-description-input");
  const customDescription = customDescriptionInput ? customDescriptionInput.value.trim() : "";
  const searchParams = {
    input: value,
    components,
    types,
    excluded_types,
    extended,
    location: biasEnabled && map ? map.getCenter() : null,
    radius: biasEnabled ? getBiasRadius() : null,
    custom_description: customDescription || null
  };

  // Perform search, with optional comparison in parallel
  const compareEnv = isCompareSameAsTarget() ? null : getCompareEnvironment();
  try {
    const promises = [autocompleteSearch(searchParams)];
    if (compareEnv) {
      promises.push(autocompleteSearch(searchParams, compareEnv).catch((err) => ({ _error: err })));
    }

    const [mainResponse, compareResponse] = await Promise.all(promises);

    // Update headers with dynamic env names
    const devHeader = document.getElementById("dev-header");
    const prodHeader = document.getElementById("prod-header");
    if (devHeader) devHeader.querySelector("span").textContent = getTargetLabel();
    if (prodHeader) prodHeader.querySelector("span").textContent = compareEnv ? getCompareLabel() : "";

    renderSearchResults(mainResponse, false, handleResultClick);
    if (compareResponse) {
      if (compareResponse._error) {
        renderSearchError(compareResponse._error, true);
      } else {
        renderSearchResults(compareResponse, true, handleResultClick);
      }
    } else {
      // No comparison: ensure the compare list and header are cleared
      const compareResults = document.getElementById("autocomplete-results-compare");
      if (compareResults) compareResults.innerHTML = "";
      if (prodHeader) prodHeader.classList.add("hidden");
    }
  } catch (error) {
    console.error("Error performing search:", error);
  }

  const latlng = parseLatLng(value);
  if (latlng) {
    renderCoordinatesSuggestion(latlng, handleCoordinatesClick);
  }
}

/**
 * Handles click on a search result
 * @param {string} predictionId - ID of the clicked prediction
 * @param {string} name - Display name of the prediction
 */
function handleResultClick(predictionId, name) {
  hideSearchResults();
  const input = document.getElementById("input");
  if (input) {
    input.value = name;
  }
  requestDetails(predictionId);
}

/**
 * Handles reverse geocoding from map click
 * @param {Object} event - Map click event
 */
async function handleMapClick(event) {
  const result = await reverseGeocodeFirst(event.latlng);
  if (result) {
    displayLocationDetails(result);
  }
}

/**
 * Handles click on the coordinates suggestion: reverse geocodes and shows the result
 * @param {{lat: number, lng: number}} latlng - Coordinates typed in the search input
 */
async function handleCoordinatesClick(latlng) {
  hideSearchResults();
  clearCompareLocationFromMap();

  const compareEnv = isCompareSameAsTarget() ? null : getCompareEnvironment();
  if (!compareEnv) {
    const result = await reverseGeocodeFirst(latlng);
    if (result) {
      displayLocationDetails(result);
      displayLocationOnMap(result);
    }
    return;
  }

  const { components, types, excluded_types } = getRestrictions();
  const [mainResult, compareResponse] = await Promise.all([
    reverseGeocodeFirst(latlng),
    reverseGeocode(latlng, components, types, excluded_types, compareEnv).catch((err) => ({ _error: err }))
  ]);

  displayWithComparison(mainResult, compareResponse?._error, compareResponse?.results?.[0]);
}

/**
 * Reverse geocodes coordinates with the current restrictions
 * @param {{lat: number, lng: number}} latlng - Coordinates to reverse geocode
 * @returns {Promise<Object|null>} First geocode result, or null if none/error
 */
async function reverseGeocodeFirst(latlng) {
  const { components, types, excluded_types } = getRestrictions();
  try {
    const response = await reverseGeocode(latlng, components, types, excluded_types);
    const result = response?.results?.[0] ?? null;
    if (result) {
      console.log("Reverse geocode result:", result.formatted_address);
    }
    return result;
  } catch (error) {
    console.error("Error during reverse geocoding:", error);
    return null;
  }
}

/**
 * Toggles country selection
 * @param {HTMLElement} countryElement - Country element
 */
function toggleCountry(countryElement) {
  setCountryActive(countryElement, !countryElement.classList.contains("active"));
  refreshCountryRestrictions();
}

/**
 * Sets the selected state of a country element
 * @param {HTMLElement} countryElement - Country element
 * @param {boolean} active - Whether the country is selected
 */
function setCountryActive(countryElement, active) {
  countryElement.classList.toggle("active", active);
  countryElement.classList.toggle("bg-blue-100", active);
  countryElement.classList.toggle("border-blue-500", active);
  countryElement.querySelector(".active-icon-wrapper")?.classList.toggle("hidden", !active);
}

/**
 * Rebuilds componentsRestriction from the selected countries and renders the summary
 */
function refreshCountryRestrictions() {
  componentsRestriction = [];

  document.querySelectorAll(".country.active").forEach(({ dataset }) => {
    componentsRestriction.push({
      id: dataset.countrycode,
      text: dataset.countrytext
    });
  });

  const activeCountryList = componentsRestriction.map(
    ({ id, text }) =>
      `<div class="inline-flex items-center gap-2 bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs mr-1 mb-1">
        <span class="flag-icon flag-icon-${id.toLowerCase()}"></span>
        <span>${text}</span>
      </div>`
  );

  const activeRestrictionsEl = document.querySelector("#active-restrictions");
  if (activeRestrictionsEl) {
    activeRestrictionsEl.innerHTML = activeCountryList.length > 0
      ? activeCountryList.join("")
      : '<span class="text-gray-500">No active restrictions...</span>';
  }
}

/**
 * Replays a pasted request: selects its env, fills the form and runs it with the app keys
 * @param {{environment: Object|null, endpoint: string, params: Object}} request - Parsed request URL
 * @throws {Error} If the endpoint is not supported or a required param is missing
 */
async function applyRequest({ environment, endpoint, params }) {
  if (environment) {
    setTargetEnvironment(environment);
  }
  applyFieldsParam(params.fields);
  document.getElementById("language-select").value = params.language || "";

  if (endpoint === "details") {
    if (!params.public_id) throw new Error("Missing public_id parameter");
    return requestDetails(params.public_id);
  }

  if (endpoint === "geocode" && params.latlng) {
    const latlng = parseLatLng(params.latlng);
    if (!latlng) throw new Error(`Invalid latlng: ${params.latlng}`);
    return handleCoordinatesClick(latlng);
  }

  const endpointSelect = document.getElementById("endpoint-select");
  if (![...endpointSelect.options].some(o => o.value === endpoint)) {
    throw new Error(`Unsupported endpoint: ${endpoint}`);
  }
  endpointSelect.value = endpoint;
  applySearchParams(endpoint, params);
  return performSearch();
}

/**
 * Checks the response field checkboxes listed in a fields param
 * @param {string|undefined} fields - Pipe-separated fields (unchanged when undefined)
 */
function applyFieldsParam(fields) {
  if (fields === undefined) return;
  const selected = fields.split("|");
  document.querySelectorAll('input[name="fields"]').forEach(cb => {
    cb.checked = selected.includes(cb.value);
  });
}

/**
 * Fills the search controls from autocomplete/search/geocode params
 * @param {string} endpoint - Target endpoint
 * @param {Object} params - Request query params
 */
function applySearchParams(endpoint, params) {
  document.getElementById("input").value = (endpoint === "geocode" ? params.address : params.input) || "";
  document.getElementById("custom-description-input").value = params.custom_description || "";
  setSelectizeValues("types-select", params.types);
  setSelectizeValues("excluded-types-select", params.excluded_types);
  setCountryRestrictions(params.components);

  extended = params.extended === "postal_code";
  document.getElementById("extended-checkbox").checked = extended;

  // search always sends location=0,0 by default, so it is not a real bias
  const biasLatLng = params.location === "0,0" ? null : parseLatLng(params.location);
  setBias(biasLatLng);
}

/**
 * Sets a selectize multi-select, creating options it does not know yet
 * @param {string} selectId - ID of the underlying select element
 * @param {string|undefined} value - Pipe-separated values
 */
function setSelectizeValues(selectId, value) {
  const selectize = document.getElementById(selectId)?.selectize;
  if (!selectize) return;
  const values = value ? value.split("|") : [];
  values.forEach(v => selectize.addOption({ value: v, text: v }));
  selectize.setValue(values, true);
}

/**
 * Selects exactly the countries listed in a components param
 * @param {string|undefined} components - e.g. "country:FR|country:IT"
 */
function setCountryRestrictions(components) {
  const codes = (components || "")
    .split("|")
    .map(c => c.replace(/^country:/i, "").toUpperCase());
  document.querySelectorAll(".country").forEach(el => {
    setCountryActive(el, codes.includes(el.dataset.countrycode.toUpperCase()));
  });
  refreshCountryRestrictions();
}

/**
 * Enables the geographical bias centered on the given point, or disables it
 * @param {{lat: number, lng: number}|null} latlng - Bias center, or null to disable
 */
function setBias(latlng) {
  const map = getMap();
  biasEnabled = Boolean(latlng && map);
  document.getElementById("bias-checkbox").checked = biasEnabled;
  if (biasEnabled) {
    map.setCenter(latlng);
    showBiasCircle();
  } else {
    hideBiasCircle();
  }
}

/**
 * Initializes UI components and event listeners
 */
function initUI() {
  const multiSelect = document.querySelector(".multiselect");
  const countries = document.getElementById("countries");
  const overlayCb = document.getElementById("bgOverlay");
  const input = document.getElementById("input");
  const extendedCheckbox = document.getElementById("extended-checkbox");
  const biasCheckbox = document.getElementById("bias-checkbox");
  const typesSelect = document.getElementById("types-select");
  const excludedTypesSelect = document.getElementById("excluded-types-select");
  const languageSelect = document.getElementById("language-select");

  // Populate language select from isoLanguages
  if (languageSelect) {
    isoLanguages.forEach(({ id, text }) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = `${text} (${id})`;
      languageSelect.appendChild(option);
    });
  }

  // Initialize selectize for types
  if (typesSelect) {
    $(typesSelect).selectize({
      create: true,
      maxItems: null,
      plugins: ["remove_button"],
      sortField: {
        field: "text",
        direction: "asc"
      },
      dropdownParent: "body"
    });
  }

  // Initialize selectize for excluded types
  if (excludedTypesSelect) {
    $(excludedTypesSelect).selectize({
      create: true,
      maxItems: null,
      plugins: ["remove_button"],
      sortField: {
        field: "text",
        direction: "asc"
      },
      dropdownParent: "body"
    });
  }

  let componentExpanded = false;

  // Input search listener with debounce
  if (input) {
    input.addEventListener(
      "input",
      debounce(() => {
        performSearch();
      }, CONFIG.API.DEBOUNCE_DELAY)
    );
  }

  // Click outside autocomplete results to close
  document.addEventListener("click", (e) => {
    const container = document.querySelector(".autocomplete-input-container");
    if (container && !container.contains(e.target)) {
      hideSearchResults();
    }
  });

  // Country selection dropdown
  const showCountriesList = () => {
    if (countries) countries.classList.remove("hidden");
    if (overlayCb) overlayCb.classList.remove("hidden");
    componentExpanded = true;
  };

  const hideCountriesList = () => {
    if (countries) countries.classList.add("hidden");
    if (overlayCb) overlayCb.classList.add("hidden");
    componentExpanded = false;
  };

  if (multiSelect) {
    multiSelect.addEventListener(
      "click",
      (e) => {
        if (!componentExpanded) {
          showCountriesList();
        } else {
          hideCountriesList();
        }
        e.stopPropagation();
      },
      true
    );
  }

  // Bias checkbox
  if (biasCheckbox) {
    biasCheckbox.addEventListener("change", () => {
      biasEnabled = biasCheckbox.checked;
      if (biasEnabled) {
        showBiasCircle();
      } else {
        hideBiasCircle();
      }
      performSearch();
    });
  }

  // Language select
  if (languageSelect) {
    languageSelect.addEventListener("change", () => {
      performSearch();
    });
  }

  // Custom description input
  const customDescriptionInput = document.getElementById("custom-description-input");
  if (customDescriptionInput) {
    customDescriptionInput.addEventListener("change", () => {
      performSearch();
    });
  }

  // Extended checkbox
  if (extendedCheckbox) {
    extendedCheckbox.addEventListener("change", () => {
      extended = extendedCheckbox.checked;
      performSearch();
    });
  }

  // Overlay click
  if (overlayCb) {
    overlayCb.addEventListener("click", () => {
      if (componentExpanded) {
        hideCountriesList();
        performSearch();
      }
    });
  }

  // Populate countries list
  if (countries) {
    const countriesGrid = countries.querySelector("#countries-grid");
    if (countriesGrid) {
      const countryList = isoCountries.map(
        ({ id, text }) =>
          `<div class="country flex items-center gap-2 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors" data-countrycode="${id}" data-countrytext="${text}">
            <span class="flag-icon flag-icon-${id.toLowerCase()}"></span>
            <span class="flex-1 text-sm">${text}</span>
            <div class='active-icon-wrapper hidden'>
              <svg class="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
            </div>
          </div>`
      );

      countriesGrid.innerHTML = countryList.join("");

      document.querySelectorAll(".country").forEach(country => {
        country.addEventListener("click", () => toggleCountry(country));
      });
    }

    const btnRestrict = document.querySelector("#btnRestrict");
    if (btnRestrict) {
      btnRestrict.addEventListener("click", () => {
        hideCountriesList();
        performSearch();
      });
    }
  }

  // Error modal close button
  const closeErrorModal = document.getElementById("close-error-modal");
  if (closeErrorModal) {
    closeErrorModal.addEventListener("click", () => {
      const errorModal = document.getElementById("error-modal");
      if (errorModal) {
        errorModal.classList.add("hidden");
      }
    });
  }
}

/**
 * Initializes the Woosmap map
 */
window.initMap = function () {
  const mapContainer = document.getElementById("map");
  if (!mapContainer) {
    console.error("Map container not found");
    return;
  }

  initializeMap(mapContainer);
  addMapClickListener(handleMapClick);
};

// Load Woosmap SDK
const script = document.createElement("script");
script.src = `${CONFIG.WOOSMAP.SDK_URL}?key=${CONFIG.WOOSMAP.SDK_KEY}&callback=initMap`;
script.defer = true;
document.head.appendChild(script);

// Register address button click handler
onAddressClick((publicId) => requestDetails(publicId));

// Initialize UI when ready
initUI();
initRequestModal(applyRequest);
