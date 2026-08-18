import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { browserSessionPersistence, getAuth, getIdTokenResult, setPersistence, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs, getFirestore, limit, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js";
import { APP_CONFIG } from "./app-config.js";
import { firebaseConfig } from "./firebase-config-v3.js";
import { securityConfig } from "./security-config.js";

const SESSION_KEY = "reading-run-session-v2";
const LEGACY_SESSION_KEY = "reading-run-session-v1";
const PENDING_SUBMISSION_KEY = "reading-run-pending-submission-v1";
const SCHOOL_YEAR = String(APP_CONFIG.schoolYear || "").trim();
const SCHOOL_CODE = String(securityConfig.schoolCode || "scysps").toLowerCase().replace(/[^a-z0-9-]/g, "") || "scysps";
const STUDENT_AUTH_DOMAIN = "students.readingrun.invalid";
const STUDENT_PASSWORD_MIN_LENGTH = Number(APP_CONFIG.studentPasswordMinLength || 12);
const TEACHER_PASSWORD_MIN_LENGTH = Number(APP_CONFIG.teacherPasswordMinLength || 14);
const TEACHER_LOG_PAGE_SIZE = Math.min(500, Math.max(1, Number(APP_CONFIG.teacherLogPageSize || 500)));
const MAX_STUDENTS_PER_CLASS = Math.min(500, Math.max(76, Number(APP_CONFIG.maxStudentsPerClass || 76)));
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, APP_CONFIG.functionsRegion || "asia-east2");
const submitReadingLogCallable = httpsCallable(functions, "submitReadingLog", { timeout: 60_000 });
const getTeacherLogsPageCallable = httpsCallable(functions, "getTeacherLogsPage", { timeout: 120_000 });
const anonymousAliases = new Map();
let stopPrivate = null;
let cachedTeacherAuthorisation = null;

export async function initialiseSecurity() {
  assertRuntimeConfiguration();
  const siteKey = String(securityConfig.appCheckSiteKey || "");
  if (siteKey && !siteKey.startsWith("PASTE_") && !siteKey.startsWith("__")) {
    try {
      initializeAppCheck(app, { provider: new ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true });
    } catch (error) {
      console.warn("App Check was not started", error);
    }
  }
  await setPersistence(auth, browserSessionPersistence);
  if (typeof auth.authStateReady === "function") await auth.authStateReady();
}

export async function loginStudent(classId, studentId, password) {
  const safeClassId = normaliseClassId(classId);
  const safeStudentId = normaliseStudentId(studentId);
  const safePassword = String(password || "").trim();
  if (!safeClassId || !safeStudentId || safePassword.length < STUDENT_PASSWORD_MIN_LENGTH) {
    throw new Error("MISSING_LOGIN_FIELDS");
  }
  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      buildStudentEmail(safeClassId, safeStudentId),
      safePassword,
    );
    return await authoriseStudent(credential.user.uid, {
      classId: safeClassId,
      studentId: safeStudentId,
    });
  } catch (error) {
    await signOut(auth).catch(() => {});
    console.warn("Student sign-in was rejected", error?.code || error?.message || error);
    throw new Error("LOGIN_FAILED");
  }
}

export async function loginTeacher(email, password) {
  const safeEmail = String(email || "").trim().toLowerCase();
  const safePassword = String(password || "").trim();
  if (!safeEmail || safePassword.length < TEACHER_PASSWORD_MIN_LENGTH) {
    throw new Error("MISSING_TEACHER_LOGIN_FIELDS");
  }
  try {
    const credential = await signInWithEmailAndPassword(auth, safeEmail, safePassword);
    return await authoriseTeacher(credential.user);
  } catch (error) {
    await signOut(auth).catch(() => {});
    console.warn("Teacher sign-in was rejected", error?.code || error?.message || error);
    throw new Error("TEACHER_LOGIN_FAILED");
  }
}

export async function restoreStudent() {
  const session = readSession();
  if (session?.role && session.role !== "student") return null;
  if (!auth.currentUser || session?.schoolYear !== SCHOOL_YEAR || !session?.studentKey) return null;
  return authoriseStudent(auth.currentUser.uid, { studentKey: session.studentKey });
}

