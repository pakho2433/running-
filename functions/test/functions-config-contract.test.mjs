import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

const sourcePath = fileURLToPath(new URL("../index.js", import.meta.url));
const source = await readFile(sourcePath, "utf8");

test("callables enforce App Check in the Hong Kong region", () => {
  assert.match(source, /region: "asia-east2"/u);
  assert.match(source, /enforceAppCheck: true/u);
  assert.match(source, /export const submitReadingLog = onCall/u);
  assert.match(source, /export const getTeacherLogsPage = onCall/u);
});

test("explicit concurrency covers the 456-student submission peak", () => {
  const concurrency = Number(/concurrency: (\d+)/u.exec(source)?.[1]);
  const maxInstances = Number(/maxInstances: (\d+)/u.exec(source)?.[1]);
  assert.equal(/cpu: 1/u.test(source), true);
  assert.equal(concurrency * maxInstances >= 456, true);
});
