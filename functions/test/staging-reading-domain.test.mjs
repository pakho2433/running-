import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../lib/reading-domain.mjs";
import { parseStagingReadingSubmission } from "../lib/staging-reading-domain.mjs";

const VALID = Object.freeze({
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  readingDate: "2026-08-19",
  title: "西遊記",
  author: "吳承恩",
  readingType: "小說",
  subject: "中文",
  completed: "yes",
});

test("staging accepts August pre-open submissions", () => {
  const result = parseStagingReadingSubmission(VALID, {
    now: new Date("2026-08-19T04:00:00.000Z"),
    schoolYear: "2026-2027",
  });
  assert.equal(result.submissionDateKey, "2026-08-19");
  assert.equal(result.record.readingDate, "2026-08-19");
  assert.equal(result.distanceAwarded, 120);
});

test("staging rejects future reading dates during pre-open", () => {
  assert.throws(
    () => parseStagingReadingSubmission({ ...VALID, readingDate: "2026-08-20" }, {
      now: new Date("2026-08-19T04:00:00.000Z"),
      schoolYear: "2026-2027",
    }),
    (error) => error instanceof DomainError && error.code === "invalid-argument",
  );
});

test("staging does not open before August", () => {
  assert.throws(
    () => parseStagingReadingSubmission({ ...VALID, readingDate: "2026-07-31" }, {
      now: new Date("2026-07-31T04:00:00.000Z"),
      schoolYear: "2026-2027",
    }),
    (error) => error instanceof DomainError && error.code === "failed-precondition",
  );
});

test("staging falls back to production rules from September", () => {
  const result = parseStagingReadingSubmission({
    ...VALID,
    readingDate: "2026-09-01",
  }, {
    now: new Date("2026-09-01T04:00:00.000Z"),
    schoolYear: "2026-2027",
  });
  assert.equal(result.submissionDateKey, "2026-09-01");
  assert.equal(result.record.readingDate, "2026-09-01");
});

test("staging still closes after the academic year", () => {
  assert.throws(
    () => parseStagingReadingSubmission({ ...VALID, readingDate: "2027-08-31" }, {
      now: new Date("2027-09-01T04:00:00.000Z"),
      schoolYear: "2026-2027",
    }),
    (error) => error instanceof DomainError && error.code === "failed-precondition",
  );
});
