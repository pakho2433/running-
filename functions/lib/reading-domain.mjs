import { createHash } from "node:crypto";

export const DEFAULT_SCHOOL_YEAR = "2026-2027";
export const SCHOOL_TIME_ZONE = "Asia/Hong_Kong";
export const DAILY_BOOK_LIMIT = 5;
export const MAX_TEACHER_PAGE_SIZE = 500;

export const READING_TYPES = Object.freeze([
  "",
  "小說",
  "漫畫",
  "新聞",
  "政府公告",
  "政府短片",
]);

export const SUBJECTS = Object.freeze([
  "",
  "中文",
  "英文",
  "數學",
  "科學",
  "人文",
  "百科",
]);

const SUBMISSION_KEYS = Object.freeze([
  "idempotencyKey",
  "readingDate",
  "title",
  "author",
  "readingType",
  "subject",
  "completed",
]);

const TEACHER_PAGE_KEYS = Object.freeze(["schoolYear", "pageSize", "pageToken"]);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,80}$/u;
const CLASS_ID = /^[A-Z0-9_-]{1,12}$/u;
const STUDENT_ID = /^[A-Z0-9_-]{1,20}$/u;

export class DomainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export function academicYearBounds(schoolYear = DEFAULT_SCHOOL_YEAR) {
  const match = /^(\d{4})-(\d{4})$/u.exec(String(schoolYear || ""));
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new DomainError("invalid-argument", "Invalid academic year configuration.");
  }
  return Object.freeze({
    schoolYear: `${match[1]}-${match[2]}`,
    firstDate: `${match[1]}-09-01`,
    lastDate: `${match[2]}-08-31`,
  });
}

export function hongKongDateKey(now = new Date()) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new DomainError("invalid-argument", "Invalid server time.");
  }
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SCHOOL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function parseReadingSubmission(input, options = {}) {
  const schoolYear = options.schoolYear || DEFAULT_SCHOOL_YEAR;
  const submissionDateKey = hongKongDateKey(options.now || new Date());
  const bounds = academicYearBounds(schoolYear);
  assertPlainObject(input, "Submission payload must be an object.");
  assertAllowedKeys(input, SUBMISSION_KEYS, "Submission payload contains unsupported fields.");

  if (submissionDateKey < bounds.firstDate || submissionDateKey > bounds.lastDate) {
    throw new DomainError("failed-precondition", "Reading submissions are closed for this academic year.");
  }

  const idempotencyKey = requiredString(input.idempotencyKey, "idempotencyKey", 80);
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
    throw new DomainError("invalid-argument", "idempotencyKey must contain 16 to 80 URL-safe characters.");
  }

  const title = requiredString(input.title, "title", 80);
  const author = requiredString(input.author, "author", 80);
  const readingType = enumString(input.readingType, "readingType", READING_TYPES);
  const subject = enumString(input.subject, "subject", SUBJECTS);
  const completed = enumString(input.completed, "completed", ["", "yes"]);
  const readingDate = optionalString(input.readingDate, "readingDate", 10) || submissionDateKey;

  if (!isRealDateKey(readingDate)) {
    throw new DomainError("invalid-argument", "readingDate must be a real date in YYYY-MM-DD format.");
  }
  if (readingDate < bounds.firstDate || readingDate > bounds.lastDate || readingDate > submissionDateKey) {
    throw new DomainError("invalid-argument", "readingDate must be within the active academic year and not in the future.");
  }

  const record = Object.freeze({ readingDate, title, author, readingType, subject, completed });
  return Object.freeze({
    idempotencyKey,
    submissionDateKey,
    schoolYear: bounds.schoolYear,
    distanceAwarded: scoreReading(record),
    payloadHash: payloadFingerprint(record),
    record,
  });
}

export function scoreReading(record) {
  return 10
    + (record.readingType ? 30 : 0)
    + (record.subject ? 30 : 0)
    + (record.completed === "yes" ? 50 : 0);
}

