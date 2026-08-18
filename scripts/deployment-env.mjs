const FORBIDDEN_PRIVATE_IDENTIFIERS = ["book-running", "pakho2433"];
export const RELEASE_SCHOOL_YEAR = "2026-2027";
const PLACEHOLDER_PATTERN = /^(?:replace[-_]?me|your[-_].+|placeholder.*|school[-_]firebase[-_](?:project[-_]?id|hosting[-_]site[-_]?id))$/i;
const PLACEHOLDER_VALUES = new Set([
  "firebase_api_key",
  "firebase_app_check_site_key",
  "firebase_app_id",
  "firebase_auth_domain",
  "firebase_hosting_site",
  "firebase_messaging_sender_id",
  "firebase_project_id",
  "firebase_storage_bucket",
  "school_code",
  "school_github_org",
  "school_name",
  "school_site_origin",
  "school_year"
]);

export function requiredEnv(name, environment = process.env) {
  const value = String(environment[name] ?? "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function assertNoPlaceholder(name, value) {
  if (value.includes("<") || value.includes(">") || /^__[A-Z0-9_]+__$/.test(value) || PLACEHOLDER_PATTERN.test(value) || PLACEHOLDER_VALUES.has(value.toLowerCase())) {
    throw new Error(`${name} still contains a placeholder.`);
  }
}

function assertNotPrivate(name, value) {
  const normalised = value.toLowerCase();
  const forbidden = FORBIDDEN_PRIVATE_IDENTIFIERS.find((item) => normalised.includes(item));
  if (forbidden) {
    throw new Error(`${name} refers to the retired private deployment (${forbidden}).`);
  }
}

function validateProjectId(value) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(value)) {
    throw new Error("FIREBASE_PROJECT_ID must be a valid Google Cloud project ID.");
  }
}

function validateHost(name, value) {
  if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(value) || !value.includes(".")) {
    throw new Error(`${name} must be a hostname, without a scheme or path.`);
  }
}

function validateSchoolYear(value) {
  const match = /^(\d{4})-(\d{4})$/.exec(value);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new Error("SCHOOL_YEAR must use consecutive years in YYYY-YYYY format.");
  }
  if (value !== RELEASE_SCHOOL_YEAR) {
    throw new Error(`This release only supports SCHOOL_YEAR=${RELEASE_SCHOOL_YEAR}; update and test the versioned Functions, Rules and client contract together before rollover.`);
  }
}

function validateOrigin(value, deploymentEnv) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("SCHOOL_SITE_ORIGIN must be a valid absolute URL.");
  }

  if (url.protocol !== "https:" || url.origin !== value || url.username || url.password) {
    throw new Error("SCHOOL_SITE_ORIGIN must be an HTTPS origin with no path, query, or credentials.");
  }

  assertNotPrivate("SCHOOL_SITE_ORIGIN", url.hostname);
  if (deploymentEnv === "production" && url.hostname !== "reading.twghscysps.edu.hk") {
    throw new Error("Production SCHOOL_SITE_ORIGIN must be https://reading.twghscysps.edu.hk.");
  }
}

