// Lightweight page-visit logger for pages that don't load app.js.
(() => {
  "use strict";
  fetch("/api/log-visit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: location.pathname, referrer: document.referrer }),
  }).catch(() => {});
})();
