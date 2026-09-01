import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const text = (relativePath) => readFile(path.join(root, relativePath), "utf8");
const requireText = (source, needle, label) => {
  if (!source.includes(needle)) throw new Error(`Analytics verification failed: ${label}`);
};

const [html, ui, data, analytics, functionsSource] = await Promise.all([
  text("dist/index.html"),
  text("dist/secure-password-ui-app.js"),
  text("dist/secure-data-service.js"),
  text("dist/librarian-analytics.js"),
  text("functions/index.js"),
]);

requireText(html, 'id="loginRoleLibrarian"', "existing librarian login missing");
requireText(html, 'id="librarianAnalyticsSections"', "analytics sections missing");
requireText(html, "17班閱讀表現比較", "class comparison heading missing");
requireText(html, "全校閱讀里數走勢", "school trend heading missing");
requireText(html, "班級閱讀走勢", "class trend heading missing");
requireText(ui, 'state.loginRole === "teacher" || state.loginRole === "librarian"', "existing staff login routing missing");
requireText(ui, 'state.teacher?.role === "librarian"', "analytics event is not librarian-only");
requireText(data, 'staff.role !== "librarian"', "existing librarian export client guard missing");
requireText(data, "dailyDistanceByDate", "daily analytics map is not loaded");
requireText(analytics, "weeklyDistance", "weekly bar metric missing");
requireText(analytics, "averageDistance", "average metric missing");
requireText(analytics, "activeRate", "active-rate metric missing");
requireText(analytics, "inactive14", "14-day follow-up metric missing");
requireText(functionsSource, "dailyDistanceByDate", "submitReadingLog does not persist daily analytics");

for (const relativePath of [
  "dist/secure-password-ui-app.js",
  "dist/secure-data-service.js",
  "dist/librarian-analytics.js",
  "functions/index.js",
]) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, relativePath)], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`JavaScript syntax check failed: ${relativePath}`);
}

console.log("✅ Librarian analytics verification passed; existing staff login/export guards remain present in the hydrated client.");
