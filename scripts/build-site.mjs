import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBuildConfig } from "./deployment-env.mjs";
import { COPIED_SITE_FILES } from "./site-files.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.resolve(root, "dist");
if (dist !== path.join(root, "dist")) {
  throw new Error("Refusing to clean an unexpected output directory.");
}

const config = loadBuildConfig();
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const relativePath of COPIED_SITE_FILES) {
  const source = path.resolve(root, relativePath);
  const destination = path.resolve(dist, relativePath);
  if (!source.startsWith(`${root}${path.sep}`) || !destination.startsWith(`${dist}${path.sep}`)) {
    throw new Error(`Unsafe allowlisted path: ${relativePath}`);
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { errorOnExist: false, force: true });
}

const indexPath = path.join(dist, "index.html");
let indexHtml = await readFile(indexPath, "utf8");
indexHtml = indexHtml.replace(
  /<script\s+type="module"\s+src="\.\/daily-book-recommendation\.js[^"]*"><\/script>/g,
  ""
);
if (/daily-book-recommendation\.js/.test(indexHtml)) {
  throw new Error("index.html still loads the retired anonymous recommendation client.");
}

// Always replace previous staging module URLs so each deploy gets fresh browser
// module URLs after quota, Reading Buddy, or staging identity UI changes.
const appStageTag = '<script type="module" src="./app-stage.js?v=20260820-staging-names-1"></script>';
const readingBuddyTag = '<script type="module" src="./reading-buddy-bootstrap.js?v=20260819-reading-date-fix-2"></script>';
const readingDatePolicyTag = '<script type="module" src="./reading-date-policy-ui.js?v=20260819-reading-date-only-2"></script>';
indexHtml = indexHtml.replace(
  /<script\s+type="module"\s+src="\.\/app-stage\.js[^"]*"><\/script>/g,
  ""
);
indexHtml = indexHtml.replace(
  /<script\s+type="module"\s+src="\.\/reading-buddy-bootstrap\.js[^"]*"><\/script>/g,
  ""
);
indexHtml = indexHtml.replace(
  /<script\s+type="module"\s+src="\.\/reading-date-policy-ui\.js[^"]*"><\/script>/g,
  ""
);
if (!indexHtml.includes("</body>")) {
  throw new Error("index.html is missing </body>; cannot attach staging modules.");
}
indexHtml = indexHtml.replace("</body>", `${appStageTag}${readingBuddyTag}${readingDatePolicyTag}</body>`);
if (!indexHtml.includes("app-stage.js")) {
  throw new Error("Staging app module was not attached to index.html.");
}
if (!indexHtml.includes("reading-buddy-bootstrap.js")) {
  throw new Error("Reading Buddy bootstrap was not attached to index.html.");
}
if (!indexHtml.includes("reading-date-policy-ui.js")) {
  throw new Error("Reading date policy UI was not attached to index.html.");
}
await writeFile(indexPath, indexHtml, "utf8");

// secure-password-ui-app dynamically imports the 3D track. Force a fresh module
// URL in each staging build so runner-name label changes cannot be hidden by an
// older browser cache entry.
const secureAppPath = path.join(dist, "secure-password-ui-app.js");
let secureAppSource = await readFile(secureAppPath, "utf8");
secureAppSource = secureAppSource.replace(
  /\.\/secure-track\.js\?v=[^"']+/u,
  "./secure-track.js?v=20260820-runner-names-1",
);
if (!secureAppSource.includes("secure-track.js?v=20260820-runner-names-1")) {
  throw new Error("Could not attach the runner-name 3D track module version.");
}
await writeFile(secureAppPath, secureAppSource, "utf8");

const appConfigSource = await readFile(path.join(root, "app-config.js"), "utf8");
if (!appConfigSource.includes("__SCHOOL_YEAR__") || !appConfigSource.includes("__SCHOOL_SITE_ORIGIN__")) {
  throw new Error("app-config.js must retain the school deployment placeholders.");
}
const schoolNamePattern = /(\bschoolName\s*:\s*)"(?:\\.|[^"\\])*"/;
if (!schoolNamePattern.test(appConfigSource)) {
  throw new Error("app-config.js must expose a string schoolName field.");
}

const appConfig = appConfigSource
  .replaceAll("__SCHOOL_YEAR__", config.schoolYear)
  .replaceAll("__SCHOOL_SITE_ORIGIN__", config.schoolSiteOrigin)
  .replace(schoolNamePattern, (_match, prefix) => `${prefix}${JSON.stringify(config.schoolName)}`);
await writeFile(path.join(dist, "app-config.js"), appConfig, "utf8");

const firebaseConfig = { ...config.firebase };
if (!firebaseConfig.measurementId) {
  delete firebaseConfig.measurementId;
}
const firebaseModule = [
  "// Generated at build time. Firebase web configuration is public; never put credentials here.",
  `export const firebaseConfig = ${JSON.stringify(firebaseConfig, null, 2)};`,
  ""
].join("\n");
await Promise.all([
  writeFile(path.join(dist, "firebase-config.js"), firebaseModule, "utf8"),
  writeFile(path.join(dist, "firebase-config-v3.js"), firebaseModule, "utf8")
]);

const securityModule = [
  "// Generated at build time. Do not add student or staff credentials.",
  `export const securityConfig = ${JSON.stringify({
    schoolCode: config.schoolCode,
    appCheckSiteKey: config.appCheckSiteKey,
    schoolYear: config.schoolYear,
    schoolSiteOrigin: config.schoolSiteOrigin
  }, null, 2)};`,
  ""
].join("\n");
await writeFile(path.join(dist, "security-config.js"), securityModule, "utf8");

console.log(`Built ${COPIED_SITE_FILES.length + 4} allowlisted files for ${config.deploymentEnv}.`);
