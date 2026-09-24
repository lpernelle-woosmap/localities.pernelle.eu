// request-url.js - Export/import of Localities request URLs (API keys never leave the app)

export const KEY_PLACEHOLDER = "YOUR_WOOSMAP_KEY";

// Public and private key params accepted by the API
const KEY_PARAMS = ["key", "private_key"];

// /localities/{endpoint}/ or /{prSegment}/localities/{endpoint}/
const LOCALITIES_PATH = /^\/(?:([^/]+)\/)?localities\/([a-z_]+)\/?$/;

/**
 * Replaces any API key in a request URL with a placeholder
 * @param {string} url - Request URL
 * @returns {string} Same URL with key/private_key set to KEY_PLACEHOLDER
 */
export function maskApiKey(url) {
  const parsed = new URL(url);
  KEY_PARAMS
    .filter(name => parsed.searchParams.has(name))
    .forEach(name => parsed.searchParams.set(name, KEY_PLACEHOLDER));
  return parsed.toString();
}

/**
 * Parses a pasted Localities request URL, dropping its API key
 * @param {string} raw - Pasted URL
 * @returns {{environment: {name: string, prSegment?: string}|null, endpoint: string, params: Object}}
 * @throws {Error} If the URL is invalid or not a Localities API URL
 */
export function parseRequestUrl(raw) {
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Invalid URL");
  }

  const match = LOCALITIES_PATH.exec(url.pathname);
  if (!match) {
    throw new Error("Not a Localities API URL (expected …/localities/{endpoint}/)");
  }

  const params = Object.fromEntries(url.searchParams);
  KEY_PARAMS.forEach(name => delete params[name]);

  return {
    environment: detectEnvironment(url.hostname, match[1]),
    endpoint: match[2],
    params
  };
}

/**
 * Maps a request host (and optional PR path segment) to an app environment
 * @param {string} hostname - URL hostname
 * @param {string|undefined} prSegment - Path segment before /localities/, if any
 * @returns {{name: string, prSegment?: string}|null} Environment, or null if unknown
 */
function detectEnvironment(hostname, prSegment) {
  if (hostname === "api.woosmap.com" && !prSegment) return { name: "prod" };
  if (hostname !== "develop-api.woosmap.com") return null;
  return prSegment ? { name: "pr", prSegment } : { name: "dev" };
}