export async function restoreTeacher() {
  const session = readSession();
  if (session?.role !== "teacher" || session?.schoolYear !== SCHOOL_YEAR) return null;
  if (!auth.currentUser || session?.studentKey) return null;
  return authoriseTeacher(auth.currentUser);
}

async function authoriseStudent(uid, expected = {}) {
  const snapshot = await getDoc(doc(db, "users", uid));
  const profile = snapshot.data() || {};
  const classId = normaliseClassId(profile.classId);
  const studentId = normaliseStudentId(profile.studentId);
  const studentKey = String(profile.studentKey || "");
  const valid = profile.role === "student"
    && profile.active === true
    && String(profile.schoolYear || "") === SCHOOL_YEAR
    && classId
    && studentId
    && studentKey === `${SCHOOL_YEAR}__${uid}`
    && (!expected.classId || classId === expected.classId)
    && (!expected.studentId || studentId === expected.studentId)
    && (!expected.studentKey || studentKey === expected.studentKey);
  if (!valid) {
    await signOut(auth).catch(() => {});
    throw new Error("LOGIN_FAILED");
  }
  const user = {
    uid,
    role: "student",
    schoolYear: SCHOOL_YEAR,
    classId,
    studentId,
    studentKey,
    key: studentKey,
    displayAlias: publicDisplayAlias(profile.displayAlias, uid),
    email: auth.currentUser?.email || "",
  };
  writeSession({
    role: "student",
    schoolYear: SCHOOL_YEAR,
    studentKey,
  });
  return user;
}

async function authoriseTeacher(user) {
  const token = await getIdTokenResult(user, true);
  const profileSnapshot = await getDoc(doc(db, "users", user.uid));
  const profile = profileSnapshot.data() || {};
  if (
    token.claims?.teacher !== true
    || token.claims?.role !== "teacher"
    || String(token.claims?.schoolYear || "") !== SCHOOL_YEAR
    || profile.role !== "teacher"
    || profile.active !== true
    || String(profile.schoolYear || "") !== SCHOOL_YEAR
  ) {
    cachedTeacherAuthorisation = null;
    await signOut(auth).catch(() => {});
    throw new Error("TEACHER_LOGIN_FAILED");
  }
  const teacher = {
    uid: user.uid,
    role: "teacher",
    schoolYear: SCHOOL_YEAR,
    email: user.email || profile.email || "",
    displayName: profile.displayName || profile.name || "教師",
  };
  cachedTeacherAuthorisation = {
    uid: user.uid,
    schoolYear: SCHOOL_YEAR,
    teacher,
  };
  writeSession({ role: "teacher", schoolYear: SCHOOL_YEAR });
  return teacher;
}

async function ensureTeacher() {
  if (!auth.currentUser) throw new Error("TEACHER_NOT_SIGNED_IN");
  if (
    cachedTeacherAuthorisation?.uid === auth.currentUser.uid
    && cachedTeacherAuthorisation.schoolYear === SCHOOL_YEAR
  ) {
    return cachedTeacherAuthorisation.teacher;
  }
  return authoriseTeacher(auth.currentUser);
}

