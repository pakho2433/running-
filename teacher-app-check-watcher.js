import { getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js?teacher-app-check=1";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js?teacher-app-check=1";
import { securityConfig } from "./security-config.js";

const APP_NAME = "reading-run-teacher-secure";
const siteKey = String(securityConfig.appCheckSiteKey || "");
let attempts = 0;

if (siteKey && !siteKey.startsWith("PASTE_")) startWhenReady();

function startWhenReady() {
  const app = getApps().find((item) => item.name === APP_NAME);
  if (!app) {
    attempts += 1;
    if (attempts < 100) setTimeout(startWhenReady, 100);
    return;
  }
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.warn("Teacher App Check was not started", error);
  }
}
