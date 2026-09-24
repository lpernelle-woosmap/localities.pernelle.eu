// request-modal.js - "Request URL" modal: copy the last request, or paste one to replay it

import { getLastRequestUrl } from "./api-service.js";
import { maskApiKey, parseRequestUrl } from "./request-url.js";

/**
 * Wires the request URL modal
 * @param {Function} onApply - Called with the parsed request (see parseRequestUrl); may throw or reject
 */
export function initRequestModal(onApply) {
  const modal = document.getElementById("request-modal");
  const textarea = document.getElementById("request-url-input");
  const errorEl = document.getElementById("request-url-error");
  if (!modal || !textarea || !errorEl) return;

  const showError = (message) => {
    errorEl.textContent = message;
    errorEl.classList.toggle("hidden", !message);
  };

  const open = () => {
    const lastUrl = getLastRequestUrl();
    textarea.value = lastUrl ? maskApiKey(lastUrl) : "";
    showError("");
    modal.classList.remove("hidden");
    textarea.focus();
    textarea.select();
  };

  const close = () => modal.classList.add("hidden");

  const apply = async () => {
    try {
      const request = parseRequestUrl(textarea.value);
      close();
      await onApply(request);
    } catch (error) {
      modal.classList.remove("hidden");
      showError(error.message);
    }
  };

  document.getElementById("request-url-btn")?.addEventListener("click", open);
  document.getElementById("request-modal-close")?.addEventListener("click", close);
  document.getElementById("request-modal-backdrop")?.addEventListener("click", close);
  document.getElementById("request-url-apply")?.addEventListener("click", apply);
  document.getElementById("request-url-copy")?.addEventListener("click", () => {
    navigator.clipboard.writeText(textarea.value);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}
