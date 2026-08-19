import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourcePath = fileURLToPath(new URL("../index.js", import.meta.url));
const historySourcePath = fileURLToPath(new URL("../../reading-history-secure.js", import.meta.url));
const uiSourcePath = fileURLToPath(new URL("../../secure-password-ui-app.js", import.meta.url));
const dataSourcePath = fileURLToPath(new URL("../../secure-data-service.js", import.meta.url));
const source = await readFile(sourcePath, "utf8");
const historySource = await readFile(historySourcePath, "utf8");
const uiSource = await readFile(uiSourcePath, "utf8");
const dataSource = await readFile(dataSourcePath, "utf8");

test("staging callables use the Hong Kong region with App Check temporarily disabled", () => {
  assert.match(source, /region: "asia-east2"/u);
  assert.match(source, /enforceAppCheck: false/u);
  assert.match(source, /STAGING ONLY: App Check is deliberately not enforced/u);
  assert.match(source, /export const submitReadingLog = onCall/u);
  assert.match(source, /export const getTeacherLogsPage = onCall/u);
});

test("explicit concurrency covers the 456-student submission peak", () => {
  const concurrency = Number(/concurrency: (\d+)/u.exec(source)?.[1]);
  const maxInstances = Number(/maxInstances: (\d+)/u.exec(source)?.[1]);
  assert.equal(/cpu: 1/u.test(source), true);
  assert.equal(concurrency * maxInstances >= 456, true);
});

test("reading-date limit reconciles counters with persisted logs before allowing another book", () => {
  assert.match(source, /where\("readingDate", "==", submission\.record\.readingDate\)/u);
  assert.match(source, /limit\(READING_DATE_BOOK_LIMIT\)/u);
  assert.match(source, /Math\.max\(storedReadingDateCount, existingReadingDateLogs\.size\)/u);
  assert.match(source, /nextReadingDateSequence\(readingDateCount\)/u);
});

test("staging has no actual submission-day quota", () => {
  assert.doesNotMatch(source, /SUBMISSION_DAY_BOOK_LIMIT/u);
  assert.match(source, /Number\.MAX_SAFE_INTEGER/u);
  assert.match(source, /submission-day quota: the enforced limit is five books per readingDate/u);
});

test("student UI reports the selected reading-date count, not a daily submission quota", () => {
  assert.match(uiSource, /閱讀日期 \$\{result\.readingDate \|\| record\.readingDate\}/u);
  assert.match(uiSource, /READING_DATE_LIMIT/u);
  assert.doesNotMatch(uiSource, /APP_CONFIG\.dailyBookLimit/u);
  assert.match(dataSource, /readingDateCount: Number\(result\.readingDateCount \|\| 0\)/u);
  assert.match(dataSource, /throw new Error\("READING_DATE_LIMIT"\)/u);
});

test("Reading Buddy displays the actual reading date before any submission-date fallback", () => {
  assert.match(
    historySource,
    /record\.readingDate \|\| record\.submissionDateKey \|\| "日期未有資料"/u,
  );
  assert.doesNotMatch(
    historySource,
    /record\.submissionDateKey \|\| record\.readingDate/u,
  );
});
