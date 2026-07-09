import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js?secure-data=1";
import { browserSessionPersistence, getAuth, GoogleAuthProvider, setPersistence, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js?secure-data=1";
import { collection, doc, getDoc, getFirestore, increment, onSnapshot, query, runTransaction, serverTimestamp, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js?secure-data=1";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js?secure-data=1";
import { APP_CONFIG } from "./app-config.js";
import { firebaseConfig } from "./firebase-config-v3.js";
import { securityConfig } from "./security-config.js";

const SESSION_KEY = "reading-run-session-v1";
const DAILY_LIMIT = Number(APP_CONFIG.dailyBookLimit || 5);
const SCHOOL_DOMAIN = "@twghscysps.edu.hk";
const HOSTED_DOMAIN = "twghscysps.edu.hk";
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

export async function loginStudent() {
  await setPersistence(auth, browserSessionPersistence);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ hd: HOSTED_DOMAIN, prompt: "select_account" });
  const credential = await signInWithPopup(auth, provider);
  return authoriseStudent(credential.user.uid);
}

export async function restoreStudent() {
  if (!auth.currentUser) return null;
  return authoriseStudent(auth.currentUser.uid);
}

async function authoriseStudent(uid) {
  if (!isSchoolEmail(auth.currentUser?.email)) {
    await signOut(auth).catch(() => {});
    throw new Error("INVALID_DOMAIN");
  }
  const snapshot = await getDoc(doc(db, "users", uid));
  const profile = snapshot.data() || {};
  const classId = String(profile.classId || "").toUpperCase();
  const studentId = String(profile.studentId || "").toUpperCase();
  if (
    profile.role !== "student"
    || profile.active === false
    || !classId
    || !studentId
  ) {
    await signOut(auth).catch(() => {});
    throw new Error("PROFILE_MISMATCH");
  }
  const user = { uid, classId, studentId, email: auth.currentUser?.email || "", key: `${classId}__${studentId}` };
  localStorage.setItem(SESSION_KEY, JSON.stringify({ classId, studentId }));
  await ensureStudent(user);
  return user;
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
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_CONFIG.schoolTimeZone || "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isSchoolEmail(email) {
  return String(email || "").toLowerCase().endsWith(SCHOOL_DOMAIN);
}
