import assert from "node:assert/strict";
import test from "node:test";
import {
  nextStudentProgress,
} from "../lib/reading-domain.mjs";
import {
  READING_BACKFILL_DAYS,
  READING_DATE_BOOK_LIMIT,
  SUBMISSION_DAY_BOOK_LIMIT,
  earliestAllowedReadingDate,
  nextReadingDateSequence,
} from "../lib/reading-limit-policy.mjs";
import { parseStagingReadingSubmission } from "../lib/staging-reading-domain.mjs";

const BASE_RECORD = Object.freeze({
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  readingDate: "2026-08-19",
  title: "測試書",
  author: "測試作者",
  readingType: "小說",
  subject: "中文",
  completed: "yes",
});

test("backfill window includes today and the previous 13 calendar days", () => {
  assert.equal(READING_BACKFILL_DAYS, 14);
  assert.equal(earliestAllowedReadingDate("2026-08-19", "2026-08-01"), "2026-08-06");
  assert.equal(earliestAllowedReadingDate("2026-09-05", "2026-09-01"), "2026-09-01");
});

test("staging accepts the oldest allowed backfill date and rejects older or future dates", () => {
  const now = new Date("2026-08-19T04:00:00.000Z");
  const accepted = parseStagingReadingSubmission({
    ...BASE_RECORD,
    readingDate: "2026-08-06",
  }, { now });
  assert.equal(accepted.record.readingDate, "2026-08-06");

  assert.throws(() => parseStagingReadingSubmission({
    ...BASE_RECORD,
    readingDate: "2026-08-05",
  }, { now }), /most recent 14 days/u);

  assert.throws(() => parseStagingReadingSubmission({
    ...BASE_RECORD,
    readingDate: "2026-08-20",
  }, { now }), /not in the future/u);
});

test("each reading date stops at five books", () => {
  assert.equal(READING_DATE_BOOK_LIMIT, 5);
  assert.equal(nextReadingDateSequence(4), 5);
  assert.throws(
    () => nextReadingDateSequence(5),
    (error) => error.code === "resource-exhausted" && error.message === "READING_DATE_LIMIT",
  );
});

test("actual submission day stops at ten books", () => {
  assert.equal(SUBMISSION_DAY_BOOK_LIMIT, 10);
  const submission = {
    submissionDateKey: "2026-08-19",
    distanceAwarded: 120,
  };
  assert.equal(nextStudentProgress({
    booksCount: 20,
    distance: 2400,
    dailyDateKey: "2026-08-19",
    dailyBooksCount: 9,
  }, submission, SUBMISSION_DAY_BOOK_LIMIT).dailySequence, 10);

  assert.throws(() => nextStudentProgress({
    booksCount: 21,
    distance: 2520,
    dailyDateKey: "2026-08-19",
    dailyBooksCount: 10,
  }, submission, SUBMISSION_DAY_BOOK_LIMIT), (error) => error.code === "resource-exhausted");
});
