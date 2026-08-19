import {
  DomainError,
  academicYearBounds,
  hongKongDateKey,
  parseReadingSubmission,
  payloadFingerprint,
} from "./reading-domain.mjs";
import {
  earliestAllowedReadingDate,
} from "./reading-limit-policy.mjs";

// STAGING ONLY: allow August 2026 end-to-end testing before the 2026-2027
// academic year opens. The production branch does not import this module.
const STAGING_PREOPEN_FIRST_DATE = "2026-08-01";

export function parseStagingReadingSubmission(input, options = {}) {
  const schoolYear = options.schoolYear || "2026-2027";
  const now = options.now || new Date();
  const submissionDateKey = hongKongDateKey(now);
  const bounds = academicYearBounds(schoolYear);

  // Preserve the original staging safety boundary: before the explicit August
  // pre-open window, staging remains closed exactly like production.
  if (submissionDateKey < STAGING_PREOPEN_FIRST_DATE) {
    return parseReadingSubmission(input, { ...options, now, schoolYear });
  }

  const floorDateKey = submissionDateKey >= bounds.firstDate
    ? bounds.firstDate
    : STAGING_PREOPEN_FIRST_DATE;
  const earliestDateKey = earliestAllowedReadingDate(submissionDateKey, floorDateKey);
  const readingDate = String(input?.readingDate || submissionDateKey).trim();

  if (!isRealDateKey(readingDate)) {
    throw new DomainError("invalid-argument", "readingDate must be a real date in YYYY-MM-DD format.");
  }
  if (readingDate < earliestDateKey || readingDate > submissionDateKey) {
    throw new DomainError(
      "invalid-argument",
      "readingDate must be within the most recent 14 days and not in the future.",
    );
  }

  // Once the real academic year starts, reuse every production validation and
  // score rule after the staging-only 14-day window has been checked.
  if (submissionDateKey >= bounds.firstDate) {
    return parseReadingSubmission(input, { ...options, now, schoolYear });
  }

  // Reuse the production parser for every other validation and score rule by
  // validating against the first real day of the academic year, then restore
  // the true staging dates in the returned immutable result.
  const validationNow = new Date(`${bounds.firstDate}T00:00:00+08:00`);
  const validated = parseReadingSubmission(
    { ...input, readingDate: bounds.firstDate },
    { ...options, now: validationNow, schoolYear },
  );
  const record = Object.freeze({ ...validated.record, readingDate });

  return Object.freeze({
    ...validated,
    submissionDateKey,
    payloadHash: payloadFingerprint(record),
    record,
  });
}

function isRealDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}
