import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectId = process.argv[2] || "scysps-reading-stg-20260818-a";
const baseUrl = `https://${projectId}.web.app`;

function parseGeneratedModule(source, name) {
  const prefix = `export const ${name} = `;
  const start = source.indexOf(prefix);
  if (start < 0) throw new Error(`Cannot find ${name} in deployed config.`);
  const bodyStart = start + prefix.length;
  const end = source.indexOf(";", bodyStart);
  if (end < 0) throw new Error(`Cannot parse ${name} in deployed config.`);
  return JSON.parse(source.slice(bodyStart, end));
}

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  return response.text();
}

const [firebaseSource, securitySource] = await Promise.all([
  fetchText(`${baseUrl}/firebase-config-v3.js`),
  fetchText(`${baseUrl}/security-config.js`),
]);

const firebase = parseGeneratedModule(firebaseSource, "firebaseConfig");
const security = parseGeneratedModule(securitySource, "securityConfig");

if (firebase.projectId !== projectId) {
  throw new Error(`Safety stop: deployed projectId is ${firebase.projectId}, expected ${projectId}.`);
}
if (security.schoolSiteOrigin !== baseUrl) {
  throw new Error(`Safety stop: deployed origin is ${security.schoolSiteOrigin}, expected ${baseUrl}.`);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appConfigSource = await readFile(path.join(root, "app-config.js"), "utf8");
const schoolNameMatch = appConfigSource.match(/\bschoolName\s*:\s*"([^"]+)"/u);
if (!schoolNameMatch) throw new Error("Cannot read schoolName from app-config.js.");

const environment = {
  ...process.env,
  DEPLOYMENT_ENV: "staging",
  FIREBASE_API_KEY: firebase.apiKey,
  FIREBASE_AUTH_DOMAIN: firebase.authDomain,
  FIREBASE_PROJECT_ID: firebase.projectId,
  FIREBASE_STORAGE_BUCKET: firebase.storageBucket,
  FIREBASE_MESSAGING_SENDER_ID: firebase.messagingSenderId,
  FIREBASE_APP_ID: firebase.appId,
  FIREBASE_MEASUREMENT_ID: firebase.measurementId || "",
  FIREBASE_APP_CHECK_SITE_KEY: security.appCheckSiteKey,
  SCHOOL_CODE: security.schoolCode,
  SCHOOL_NAME: schoolNameMatch[1],
  SCHOOL_YEAR: security.schoolYear,
  SCHOOL_SITE_ORIGIN: security.schoolSiteOrigin,
};

const result = spawnSync("npm", ["run", "build"], {
  cwd: root,
  env: environment,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.status !== 0) process.exit(result.status ?? 1);

const hongKongPatch = spawnSync("node", ["scripts/apply-staging-hong-kong.mjs"], {
  cwd: root,
  env: environment,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (hongKongPatch.status !== 0) process.exit(hongKongPatch.status ?? 1);

const egyptAudioPatch = spawnSync("node", ["scripts/apply-staging-egypt-audio-fix.mjs"], {
  cwd: root,
  env: environment,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (egyptAudioPatch.status !== 0) process.exit(egyptAudioPatch.status ?? 1);

console.log(`✅ Rebuilt staging dist from ${baseUrl}`);
