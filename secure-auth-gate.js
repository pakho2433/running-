import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js?reading-run-secure-gate=1";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js?reading-run-secure-gate=1";
import { doc, getDoc, getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js?reading-run-secure-gate=1";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js?reading-run-secure-gate=1";
import { firebaseConfig, securityConfig } from "./firebase-config.js";

const SESSION_KEY = "reading-run-session-v1";
const form = document.querySelector("#loginForm");
const classInput = document.querySelector("#loginClass");
const studentIdInput = document.querySelector("#studentId");
const pinInput = document.querySelector("#studentPin");
const loginButton = document.querySelector("#loginButton");
const loginMessage = document.querySelector("#loginMessage");
const logoutButton = document.querySelector("#logoutButton");

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

startAppCheck();

if (form && classInput && studentIdInput && pinInput) {
  form.addEventListener("submit", secureLogin, true);
}

if (logoutButton) {
  logoutButton.addEventListener("click", secureLogout, true);
}

async function secureLogin(event) {
  event.preventDefault();
  event.stopImmediatePropagation();

  const classId = normaliseCode(classInput.value, 12);
  const studentId = normaliseCode(studentIdInput.value, 20);
  const pin = String(pinInput.value || "");

  if (!classId || !studentId || pin.length < 6) {
    showMessage("請輸入有效的學生 ID 及至少 6 位的個人 PIN。", true);
    return;
  }

  setBusy(true);
  showMessage("正在核對學生身份……");

  try {
    await setPersistence(auth, browserLocalPersistence);
    const credential = await signInWithEmailAndPassword(
      auth,
      studentLoginEmail(classId, studentId),
      pin,
    );

    const profileSnapshot = await getDoc(doc(db, "users", credential.user.uid));
    const profile = profileSnapshot.data() || {};
    if (
      profile.role !== "student"
      || profile.classId !== classId
      || String(profile.studentId || "").toUpperCase() !== studentId
    ) {
      await signOut(auth);
      throw new Error("PROFILE_MISMATCH");
    }

    localStorage.setItem(SESSION_KEY, JSON.stringify({ classId, studentId }));
    location.reload();
  } catch (error) {
    console.error("Secure student login failed", error);
    try { await signOut(auth); } catch {}
    localStorage.removeItem(SESSION_KEY);
    pinInput.value = "";
    showMessage(loginError(error), true);
    setBusy(false);
  }
}

async function secureLogout(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  localStorage.removeItem(SESSION_KEY);
  try { await signOut(auth); } catch (error) { console.warn(error); }
  location.reload();
}

function studentLoginEmail(classId, studentId) {
  const schoolCode = String(securityConfig?.schoolCode || "readingrun")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  return `${schoolCode}.${classId}.${studentId}@students.readingrun.invalid`.toLowerCase();
}

function normaliseCode(value, maxLength) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, maxLength);
}

function setBusy(busy) {
  if (loginButton) loginButton.disabled = busy;
  if (classInput) classInput.disabled = busy;
  if (studentIdInput) studentIdInput.disabled = busy;
  if (pinInput) pinInput.disabled = busy;
}

function showMessage(message, isError = false) {
  if (!loginMessage) return;
  loginMessage.textContent = message;
  loginMessage.dataset.state = isError ? "error" : "loading";
}

function loginError(error) {
  if (error?.message === "PROFILE_MISMATCH") return "帳戶資料與所選班別或學生 ID 不符。";
  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(error?.code)) {
    return "學生 ID 或 PIN 不正確。";
  }
  if (error?.code === "auth/too-many-requests") return "登入嘗試過多，請稍後再試或聯絡老師。";
  if (error?.code === "permission-denied") return "帳戶權限尚未設定，請聯絡系統管理員。";
  return "暫時未能登入，請檢查網絡後再試。";
}

function startAppCheck() {
  const siteKey = String(securityConfig?.appCheckSiteKey || "");
  if (!siteKey || siteKey.startsWith("PASTE_")) return;
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.warn("App Check initialization skipped", error);
  }
}
