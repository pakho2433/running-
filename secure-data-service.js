import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { browserSessionPersistence, fetchSignInMethodsForEmail, getAuth, getIdTokenResult, setPersistence, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, doc, getDoc, getDocs, getFirestore, increment, onSnapshot, query, runTransaction, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js";
import { APP_CONFIG } from "./app-config.js";
import { firebaseConfig } from "./firebase-config-v3.js";
import { securityConfig } from "./security-config.js";

const SESSION_KEY = "reading-run-session-v1";
const DAILY_LIMIT = Number(APP_CONFIG.dailyBookLimit || 5);
const SCHOOL_CODE = String(securityConfig.schoolCode || "scysps").toLowerCase().replace(/[^a-z0-9-]/g, "") || "scysps";
const STUDENT_AUTH_DOMAIN = "students.readingrun.invalid";
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let stopPrivate = null;
let stopClass = null;

export async function initialiseSecurity() {
  const siteKey = String(securityConfig.appCheckSiteKey || "");
  if (siteKey && !siteKey.startsWith("PASTE_")) {
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
  if (!safeClassId || !safeStudentId || safePassword.length < 6) throw new Error("MISSING_LOGIN_FIELDS");
  const email = buildStudentEmail(safeClassId, safeStudentId);
  await ensureStudentAccountExists(email);
  let credential;
  try {
    credential = await signInWithEmailAndPassword(auth, email, safePassword);
  } catch (error) {
    if (isWrongPasswordError(error)) throw new Error("PASSWORD_INCORRECT");
    throw error;
  }
  return authoriseStudent(credential.user.uid, safeClassId, safeStudentId);
}

export async function loginTeacher(email, password) {
  const safeEmail = String(email || "").trim().toLowerCase();
  const safePassword = String(password || "").trim();
  if (!safeEmail || safePassword.length < 8) throw new Error("MISSING_TEACHER_LOGIN_FIELDS");
  let credential;
  try {
    credential = await signInWithEmailAndPassword(auth, safeEmail, safePassword);
  } catch (error) {
    if (isWrongPasswordError(error)) throw new Error("PASSWORD_INCORRECT");
    throw error;
  }
  return authoriseTeacher(credential.user);
}

async function ensureStudentAccountExists(email) {
  try {
    await fetchSignInMethodsForEmail(auth, email);
  } catch (error) {
    console.warn("Unable to pre-check student ID, falling back to password sign-in.", error);
  }
}

function isWrongPasswordError(error) {
  return error?.message === "PASSWORD_INCORRECT"
    || error?.code === "auth/invalid-credential"
    || error?.code === "auth/wrong-password";
}

export async function restoreStudent() {
  const session = readSession();
  if (session?.role && session.role !== "student") return null;
  if (!auth.currentUser || !session?.classId || !session?.studentId) return null;
  return authoriseStudent(auth.currentUser.uid, session.classId, session.studentId);
}

export async function restoreTeacher() {
  const session = readSession();
  if (session?.role !== "teacher") return null;
  if (!auth.currentUser || session?.classId || session?.studentId) return null;
  return authoriseTeacher(auth.currentUser);
}

async function authoriseStudent(uid, classId, studentId) {
  const snapshot = await getDoc(doc(db, "users", uid));
  const profile = snapshot.data() || {};
  if (
    profile.role !== "student"
    || profile.active === false
    || String(profile.classId || "").toUpperCase() !== classId
    || String(profile.studentId || "").toUpperCase() !== studentId
  ) {
    await signOut(auth).catch(() => {});
    throw new Error("PROFILE_MISMATCH");
  }
  const user = { uid, role: "student", classId, studentId, email: auth.currentUser?.email || "", key: `${classId}__${studentId}` };
  localStorage.setItem(SESSION_KEY, JSON.stringify({ role: "student", classId, studentId }));
  await ensureStudent(user);
  return user;
}

async function authoriseTeacher(user) {
  const token = await getIdTokenResult(user, true);
  const profileSnapshot = await getDoc(doc(db, "users", user.uid));
  const profile = profileSnapshot.data() || {};
  if (
    token.claims?.teacher !== true
    || profile.role !== "teacher"
    || profile.active === false
  ) {
    await signOut(auth).catch(() => {});
    throw new Error("TEACHER_PROFILE_MISMATCH");
  }
  const teacher = {
    uid: user.uid,
    role: "teacher",
    email: user.email || profile.email || "",
    displayName: profile.displayName || profile.name || "教師",
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify({ role: "teacher" }));
  return teacher;
}

async function ensureTeacher() {
  if (!auth.currentUser) throw new Error("TEACHER_NOT_SIGNED_IN");
  return authoriseTeacher(auth.currentUser);
}

async function ensureStudent(user) {
  const privateRef = doc(db, "students", user.key);
  const publicRef = doc(db, "publicStudents", user.key);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(privateRef);
    if (!snapshot.exists()) {
      transaction.set(privateRef, {
        classId: user.classId,
        studentId: user.studentId,
        email: user.email,
        booksCount: 0,
        distance: 0,
        lastBook: "",
        lastAuthor: "",
        dailyBooksCount: 0,
        dailyDateKey: schoolDateKey(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      transaction.set(publicRef, {
        classId: user.classId,
        studentId: user.studentId,
        booksCount: 0,
        distance: 0,
        updatedAt: serverTimestamp(),
      });
      return;
    }
    const data = snapshot.data();
    transaction.set(publicRef, {
      classId: data.classId,
      studentId: data.studentId,
      booksCount: Number(data.booksCount || 0),
      distance: Number(data.distance || 0),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
}

export function subscribeStudent(user, onPrivate, onClass, onError) {
  stopPrivate?.();
  stopClass?.();
  stopPrivate = onSnapshot(doc(db, "students", user.key), (snapshot) => {
    onPrivate(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
  }, onError);
  stopClass = onSnapshot(
    query(collection(db, "publicStudents"), where("classId", "==", user.classId)),
    (snapshot) => onClass(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError,
  );
  return stopSubscriptions;
}

export function stopSubscriptions() {
  stopPrivate?.();
  stopClass?.();
  stopPrivate = null;
  stopClass = null;
}

export async function saveReading(user, record) {
  const distance = scoreReading(record);
  if (!record.title || !record.author || distance <= 0) throw new Error("INVALID_RECORD");
  const dateKey = schoolDateKey();
  const privateRef = doc(db, "students", user.key);
  const publicRef = doc(db, "publicStudents", user.key);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(privateRef);
    if (!snapshot.exists()) throw new Error("MISSING_STUDENT");
    const data = snapshot.data();
    const current = data.dailyDateKey === dateKey ? Number(data.dailyBooksCount || 0) : 0;
    if (current >= DAILY_LIMIT) throw new Error("DAILY_LIMIT");
    const next = current + 1;
    const logRef = doc(db, "bookLogs", `${user.key}__${dateKey}__${next}`);
    if ((await transaction.get(logRef)).exists()) throw new Error("DAILY_LIMIT");
    transaction.set(logRef, {
      classId: user.classId,
      studentId: user.studentId,
      studentKey: user.key,
      readingDate: record.readingDate || dateKey,
      title: record.title,
      author: record.author,
      readingType: record.readingType || "",
      subject: record.subject || "",
      completed: record.completed || "",
      distanceAwarded: distance,
      submissionDateKey: dateKey,
      dailySequence: next,
      clientCreatedAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
    });
    transaction.set(privateRef, {
      classId: user.classId,
      studentId: user.studentId,
      booksCount: increment(1),
      distance: increment(distance),
      lastBook: record.title,
      lastAuthor: record.author,
      dailyDateKey: dateKey,
      dailyBooksCount: next,
      updatedAt: serverTimestamp(),
    }, { merge: true });
    transaction.set(publicRef, {
      classId: user.classId,
      studentId: user.studentId,
      booksCount: increment(1),
      distance: increment(distance),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return { count: next, distance };
  });
}

export async function loadTeacherDashboardData(options = {}) {
  const teacher = await ensureTeacher();
  const includeLogs = options.includeLogs === true;
  const [studentsSnapshot, logsSnapshot] = await Promise.all([
    getDocs(collection(db, "students")),
    includeLogs ? getDocs(collection(db, "bookLogs")) : Promise.resolve(null),
  ]);
  const students = studentsSnapshot.docs
    .map((item) => normaliseStudentRecord(item.id, item.data()))
    .sort(compareStudentRecords);
  const logs = logsSnapshot ? logsSnapshot.docs
    .map((item) => normaliseBookLog(item.id, item.data()))
    .sort((a, b) => timeOf(b) - timeOf(a)) : [];
  return { teacher, students, logs, logsLoaded: includeLogs, generatedAt: new Date().toISOString() };
}

export async function logoutStudent() {
  stopSubscriptions();
  localStorage.removeItem(SESSION_KEY);
  await signOut(auth).catch(() => {});
}

export function scoreReading(record) {
  if (!record.title || !record.author) return 0;
  return 10 + (record.readingType ? 30 : 0) + (record.subject ? 30 : 0) + (record.completed === "yes" ? 50 : 0);
}

export function schoolDateKey() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_CONFIG.schoolTimeZone || "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function normaliseStudentRecord(id, data) {
  return {
    id,
    classId: String(data.classId || ""),
    studentId: String(data.studentId || ""),
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

function timeOf(record) {
  if (typeof record.createdAt?.toMillis === "function") return record.createdAt.toMillis();
  return Date.parse(record.clientCreatedAt || record.submissionDateKey || record.readingDate || "") || 0;
}

function buildStudentEmail(classId, studentId) {
  return `${SCHOOL_CODE}.${classId}.${studentId}@${STUDENT_AUTH_DOMAIN}`.toLowerCase();
}

function normaliseClassId(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 12);
}

function normaliseStudentId(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 20);
}

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}
