import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc,
  getFirestore,
  increment,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { APP_CONFIG } from "./app-config.js";
import { firebaseConfig } from "./firebase-config.js";

const DAILY_LIMIT = Math.max(1, Number(APP_CONFIG.dailyBookLimit || 5));
const SCHOOL_TIME_ZONE = APP_CONFIG.schoolTimeZone || "Asia/Hong_Kong";
const SESSION_KEY = "reading-run-session-v1";
const LOCAL_LIMIT_PREFIX = "reading-run-daily-count-v1";

const form = document.querySelector("#bookForm");
const submitButton = document.querySelector(".submit-reading-button");
const scorePreview = document.querySelector("#scorePreview");
const appShell = document.querySelector("#appShell");
const toastRegion = document.querySelector("#toastRegion");

const fields = {
  readingDate: document.querySelector("#readingDate"),
  title: document.querySelector("#bookTitle"),
  author: document.querySelector("#bookAuthor"),
  readingType: document.querySelector("#readingType"),
  subject: document.querySelector("#bookSubject"),
  completed: document.querySelector("#readingCompleted"),
};

const state = {
  studentKey: "",
  dateKey: schoolDateKey(),
  count: 0,
  loading: true,
  busy: false,
  bypassOriginal: false,
  unsubscribe: null,
};

let dailyCard;
let dailyCountLabel;
let dailyRemainingLabel;
let dailyProgressBar;

if (form && submitButton && scorePreview && appShell) {
  installDailyLimitCard();
  form.addEventListener("submit", handleSubmission, true);
  new MutationObserver(syncStudentContext).observe(appShell, {
    attributes: true,
    attributeFilter: ["class"],
  });
  setInterval(syncStudentContext, 1000);
  syncStudentContext();
}

function installDailyLimitCard() {
  dailyCard = document.createElement("section");
  dailyCard.className = "daily-limit-card";
  dailyCard.setAttribute("aria-live", "polite");
  dailyCard.innerHTML = `
    <div class="daily-limit-heading">
      <span>📚 每日提交上限</span>
      <strong><span data-daily-count>0</span> / ${DAILY_LIMIT} 本</strong>
    </div>
    <div class="daily-limit-progress" aria-hidden="true">
      <span data-daily-progress></span>
    </div>
    <p data-daily-remaining>正在讀取今日紀錄……</p>
  `;
  scorePreview.closest(".score-preview")?.insertAdjacentElement("afterend", dailyCard);
  dailyCountLabel = dailyCard.querySelector("[data-daily-count]");
  dailyRemainingLabel = dailyCard.querySelector("[data-daily-remaining]");
  dailyProgressBar = dailyCard.querySelector("[data-daily-progress]");
  updateDailyLimitUi();
}

async function syncStudentContext() {
  const session = readSession();
  const visible = !appShell.classList.contains("is-hidden");
  const dateKey = schoolDateKey();
  const studentKey = visible && session?.classId && session?.studentId
    ? `${session.classId}__${session.studentId}`
    : "";

  if (studentKey === state.studentKey && dateKey === state.dateKey) return;

  state.unsubscribe?.();
  state.unsubscribe = null;
  state.studentKey = studentKey;
  state.dateKey = dateKey;
  state.count = 0;
  state.loading = Boolean(studentKey);
  updateDailyLimitUi();

  if (!studentKey) return;

  if (!cloudConfigured()) {
    state.count = readLocalCount(studentKey, dateKey);
    state.loading = false;
    updateDailyLimitUi();
    return;
  }

  try {
    const db = await getDatabase();
    const usageRef = doc(db, "dailyUsage", usageDocumentId(studentKey, dateKey));
    state.unsubscribe = onSnapshot(usageRef, (snapshot) => {
      state.count = Math.min(DAILY_LIMIT, Number(snapshot.data()?.count || 0));
      state.loading = false;
      updateDailyLimitUi();
    }, (error) => {
      console.error("Unable to read daily usage", error);
      state.loading = false;
      dailyRemainingLabel.textContent = "未能讀取今日提交次數，請重新整理頁面。";
      dailyCard.dataset.state = "error";
    });
  } catch (error) {
    console.error(error);
    state.loading = false;
    dailyRemainingLabel.textContent = "未能連接每日限額資料。";
    dailyCard.dataset.state = "error";
  }
}

