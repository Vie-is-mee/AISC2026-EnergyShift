"use strict";
const apiBaseUrl = window.ENERGYSHIFT_CONFIG?.apiBaseUrl || "";
function apiFetch(path, options) {
  if (!path.startsWith("/api/demo/")) throw Error("Unsupported demo endpoint");
  // No credentials or API keys are attached to public demo requests.
  return fetch(apiBaseUrl + path, { ...options, credentials: "omit" });
}
