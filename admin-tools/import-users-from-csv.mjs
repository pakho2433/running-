import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const modulePath = fileURLToPath(import.meta.url);
const moduleDirectory = path.dirname(modulePath);
const DEFAULT_SCHOOL_YEAR = "2026-2027";
const DEFAULT_SCHOOL_CODE = "scysps";
const REMOTE_PREFLIGHT_CONCURRENCY = 12;
const PLACEHOLDER_PASSWORD = /^(?:change|changeme|dummy|example|generate|placeholder|replace|sample|test|your)(?:[^a-z0-9]|$)/iu;

export async function runImport({ argv = process.argv, environment = process.env } = {}) {
  const config = loadRuntimeConfig(argv, environment);
  if (!fs.existsSync(config.csvPath)) throw new Error(`CSV not found: ${config.csvPath}`);

  const rawRows = parseCsv(fs.readFileSync(config.csvPath, "utf8"));
  const rows = preflightCsvRows(rawRows, config);
  console.log(`CSV preflight passed for ${rows.length} row(s); no remote data has been changed.`);

  if (!getApps().length) {
    initializeApp({ credential: applicationDefault(), projectId: config.projectId });
  }
  const auth = getAuth();
  const db = getFirestore();
  const states = await preflightRemoteStates(rows, { auth, db });
  console.log(`Auth/Firestore read-only preflight passed for ${states.length} row(s); starting import.`);

  const summary = { created: 0, updated: 0, failed: 0, rolledBack: 0 };
  const reconciliation = [];
  for (const [index, state] of states.entries()) {
    const result = await applyImportState(state, { auth, db });
    if (result.ok) {
      summary[result.action] += 1;
      console.log(`[${index + 1}/${states.length}] ${result.action}: student ${state.row.email}`);
      continue;
    }

    summary.failed += 1;
    if (result.rolledBack) summary.rolledBack += 1;
    if (result.reconciliation) reconciliation.push(result.reconciliation);
    console.error(
      `[${index + 1}/${states.length}] failed at ${result.stage}: student ${state.row.email} (${result.errorCode})`,
    );
  }

  console.log(
    `Done for ${config.schoolYear} in ${config.projectId}. Created: ${summary.created}; updated: ${summary.updated}; failed: ${summary.failed}; new Auth rollbacks: ${summary.rolledBack}.`,
  );
  printReconciliation(reconciliation);
  if (summary.failed || reconciliation.length) process.exitCode = 1;
  return { summary, reconciliation };
}

export function preflightCsvRows(rawRows, { schoolYear, schoolCode }) {
  const errors = [];
  const prepared = [];
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throw preflightError("CSV preflight failed", ["CSV must contain at least one student row."]);
  }

  for (const [index, row] of rawRows.entries()) {
    const rowNumber = index + 2;
    try {
      const role = String(row.role || "student").trim().toLowerCase();
      const classId = normaliseClassId(row.classId);
      const studentId = normaliseStudentId(row.studentId);
      const active = strictBoolean(row.active, "active", true);
      const password = String(row.pin || row.password || "").trim();
      const emailYear = schoolYear.replace(/[^0-9]/g, "");
      const email = String(
        row.email || `${schoolCode}.${emailYear}.${classId}.${studentId}@students.readingrun.invalid`,
      ).trim().toLowerCase();

      if (role !== "student") throw new Error("role must be student");
      if (!/^[^@\s]+@[^@\s]+$/u.test(email)) throw new Error("email is invalid");
      if (password.length < 12) throw new Error("pin/password must contain at least 12 characters");
      if (isPlaceholderPassword(password)) {
        throw new Error("pin/password is a placeholder; replace it with a unique random value");
      }

      prepared.push(Object.freeze({
        rowNumber,
        role,
        classId,
        studentId,
        email,
        password,
        displayAlias: cleanAlias(row.displayAlias),
        active,
        schoolYear,
      }));
    } catch (error) {
      errors.push(`row ${rowNumber}: ${safeValidationMessage(error)}`);
    }
  }

  collectDuplicateErrors(prepared, (row) => row.password, "pin/password", errors);
  collectDuplicateErrors(prepared, (row) => row.email, "email", errors);
  collectDuplicateErrors(
    prepared,
    (row) => `${row.classId}\u0000${row.studentId}`,
    "classId + studentId",
    errors,
  );
  if (errors.length) throw preflightError("CSV preflight failed", errors);
  return prepared;
}