export function loadBuildConfig(environment = process.env) {
  const deploymentEnv = requiredEnv("DEPLOYMENT_ENV", environment).toLowerCase();
  if (!new Set(["ci", "staging", "production"]).has(deploymentEnv)) {
    throw new Error("DEPLOYMENT_ENV must be ci, staging, or production.");
  }

  const config = {
    deploymentEnv,
    firebase: {
      apiKey: requiredEnv("FIREBASE_API_KEY", environment),
      authDomain: requiredEnv("FIREBASE_AUTH_DOMAIN", environment).toLowerCase(),
      projectId: requiredEnv("FIREBASE_PROJECT_ID", environment).toLowerCase(),
      storageBucket: requiredEnv("FIREBASE_STORAGE_BUCKET", environment).toLowerCase(),
      messagingSenderId: requiredEnv("FIREBASE_MESSAGING_SENDER_ID", environment),
      appId: requiredEnv("FIREBASE_APP_ID", environment),
      measurementId: String(environment.FIREBASE_MEASUREMENT_ID ?? "").trim(),
    },
    appCheckSiteKey: requiredEnv("FIREBASE_APP_CHECK_SITE_KEY", environment),
    schoolCode: requiredEnv("SCHOOL_CODE", environment).toLowerCase(),
    schoolName: requiredEnv("SCHOOL_NAME", environment),
    schoolYear: requiredEnv("SCHOOL_YEAR", environment),
    schoolSiteOrigin: requiredEnv("SCHOOL_SITE_ORIGIN", environment),
  };

  for (const [name, value] of [
    ["FIREBASE_API_KEY", config.firebase.apiKey],
    ["FIREBASE_AUTH_DOMAIN", config.firebase.authDomain],
    ["FIREBASE_PROJECT_ID", config.firebase.projectId],
    ["FIREBASE_STORAGE_BUCKET", config.firebase.storageBucket],
    ["FIREBASE_MESSAGING_SENDER_ID", config.firebase.messagingSenderId],
    ["FIREBASE_APP_ID", config.firebase.appId],
    ["FIREBASE_APP_CHECK_SITE_KEY", config.appCheckSiteKey],
    ["SCHOOL_CODE", config.schoolCode],
    ["SCHOOL_NAME", config.schoolName],
    ["SCHOOL_YEAR", config.schoolYear],
    ["SCHOOL_SITE_ORIGIN", config.schoolSiteOrigin],
  ]) {
    assertNoPlaceholder(name, value);
  }

  assertNotPrivate("FIREBASE_PROJECT_ID", config.firebase.projectId);
  assertNotPrivate("FIREBASE_AUTH_DOMAIN", config.firebase.authDomain);
  assertNotPrivate("FIREBASE_STORAGE_BUCKET", config.firebase.storageBucket);
  validateProjectId(config.firebase.projectId);
  validateHost("FIREBASE_AUTH_DOMAIN", config.firebase.authDomain);
  validateHost("FIREBASE_STORAGE_BUCKET", config.firebase.storageBucket);
  validateSchoolYear(config.schoolYear);
  validateOrigin(config.schoolSiteOrigin, deploymentEnv);

  if (config.firebase.apiKey.length < 20 || config.appCheckSiteKey.length < 20) {
    throw new Error("Firebase API and App Check keys must be complete client configuration values.");
  }
  if (!/^\d{6,20}$/.test(config.firebase.messagingSenderId)) {
    throw new Error("FIREBASE_MESSAGING_SENDER_ID must be numeric.");
  }
  if (!/^1:\d+:web:[a-f0-9]+$/i.test(config.firebase.appId)) {
    throw new Error("FIREBASE_APP_ID has an unexpected format.");
  }
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(config.schoolCode)) {
    throw new Error("SCHOOL_CODE must be a short lower-case identifier.");
  }
  if (config.schoolName.length < 2 || config.schoolName.length > 120) {
    throw new Error("SCHOOL_NAME must contain 2 to 120 characters.");
  }

  return config;
}

export function loadHostingTarget(environment = process.env) {
  const projectId = requiredEnv("FIREBASE_PROJECT_ID", environment).toLowerCase();
  const hostingSite = requiredEnv("FIREBASE_HOSTING_SITE", environment).toLowerCase();
  assertNoPlaceholder("FIREBASE_PROJECT_ID", projectId);
  assertNoPlaceholder("FIREBASE_HOSTING_SITE", hostingSite);
  assertNotPrivate("FIREBASE_PROJECT_ID", projectId);
  assertNotPrivate("FIREBASE_HOSTING_SITE", hostingSite);
  validateProjectId(projectId);
  if (!/^[a-z0-9][a-z0-9-]{4,28}[a-z0-9]$/.test(hostingSite)) {
    throw new Error("FIREBASE_HOSTING_SITE must be a valid Firebase Hosting site ID.");
  }
  return { projectId, hostingSite };
}
