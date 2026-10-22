export const isoCountries = [
    { id: "FR", text: "France" },
    { id: "MC", text: "Monaco" },
    { id: "GB", text: "United Kingdom", extraCodes: ["JE", "GG", "IM"] }, // + Channel Islands, Isle of Man
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

/**
 * Builds the `components` param, expanding countries that bundle extra codes (e.g. GB + Channel Islands)
 * @param {string[]} ids - Selected country codes
 * @returns {string} e.g. "country:GB|country:JE|country:GG"
 */
export function buildCountryComponents(ids) {
  return ids
    .flatMap(id => [id, ...(isoCountries.find(c => c.id === id)?.extraCodes || [])])
    .map(id => `country:${id}`)
    .join("|");
}
