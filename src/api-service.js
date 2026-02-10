// api-service.js - Unified API service for Woosmap Localities API

import { buildQueryString } from "./utils.js";
import { getTargetEnvironment } from "./environment_select.js";
import { getTargetEnpoint } from "./endpoint_select.js";

const queryParams = new URLSearchParams(window.location.search);
const langFromUrl = queryParams.get("language");

/**
 * Returns the currently selected language, or empty string if none
 * Priority: URL query param > select element > empty
 */
function getLanguage() {
  if (langFromUrl) return langFromUrl;
  const select = document.getElementById("language-select");
  return select ? select.value : "";
}

/**
 * Shows error modal with message
 * @param {string} messageHtml - Error message (can contain HTML)
 */
function showErrorModal(messageHtml) {
  const modal = document.getElementById("error-modal");
  const msg = document.getElementById("error-message");
  if (modal && msg) {
    msg.innerHTML = messageHtml;
    modal.classList.remove("hidden");
  }
}

/**
 * Builds API arguments for autocomplete/search requests
 * @param {Object} params - Request parameters
 * @returns {Object} API arguments
 */
function buildApiArgs({ input, components, types, extended, location, radius }) {
  const endpoint = getTargetEnpoint();
  const lang = getLanguage();
  const args = {
    input,
    data: "advanced"
  };

  if (lang) {
    args.language = lang;
  }

  if (extended) {
    args.extended = "postal_code";
  }

  if (endpoint === "search") {
    args.location = "0,0";
  } else if (endpoint === "geocode") {
    args.address = input;
  }

  if (location) {
    args.location = `${location.lat()},${location.lng()}`;
  }

  if (radius) {
    args.radius = radius;
  }

  if (components) {
    args.components = components;
  }

  if (types) {
    args.types = types;
  }

  return args;
}

/**
 * Generic API fetch with error handling
 * @param {string} url - API URL
 * @param {boolean} showErrors - Whether to show error modal
 * @returns {Promise} API response
 */
async function fetchApi(url, showErrors = false) {
  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok && showErrors) {
      const details = data?.details;
      const message = details
        ? `<pre>${JSON.stringify(details, null, 2)}</pre>`
        : "Unknown API error.";
      showErrorModal(message);
    }

    return data;
  } catch (err) {
    if (showErrors) {
      showErrorModal(err.message || "A network error occurred.");
    }
    throw err;
  }
}

/**
 * Performs autocomplete/search request
 * @param {Object} params - Search parameters
 * @param {Object|null} env - Environment config to use (defaults to target environment)
 * @returns {Promise} API response
 */
export async function autocompleteSearch(params, env = null) {
  const resolvedEnv = env || getTargetEnvironment();
  const endpoint = getTargetEnpoint();
  const args = {
    key: resolvedEnv.woosmap_key,
    ...buildApiArgs(params)
  };

  const url = `${resolvedEnv.url}${endpoint}/?${buildQueryString(args)}`;
  console.log(`autocompleteSearch - args:`, args);

  return fetchApi(url, !env);
}

/**
 * Gets details for a specific locality
 * @param {string} publicId - Public ID of the locality
 * @param {string} fields - Fields to retrieve (pipe-separated)
 * @param {Object|null} env - Environment config to use (defaults to target environment)
 * @returns {Promise} API response
 */
export async function getDetails(publicId, fields, env = null) {
  const resolvedEnv = env || getTargetEnvironment();
  const lang = getLanguage();
  const args = {
    key: resolvedEnv.woosmap_key,
    public_id: publicId
  };

  if (lang) {
    args.language = lang;
  }

  if (fields) {
    args.fields = fields;
  }

  const url = `${resolvedEnv.url}details/?${buildQueryString(args)}`;
  return fetchApi(url, !env);
}

/**
 * Performs reverse geocoding
 * @param {Object} latlng - Latitude/longitude object
 * @param {string} components - Country restrictions
 * @param {string} types - Type restrictions
 * @returns {Promise} API response
 */
export async function reverseGeocode(latlng, components, types) {
  const env = getTargetEnvironment();
  const lang = getLanguage();
  const args = {
    key: env.woosmap_key,
    latlng: `${latlng.lat},${latlng.lng}`
  };

  if (lang) {
    args.language = lang;
  }

  if (components) {
    args.components = components;
  }

  if (types) {
    args.types = types;
  }

  const url = `${env.url}geocode/?${buildQueryString(args)}`;
  return fetchApi(url, false);
}
