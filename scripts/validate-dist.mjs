import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadBuildConfig } from "./deployment-env.mjs";
import { EXPECTED_DIST_FILES } from "./site-files.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const buildConfig = loadBuildConfig();

async function listFiles(directory, prefix = "") {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) result.push(...await listFiles(path.join(directory, entry.name), relativePath));
    else result.push(relativePath);
  }
  return result;
}

const actualFiles = (await listFiles(dist)).sort();
if (JSON.stringify(actualFiles) !== JSON.stringify(EXPECTED_DIST_FILES)) {
  const unexpected = actualFiles.filter((file) => !EXPECTED_DIST_FILES.includes(file));
  const missing = EXPECTED_DIST_FILES.filter((file) => !actualFiles.includes(file));
  throw new Error(`dist allowlist mismatch. Unexpected: ${unexpected.join(", ") || "none"}; missing: ${missing.join(", ") || "none"}.`);
}

let totalBytes = 0;
let deployedText = "";
const forbiddenPatterns = [
  [/pakho2433/i, "retired personal GitHub owner"],
  [/-----BEGIN (?:RSA |EC |)PRIVATE KEY-----/, "private key"],
  [/service-account\.json/i, "service-account filename"],
  [/__[A-Z0-9_]+__/, "unresolved deployment placeholder"]
];

for (const relativePath of actualFiles) {
  const absolutePath = path.join(dist, relativePath);
  totalBytes += (await stat(absolutePath)).size;
  if (!/\.(?:css|html|js)$/.test(relativePath)) continue;
  const contents = await readFile(absolutePath, "utf8");
  deployedText += `\n${contents}`;
  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(contents)) {
      throw new Error(`${relativePath} contains a forbidden ${label}.`);
    }
  }
}
if (totalBytes > 10 * 1024 * 1024) {
  throw new Error(`dist is unexpectedly large (${totalBytes} bytes).`);
}

const indexHtml = await readFile(path.join(dist, "index.html"), "utf8");
if (/signInAnonymously|daily-book-recommendation/iu.test(deployedText)) {
  throw new Error("Deployment references anonymous authentication or the retired recommendation client.");
}
const inlineScripts = [...indexHtml.matchAll(/<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)];
if (inlineScripts.length !== 1 || !/<script\s+type="importmap">/.test(inlineScripts[0][0])) {
  throw new Error("Only the reviewed import map may be an inline script.");
}
const importMapHash = `sha256-${createHash("sha256").update(inlineScripts[0][1]).digest("base64")}`;

const firebaseJson = JSON.parse(await readFile(path.join(root, "firebase.json"), "utf8"));
if (firebaseJson.hosting?.public !== "dist" || firebaseJson.hosting?.target !== "reading") {
  throw new Error("Firebase Hosting must deploy the allowlisted dist directory through the reading target.");
}
const globalHeaders = firebaseJson.hosting.headers?.find((entry) => entry.source === "**")?.headers ?? [];
const headerMap = new Map(globalHeaders.map(({ key, value }) => [key.toLowerCase(), value]));
for (const header of [
  "content-security-policy",
  "permissions-policy",
  "referrer-policy",
  "strict-transport-security",
  "x-content-type-options",
  "x-frame-options"
]) {
  if (!headerMap.has(header)) throw new Error(`Missing required Hosting header: ${header}`);
}
if (!headerMap.get("content-security-policy").includes(`'${importMapHash}'`)) {
  throw new Error(`CSP does not allow the reviewed import map hash ${importMapHash}.`);
}

const firebaseModule = await readFile(path.join(dist, "firebase-config-v3.js"), "utf8");
if (!firebaseModule.includes(`"projectId": "${buildConfig.firebase.projectId}"`)) {
  throw new Error("Generated Firebase config does not match the selected deployment project.");
}
if (/book-running/i.test(firebaseModule)) {
  throw new Error("Generated Firebase config references the retired private project.");
}
const appConfig = await readFile(path.join(dist, "app-config.js"), "utf8");
if (!appConfig.includes(JSON.stringify(buildConfig.schoolYear)) || !appConfig.includes(JSON.stringify(buildConfig.schoolSiteOrigin))) {
  throw new Error("Generated app config does not match the selected school year and site origin.");
}

console.log(`Validated ${actualFiles.length} files (${totalBytes} bytes) and Hosting security headers.`);