export function nextStudentProgress(previous, submission, dailyLimit = DAILY_BOOK_LIMIT) {
  const value = previous && typeof previous === "object" ? previous : {};
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1) {
    throw new DomainError("failed-precondition", "Daily reading limit is invalid.");
  }
  const currentDailyCount = value.dailyDateKey === submission.submissionDateKey
    ? nonNegativeSafeInteger(value.dailyBooksCount, "dailyBooksCount")
    : 0;
  if (currentDailyCount >= dailyLimit) {
    throw new DomainError("resource-exhausted", `Daily reading limit of ${dailyLimit} has been reached.`);
  }
  const booksCount = nonNegativeSafeInteger(value.booksCount, "booksCount");
  const distance = nonNegativeSafeInteger(value.distance, "distance");
  if (!Number.isSafeInteger(submission.distanceAwarded) || submission.distanceAwarded < 1) {
    throw new DomainError("failed-precondition", "Calculated reading score is invalid.");
  }
  const booksCountAfter = booksCount + 1;
  const distanceAfter = distance + submission.distanceAwarded;
  if (!Number.isSafeInteger(booksCountAfter) || !Number.isSafeInteger(distanceAfter)) {
    throw new DomainError("failed-precondition", "Stored reading totals are too large.");
  }
  return Object.freeze({
    dailySequence: currentDailyCount + 1,
    booksCountAfter,
    distanceAfter,
  });
}

export function parseStudentIdentity(profile, uid, schoolYear = DEFAULT_SCHOOL_YEAR) {
  assertPlainObject(profile, "Student profile is missing.");
  const safeUid = requiredString(uid, "uid", 128);
  if (safeUid.includes("/")) throw new DomainError("permission-denied", "Invalid authenticated identity.");

  const classId = requiredString(profile.classId, "classId", 12).toUpperCase();
  const studentId = requiredString(profile.studentId, "studentId", 20).toUpperCase();
  if (!CLASS_ID.test(classId) || !STUDENT_ID.test(studentId)) {
    throw new DomainError("failed-precondition", "Student profile contains an invalid class or student identifier.");
  }
  if (profile.schoolYear !== schoolYear) {
    throw new DomainError("failed-precondition", "Student is not enrolled in the active academic year.");
  }

  return Object.freeze({
    authUid: safeUid,
    classId,
    studentId,
    schoolYear,
    studentKey: studentDocumentKey(safeUid, schoolYear),
    displayAlias: displayAlias(profile.displayAlias, safeUid, schoolYear, [
      studentId,
      `${classId}${studentId}`,
      `${classId}-${studentId}`,
      `${classId}__${studentId}`,
    ]),
  });
}

export function studentDocumentKey(uid, schoolYear = DEFAULT_SCHOOL_YEAR) {
  const safeUid = String(uid || "").trim();
  if (!safeUid || safeUid.length > 128 || safeUid.includes("/")) {
    throw new DomainError("permission-denied", "Invalid authenticated identity.");
  }
  academicYearBounds(schoolYear);
  return `${schoolYear}__${safeUid}`;
}

export function displayAlias(candidate, uid, schoolYear = DEFAULT_SCHOOL_YEAR, forbiddenValues = []) {
  if (typeof candidate === "string") {
    const value = candidate.normalize("NFC").trim();
    const comparableValue = comparableIdentifier(value);
    const forbidden = forbiddenValues.map(comparableIdentifier).filter(Boolean);
    const exposesLoginIdentifier = forbidden.some((item) => (
      comparableValue === item || (item.length >= 4 && comparableValue.includes(item))
    ));
    if (
      codePointLength(value) >= 2
      && codePointLength(value) <= 32
      && !CONTROL_CHARACTERS.test(value)
      && !exposesLoginIdentifier
    ) {
      return value;
    }
  }
  const suffix = sha256(`${schoolYear}|${uid}|display-alias`).slice(0, 8).toUpperCase();
  return `Runner-${suffix}`;
}

export function readingLogId(uid, schoolYear, idempotencyKey) {
  studentDocumentKey(uid, schoolYear);
  if (!IDEMPOTENCY_KEY.test(String(idempotencyKey || ""))) {
    throw new DomainError("invalid-argument", "Invalid idempotency key.");
  }
  return `${schoolYear}__${sha256(`${schoolYear}|${uid}|${idempotencyKey}`).slice(0, 48)}`;
}