export function isPlaceholderPassword(value) {
  const password = String(value || "").trim();
  const token = password.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]+/gu, "_");
  return PLACEHOLDER_PASSWORD.test(password)
    || /^(?:change|replace)_?to_?unique/iu.test(token)
    || /^(?:replace|your|generate)_/iu.test(token)
    || /^_*(?:password|pin)_*(?:here|example|placeholder|required)?_*\d*_*$/iu.test(token);
}

export function validateExistingState(row, {
  uid,
  profile = null,
  student = null,
  publicStudent = null,
} = {}) {
  if (!uid) throw new Error("existing Auth account has no uid");
  const studentKey = `${row.schoolYear || ""}__${uid}`;
  const schoolYear = row.schoolYear;

  assertCompatible(profile, "role", "student", "users profile");
  assertCompatible(profile, "classId", row.classId, "users profile");
  assertCompatible(profile, "studentId", row.studentId, "users profile");
  assertCompatible(profile, "schoolYear", schoolYear, "users profile");
  assertCompatible(profile, "studentKey", studentKey, "users profile");
  assertCompatibleEmail(profile, row.email, "users profile");

  assertCompatible(student, "authUid", uid, "student progress");
  assertCompatible(student, "classId", row.classId, "student progress");
  assertCompatible(student, "studentId", row.studentId, "student progress");
  assertCompatible(student, "schoolYear", schoolYear, "student progress");
  assertCompatible(student, "studentKey", studentKey, "student progress");
  assertCompatibleEmail(student, row.email, "student progress");

  assertCompatible(publicStudent, "classId", row.classId, "public student");
  assertCompatible(publicStudent, "schoolYear", schoolYear, "public student");

  const privateCounters = student ? {
    booksCount: safeCounter(student.booksCount, "booksCount"),
    distance: safeCounter(student.distance, "distance"),
  } : null;
  const publicCounters = publicStudent ? {
    booksCount: safeCounter(publicStudent.booksCount, "public booksCount"),
    distance: safeCounter(publicStudent.distance, "public distance"),
  } : null;
  if (
    privateCounters
    && publicCounters
    && (
      privateCounters.booksCount !== publicCounters.booksCount
      || privateCounters.distance !== publicCounters.distance
    )
  ) {
    throw new Error("private and public progress counters do not match");
  }

  const dailyBooksCount = student ? safeCounter(student.dailyBooksCount, "dailyBooksCount") : 0;
  if (dailyBooksCount > 5) throw new Error("stored dailyBooksCount exceeds the daily limit");
  const counters = privateCounters || publicCounters || { booksCount: 0, distance: 0 };
  const displayAlias = selectDisplayAlias(
    [row.displayAlias, profile?.displayAlias, student?.displayAlias, publicStudent?.displayAlias],
    row.classId,
    row.studentId,
    uid,
  );

  return Object.freeze({
    uid,
    studentKey,
    displayAlias,
    booksCount: counters.booksCount,
    distance: counters.distance,
    dailyBooksCount,
    studentExists: Boolean(student),
  });
}

export function buildReconciliationEntry({
  row,
  uid,
  accountState,
  firestoreError,
  firestoreCleanupError,
  authCleanupError,
}) {
  return Object.freeze({
    rowNumber: Number(row?.rowNumber || 0),
    email: String(row?.email || ""),
    uid: String(uid || ""),
    accountState: String(accountState || "unknown"),
    firestoreErrorCode: safeErrorCode(firestoreError),
    ...(firestoreCleanupError ? { firestoreCleanupErrorCode: safeErrorCode(firestoreCleanupError) } : {}),
    ...(authCleanupError ? { authCleanupErrorCode: safeErrorCode(authCleanupError) } : {}),
    requiredAction: "Resolve the reported Firebase error, then rerun the same secured CSV.",
  });
}