async function handleSubmission(event) {
  if (state.bypassOriginal) {
    state.bypassOriginal = false;
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  if (state.busy) return;

  const session = readSession();
  if (!session?.classId || !session?.studentId) {
    showToast("請先重新登入學生帳戶。", true);
    return;
  }

  const record = readForm();
  const distanceAwarded = calculateScore(record);
  if (!record.title || !record.author || distanceAwarded <= 0) {
    showToast("請輸入書本名稱及作者名稱。", true);
    return;
  }

  const currentDateKey = schoolDateKey();
  if (state.dateKey !== currentDateKey || state.studentKey !== `${session.classId}__${session.studentId}`) {
    await syncStudentContext();
  }

  if (state.count >= DAILY_LIMIT) {
    lockAtDailyLimit();
    showToast(`你今日已提交 ${DAILY_LIMIT} 本書，明天可以再提交。`, true);
    return;
  }

  if (!cloudConfigured()) {
    reserveLocalSubmission(session);
    state.bypassOriginal = true;
    form.requestSubmit(submitButton);
    setTimeout(updateDailyLimitUi, 800);
    return;
  }

  if (!navigator.onLine) {
    showToast("為確保每人每日最多 5 本，請連接網絡後再提交。", true);
    return;
  }

  state.busy = true;
  updateDailyLimitUi();

  try {
    const result = await commitLimitedReading(session, record, distanceAwarded);
    state.count = result.count;
    state.loading = false;
    resetForm();
    updateDailyLimitUi();
    showToast(`《${record.title}》已記錄，今日已提交 ${result.count} / ${DAILY_LIMIT} 本。`);
  } catch (error) {
    console.error(error);
    if (error?.code === "daily-limit-reached") {
      state.count = DAILY_LIMIT;
      state.loading = false;
      lockAtDailyLimit();
      showToast(`你今日已達 ${DAILY_LIMIT} 本上限，不能再提交。`, true);
    } else if (error?.code === "permission-denied") {
      showToast("每日限額權限尚未啟用，請部署最新 firestore.rules。", true);
    } else {
      showToast("未能提交紀錄，請檢查網絡後再試。", true);
    }
  } finally {
    state.busy = false;
    updateDailyLimitUi();
  }
}

async function commitLimitedReading(session, record, distanceAwarded) {
  const db = await getDatabase();
  const studentKey = `${session.classId}__${session.studentId}`;
  const dateKey = schoolDateKey();
  const usageId = usageDocumentId(studentKey, dateKey);
  const usageRef = doc(db, "dailyUsage", usageId);
  const studentRef = doc(db, "students", studentKey);

  return runTransaction(db, async (transaction) => {
    const usageSnapshot = await transaction.get(usageRef);
    const currentCount = Number(usageSnapshot.data()?.count || 0);

    if (currentCount >= DAILY_LIMIT) {
      const limitError = new Error("DAILY_LIMIT_REACHED");
      limitError.code = "daily-limit-reached";
      throw limitError;
    }

    const nextCount = currentCount + 1;
    const logId = `${usageId}__${nextCount}`;
    const logRef = doc(db, "bookLogs", logId);
    const existingLog = await transaction.get(logRef);

    if (existingLog.exists()) {
      const duplicateError = new Error("DAILY_SEQUENCE_ALREADY_USED");
      duplicateError.code = "daily-limit-reached";
      throw duplicateError;
    }

    const usageData = {
      studentKey,
      classId: session.classId,
      studentId: session.studentId,
      dateKey,
      count: nextCount,
      limit: DAILY_LIMIT,
      updatedAt: serverTimestamp(),
    };
    if (!usageSnapshot.exists()) usageData.createdAt = serverTimestamp();

    transaction.set(usageRef, usageData, { merge: true });
    transaction.set(logRef, {
      classId: session.classId,
      studentId: session.studentId,
      studentKey,
      readingDate: record.readingDate || "",
      title: record.title,
      author: record.author,
      readingType: record.readingType || "",
      subject: record.subject || "",
      completed: record.completed || "",
      distanceAwarded,
      usageId,
      submissionDateKey: dateKey,
      dailySequence: nextCount,
      clientCreatedAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
    });
    transaction.set(studentRef, {
      classId: session.classId,
      studentId: session.studentId,
      booksCount: increment(1),
      distance: increment(distanceAwarded),
      lastBook: record.title,
      lastAuthor: record.author,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return { count: nextCount };
  });
}

function reserveLocalSubmission(session) {
  const studentKey = `${session.classId}__${session.studentId}`;
  const dateKey = schoolDateKey();
  const nextCount = Math.min(DAILY_LIMIT, readLocalCount(studentKey, dateKey) + 1);
  localStorage.setItem(localCountKey(studentKey, dateKey), String(nextCount));
  state.studentKey = studentKey;
  state.dateKey = dateKey;
  state.count = nextCount;
  state.loading = false;
  updateDailyLimitUi();
}

function updateDailyLimitUi() {
  if (!dailyCard) return;

  const count = Math.max(0, Math.min(DAILY_LIMIT, Number(state.count || 0)));
  const remaining = Math.max(0, DAILY_LIMIT - count);
  dailyCountLabel.textContent = String(count);
  dailyProgressBar.style.width = `${(count / DAILY_LIMIT) * 100}%`;

  if (!state.studentKey) {
    dailyCard.dataset.state = "idle";
    dailyRemainingLabel.textContent = `登入後可查看今日剩餘次數，每人每日最多 ${DAILY_LIMIT} 本。`;
    return;
  }

  if (state.loading) {
    dailyCard.dataset.state = "loading";
    dailyRemainingLabel.textContent = "正在讀取今日提交次數……";
    submitButton.disabled = true;
    submitButton.textContent = "正在檢查今日次數";
    return;
  }

  if (state.busy) {
    dailyCard.dataset.state = "loading";
    dailyRemainingLabel.textContent = "正在檢查並提交紀錄……";
    submitButton.disabled = true;
    submitButton.textContent = "正在提交";
    return;
  }

  if (count >= DAILY_LIMIT) {
    lockAtDailyLimit();
    return;
  }

  dailyCard.dataset.state = count >= DAILY_LIMIT - 1 ? "warning" : "available";
  dailyRemainingLabel.textContent = `今日尚可提交 ${remaining} 本；每日於香港時間午夜重新計算。`;
  submitButton.disabled = false;
  submitButton.textContent = "提交閱讀紀錄";
}

function lockAtDailyLimit() {
  dailyCard.dataset.state = "locked";
  dailyRemainingLabel.textContent = `今日已達 ${DAILY_LIMIT} 本上限，明天可再次提交。`;
  dailyProgressBar.style.width = "100%";
  submitButton.disabled = true;
  submitButton.textContent = `今日已達 ${DAILY_LIMIT} 本上限`;
}

function readForm() {
  return {
    readingDate: fields.readingDate?.value || "",
    title: cleanText(fields.title?.value, 80),
    author: cleanText(fields.author?.value, 80),
    readingType: fields.readingType?.value || "",
    subject: fields.subject?.value || "",
    completed: fields.completed?.value || "",
  };
}

function calculateScore(record) {
  if (!record.title || !record.author) return 0;
  let score = Number(APP_CONFIG.scoring?.base || 10);
  if (record.readingType) score += Number(APP_CONFIG.scoring?.readingType || 30);
  if (record.subject) score += Number(APP_CONFIG.scoring?.subject || 30);
  if (record.completed === "yes") score += Number(APP_CONFIG.scoring?.completion || 50);
  return score;
}

function resetForm() {
  fields.readingDate.value = schoolDateKey();
  fields.title.value = "";
  fields.author.value = "";
  fields.readingType.value = "";
  fields.subject.value = "";
  fields.completed.value = "";
  form.dispatchEvent(new Event("input", { bubbles: true }));
}

async function getDatabase() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  if (!auth.currentUser) await signInAnonymously(auth);
  return getFirestore(app);
}

function schoolDateKey() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: SCHOOL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function usageDocumentId(studentKey, dateKey) {
  return `${studentKey}__${dateKey}`;
}

function localCountKey(studentKey, dateKey) {
  return `${LOCAL_LIMIT_PREFIX}__${studentKey}__${dateKey}`;
}

function readLocalCount(studentKey, dateKey) {
  const value = Number(localStorage.getItem(localCountKey(studentKey, dateKey)) || 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(DAILY_LIMIT, value)) : 0;
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function cloudConfigured() {
  return Object.values(firebaseConfig).every((value) => value && !String(value).startsWith("PASTE_YOUR_"));
}

function cleanText(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function showToast(message, error = false) {
  if (!toastRegion) return;
  const item = document.createElement("div");
  item.className = `toast${error ? " error" : ""}`;
  item.textContent = message;
  toastRegion.append(item);
  setTimeout(() => item.remove(), 4200);
}
