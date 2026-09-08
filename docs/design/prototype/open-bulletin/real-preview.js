/* Browser bootstrap for the local read-only real-data preview on port 8100. */
(function bootRealPreview(window, document) {
  "use strict";

  const isRealPreview = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";
  if (!isRealPreview) return;

  const main = document.getElementById("app-main");
  const toolbar = document.querySelector(".review-toolbar");
  const sampleLabel = document.querySelector(".sample-label");
  const description = document.querySelector('meta[name="description"]');

  if (toolbar) {
    toolbar.hidden = true;
    toolbar.setAttribute("aria-hidden", "true");
  }
  if (description) description.setAttribute("content", "Read-only local preview of current worship service records.");
  if (sampleLabel) {
    sampleLabel.textContent = "Read-only local preview";
    sampleLabel.classList.add("read-only-label");
  }

  function showFailure() {
    window.WorshipPrototypeLoadFailed = true;
    if (main) {
      main.innerHTML = '<section class="state-wrap" data-preview-state="unavailable"><div class="state-card"><p class="state-marker">Read-only preview</p><h1 id="main-title" tabindex="-1">Current records are unavailable</h1><p>The local preview could not load the current worship records. No sample data was displayed.</p></div></section>';
    }
  }

  function fetchedLabel(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "time unavailable" : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  }

  function validPayload(payload) {
    return Boolean(payload && payload.readOnly === true && payload.source === "Current Worship Service records" &&
      Array.isArray(payload.members) && Array.isArray(payload.categories) && Array.isArray(payload.services) &&
      Array.isArray(payload.songs) && Array.isArray(payload.requests) && payload.setlists && typeof payload.setlists === "object" &&
      payload.songStats && typeof payload.songStats === "object" && payload.features && typeof payload.features === "object" &&
      typeof payload.today === "string" && typeof payload.fetchedAt === "string");
  }

  function start(payload) {
    if (!validPayload(payload)) throw new Error("invalid preview payload");
    window.WorshipPrototypeFixtures = payload;
    if (sampleLabel) sampleLabel.textContent = "Read-only local preview, fetched " + fetchedLabel(payload.fetchedAt);
    document.title = "Current worship schedule, LV Zion Worship Service";
    window.dispatchEvent(new CustomEvent("WorshipPrototypeReady"));
  }

  fetch(new URL("../preview-data.json", window.location.href), {
    method: "GET",
    cache: "no-store",
    credentials: "omit",
    headers: { Accept: "application/json" }
  }).then((response) => {
    if (!response.ok) throw new Error("preview request failed");
    return response.json();
  }).then(start).catch(showFailure);
})(window, document);
