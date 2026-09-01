import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function text(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`Staff-role verification failed: ${label}`);
}

const [html, ui, data, functionsSource, rules] = await Promise.all([
  text("dist/index.html"),
  text("dist/secure-password-ui-app.js"),
  text("dist/secure-data-service.js"),
  text("functions/index.js"),
  text("firestore.rules"),
]);

requireText(html, 'id="loginRoleStudent"', "student login missing");
requireText(html, 'id="loginRoleTeacher"', "teacher login missing");
requireText(html, 'id="loginRoleLibrarian"', "librarian login missing");
requireText(html, "全校教師", "teacher entry label missing");
requireText(html, "圖書管理員", "librarian entry label missing");

requireText(ui, 'state.loginRole === "teacher" || state.loginRole === "librarian"', "staff login routing missing");
requireText(ui, 'loginTeacher(email, password, state.loginRole)', "selected staff role is not enforced");
requireText(ui, 'state.teacher.role !== "librarian"', "client export guard missing");
requireText(ui, 'return days !== null && days <= 7;', "7-day monitoring metric is unsafe");
requireText(ui, "lastReadingDate", "student continuity monitoring missing");

requireText(data, 'expectedRole = "teacher"', "role-aware staff authentication missing");
requireText(data, 'staff.role !== "librarian"', "librarian-only client export guard missing");
requireText(data, 'lastReadingDate: String(data.lastReadingDate || "")', "last reading date not loaded");

requireText(functionsSource, "requireActiveLibrarian", "server librarian guard missing");
if (functionsSource.includes("await requireActiveTeacher(uid, request.auth?.token || {});")) {
  throw new Error("Staff-role verification failed: teacher can still call full reading-log export.");
}

requireText(rules, "function isLibrarian()", "Firestore librarian role missing");
requireText(rules, "function isStaff()", "Firestore staff role missing");
const staffReads = (rules.match(/isStaff\(\) && resource\.data\.schoolYear/g) || []).length;
const librarianReads = (rules.match(/isLibrarian\(\) && resource\.data\.schoolYear/g) || []).length;
if (staffReads !== 2) throw new Error(`Expected 2 staff summary read policies, found ${staffReads}.`);
if (librarianReads !== 1) throw new Error(`Expected 1 librarian bookLogs read policy, found ${librarianReads}.`);

for (const relativePath of [
  "dist/secure-password-ui-app.js",
  "dist/secure-data-service.js",
  "functions/index.js",
]) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, relativePath)], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`JavaScript syntax check failed: ${relativePath}`);
}

console.log("✅ Staff-role verification passed: students unchanged; teachers are school-wide read-only monitors; librarians alone have detailed export access.");
