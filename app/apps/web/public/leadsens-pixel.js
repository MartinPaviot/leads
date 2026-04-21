/*
 * LeadSens visitor pixel. Install on customer marketing sites with:
 *
 *   <script
 *     src="https://app.leadsens.io/leadsens-pixel.js"
 *     data-write-key="lk_YOUR_KEY"
 *     async
 *   ></script>
 *
 * Ships one ping per page + a lightweight session cookie in
 * sessionStorage so repeat pageviews within the same tab accumulate
 * into a single row. Zero dependencies, zero cookies on the
 * customer's domain beyond the sessionStorage key we read. Failures
 * are swallowed so a downed ingest endpoint can never break the
 * host page.
 */
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  try {
    var scripts = document.getElementsByTagName("script");
    var selfScript = null;
    for (var i = scripts.length - 1; i >= 0; i--) {
      var s = scripts[i];
      if (s.src && s.src.indexOf("leadsens-pixel.js") !== -1) {
        selfScript = s;
        break;
      }
    }
    if (!selfScript) return;

    var writeKey = selfScript.getAttribute("data-write-key");
    if (!writeKey) return;

    var endpoint = selfScript.getAttribute("data-endpoint") ||
      (selfScript.src.split("/leadsens-pixel.js")[0] + "/api/public/pixel/track");

    // Session ID lives in sessionStorage for the tab's lifetime.
    // Reload = same session; close-and-reopen = new session.
    var sessionKey = "leadsens_pixel_session";
    var sessionId = null;
    try { sessionId = window.sessionStorage.getItem(sessionKey); } catch (e) {}
    if (!sessionId) {
      sessionId = "s_" + Math.random().toString(36).slice(2) + "_" + Date.now().toString(36);
      try { window.sessionStorage.setItem(sessionKey, sessionId); } catch (e) {}
    }

    var payload = {
      writeKey: writeKey,
      sessionId: sessionId,
      pageUrl: (window.location && window.location.href) || null,
      referrer: document.referrer || null,
      metadata: {
        title: document.title || null,
        screen: window.screen ? { w: window.screen.width, h: window.screen.height } : null,
        lang: (navigator && navigator.language) || null,
      },
    };

    // Prefer sendBeacon so closing the tab mid-flight still ships
    // the ping. Fall back to fetch + keepalive.
    var json = JSON.stringify(payload);
    if (navigator && typeof navigator.sendBeacon === "function") {
      try {
        var blob = new Blob([json], { type: "application/json" });
        if (navigator.sendBeacon(endpoint, blob)) return;
      } catch (e) {}
    }

    if (typeof fetch === "function") {
      fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", "x-leadsens-write-key": writeKey },
        body: json,
        keepalive: true,
        credentials: "omit",
        mode: "cors",
      }).catch(function () { /* swallow */ });
    }
  } catch (e) {
    // Never throw — the host page doesn't know we exist.
  }
})();
