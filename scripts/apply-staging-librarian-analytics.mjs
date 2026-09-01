import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = "20260902-librarian-analytics-2";

function replaceTextOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}.`);
  return source.replace(search, replacement);
}

async function patch(relativePath, transform) {
  const filePath = path.join(root, relativePath);
  const source = await readFile(filePath, "utf8");
  const next = transform(source);
  if (next !== source) await writeFile(filePath, next, "utf8");
  console.log(`✓ librarian analytics patch: ${relativePath}`);
}

await copyFile(path.join(root, "librarian-analytics.js"), path.join(root, "dist", "librarian-analytics.js"));
await copyFile(path.join(root, "librarian-analytics.css"), path.join(root, "dist", "librarian-analytics.css"));
console.log("✓ librarian analytics assets copied to dist");

await patch("dist/index.html", (source) => {
  if (!source.includes("librarian-analytics.css")) {
    source = replaceTextOnce(
      source,
      "</head>",
      `  <link rel="stylesheet" href="./librarian-analytics.css?v=${VERSION}" />\n</head>`,
      "analytics stylesheet",
    );
  }

  if (!source.includes('id="librarianAnalyticsSections"')) {
    const analyticsHtml = `
      <div id="librarianAnalyticsSections" class="librarian-analytics is-hidden" aria-label="圖書管理員閱讀分析圖表">
        <section class="teacher-panel analytics-panel" aria-labelledby="classPerformanceTitle">
          <div class="section-heading analytics-section-heading">
            <div><p class="eyebrow">CLASS PERFORMANCE</p><h2 id="classPerformanceTitle">17班閱讀表現比較</h2></div>
            <div class="analytics-toolbar">
              <label class="analytics-control"><span>比較指標</span><select id="classMetricSelect"><option value="weeklyDistance">本週閱讀里數</option><option value="averageDistance">人均里數</option><option value="books">閱讀本數</option><option value="activeRate">活躍學生比例</option><option value="inactive14">14日未提交人數</option></select></label>
            </div>
          </div>
          <p id="classPerformanceNote" class="analytics-note">由本週星期一至今日的閱讀里數。</p>
          <div id="classPerformanceChart" class="analytics-bar-chart" aria-live="polite"></div>
        </section>
        <section class="teacher-panel analytics-panel" aria-labelledby="schoolTrendTitle">
          <div class="section-heading analytics-section-heading">
            <div><p class="eyebrow">SCHOOL TREND</p><h2 id="schoolTrendTitle">全校閱讀里數走勢</h2></div>
            <div class="analytics-range-tabs" role="group" aria-label="全校閱讀里數走勢時段">
              <button type="button" data-school-trend-range="7" aria-pressed="false">7日</button>
              <button type="button" data-school-trend-range="30" class="is-active" aria-pressed="true">30日</button>
              <button type="button" data-school-trend-range="90" aria-pressed="false">90日</button>
              <button type="button" data-school-trend-range="year" aria-pressed="false">本學年</button>
            </div>
          </div>
          <p id="schoolTrendSummary" class="analytics-summary">—</p>
          <div id="schoolTrendChart" class="analytics-chart-host" aria-live="polite"></div>
        </section>
        <section class="teacher-panel analytics-panel" aria-labelledby="classTrendTitle">
          <div class="section-heading analytics-section-heading">
            <div><p class="eyebrow">CLASS TREND</p><h2 id="classTrendTitle">班級閱讀走勢</h2></div>
            <div class="analytics-class-controls">
              <label class="analytics-control"><span>選擇班別</span><select id="classTrendPrimary"></select></label>
              <div id="classTrendComparisons" class="analytics-compare-list"></div>
              <button id="classTrendAddComparison" class="analytics-add-compare" type="button">+ 加入比較</button>
            </div>
          </div>
          <p id="classTrendSummary" class="analytics-summary">—</p>
          <div id="classTrendChart" class="analytics-chart-host" aria-live="polite"></div>
        </section>
      </div>`;
    source = replaceTextOnce(
      source,
      '      <section id="teacherSummaryCards" class="teacher-metrics" aria-label="全校摘要"></section>',
      `      <section id="teacherSummaryCards" class="teacher-metrics" aria-label="全校摘要"></section>${analyticsHtml}`,
      "analytics dashboard sections",
    );
  }

  if (!source.includes("librarian-analytics.js")) {
    source = source.replace(
      /<script type="module" src="\.\/app-stage\.js\?v=[^\"]+"><\/script>/,
      `<script type="module" src="./librarian-analytics.js?v=${VERSION}"></script><script type="module" src="./app-stage.js?v=${VERSION}"></script>`,
    );
  } else {
    source = source.replace(/\.\/app-stage\.js\?v=[^\"']+/g, `./app-stage.js?v=${VERSION}`);
  }
  return source;
});

await patch("dist/app-stage.js", (source) => source.replace(
  /\.\/secure-password-ui-app\.js\?v=[^\"']+/g,
  `./secure-password-ui-app.js?v=${VERSION}`,
));

await patch("dist/secure-data-service.js", (source) => {
  if (!source.includes("dailyDistanceByDate: normaliseDailyNumberMap")) {
    source = replaceTextOnce(
      source,
      `    lastReadingDate: String(data.lastReadingDate || ""),\n    dailyBooksCount: Number(data.dailyBooksCount || 0),`,
      `    lastReadingDate: String(data.lastReadingDate || ""),\n    dailyDistanceByDate: normaliseDailyNumberMap(data.dailyDistanceByDate),\n    dailyBooksCount: Number(data.dailyBooksCount || 0),`,
      "daily distance analytics on staff records",
    );
    source = replaceTextOnce(
      source,
      `function normaliseBookLog(id, data) {`,
      `function normaliseDailyNumberMap(value) {\n  if (!value || typeof value !== "object" || Array.isArray(value)) return {};\n  const output = {};\n  Object.entries(value).forEach(([date, amount]) => {\n    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) return;\n    const number = Number(amount);\n    if (Number.isFinite(number) && number >= 0) output[date] = number;\n  });\n  return output;\n}\n\nfunction normaliseBookLog(id, data) {`,
      "daily analytics normaliser",
    );
  }
  return source;
});

await patch("dist/secure-password-ui-app.js", (source) => {
  source = source.replace(/\.\/secure-data-service\.js\?v=[^\"']+/g, `./secure-data-service.js?v=${VERSION}`);

  if (!source.includes('document.getElementById("librarianAnalyticsSections")?.classList.toggle')) {
    source = replaceTextOnce(
      source,
      `  const librarianMode = staff.role === "librarian";`,
      `  const librarianMode = staff.role === "librarian";\n  document.getElementById("librarianAnalyticsSections")?.classList.toggle("is-hidden", !librarianMode);`,
      "librarian analytics visibility",
    );
  }

  if (!source.includes("readingrun:librarian-data")) {
    source = replaceTextOnce(
      source,
      `  renderClassRows(classSummary(students));\n  renderStudentRows(students);\n}`,
      `  renderClassRows(classSummary(students));\n  renderStudentRows(students);\n  window.dispatchEvent(new CustomEvent("readingrun:librarian-data", {\n    detail: {\n      students,\n      classrooms: APP_CONFIG.classrooms || [],\n      schoolYear: APP_CONFIG.schoolYear || "",\n      today: schoolDateKey(),\n    },\n  }));\n}`,
      "librarian analytics data event",
    );
  }
  return source;
});

await patch("functions/index.js", (source) => {
  if (!source.includes("dailyDistanceByDate:")) {
    source = replaceTextOnce(
      source,
      `        lastReadingDate: submission.record.readingDate,\n        dailyDateKey: submission.submissionDateKey,`,
      `        lastReadingDate: submission.record.readingDate,\n        dailyDistanceByDate: {\n          [submission.record.readingDate]: FieldValue.increment(submission.distanceAwarded),\n        },\n        dailyDateKey: submission.submissionDateKey,`,
      "persist daily distance analytics",
    );
  }
  return source;
});

console.log("✅ Applied librarian analytics: KPI retained; 17-class bar comparison, school trend, and 1–3 class trend charts added without dashboard bookLogs scans.");