async function preflightRemoteStates(rows, { auth, db }) {
  const settled = await settledMapWithConcurrency(
    rows,
    REMOTE_PREFLIGHT_CONCURRENCY,
    (row) => inspectRemoteState(row, { auth, db }),
  );
  const errors = settled
    .filter((item) => !item.ok)
    .map((item) => `row ${item.row.rowNumber} (${item.row.email}): ${safeRemoteMessage(item.error)}`);
  if (errors.length) throw preflightError("Auth/Firestore read-only preflight failed; no data was changed", errors);
  return settled.map((item) => item.value);
}

async function inspectRemoteState(row, { auth, db }) {
  let userRecord = null;
  try {
    userRecord = await auth.getUserByEmail(row.email);
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
  }

  if (!userRecord) {
    const [profiles, students] = await Promise.all([
      db.collection("users").where("email", "==", row.email).limit(2).get(),
      db.collection("students").where("email", "==", row.email).limit(2).get(),
    ]);
    if (!profiles.empty || !students.empty) {
      throw new Error("orphan Firestore data exists for this email but the Auth account is missing");
    }
    return Object.freeze({ kind: "new", row: withSchoolYear(row) });
  }

  if (String(userRecord.email || "").trim().toLowerCase() !== row.email) {
    throw new Error("Auth email does not match the import row");
  }
  if (userRecord.customClaims?.teacher === true || (
    userRecord.customClaims?.role !== undefined
    && userRecord.customClaims.role !== "student"
  )) {
    throw new Error("the existing Auth account has non-student custom claims");
  }

  const rowWithYear = withSchoolYear(row);
  const studentKey = `${rowWithYear.schoolYear}__${userRecord.uid}`;
  const [profileSnapshot, studentSnapshot, publicSnapshot] = await db.getAll(
    db.doc(`users/${userRecord.uid}`),
    db.doc(`students/${studentKey}`),
    db.doc(`publicStudents/${studentKey}`),
  );
  const persistence = validateExistingState(rowWithYear, {
    uid: userRecord.uid,
    profile: snapshotData(profileSnapshot),
    student: snapshotData(studentSnapshot),
    publicStudent: snapshotData(publicSnapshot),
  });
  return Object.freeze({
    kind: "existing",
    row: rowWithYear,
    userRecord,
    persistence,
  });
}

export async function applyImportState(state, { auth, db }) {
  let userRecord;
  let created = false;
  try {
    if (state.kind === "existing") {
      userRecord = await auth.updateUser(state.userRecord.uid, {
        password: state.row.password,
        disabled: !state.row.active,
      });
    } else {
      userRecord = await auth.createUser({
        email: state.row.email,
        password: state.row.password,
        emailVerified: true,
        disabled: !state.row.active,
      });
      created = true;
    }
  } catch (error) {
    return operationFailure("auth", error);
  }

  try {
    const persistence = state.kind === "existing"
      ? state.persistence
      : newStudentPersistence(state.row, userRecord.uid);
    await writeFirestoreState(db, state.row, userRecord, persistence);
    return { ok: true, action: created ? "created" : "updated" };
  } catch (error) {
    if (!created) {
      return operationFailure("firestore", error, {
        reconciliation: buildReconciliationEntry({
          row: state.row,
          uid: userRecord.uid,
          accountState: "existing-auth-updated-firestore-failed",
          firestoreError: error,
        }),
      });
    }

    let firestoreCleanupError = null;
    let authCleanupError = null;
    try {
      await rollbackNewFirestoreState(db, state.row, userRecord.uid);
    } catch (cleanupError) {
      firestoreCleanupError = cleanupError;
    }
    try {
      await auth.deleteUser(userRecord.uid);
    } catch (cleanupError) {
      authCleanupError = cleanupError;
    }
    if (!firestoreCleanupError && !authCleanupError) {
      return operationFailure("firestore", error, { rolledBack: true });
    }
    return operationFailure("rollback", authCleanupError || firestoreCleanupError || error, {
      reconciliation: buildReconciliationEntry({
        row: state.row,
        uid: userRecord.uid,
        accountState: "new-user-rollback-incomplete-after-firestore-failure",
        firestoreError: error,
        firestoreCleanupError,
        authCleanupError,
      }),
    });
  }
}

