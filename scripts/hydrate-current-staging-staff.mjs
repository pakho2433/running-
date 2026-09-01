import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectId = process.argv[2] || process.env.FIREBASE_PROJECT_ID || "";
if (!projectId) throw new Error("Missing Firebase project id.");
const baseUrl = `https://${projectId}.web.app`;
const files = [
  "index.html",
  "teacher-dashboard.css",
  "app-stage.js",
  "secure-data-service.js",
  "secure-password-ui-app.js",
];

await mkdir(path.join(root, "dist"), { recursive: true });
for (const relativePath of files) {
  const url = `${baseUrl}/${relativePath}?hydrate=${Date.now()}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Cannot hydrate ${relativePath}: HTTP ${response.status}`);
  const source = await response.text();
  if (!source.trim()) throw new Error(`Cannot hydrate ${relativePath}: empty response.`);
  await writeFile(path.join(root, "dist", relativePath), source, "utf8");
  console.log(`✓ hydrated current staging asset: ${relativePath}`);
}

const [html, ui, data] = await Promise.all([
  import("node:fs/promises").then(({ readFile }) => readFile(path.join(root, "dist/index.html"), "utf8")),
  import("node:fs/promises").then(({ readFile }) => readFile(path.join(root, "dist/secure-password-ui-app.js"), "utf8")),
  import("node:fs/promises").then(({ readFile }) => readFile(path.join(root, "dist/secure-data-service.js"), "utf8")),
]);

if (!html.includes('id="loginRoleLibrarian"') || !html.includes("全校教師")) {
  throw new Error("Safety stop: current staging staff login UI was not found.");
}

const hasRoleAwareUi = [
  "librarian",
  "loginTeacher",
  "loginRole",
].every((marker) => ui.includes(marker));
if (!hasRoleAwareUi) {
  throw new Error("Safety stop: current staging role-aware UI was not found.");
}

const hasStaffAuthorisationClient = [
  "loginTeacher",
  "authoriseTeacher",
  "getIdTokenResult",
  "librarian",
  "teacher",
  "schoolYear",
].every((marker) => data.includes(marker));
if (!hasStaffAuthorisationClient) {
  throw new Error("Safety stop: current staging staff authorisation client was not found.");
}

console.log(`✅ Current deployed staff UI hydrated from ${baseUrl}.`);