export function subscribeStudent(user, onPrivate, onClass, onError) {
  stopPrivate?.();
  stopPrivate = onSnapshot(doc(db, "students", user.studentKey), (snapshot) => {
    onPrivate(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
  }, onError);

  // The class list is intentionally a one-time read. A class-wide real-time
  // listener would multiply every submission by the number of signed-in pupils.
  loadClassmates(user).then(onClass).catch(onError);
  return stopSubscriptions;
}

export async function loadClassmates(user) {
  const snapshot = await getDocs(query(
    collection(db, "publicStudents"),
    where("schoolYear", "==", SCHOOL_YEAR),
    where("classId", "==", user.classId),
    limit(MAX_STUDENTS_PER_CLASS),
  ));
  return snapshot.docs.map((item) => normalisePublicStudent(item.id, item.data()));
}

export function stopSubscriptions() {
  stopPrivate?.();
  stopPrivate = null;
}

export async function saveReading(user, record) {
  if (!user?.studentKey || user.schoolYear !== SCHOOL_YEAR) throw new Error("LOGIN_REQUIRED");
  const distance = scoreReading(record);
  if (!record.title || !record.author || distance <= 0) throw new Error("INVALID_RECORD");
  const pending = pendingSubmissionFor(user, record);
  try {
    const response = await submitReadingLogCallable({
      idempotencyKey: pending.idempotencyKey,
      readingDate: String(record.readingDate || schoolDateKey()),
      title: String(record.title || ""),
      author: String(record.author || ""),
      readingType: String(record.readingType || ""),
      subject: String(record.subject || ""),
      completed: String(record.completed || ""),
    });
    clearPendingSubmission();
    const result = response?.data || {};
    return {
      logId: String(result.logId || ""),
      idempotent: result.idempotent === true,
      schoolYear: String(result.schoolYear || SCHOOL_YEAR),
      submissionDateKey: String(result.submissionDateKey || ""),
      count: Number(result.count || 0),
      distance: Number(result.distance || 0),
      booksCount: Number(result.booksCount || 0),
      totalDistance: Number(result.totalDistance || 0),
    };
  } catch (error) {
    const code = callableErrorCode(error);
    if (code === "resource-exhausted" || error?.message === "DAILY_LIMIT") {
      clearPendingSubmission();
      throw new Error("DAILY_LIMIT");
    }
    if (["invalid-argument", "failed-precondition", "permission-denied", "unauthenticated"].includes(code)) {
      clearPendingSubmission();
    }
    throw error;
  }
}

export async function loadTeacherDashboardData() {
  const teacher = await ensureTeacher();
  const studentsSnapshot = await getDocs(query(
    collection(db, "students"),
    where("schoolYear", "==", SCHOOL_YEAR),
  ));
  const students = studentsSnapshot.docs
    .map((item) => normaliseStudentRecord(item.id, item.data()))
    .sort(compareStudentRecords);
  return {
    teacher,
    schoolYear: SCHOOL_YEAR,
    students,
    logs: [],
    logsLoaded: false,
    generatedAt: new Date().toISOString(),
  };
}

export async function loadTeacherLogsPage(options = {}) {
  await ensureTeacher();
  return requestTeacherLogsPage(options);
}

async function requestTeacherLogsPage(options = {}) {
  const requestedSize = Number(options.pageSize || TEACHER_LOG_PAGE_SIZE);
  const response = await getTeacherLogsPageCallable({
    schoolYear: SCHOOL_YEAR,
    pageSize: Math.min(TEACHER_LOG_PAGE_SIZE, Math.max(1, requestedSize)),
    pageToken: String(options.pageToken || ""),
  });
  const data = response?.data || {};
  const rows = Array.isArray(data.logs) ? data.logs : (Array.isArray(data.items) ? data.items : []);
  return {
    schoolYear: String(data.schoolYear || SCHOOL_YEAR),
    logs: rows.map((item, index) => normaliseBookLog(String(item.id || index), item)),
    nextPageToken: typeof data.nextPageToken === "string" && data.nextPageToken ? data.nextPageToken : null,
  };
}

export async function logoutStudent() {
  stopSubscriptions();
  cachedTeacherAuthorisation = null;
  clearSession();
  clearPendingSubmission();
  await signOut(auth).catch(() => {});
}

// Preview only. The callable function recomputes this value on the server.
export function scoreReading(record) {
  if (!record.title || !record.author) return 0;
  return 10 + (record.readingType ? 30 : 0) + (record.subject ? 30 : 0) + (record.completed === "yes" ? 50 : 0);
}

export function schoolDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_CONFIG.schoolTimeZone || "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalisePublicStudent(id, data) {
  return {
    id,
    schoolYear: String(data.schoolYear || ""),
    classId: String(data.classId || ""),
    displayAlias: publicDisplayAlias(data.displayAlias, id),
    booksCount: Number(data.booksCount || 0),
    distance: Number(data.distance || 0),
    updatedAt: data.updatedAt || null,
  };
}

function normaliseStudentRecord(id, data) {
  return {
    id,
    schoolYear: String(data.schoolYear || ""),
    classId: String(data.classId || ""),
    studentId: String(data.studentId || ""),
    displayAlias: publicDisplayAlias(data.displayAlias, id),
    booksCount: Number(data.booksCount || 0),
    distance: Number(data.distance || 0),
    lastBook: String(data.lastBook || ""),
    lastAuthor: String(data.lastAuthor || ""),
    dailyBooksCount: Number(data.dailyBooksCount || 0),
    dailyDateKey: String(data.dailyDateKey || ""),
    updatedAt: data.updatedAt || null,
  };
}

