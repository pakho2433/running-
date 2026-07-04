(() => {
  const root = document.documentElement;
  let resizeTimer = null;

  function detectDevice() {
    const userAgent = navigator.userAgent || "";
    const platform = navigator.platform || "";
    const touchPoints = navigator.maxTouchPoints || 0;
    const viewportWidth = Math.max(1, window.innerWidth || root.clientWidth || 1);
    const viewportHeight = Math.max(1, window.innerHeight || root.clientHeight || 1);
    const shortSide = Math.min(viewportWidth, viewportHeight);
    const longSide = Math.max(viewportWidth, viewportHeight);

    const isIPad = /iPad/i.test(userAgent)
      || (platform === "MacIntel" && touchPoints > 1)
      || (/Macintosh/i.test(userAgent) && touchPoints > 1);
    const isIPhone = /iPhone|iPod/i.test(userAgent);
    const isAndroid = /Android/i.test(userAgent);
    const isAndroidPhone = isAndroid && /Mobile/i.test(userAgent);
    const isAndroidTablet = isAndroid && !/Mobile/i.test(userAgent);
    const tabletBySize = touchPoints > 0 && shortSide >= 600 && longSide <= 1500;
    const phoneBySize = touchPoints > 0 && shortSide < 600;

    let device = "desktop";
    if (isIPhone || isAndroidPhone || phoneBySize) device = "phone";
    else if (isIPad || isAndroidTablet || tabletBySize) device = "tablet";

    const orientation = viewportWidth > viewportHeight ? "landscape" : "portrait";
    const inputMode = touchPoints > 0 ? "touch" : "pointer";

    root.dataset.device = device;
    root.dataset.orientation = orientation;
    root.dataset.input = inputMode;
    root.classList.toggle("device-phone", device === "phone");
    root.classList.toggle("device-tablet", device === "tablet");
    root.classList.toggle("device-desktop", device === "desktop");
    root.classList.toggle("touch-device", inputMode === "touch");
    root.classList.toggle("pointer-device", inputMode === "pointer");

    root.style.setProperty("--app-height", `${viewportHeight}px`);
    root.style.setProperty("--safe-top", "env(safe-area-inset-top, 0px)");
    root.style.setProperty("--safe-right", "env(safe-area-inset-right, 0px)");
    root.style.setProperty("--safe-bottom", "env(safe-area-inset-bottom, 0px)");
    root.style.setProperty("--safe-left", "env(safe-area-inset-left, 0px)");

    window.dispatchEvent(new CustomEvent("readingrun:devicechange", {
      detail: { device, orientation, inputMode, viewportWidth, viewportHeight },
    }));
  }

  function scheduleDetection() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(detectDevice, 90);
  }

  function loadRecommendationFeatures() {
    addStylesheet("./daily-recommendation.css?v=20260704-recommendation-1", "daily-recommendation");
    addStylesheet("./teacher-recommendations.css?v=20260704-recommendation-1", "teacher-recommendations");

    import("./daily-recommendation.js?v=20260704-recommendation-1").catch((error) => {
      console.error("Unable to load daily recommendation", error);
    });

    import("./teacher-recommendations.js?v=20260704-recommendation-1").catch((error) => {
      console.error("Unable to load teacher recommendation scheduler", error);
    });
  }

  function addStylesheet(href, key) {
    if (document.querySelector(`link[data-feature-style="${key}"]`)) return;
    const stylesheet = document.createElement("link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = href;
    stylesheet.dataset.featureStyle = key;
    document.head.append(stylesheet);
  }

  detectDevice();
  loadRecommendationFeatures();
  window.addEventListener("resize", scheduleDetection, { passive: true });
  window.addEventListener("orientationchange", () => setTimeout(detectDevice, 180), { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleDetection, { passive: true });
})();
