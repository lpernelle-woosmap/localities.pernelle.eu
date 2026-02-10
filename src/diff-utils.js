// diff-utils.js - Comparison utilities for API responses

/**
 * Deep equality check for two JSON-serializable values
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
export function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;

  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(key => keysB.includes(key) && deepEqual(a[key], b[key]));
}

/**
 * Compares two detail result objects field-by-field
 * @param {Object} devResult - Result from dev/PR environment
 * @param {Object} prodResult - Result from production environment
 * @returns {{ identical: boolean, fields: Object<string, {status: string, devValue: *, prodValue: *}> }}
 */
export function computeDiff(devResult, prodResult) {
  const allKeys = new Set([
    ...Object.keys(devResult || {}),
    ...Object.keys(prodResult || {})
  ]);

  const fields = {};
  let identical = true;

  for (const key of allKeys) {
    const inDev = devResult != null && Object.prototype.hasOwnProperty.call(devResult, key);
    const inProd = prodResult != null && Object.prototype.hasOwnProperty.call(prodResult, key);

    if (inDev && inProd) {
      if (deepEqual(devResult[key], prodResult[key])) {
        fields[key] = { status: "same", devValue: devResult[key], prodValue: prodResult[key] };
      } else {
        fields[key] = { status: "changed", devValue: devResult[key], prodValue: prodResult[key] };
        identical = false;
      }
    } else if (inDev && !inProd) {
      fields[key] = { status: "added", devValue: devResult[key], prodValue: undefined };
      identical = false;
    } else {
      fields[key] = { status: "removed", devValue: undefined, prodValue: prodResult[key] };
      identical = false;
    }
  }

  return { identical, fields };
}

/**
 * Checks if coordinates differ between dev and prod
 * @param {{ fields: Object }} diff - Diff result from computeDiff
 * @returns {boolean}
 */
export function coordinatesDiffer(diff) {
  const geom = diff.fields.geometry;
  if (!geom || geom.status === "same") return false;
  if (geom.status === "added" || geom.status === "removed") return true;
  return !deepEqual(geom.devValue?.location, geom.prodValue?.location);
}

/**
 * Checks if viewport differs between dev and prod
 * @param {{ fields: Object }} diff - Diff result from computeDiff
 * @returns {boolean}
 */
export function viewportDiffers(diff) {
  const geom = diff.fields.geometry;
  if (!geom || geom.status === "same") return false;
  if (geom.status === "added" || geom.status === "removed") return true;
  return !deepEqual(geom.devValue?.viewport, geom.prodValue?.viewport);
}