export function payloadFingerprint(record) {
  const canonical = [
    record.readingDate,
    record.title,
    record.author,
    record.readingType,
    record.subject,
    record.completed,
  ];
  return sha256(JSON.stringify(canonical));
}

export function parseTeacherPageRequest(input, activeSchoolYear = DEFAULT_SCHOOL_YEAR) {
  const value = input === undefined || input === null ? {} : input;
  assertPlainObject(value, "Teacher page request must be an object.");
  assertAllowedKeys(value, TEACHER_PAGE_KEYS, "Teacher page request contains unsupported fields.");

  const schoolYear = value.schoolYear === undefined
    ? activeSchoolYear
    : requiredString(value.schoolYear, "schoolYear", 9);
  if (schoolYear !== activeSchoolYear) {
    throw new DomainError("failed-precondition", "Only the active academic year is available from this endpoint.");
  }
  academicYearBounds(schoolYear);

  const pageSize = value.pageSize === undefined ? 100 : value.pageSize;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_TEACHER_PAGE_SIZE) {
    throw new DomainError("invalid-argument", `pageSize must be an integer from 1 to ${MAX_TEACHER_PAGE_SIZE}.`);
  }

  const cursor = value.pageToken === undefined || value.pageToken === ""
    ? null
    : decodePageToken(value.pageToken, schoolYear);
  return Object.freeze({ schoolYear, pageSize, cursor });
}

export function encodePageToken(cursor) {
  assertPlainObject(cursor, "Cursor must be an object.");
  const schoolYear = requiredString(cursor.schoolYear, "schoolYear", 9);
  academicYearBounds(schoolYear);
  if (!Number.isSafeInteger(cursor.createdAtMillis) || cursor.createdAtMillis < 0) {
    throw new DomainError("invalid-argument", "Cursor timestamp is invalid.");
  }
  const id = requiredString(cursor.id, "id", 512);
  return Buffer.from(JSON.stringify({ v: 1, y: schoolYear, t: cursor.createdAtMillis, i: id }), "utf8")
    .toString("base64url");
}

export function decodePageToken(token, expectedSchoolYear) {
  if (typeof token !== "string" || token.length < 8 || token.length > 1024 || !/^[A-Za-z0-9_-]+$/u.test(token)) {
    throw new DomainError("invalid-argument", "pageToken is invalid.");
  }
  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    if (
      !parsed
      || parsed.v !== 1
      || parsed.y !== expectedSchoolYear
      || !Number.isSafeInteger(parsed.t)
      || parsed.t < 0
      || typeof parsed.i !== "string"
      || !parsed.i
      || parsed.i.length > 512
    ) {
      throw new Error("invalid cursor fields");
    }
    return Object.freeze({ schoolYear: parsed.y, createdAtMillis: parsed.t, id: parsed.i });
  } catch {
    throw new DomainError("invalid-argument", "pageToken is invalid.");
  }
}

function assertPlainObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new DomainError("invalid-argument", message);
  }
}

function assertAllowedKeys(value, allowed, message) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new DomainError("invalid-argument", message);
  }
}

function requiredString(value, field, maxLength) {
  if (typeof value !== "string") throw new DomainError("invalid-argument", `${field} must be a string.`);
  const result = value.normalize("NFC").trim();
  const length = codePointLength(result);
  if (!result || length > maxLength || CONTROL_CHARACTERS.test(result)) {
    throw new DomainError("invalid-argument", `${field} is missing or too long.`);
  }
  return result;
}

function optionalString(value, field, maxLength) {
  if (value === undefined || value === null || value === "") return "";
  return requiredString(value, field, maxLength);
}

function enumString(value, field, allowed) {
  const result = optionalString(value, field, 32);
  if (!allowed.includes(result)) throw new DomainError("invalid-argument", `${field} has an unsupported value.`);
  return result;
}

function isRealDateKey(value) {
  if (!DATE_KEY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function codePointLength(value) {
  return Array.from(value).length;
}

function comparableIdentifier(value) {
  return String(value || "").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/gu, "");
}

function nonNegativeSafeInteger(value, field) {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DomainError("failed-precondition", `Stored ${field} is invalid.`);
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
