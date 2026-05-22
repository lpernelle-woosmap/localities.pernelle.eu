// environment_select.js - Environment and API key management

const environments = {
  prod: {
    woosmap_key: "woos-afefb9b4-238c-3c6a-a036-9b630b6ca775",
    url: "https://api.woosmap.com/localities/"
  },
  dev: {
    woosmap_key: "woos-f3399eaa-1f01-33cd-a0db-ce1e23b7320d",
    url: "https://develop-api.woosmap.com/localities/"
  },
  pr: {
    woosmap_key: "woos-f3399eaa-1f01-33cd-a0db-ce1e23b7320d",
    url: ""
  },
  comparePr: {
    woosmap_key: "woos-f3399eaa-1f01-33cd-a0db-ce1e23b7320d",
    url: ""
  }
};

const envLabels = {
  prod: "Production",
  dev: "Development",
  pr: "PR Deploy",
  none: "None"
};

/**
 * Gets the currently selected target environment configuration
 * @returns {Object} Environment configuration with woosmap_key and url
 */
export function getTargetEnvironment() {
  const selectedEnvironment = document.getElementById("env-select").value;
  console.log(
    `** ${selectedEnvironment.toUpperCase()} ** ${environments[selectedEnvironment].url}`
  );
  return environments[selectedEnvironment];
}

/**
 * Gets the compare environment configuration, or null if "none"
 * @returns {Object|null} Environment configuration, or null if comparison is disabled
 */
export function getCompareEnvironment() {
  const selected = document.getElementById("compare-select").value;
  if (selected === "none") return null;
  // For compare PR, use the separate comparePr entry
  if (selected === "pr") return environments.comparePr;
  return environments[selected];
}

/**
 * Returns true if the compare env points to the same stack as the target env
 * (same URL and key). For PR vs PR, this checks both PR numbers resolve to the
 * same URL.
 * @returns {boolean}
 */
export function isCompareSameAsTarget() {
  const targetSel = document.getElementById("env-select").value;
  const compareSel = document.getElementById("compare-select").value;
  if (compareSel === "none") return false;

  const target = environments[targetSel];
  const compare = compareSel === "pr" ? environments.comparePr : environments[compareSel];
  if (!target || !compare) return false;

  return target.url === compare.url && target.woosmap_key === compare.woosmap_key;
}

/**
 * Gets the display label for the target environment
 * @returns {string}
 */
export function getTargetLabel() {
  const selected = document.getElementById("env-select").value;
  if (selected === "pr") {
    const prDeployEl = document.getElementById("pr-deploy");
    return prDeployEl?.innerText || "PR Deploy";
  }
  return envLabels[selected] || selected;
}

/**
 * Gets the display label for the compare environment
 * @returns {string}
 */
export function getCompareLabel() {
  const selected = document.getElementById("compare-select").value;
  if (selected === "pr") {
    const prDeployEl = document.getElementById("compare-pr-deploy");
    return prDeployEl?.innerText || "PR Deploy";
  }
  return envLabels[selected] || selected;
}

/**
 * Handles PR selection for a given select element
 * @param {string} selectId - ID of the select element
 * @param {string} envKey - Key in environments object ('pr' or 'comparePr')
 * @param {string} labelId - ID of the option element to update label
 */
function handlePrSelection(selectId, envKey, labelId) {
  const selectEl = document.getElementById(selectId);
  if (selectEl.value === "pr") {
    const targetPR = prompt("Which PR should we target today?");

    if (targetPR) {
      const prNumber = /\d+/.exec(targetPR);
      environments[envKey].url = `https://develop-api.woosmap.com/${targetPR}/localities/`;
      const labelEl = document.getElementById(labelId);
      if (labelEl) {
        labelEl.innerText = `PR ${prNumber}`;
      }
    }
  }
}

// Handle PR environment selection for target env
document.getElementById("env-select").addEventListener("change", () => {
  handlePrSelection("env-select", "pr", "pr-deploy");
});

// Handle PR environment selection for compare env
document.getElementById("compare-select").addEventListener("change", () => {
  handlePrSelection("compare-select", "comparePr", "compare-pr-deploy");
});
