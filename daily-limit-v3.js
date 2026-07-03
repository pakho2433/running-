import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { APP_CONFIG } from "./app-config.js";
import { firebaseConfig } from "./firebase-config.js";

const LIMIT = 5;
const TIME_ZONE = "Asia/Hong_Kong";
const PROGRAMME_TITLE = "東華三院周演森小學-26/27悅讀千里號";
const SESSION_KEY = "reading-run-session-v1";
const LOCAL_PREFIX = "reading-run-daily-count-v3";

const form = document.querySelector("#bookForm");
const submitButton = document.querySelector(".submit-reading-button");
const scorePreview = document.querySelector("#scorePreview");
const appShell = document.querySelector("#appShell");
const toastRegion = document.querySelector("#toastRegion");

const inputs = {
  date: document.querySelector("#readingDate"),
  title: document.querySelector("#bookTitle"),
  author: document.querySelector("#bookAuthor"),
  type: document.querySelector("#readingType"),
  subject: document.querySelector("#bookSubject"),
  completed: document.querySelector("#readingCompleted"),
};

const state = {
  studentKey: "",
  dateKey: schoolDateKey(),
  count: 0,
  historicalCount: 0,
  loading: false,
  busy: false,
  bypassOriginal: false,
  unsubscribe: null,
};

let card;
let countLabel;
let remainingLabel;
let progressBar;

applyProgrammeTitle();

if (form && submitButton && scorePreview && appShell) {
  createQuotaCard();
  form.addEventListener("submit", handleSubmit, true);
  new MutationObserver(syncContext).observe(appShell, {
    attributes: true,
    attributeFilter: ["class"],
  });
  setInterval(syncContext, 1000);
  syncContext();
}

function applyProgrammeTitle() {
  document.title = PROGRAMME_TITLE;
  const loginTitle = document.querySelector("#loginTitle");
  const schoolTitle = document.querySelector("#schoolTitle");
  if (loginTitle) loginTitle.textContent = PROGRAMME_TITLE;
  if (schoolTitle) schoolTitle.textContent = PROGRAMME_TITLE;
  document.querySelectorAll(".eyebrow").forEach((element) => {
    if (element.textContent.trim() === "READING RUN") element.textContent = PROGRAMME_TITLE;
  });
}

function createQuotaCard() {
  card = document.createElement("section");
  card.className = "daily-limit-card";
  card.setAttribute("aria-live", "polite");
  card.innerHTML = `
    <div class="daily-limit-heading">
      <span>📚 每日提交上限</span>
      <strong><span data-daily-count>0</span> / ${LIMIT} 本</strong>
    </div>
    <div class="daily-limit-progress" aria-hidden="true"><span data-daily-progress></span></div>
    <p data-daily-remaining>登入後顯示今日剩餘次數。</p>
  `;
  scorePreview.closest(".score-preview")?.insertAdjacentElement("afterend", card);
  countLabel = card.querySelector("[data-daily-count]");
  remainingLabel = card.querySelector("[data-daily-remaining]");
  progressBar = card.querySelector("[data-daily-progress]");
  renderQuota();
}

async function syncContext() {
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
  state.historicalCount = 0;
  state.loading = Boolean(studentKey);
  renderQuota();

  if (!studentKey) return;

  if (!cloudConfigured()) {
    state.count = readLocalCount(studentKey, dateKey);
    state.loading = false;
    renderQuota();
    return;
  }

  try {
    const db = await database();
    state.historicalCount = await countExistingSubmissions(db, studentKey, dateKey);
    state.count = state.historicalCount;

    state.unsubscribe = onSnapshot(doc(db, "students", studentKey), (snapshot) => {
      const data = snapshot.data() || {};
      const storedCount = data.dailyDateKey === state.dateKey
        ? Number(data.dailyBooksCount || 0)
        : 0;
      state.count = Math.max(state.historicalCount, storedCount);
      state.loading = false;
      renderQuota();
    }, failQuotaLoad);
  } catch (error) {
    failQuotaLoad(error);
  }
}

