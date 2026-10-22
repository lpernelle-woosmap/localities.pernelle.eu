export const isoCountries = [
    { id: "FR", text: "France (+ DOM-TOM)" }, // the API includes overseas departments in FR
    { id: "FR-FR", text: "France hexagonale", flag: "FR" }, // API code for mainland France only
    { id: "MC", text: "Monaco" },
    { id: "GB", text: "GB" },
    { id: "UK", text: "UK (GB + JE + GG + IM)", codes: ["GB", "JE", "GG", "IM"] }, // GB + Channel Islands + Isle of Man
    { id: "IT", text: "Italy" },
    { id: "DE", text: "Germany" },
    { id: "ES", text: "Spain" },
    { id: "BE", text: "Belgium" },
    { id: "LU", text: "Luxembourg" },
    { id: "CH", text: "Switzerland" },
    { id: "NL", text: "Netherland" },
    { id: "US", text: "USA" },
    { id: "CN", text: "China" },
    { id: "BR", text: "Brazil" },
    { id: "PT", text: "Portugal" },
    { id: "RE", text: "Reunion" },
    { id: "TW", text: "Taiwan" },
    { id: "DZ", text: "Algeria" },
    { id: "IE", text: "Ireland" },
    { id: "PL", text: "Poland" },
    { id: "VN", text: "Vietnam" },
    { id: "AT", text: "Austria" },
    { id: "DK", text: "Denmark" },
    { id: "SE", text: "Sweden" },
  ];

/** Country codes sent to the API for an entry (defaults to its own id) */
const codesOf = (id) => isoCountries.find(c => c.id === id)?.codes || [id];

/** ISO code used to display an entry's flag (explicit `flag`, else its first API code) */
export const flagCode = (id) => isoCountries.find(c => c.id === id)?.flag || codesOf(id)[0];

/**
 * Builds the `components` param, expanding grouped entries (e.g. UK = GB + JE + GG + IM)
 * @param {string[]} ids - Selected entry ids
 * @returns {string} e.g. "country:GB|country:JE|country:GG|country:IM"
 */
export function buildCountryComponents(ids) {
  return [...new Set(ids.flatMap(codesOf))]
    .map(code => `country:${code}`)
    .join("|");
}

/**
 * Maps API country codes back to entry ids, preferring grouped entries when all their codes are present
 * @param {string[]} codes - e.g. ["GB", "JE", "GG", "IM", "FR"]
 * @returns {string[]} e.g. ["UK", "FR"]
 */
export function matchCountryIds(codes) {
  const remaining = new Set(codes);
  const groups = isoCountries.filter(c => c.codes?.every(code => remaining.has(code)));
  groups.forEach(g => g.codes.forEach(code => remaining.delete(code)));
  return [...groups.map(g => g.id), ...remaining];
}
