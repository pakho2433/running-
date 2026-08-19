export const COPIED_SITE_FILES = [
  "index.html",
  "app-stage.js",
  "book-mascot.css",
  "colorful-theme.css",
  "country-history.css",
  "country-landmarks-3d.css",
  "country-landmarks-3d.js",
  "country-scenes.js",
  "country-scenes-secure.js",
  "device-layout.css",
  "device-layout.js",
  "map-controls.css",
  "map-controls.js",
  "mobile-map-fix.css",
  "reading-buddy-bootstrap.js",
  "reading-date-policy-ui.js",
  "reading-history.js",
  "reading-history-secure.js",
  "reset-all-v1.js",
  "secure-data-service.js",
  "secure-password-ui-app.js",
  "secure-track.js",
  "stage-fix.css",
  "student-name-ui.js",
  "styles.css",
  "teacher-dashboard.css",
  "three-reading-wrapper.js",
  "world-runway-audio.js",
  "world-runway-camera-fit.js",
  "world-runway-device-fit.css",
  "world-runway-hotspot-fix.js",
  "world-runway-interaction-bridge.js",
  "world-runway-layout-fix.js",
  "world-runway-panda-persistent.js",
  "world-runway-responsive-fit.css",
  "world-runway-stable-interaction.js"
];

export const GENERATED_SITE_FILES = [
  "app-config.js",
  "firebase-config.js",
  "firebase-config-v3.js",
  "security-config.js"
];

export const EXPECTED_DIST_FILES = [...COPIED_SITE_FILES, ...GENERATED_SITE_FILES].sort();