async function countExistingSubmissions(db, studentKey, dateKey) {
  const result = await getDocs(query(
    collection(db, "bookLogs"),
    where("studentKey", "==", studentKey),
  ));

  return result.docs.reduce((count, snapshot) => {
    const record = snapshot.data() || {};
    return count + (submissionDateKey(record) === dateKey ? 1 : 0);
  }, 0);
}

function submissionDateKey(record) {
  if (record.submissionDateKey) return String(record.submissionDateKey);
  if (record.createdAt?.toDate) return dateKeyFor(record.createdAt.toDate());
  if (record.clientCreatedAt) {
    const date = new Date(record.clientCreatedAt);
    if (!Number.isNaN(date.getTime())) return dateKeyFor(date);
  }
  return "";
}

function failQuotaLoad(error) {
  console.error("Daily quota load failed", error);
  state.loading = false;
  card.dataset.state = "error";
  remainingLabel.textContent = "未能核對今日提交次數，暫停提交以防超出上限。";
  submitButton.disabled = true;
  submitButton.textContent = "請重新整理後再試";
}

async function handleSubmit(event) {
  if (state.bypassOriginal) {
    state.bypassOriginal = false;
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();
  if (state.busy || state.loading) return;

  const session = readSession();
  if (!session?.classId || !session?.studentId) {
    toast("請先重新登入學生帳戶。", true);
    return;
  }

  const record = readRecord();
  const distance = scoreRecord(record);
  if (!record.title || !record.author || distance <= 0) {
    toast("請輸入書本名稱及作者名稱。", true);
    return;
  }

  if (state.count >= LIMIT) {
    lockQuota();
    toast("今日已提交 5 本書，第 6 本不會增加里數。", true);
    return;
  }

  if (!cloudConfigured()) {
    reserveLocal(session);
    state.bypassOriginal = true;
    form.requestSubmit();
    setTimeout(renderQuota, 800);
    return;
  }

  if (!navigator.onLine) {
    toast("為確保每日最多 5 本，請連接網絡後再提交。", true);
    return;
  }

  state.busy = true;
  renderQuota();

  try {
    const result = await saveWithLimit(session, record, distance);
    state.dateKey = result.dateKey;
    state.historicalCount = result.count;
    state.count = result.count;
    state.loading = false;
    clearForm();
    renderQuota();
    toast(`《${record.title}》已記錄，今日已提交 ${result.count} / ${LIMIT} 本。`);
  } catch (error) {
    console.error(error);
    if (error?.code === "daily-limit-reached") {
      state.count = LIMIT;
      lockQuota();
      toast("今日已達 5 本上限，第 6 本不會加里數。", true);
    } else {
      toast("未能提交紀錄，請檢查網絡後再試。", true);
    }
  } finally {
    state.busy = false;
    renderQuota();
  }
}

async function saveWithLimit(session, record, distance) {
  const db = await database();
  const studentKey = `${session.classId}__${session.studentId}`;
  const dateKey = schoolDateKey();
  const studentRef = doc(db, "students", studentKey);

  return runTransaction(db, async (transaction) => {
    const studentSnapshot = await transaction.get(studentRef);
    const student = studentSnapshot.data() || {};
    const storedCount = student.dailyDateKey === dateKey
      ? Number(student.dailyBooksCount || 0)
      : 0;
    const current = Math.max(storedCount, state.dateKey === dateKey ? state.historicalCount : 0);

    if (current >= LIMIT) {
      const error = new Error("DAILY_LIMIT_REACHED");
      error.code = "daily-limit-reached";
      throw error;
    }

    const next = current + 1;
    const logRef = doc(db, "bookLogs", `${studentKey}__${dateKey}__${next}`);
    const existingLog = await transaction.get(logRef);
    if (existingLog.exists()) {
      const error = new Error("DAILY_SEQUENCE_USED");
      error.code = "daily-limit-reached";
      throw error;
    }

    transaction.set(logRef, {
      classId: session.classId,
      studentId: session.studentId,
      studentKey,
      readingDate: record.readingDate,
      title: record.title,
      author: record.author,
      readingType: record.readingType,
      subject: record.subject,
      completed: record.completed,
      distanceAwarded: distance,
      submissionDateKey: dateKey,
      dailySequence: next,
      clientCreatedAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
    });

    transaction.set(studentRef, {
      classId: session.classId,
      studentId: session.studentId,
      booksCount: increment(1),
      distance: increment(distance),
      lastBook: record.title,
      lastAuthor: record.author,
      dailyDateKey: dateKey,
      dailyBooksCount: next,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return { count: next, dateKey };
  });
}

function reserveLocal(session) {
  const studentKey = `${session.classId}__${session.studentId}`;
  const dateKey = schoolDateKey();
  const next = Math.min(LIMIT, readLocalCount(studentKey, dateKey) + 1);
  localStorage.setItem(localKey(studentKey, dateKey), String(next));
  state.studentKey = studentKey;
  state.dateKey = dateKey;
  state.historicalCount = next;
  state.count = next;
  state.loading = false;
}

function renderQuota() {
  if (!card) return;
  const count = Math.max(0, Math.min(LIMIT, Number(state.count || 0)));
  const remaining = Math.max(0, LIMIT - count);
  countLabel.textContent = String(count);
  progressBar.style.width = `${(count / LIMIT) * 100}%`;

  if (!state.studentKey) {
    card.dataset.state = "idle";
    remainingLabel.textContent = "每人每日最多提交 5 本書。";
    return;
  }
  if (state.loading || state.busy) {
    card.dataset.state = "loading";
    remainingLabel.textContent = state.busy ? "正在檢查並提交紀錄……" : "正在核對今日提交次數……";
    submitButton.disabled = true;
    submitButton.textContent = state.busy ? "正在提交" : "正在檢查今日次數";
    return;
  }
  if (count >= LIMIT) {
    lockQuota();
    return;
  }

  card.dataset.state = count === LIMIT - 1 ? "warning" : "available";
  remainingLabel.textContent = `今日尚可提交 ${remaining} 本；每日 23:59 後重新提供 5 本限額。`;
  submitButton.disabled = false;
  submitButton.textContent = "提交閱讀紀錄";
}

function lockQuota() {
  card.dataset.state = "locked";
  remainingLabel.textContent = "今日已達 5 本上限；第 6 本不會增加里數，23:59 後重設。";
  progressBar.style.width = "100%";
  submitButton.disabled = true;
  submitButton.textContent = "今日已達 5 本上限";
}

function readRecord() {
  return {
    readingDate: inputs.date?.value || "",
    title: clean(inputs.title?.value, 80),
    author: clean(inputs.author?.value, 80),
    readingType: inputs.type?.value || "",
    subject: inputs.subject?.value || "",
    completed: inputs.completed?.value || "",
  };
}

function scoreRecord(record) {
  if (!record.title || !record.author) return 0;
  let score = Number(APP_CONFIG.scoring?.base || 10);
  if (record.readingType) score += Number(APP_CONFIG.scoring?.readingType || 30);
  if (record.subject) score += Number(APP_CONFIG.scoring?.subject || 30);
  if (record.completed === "yes") score += Number(APP_CONFIG.scoring?.completion || 50);
  return score;
}

function clearForm() {
  inputs.date.value = schoolDateKey();
  inputs.title.value = "";
  inputs.author.value = "";
  inputs.type.value = "";
  inputs.subject.value = "";
  inputs.completed.value = "";
  form.dispatchEvent(new Event("input", { bubbles: true }));
}

async function database() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  if (!auth.currentUser) await signInAnonymously(auth);
  return getFirestore(app);
}

function schoolDateKey() {
  return dateKeyFor(new Date());
}

function dateKeyFor(date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function localKey(studentKey, dateKey) {
  return `${LOCAL_PREFIX}__${studentKey}__${dateKey}`;
}

function readLocalCount(studentKey, dateKey) {
  const value = Number(localStorage.getItem(localKey(studentKey, dateKey)) || 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(LIMIT, value)) : 0;
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

function clean(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function toast(message, error = false) {
  if (!toastRegion) return;
  const item = document.createElement("div");
  item.className = `toast${error ? " error" : ""}`;
  item.textContent = message;
  toastRegion.append(item);
  setTimeout(() => item.remove(), 4200);
}
