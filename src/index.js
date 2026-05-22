// index.js - Main application entry point

import { isoCountries } from "./countries.js";
import { isoLanguages } from "./languages.js";
import { debounce } from "./utils.js";
import { autocompleteSearch, getDetails, reverseGeocode } from "./api-service.js";
import { initializeMap, getMap, displayLocationOnMap, displayCompareLocationOnMap, clearCompareLocationFromMap, addMapClickListener } from "./map-manager.js";
import { renderSearchResults, renderSearchError, displayLocationDetails, displayComparisonDetails, displayCompareErrorBanner, hideSearchResults, clearSearchResults, onAddressClick } from "./ui-manager.js";
import { computeDiff, coordinatesDiffer, viewportDiffers } from "./diff-utils.js";
import { getCompareEnvironment, getTargetLabel, getCompareLabel, isCompareSameAsTarget } from "./environment_select.js";
import { CONFIG } from "./config.js";

// Application state
let componentsRestriction = [];
let extended = false;
let biasEnabled = false;

/**
 * Requests and displays details for a location
 * @param {string} publicId - Public ID of the location
 */
async function requestDetails(publicId) {
  const fields = [...document.querySelectorAll('input[name="fields"]:checked')]
    .map(e => e.value)
    .join("|");

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

    const mainResult = mainResponse?.result;
    const compareError = compareResponse?._error;
    const compareResult = compareResponse?.result;

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
  } catch (error) {
    console.error("Error fetching details:", error);
  }
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

  const typesSelect = document.getElementById("types-select");
  const excludedTypesSelect = document.getElementById("excluded-types-select");
  const components = componentsRestriction
    .map(({ id }) => `country:${id}`)
    .join("|");
  const types = Array.from(typesSelect.selectedOptions)
    .map(o => o.value)
    .join("|");
  const excluded_types = Array.from(excludedTypesSelect.selectedOptions)
    .map(o => o.value)
    .join("|");

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
    radius: biasEnabled ? CONFIG.API.GEOGRAPHICAL_BIAS_RADIUS : null,
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
  const typesSelect = document.getElementById("types-select");
  const excludedTypesSelect = document.getElementById("excluded-types-select");
  const components = componentsRestriction
    .map(({ id }) => `country:${id}`)
    .join("|");
  const types = Array.from(typesSelect.selectedOptions)
    .map(o => o.value)
    .join("|");
  const excluded_types = Array.from(excludedTypesSelect.selectedOptions)
    .map(o => o.value)
    .join("|");

  try {
    const response = await reverseGeocode(event.latlng, components, types, excluded_types);
    if (response?.results?.[0]) {
      console.log("Reverse geocode result:", response.results[0].formatted_address);
      displayLocationDetails(response.results[0]);
    }
  } catch (error) {
    console.error("Error during reverse geocoding:", error);
  }
}

/**
 * Toggles country selection
 * @param {HTMLElement} countryElement - Country element
 */
function toggleCountry(countryElement) {
  countryElement.classList.toggle("active");
  countryElement.classList.toggle("bg-blue-100");
  countryElement.classList.toggle("border-blue-500");

  const iconWrapper = countryElement.querySelector('.active-icon-wrapper');
  if (iconWrapper) {
    iconWrapper.classList.toggle("hidden");
  }

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