async function writeFirestoreState(db, row, userRecord, persistence) {
  const profileRef = db.doc(`users/${userRecord.uid}`);
  const studentRef = db.doc(`students/${persistence.studentKey}`);
  const publicRef = db.doc(`publicStudents/${persistence.studentKey}`);
  const batch = db.batch();
  batch.set(profileRef, {
    role: "student",
    classId: row.classId,
    studentId: row.studentId,
    email: row.email,
    active: row.active,
    schoolYear: row.schoolYear,
    studentKey: persistence.studentKey,
    displayAlias: persistence.displayAlias,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  batch.set(studentRef, {
    authUid: userRecord.uid,
    classId: row.classId,
    studentId: row.studentId,
    email: row.email,
    schoolYear: row.schoolYear,
    studentKey: persistence.studentKey,
    displayAlias: persistence.displayAlias,
    ...(!persistence.studentExists ? {
      booksCount: persistence.booksCount,
      distance: persistence.distance,
      lastBook: "",
      lastAuthor: "",
      dailyBooksCount: persistence.dailyBooksCount,
      dailyDateKey: "",
      createdAt: FieldValue.serverTimestamp(),
    } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  if (row.active) {
    batch.set(publicRef, {
      classId: row.classId,
      schoolYear: row.schoolYear,
      displayAlias: persistence.displayAlias,
      booksCount: persistence.booksCount,
      distance: persistence.distance,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } else {
    batch.delete(publicRef);
  }
  await batch.commit();
}

async function rollbackNewFirestoreState(db, row, uid) {
  const studentKey = `${row.schoolYear}__${uid}`;
  const batch = db.batch();
  batch.delete(db.doc(`users/${uid}`));
  batch.delete(db.doc(`students/${studentKey}`));
  batch.delete(db.doc(`publicStudents/${studentKey}`));
  await batch.commit();
}

function newStudentPersistence(row, uid) {
  return Object.freeze({
    uid,
    studentKey: `${row.schoolYear}__${uid}`,
    displayAlias: selectDisplayAlias([row.displayAlias], row.classId, row.studentId, uid),
    booksCount: 0,
    distance: 0,
    dailyBooksCount: 0,
    studentExists: false,
  });
}

function loadRuntimeConfig(argv, environment) {
  const csvPath = path.resolve(argv[2] || path.join(moduleDirectory, "users.csv"));
  const projectId = String(environment.FIREBASE_PROJECT_ID || "").trim();
  const confirmedProjectId = String(environment.READING_RUN_CONFIRM_PROJECT || "").trim();
  const schoolYear = String(environment.READING_RUN_SCHOOL_YEAR || DEFAULT_SCHOOL_YEAR).trim();
  const schoolCode = String(environment.READING_RUN_SCHOOL_CODE || DEFAULT_SCHOOL_CODE)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");

  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required; never rely on an implicit personal project");
  if (confirmedProjectId !== projectId) {
    throw new Error("READING_RUN_CONFIRM_PROJECT must exactly match FIREBASE_PROJECT_ID");
  }
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(projectId) || /book-running|pakho2433/iu.test(projectId)) {
    throw new Error("FIREBASE_PROJECT_ID must be a school-owned Google Cloud project");
  }
  assertConsecutiveSchoolYear(schoolYear);
  if (schoolYear !== DEFAULT_SCHOOL_YEAR) {
    throw new Error(`This release only supports READING_RUN_SCHOOL_YEAR=${DEFAULT_SCHOOL_YEAR}; update and test the client, Functions and Rules contract before rollover`);
  }
  if (!schoolCode) throw new Error("READING_RUN_SCHOOL_CODE is required");
  return Object.freeze({ csvPath, projectId, schoolYear, schoolCode });
}

export function parseCsv(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function splitCsvLine(line) {
  const result = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"' && quoted && line[index + 1] === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      result.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted value");
  result.push(value);
  return result.map((item) => item.trim());
}

function normaliseClassId(value) {
  const result = String(value || "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,12}$/u.test(result)) throw new Error("classId is invalid");
  return result;
}

function normaliseStudentId(value) {
  const result = String(value || "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,20}$/u.test(result)) throw new Error("studentId is invalid");
  return result;
}

function cleanAlias(value) {
  return String(value || "")
    .normalize("NFC")
    .replace(/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 32);
}

function selectDisplayAlias(candidates, classId, studentId, uid) {
  for (const candidate of candidates) {
    const alias = safePublicAlias(candidate, classId, studentId, "");
    if (alias) return alias;
  }
  return fallbackAlias(uid, classId, studentId);
}

function safePublicAlias(value, classId, studentId, fallback) {
  const alias = cleanAlias(value);
  const comparableAlias = alias.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const comparableClassId = String(classId || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const comparableStudentId = String(studentId || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const exposesLoginId = comparableAlias === comparableStudentId
    || comparableAlias === `${comparableClassId}${comparableStudentId}`
    || (comparableStudentId.length >= 4 && comparableAlias.includes(comparableStudentId));
  return alias.length < 2 || exposesLoginId ? fallback : alias;
}

function fallbackAlias(uid, classId, studentId) {
  const digest = createHash("sha256").update(String(uid || "missing-uid")).digest("hex").toUpperCase();
  for (let offset = 0; offset <= digest.length - 8; offset += 8) {
    const candidate = `跑手-${digest.slice(offset, offset + 8)}`;
    if (safePublicAlias(candidate, classId, studentId, "")) return candidate;
  }
  return "閱讀跑手";
}

function strictBoolean(value, field, defaultValue) {
  if (value === undefined || value === null || String(value).trim() === "") return defaultValue;
  const normalised = String(value).trim().toLowerCase();
  if (normalised === "true") return true;
  if (normalised === "false") return false;
  throw new Error(`${field} must be true or false`);
}

function safeCounter(value, field) {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`stored ${field} is invalid`);
  return value;
}

function assertConsecutiveSchoolYear(value) {
  const match = /^(20\d{2})-(20\d{2})$/u.exec(value);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new Error("READING_RUN_SCHOOL_YEAR must use consecutive years such as 2026-2027");
  }
}

function assertCompatible(document, field, expected, label) {
  if (!document || document[field] === undefined) return;
  if (document[field] !== expected) throw new Error(`${label} ${field} conflicts with the import row`);
}

function assertCompatibleEmail(document, expected, label) {
  if (!document || document.email === undefined) return;
  if (String(document.email).trim().toLowerCase() !== expected) {
    throw new Error(`${label} email conflicts with the import row`);
  }
}

function collectDuplicateErrors(rows, keyFor, label, errors) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    const group = groups.get(key) || [];
    group.push(row.rowNumber);
    groups.set(key, group);
  }
  for (const rowNumbers of groups.values()) {
    if (rowNumbers.length > 1) {
      errors.push(`${label} is duplicated in rows ${rowNumbers.join(", ")}`);
    }
  }
}

async function settledMapWithConcurrency(items, concurrency, operation) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { ok: true, row: items[index], value: await operation(items[index]) };
      } catch (error) {
        results[index] = { ok: false, row: items[index], error };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function withSchoolYear(row) {
  return Object.freeze({ ...row });
}

function snapshotData(snapshot) {
  return snapshot?.exists ? snapshot.data() : null;
}

function operationFailure(stage, error, extras = {}) {
  return { ok: false, stage, errorCode: safeErrorCode(error), ...extras };
}

function safeErrorCode(error) {
  const value = String(error?.code || error?.name || "unknown-error");
  return value.replace(/[^A-Za-z0-9/_-]/g, "-").slice(0, 80) || "unknown-error";
}

function safeValidationMessage(error) {
  return String(error?.message || "invalid row").replace(/\r/g, "").slice(0, 4_000);
}

function safeRemoteMessage(error) {
  if (error?.message && !error?.code) return safeValidationMessage(error);
  return `remote read failed (${safeErrorCode(error)})`;
}

function preflightError(title, details) {
  const error = new Error(`${title}:\n- ${details.join("\n- ")}`);
  error.code = "IMPORT_PREFLIGHT_FAILED";
  return error;
}

function printReconciliation(entries) {
  if (!entries.length) return;
  console.error("RECONCILIATION_REQUIRED_BEGIN (records below never contain passwords)");
  for (const entry of entries) console.error(JSON.stringify(entry));
  console.error("RECONCILIATION_REQUIRED_END");
}

if (path.resolve(process.argv[1] || "").toLowerCase() === path.resolve(modulePath).toLowerCase()) {
  runImport().catch((error) => {
    console.error(safeValidationMessage(error));
    process.exitCode = 1;
  });
}