function normaliseBookLog(id, data) {
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
    clientCreatedAt: String(data.clientCreatedAt || ""),
    createdAt: data.createdAt || null,
  };
}

function compareStudentRecords(a, b) {
  return a.classId.localeCompare(b.classId, "en", { numeric: true })
    || a.studentId.localeCompare(b.studentId, "en", { numeric: true });
}

function buildStudentEmail(classId, studentId) {
  const yearToken = SCHOOL_YEAR.replace(/[^0-9]/g, "");
  return `${SCHOOL_CODE}.${yearToken}.${classId}.${studentId}@${STUDENT_AUTH_DOMAIN}`.toLowerCase();
}

function normaliseClassId(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 12);
}

function normaliseStudentId(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 20);
}

function publicDisplayAlias(value, seed) {
  const alias = String(value || "").trim().replace(/[\u0000-\u001F\u007F]/g, "").slice(0, 32);
  if (alias) return alias;
  const key = String(seed || "anonymous");
  if (!anonymousAliases.has(key)) anonymousAliases.set(key, randomAnonymousAlias());
  return anonymousAliases.get(key);
}

function randomAnonymousAlias() {
  const bytes = globalThis.crypto?.getRandomValues?.(new Uint8Array(4));
  if (!bytes) return "匿名同學";
  return `匿名同學 ${[...bytes].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function pendingSubmissionFor(user, record) {
  const fingerprint = submissionFingerprint(user, record);
  const existing = readPendingSubmission();
  if (existing?.fingerprint === fingerprint && validIdempotencyKey(existing.idempotencyKey)) return existing;
  const pending = { fingerprint, idempotencyKey: makeIdempotencyKey() };
  try { sessionStorage.setItem(PENDING_SUBMISSION_KEY, JSON.stringify(pending)); } catch {}
  return pending;
}

function submissionFingerprint(user, record) {
  return hashHex(JSON.stringify([
    SCHOOL_YEAR,
    user.uid,
    record.readingDate,
    record.title,
    record.author,
    record.readingType,
    record.subject,
    record.completed,
  ]));
}

function hashHex(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function makeIdempotencyKey() {
  const browserCrypto = globalThis.crypto;
  if (typeof browserCrypto?.randomUUID === "function") return browserCrypto.randomUUID();
  const random = browserCrypto?.getRandomValues?.(new Uint32Array(4));
  if (random) return [...random].map((value) => value.toString(16).padStart(8, "0")).join("-");
  throw new Error("SECURE_RANDOM_UNAVAILABLE");
}

function validIdempotencyKey(value) {
  return /^[A-Za-z0-9_-]{20,80}$/.test(String(value || ""));
}

function readPendingSubmission() {
  try { return JSON.parse(sessionStorage.getItem(PENDING_SUBMISSION_KEY) || "null"); }
  catch { return null; }
}

function clearPendingSubmission() {
  try { sessionStorage.removeItem(PENDING_SUBMISSION_KEY); } catch {}
}

function callableErrorCode(error) {
  const code = String(error?.code || error?.details?.code || "");
  return code.replace(/^functions\//, "");
}

function writeSession(value) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
    localStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {}
}

function readSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {}
}

function assertRuntimeConfiguration() {
  const siteOrigin = String(APP_CONFIG.schoolSiteOrigin || "");
  if (!/^\d{4}-\d{4}$/.test(SCHOOL_YEAR) || SCHOOL_YEAR.startsWith("__")) {
    throw new Error("SCHOOL_YEAR_NOT_CONFIGURED");
  }
  if (!/^https:\/\//i.test(siteOrigin) || siteOrigin.includes("__")) {
    throw new Error("SCHOOL_SITE_ORIGIN_NOT_CONFIGURED");
  }
  if (location.origin !== new URL(siteOrigin).origin) {
    throw new Error("UNAUTHORISED_SITE_ORIGIN");
  }
  if (!firebaseConfig.projectId || firebaseConfig.projectId === "book-running") {
    throw new Error("SCHOOL_FIREBASE_PROJECT_NOT_CONFIGURED");
  }
}
