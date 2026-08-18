import assert from "node:assert/strict";
import test from "node:test";
import {
  DomainError,
  academicYearBounds,
  decodePageToken,
  displayAlias,
  encodePageToken,
  hongKongDateKey,
  nextStudentProgress,
  parseReadingSubmission,
  parseStudentIdentity,
  parseTeacherPageRequest,
  readingLogId,
  scoreReading,
  studentDocumentKey,
} from "../lib/reading-domain.mjs";

const NOW = new Date("2026-10-12T04:00:00.000Z");
const VALID = Object.freeze({
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
  readingDate: "2026-10-11",
  title: "西遊記",
  author: "吳承恩",
  readingType: "小說",
  subject: "中文",
  completed: "yes",
});

test("academic year uses September through August", () => {
  assert.deepEqual(academicYearBounds("2026-2027"), {
    schoolYear: "2026-2027",
    firstDate: "2026-09-01",
    lastDate: "2027-08-31",
  });
  assert.throws(() => academicYearBounds("2026-2028"), DomainError);
});

test("Hong Kong date is calculated from server time at UTC rollover", () => {
  assert.equal(hongKongDateKey(new Date("2026-08-31T15:59:59Z")), "2026-08-31");
  assert.equal(hongKongDateKey(new Date("2026-08-31T16:00:00Z")), "2026-09-01");
});

test("submission normalises text and recomputes the maximum score", () => {
  const result = parseReadingSubmission({ ...VALID, title: "  西遊記  " }, { now: NOW });
  assert.equal(result.record.title, "西遊記");
  assert.equal(result.submissionDateKey, "2026-10-12");
  assert.equal(result.distanceAwarded, 120);
  assert.equal(scoreReading({ readingType: "", subject: "", completed: "" }), 10);
});

test("submission rejects unknown fields, invalid enums and future dates", () => {
  assert.throws(
    () => parseReadingSubmission({ ...VALID, distanceAwarded: 999 }, { now: NOW }),
    /unsupported fields/u,
  );
  assert.throws(
    () => parseReadingSubmission({ ...VALID, subject: "Computer Science" }, { now: NOW }),
    /unsupported value/u,
  );
  assert.throws(
    () => parseReadingSubmission({ ...VALID, readingDate: "2026-10-13" }, { now: NOW }),
    /not in the future/u,
  );
});

test("submission closes outside the configured academic year", () => {
  assert.throws(
    () => parseReadingSubmission(VALID, { now: new Date("2026-08-18T04:00:00Z") }),
    (error) => error instanceof DomainError && error.code === "failed-precondition",
  );
});

test("daily progress increments, resets on a new Hong Kong date, and stops at five", () => {
  const submission = parseReadingSubmission(VALID, { now: NOW });
  assert.deepEqual(nextStudentProgress({
    booksCount: 8,
    distance: 410,
    dailyDateKey: "2026-10-12",
    dailyBooksCount: 4,
  }, submission), {
    dailySequence: 5,
    booksCountAfter: 9,
    distanceAfter: 530,
  });
  assert.throws(() => nextStudentProgress({
    booksCount: 9,
    distance: 530,
    dailyDateKey: "2026-10-12",
    dailyBooksCount: 5,
  }, submission), (error) => error.code === "resource-exhausted");
  assert.equal(nextStudentProgress({
    booksCount: 9,
    distance: 530,
    dailyDateKey: "2026-10-11",
    dailyBooksCount: 5,
  }, submission).dailySequence, 1);
});

test("canonical document keys use academic year and auth UID, not login ID", () => {
  const identity = parseStudentIdentity({
    role: "student",
    classId: "c01",
    studentId: "s0042",
    schoolYear: "2026-2027",
  }, "firebase-uid-123");
  assert.equal(identity.studentKey, "2026-2027__firebase-uid-123");
  assert.equal(identity.classId, "C01");
  assert.equal(identity.studentId, "S0042");
  assert.ok(!identity.studentKey.includes(identity.studentId));
  assert.equal(studentDocumentKey("firebase-uid-123"), identity.studentKey);
});

test("student profiles must be explicitly enrolled in the active academic year", () => {
  assert.throws(() => parseStudentIdentity({
    role: "student",
    classId: "C01",
    studentId: "S0042",
  }, "firebase-uid-123"), (error) => error.code === "failed-precondition");
  assert.throws(() => parseStudentIdentity({
    role: "student",
    classId: "C01",
    studentId: "S0042",
    schoolYear: "2025-2026",
  }, "firebase-uid-123"), (error) => error.code === "failed-precondition");
});

test("public aliases are stable and never fall back to the student login ID", () => {
  const first = displayAlias(undefined, "firebase-uid-123");
  assert.match(first, /^Runner-[A-F0-9]{8}$/u);
  assert.equal(displayAlias(undefined, "firebase-uid-123"), first);
  assert.equal(displayAlias("Blue Panda", "firebase-uid-123"), "Blue Panda");
  assert.match(displayAlias("S0042", "firebase-uid-123", "2026-2027", ["S0042"]), /^Runner-/u);
  assert.match(displayAlias("Runner S0042", "firebase-uid-123", "2026-2027", ["S0042"]), /^Runner-/u);
  assert.match(displayAlias("Safe\u202eAlias", "firebase-uid-123"), /^Runner-/u);
});

test("idempotent log IDs are stable per student and request", () => {
  const first = readingLogId("uid-a", "2026-2027", VALID.idempotencyKey);
  assert.equal(readingLogId("uid-a", "2026-2027", VALID.idempotencyKey), first);
  assert.notEqual(readingLogId("uid-b", "2026-2027", VALID.idempotencyKey), first);
});

test("teacher page request caps pages at 500 and round-trips opaque cursor", () => {
  const token = encodePageToken({
    schoolYear: "2026-2027",
    createdAtMillis: 1791777600000,
    id: "log-123",
  });
  assert.deepEqual(decodePageToken(token, "2026-2027"), {
    schoolYear: "2026-2027",
    createdAtMillis: 1791777600000,
    id: "log-123",
  });
  assert.equal(parseTeacherPageRequest({ pageSize: 500, pageToken: token }).pageSize, 500);
  assert.throws(() => parseTeacherPageRequest({ pageSize: 501 }), /pageSize/u);
  assert.throws(() => decodePageToken(token, "2027-2028"), /pageToken/u);
});
