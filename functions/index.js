import { initializeApp } from "firebase-admin/app";
import { FieldPath, FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import {
  DEFAULT_SCHOOL_YEAR,
  DomainError,
  encodePageToken,
  nextStudentProgress,
  parseStudentIdentity,
  parseTeacherPageRequest,
  readingLogId,
} from "./lib/reading-domain.mjs";
import {
  READING_DATE_BOOK_LIMIT,
  nextReadingDateSequence,
} from "./lib/reading-limit-policy.mjs";
import { parseStagingReadingSubmission } from "./lib/staging-reading-domain.mjs";

initializeApp();

const db = getFirestore();
// Keep this source-controlled value in lockstep with firestore.rules. A hidden
// runtime override could otherwise write a cohort that the deployed rules deny.
const SCHOOL_YEAR = DEFAULT_SCHOOL_YEAR;
const FUNCTION_OPTIONS = Object.freeze({
  region: "asia-east2",
  // STAGING ONLY: App Check is deliberately not enforced on this branch while
  // browser App Check is being validated. The production branch keeps this true.
  enforceAppCheck: false,
  timeoutSeconds: 30,
  memory: "256MiB",
  cpu: 1,
  concurrency: 40,
  maxInstances: 20,
});

export const submitReadingLog = onCall(FUNCTION_OPTIONS, async (request) => {
  try {
    const uid = authenticatedUid(request);
    const submission = parseStagingReadingSubmission(request.data, {
      now: new Date(),
      schoolYear: SCHOOL_YEAR,
    });
    const userRef = db.doc(`users/${uid}`);
    const logId = readingLogId(uid, SCHOOL_YEAR, submission.idempotencyKey);
    const logRef = db.doc(`bookLogs/${logId}`);

    return await db.runTransaction(async (transaction) => {
      const profileSnapshot = await transaction.get(userRef);
      const profile = requireActiveStudentProfile(profileSnapshot);
      const identity = parseStudentIdentity(profile, uid, SCHOOL_YEAR);
      const studentRef = db.doc(`students/${identity.studentKey}`);
      const publicRef = db.doc(`publicStudents/${identity.studentKey}`);
      const existingLog = await transaction.get(logRef);

      if (existingLog.exists) {
        const previous = existingLog.data();
        if (
          previous.authUid !== uid
          || previous.schoolYear !== SCHOOL_YEAR
          || previous.payloadHash !== submission.payloadHash
        ) {
          throw new HttpsError("already-exists", "This submission key has already been used for different data.");
        }
        return submissionResponse(logId, previous, true);
      }

      const studentSnapshot = await transaction.get(studentRef);
      const previous = studentSnapshot.exists ? studentSnapshot.data() : {};
      validateExistingStudent(previous, identity);

      const readingDateCounterRef = db.doc(
        `readingDateCounters/${identity.studentKey}__${submission.record.readingDate}`,
      );
      const readingDateCounterSnapshot = await transaction.get(readingDateCounterRef);

      // Always reconcile the counter with the real persisted logs. This is
      // migration-safe for records created before readingDateCounters existed,
      // and prevents a stale/low counter from allowing a sixth book for a date.
      const existingReadingDateLogs = await transaction.get(
        db.collection("bookLogs")
          .where("studentKey", "==", identity.studentKey)
          .where("readingDate", "==", submission.record.readingDate)
          .limit(READING_DATE_BOOK_LIMIT),
      );
      const storedReadingDateCount = readingDateCounterSnapshot.exists
        ? counterDocumentCount(readingDateCounterSnapshot.data())
        : 0;
      const readingDateCount = Math.max(storedReadingDateCount, existingReadingDateLogs.size);
      const readingDateSequence = nextReadingDateSequence(readingDateCount);

      // The actual submission-day count is informational only. Staging has no
      // submission-day quota: the enforced limit is five books per readingDate.
      const {
        dailySequence: submissionDaySequence,
        booksCountAfter,
        distanceAfter,
      } = nextStudentProgress(
        previous,
        submission,
        Number.MAX_SAFE_INTEGER,
      );

      const timestamp = FieldValue.serverTimestamp();
      const log = {
        authUid: uid,
        schoolYear: SCHOOL_YEAR,
        classId: identity.classId,
        studentId: identity.studentId,
        studentKey: identity.studentKey,
        readingDate: submission.record.readingDate,
        title: submission.record.title,
        author: submission.record.author,
        readingType: submission.record.readingType,
        subject: submission.record.subject,
        completed: submission.record.completed,
        distanceAwarded: submission.distanceAwarded,
        submissionDateKey: submission.submissionDateKey,
        dailySequence: submissionDaySequence,
        submissionDaySequence,
        readingDateSequence,
        booksCountAfter,
        distanceAfter,
        idempotencyKeyHash: logId.split("__").at(-1),
        payloadHash: submission.payloadHash,
        createdAt: timestamp,
      };
      const privateProgress = {
        authUid: uid,
        studentKey: identity.studentKey,
        schoolYear: SCHOOL_YEAR,
        classId: identity.classId,
        studentId: identity.studentId,
        displayAlias: identity.displayAlias,
        booksCount: booksCountAfter,
        distance: distanceAfter,
        lastBook: submission.record.title,
        lastAuthor: submission.record.author,
        lastReadingDate: submission.record.readingDate,
        dailyDateKey: submission.submissionDateKey,
        dailyBooksCount: submissionDaySequence,
        updatedAt: timestamp,
      };
      if (!studentSnapshot.exists) privateProgress.createdAt = timestamp;

      transaction.create(logRef, log);
      transaction.set(readingDateCounterRef, {
        authUid: uid,
        studentKey: identity.studentKey,
        schoolYear: SCHOOL_YEAR,
        readingDate: submission.record.readingDate,
        count: readingDateSequence,
        updatedAt: timestamp,
      }, { merge: true });
      transaction.set(studentRef, privateProgress, { merge: true });
      transaction.set(publicRef, {
        schoolYear: SCHOOL_YEAR,
        classId: identity.classId,
        displayAlias: identity.displayAlias,
        booksCount: booksCountAfter,
        distance: distanceAfter,
        updatedAt: timestamp,
      });

      return submissionResponse(logId, log, false);
    });
  } catch (error) {
    throw callableError(error, "submitReadingLog");
  }
});

export const getTeacherLogsPage = onCall(FUNCTION_OPTIONS, async (request) => {
  try {
    const uid = authenticatedUid(request);
    await requireActiveTeacher(uid, request.auth?.token || {});
    const page = parseTeacherPageRequest(request.data, SCHOOL_YEAR);
    logger.info("Teacher reading-log page requested", {
      uid,
      schoolYear: page.schoolYear,
      pageSize: page.pageSize,
      hasCursor: Boolean(page.cursor),
    });

    let query = db.collection("bookLogs")
      .where("schoolYear", "==", page.schoolYear)
      .orderBy("createdAt", "desc")
      .orderBy(FieldPath.documentId(), "desc");
    if (page.cursor) {
      query = query.startAfter(Timestamp.fromMillis(page.cursor.createdAtMillis), page.cursor.id);
    }
    const snapshot = await query.limit(page.pageSize).get();
    const logs = snapshot.docs.map((document) => teacherLog(document.id, document.data()));
    const last = snapshot.docs.at(-1);
    const lastTimestamp = last?.get("createdAt");
    const nextPageToken = snapshot.size === page.pageSize && lastTimestamp?.toMillis
      ? encodePageToken({
        schoolYear: page.schoolYear,
        createdAtMillis: lastTimestamp.toMillis(),
        id: last.id,
      })
      : null;

    return {
      schoolYear: page.schoolYear,
      pageSize: page.pageSize,
      logs,
      nextPageToken,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw callableError(error, "getTeacherLogsPage");
  }
});

function authenticatedUid(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign-in is required.");
  return uid;
}

function requireActiveStudentProfile(snapshot) {
  if (!snapshot.exists) throw new HttpsError("permission-denied", "Student profile is missing.");
  const profile = snapshot.data();
  if (profile.role !== "student" || profile.active !== true) {
    throw new HttpsError("permission-denied", "Student account is not active.");
  }
  return profile;
}

async function requireActiveTeacher(uid, token) {
  if (
    token.teacher !== true
    || token.role !== "teacher"
    || token.schoolYear !== SCHOOL_YEAR
  ) {
    throw new HttpsError("permission-denied", "Teacher permission is required.");
  }
  const snapshot = await db.doc(`users/${uid}`).get();
  const profile = snapshot.data();
  if (
    !snapshot.exists
    || profile?.role !== "teacher"
    || profile?.active !== true
    || profile?.schoolYear !== SCHOOL_YEAR
  ) {
    throw new HttpsError("permission-denied", "Teacher account is not active.");
  }
}

function validateExistingStudent(previous, identity) {
  if (!Object.keys(previous).length) return;
  if (previous.authUid !== undefined && previous.authUid !== identity.authUid) {
    throw new HttpsError("failed-precondition", "Student progress belongs to a different account.");
  }
  if (previous.schoolYear !== undefined && previous.schoolYear !== identity.schoolYear) {
    throw new HttpsError("failed-precondition", "Student progress belongs to a different academic year.");
  }
}

function counterDocumentCount(data) {
  const count = data?.count;
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new DomainError("failed-precondition", "Stored reading-date count is invalid.");
  }
  return count;
}

function submissionResponse(logId, log, idempotent) {
  const submissionDayCount = Number(log.submissionDaySequence ?? log.dailySequence ?? 0);
  const readingDateCount = Number(log.readingDateSequence ?? 0);
  return {
    logId,
    idempotent,
    schoolYear: log.schoolYear,
    submissionDateKey: log.submissionDateKey,
    count: submissionDayCount,
    submissionDayCount,
    readingDateCount,
    readingDate: log.readingDate,
    distance: log.distanceAwarded,
    booksCount: log.booksCountAfter,
    totalDistance: log.distanceAfter,
  };
}

function teacherLog(id, data) {
  return {
    id,
    schoolYear: String(data.schoolYear || ""),
    classId: String(data.classId || ""),
    studentId: String(data.studentId || ""),
    studentKey: String(data.studentKey || ""),
    readingDate: String(data.readingDate || ""),
    title: String(data.title || ""),
    author: String(data.author || ""),
    readingType: String(data.readingType || ""),
    subject: String(data.subject || ""),
    completed: String(data.completed || ""),
    distanceAwarded: Number(data.distanceAwarded || 0),
    submissionDateKey: String(data.submissionDateKey || ""),
    dailySequence: Number(data.dailySequence || 0),
    submissionDaySequence: Number(data.submissionDaySequence || data.dailySequence || 0),
    readingDateSequence: Number(data.readingDateSequence || 0),
    createdAt: data.createdAt?.toDate?.().toISOString?.() || null,
  };
}

function callableError(error, operation) {
  if (error instanceof HttpsError) return error;
  if (error instanceof DomainError) return new HttpsError(error.code, error.message);
  logger.error(`${operation} failed`, { error });
  return new HttpsError("internal", "The request could not be completed.");
}
