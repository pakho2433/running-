import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourcePath = fileURLToPath(new URL("../index.js", import.meta.url));
const source = await readFile(sourcePath, "utf8");

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
