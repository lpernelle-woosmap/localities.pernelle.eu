// utils.js - Shared utility functions

/**
 * Builds a URL query string from parameters object
 * @param {Object} params - Key-value pairs for query string
 * @returns {string} Encoded query string
 */
export function buildQueryString(params) {
  const queryStringParts = [];

  for (let key in params) {
    if (params.hasOwnProperty(key)) {
      const value = params[key];
      queryStringParts.push(
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
      );
    }
  }
  return queryStringParts.join("&");
}

/**
 * Debounces a function call
 * @param {Function} func - Function to debounce
 * @param {number} wait - Milliseconds to wait
 * @param {boolean} immediate - Execute immediately on first call
 * @returns {Function} Debounced function
 */
export function debounce(func, wait, immediate) {
  let timeout;
  return function () {
    const context = this;
    const args = arguments;
    const later = () => {
      timeout = null;
      if (!immediate) {
        func.apply(context, args);
      }
    };
    const callNow = immediate && !timeout;
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
    if (callNow) {
      func.apply(context, args);
    }
  };
}

/**
 * Safely escapes HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Safely creates HTML with bold matched substrings
 * @param {string} string - Original string
 * @param {Array} matched_substrings - Array of {offset, length} objects
 * @returns {string} HTML string with bold tags (safe)
 */
export function boldMatchedSubstring(string, matched_substrings) {
  if (!matched_substrings || matched_substrings.length === 0) {
    return escapeHtml(string);
  }

  const sorted = [...matched_substrings].sort((a, b) => a.offset - b.offset);
  let result = '';
  let lastIndex = 0;

  for (const substring of sorted) {
    const start = substring.offset;
    const end = start + substring.length;

    // Add text before match (escaped)
    if (start > lastIndex) {
      result += escapeHtml(string.substring(lastIndex, start));
    }

    // Add matched text in bold (escaped)
    result += '<b>' + escapeHtml(string.substring(start, end)) + '</b>';
    lastIndex = end;
  }

  // Add remaining text (escaped)
  if (lastIndex < string.length) {
    result += escapeHtml(string.substring(lastIndex));
  }

  return result;
}

const LAT_LNG_PATTERN = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/**
 * Parses a "lat, lng" string into coordinates
 * @param {string} value - Raw input (separator: comma, semicolon or space)
 * @returns {{lat: number, lng: number}|null} Coordinates, or null if invalid/out of range
 */
export function parseLatLng(value) {
  const match = LAT_LNG_PATTERN.exec(value || "");
  if (!match) return null;

  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return { lat, lng };
}
