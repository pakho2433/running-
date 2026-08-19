import { DomainError } from "./reading-domain.mjs";

export const READING_BACKFILL_DAYS = 14;
export const READING_DATE_BOOK_LIMIT = 5;
export const SUBMISSION_DAY_BOOK_LIMIT = 10;

export function earliestAllowedReadingDate(submissionDateKey, floorDateKey) {
  const rollingStart = shiftDateKey(submissionDateKey, -(READING_BACKFILL_DAYS - 1));
  return rollingStart < floorDateKey ? floorDateKey : rollingStart;
}

export function nextReadingDateSequence(currentCount) {
  if (!Number.isSafeInteger(currentCount) || currentCount < 0) {
    throw new DomainError("failed-precondition", "Stored reading-date count is invalid.");
  }
  if (currentCount >= READING_DATE_BOOK_LIMIT) {
    throw new DomainError("resource-exhausted", "READING_DATE_LIMIT");
  }
  return currentCount + 1;
}

export function shiftDateKey(dateKey, dayOffset) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(dateKey || "")) || !Number.isInteger(dayOffset)) {
    throw new DomainError("invalid-argument", "Invalid date window configuration.");
  }
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new DomainError("invalid-argument", "Invalid date window configuration.");
  }
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}
