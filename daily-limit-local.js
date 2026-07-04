import { APP_CONFIG } from "./app-config.js";

const LIMIT = Math.max(1, Number(APP_CONFIG.dailyBookLimit || 5));
const TIME_ZONE = APP_CONFIG.schoolTimeZone || "Asia/Hong_Kong";
const SESSION_KEY = "reading-run-session-v1";
const COUNT_PREFIX = "reading-run-local-count-v1";
const HISTORY_PREFIX = "reading-run-local-history-v1";

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

const state = { studentKey: "", dateKey: dateKey(), count: 0, bypass: false };
let card;
let countLabel;
let remainingLabel;
let progressBar;

if (form && submitButton && scorePreview && appShell) {
  installNotice();
  installCard();
  form.addEventListener("submit", handleSubmit, true);
  new MutationObserver(sync).observe(appShell, { attributes: true, attributeFilter: ["class"] });
  setInterval(sync, 1000);
  sync();
}

function installNotice() {
  const notice = document.createElement("section");
  notice.className = "student-security-notice";
  notice.innerHTML = "<strong>🔒 資料保護模式</strong><span>閱讀紀錄暫時只保存在此裝置，不會上載全校資料庫。請勿使用學生全名或正式學號。</span>";
  document.querySelector(".student-panel")?.insertAdjacentElement("afterend", notice);
}

function installCard() {
  card = document.createElement("section");
  card.className = "daily-limit-card";
  card.setAttribute("aria-live", "polite");
  card.innerHTML = `<div class="daily-limit-heading"><span>📚 每日提交上限</span><strong><span data-count>0</span> / ${LIMIT} 本</strong></div><div class="daily-limit-progress" aria-hidden="true"><span data-progress></span></div><p data-remaining>登入後顯示今日剩餘次數。</p>`;
  scorePreview.closest(".score-preview")?.insertAdjacentElement("afterend", card);
  countLabel = card.querySelector("[data-count]");
  remainingLabel = card.querySelector("[data-remaining]");
  progressBar = card.querySelector("[data-progress]");
  render();
}

function sync() {
  const visible = !appShell.classList.contains("is-hidden");
  const session = readJson(SESSION_KEY, null);
  const nextDate = dateKey();
  const nextStudent = visible && session?.classId && session?.studentId ? `${session.classId}__${session.studentId}` : "";
  if (nextStudent === state.studentKey && nextDate === state.dateKey) return;
  state.studentKey = nextStudent;
  state.dateKey = nextDate;
  state.count = nextStudent ? readCount(nextStudent, nextDate) : 0;
  render();
}

function handleSubmit(event) {
  if (state.bypass) {
    state.bypass = false;
    return;
  }
  event.preventDefault();
  event.stopImmediatePropagation();

  const session = readJson(SESSION_KEY, null);
  if (!session?.classId || !session?.studentId) return showToast("請先登入學生帳戶。", true);

  const today = dateKey();
  const studentKey = `${session.classId}__${session.studentId}`;
  const current = readCount(studentKey, today);
  if (current >= LIMIT) {
    state.studentKey = studentKey;
    state.dateKey = today;
    state.count = LIMIT;
    render();
    return showToast("今日已達 5 本上限，第 6 本不會增加里數。", true);
  }

  const record = readRecord();
  const distanceAwarded = score(record);
  if (!record.title || !record.author || distanceAwarded <= 0) return showToast("請輸入書本名稱及作者名稱。", true);

  const next = current + 1;
  localStorage.setItem(countKey(studentKey, today), String(next));
  const history = readJson(historyKey(studentKey), []);
  history.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    classId: session.classId,
    studentId: session.studentId,
    studentKey,
    ...record,
    distanceAwarded,
    submissionDateKey: today,
    clientCreatedAt: new Date().toISOString(),
  });
  localStorage.setItem(historyKey(studentKey), JSON.stringify(history.slice(0, 500)));

  state.studentKey = studentKey;
  state.dateKey = today;
  state.count = next;
  render();
  state.bypass = true;
  form.requestSubmit();
}

function readRecord() {
  return {
    readingDate: fields.readingDate?.value || dateKey(),
    title: clean(fields.title?.value, 80),
    author: clean(fields.author?.value, 80),
    readingType: fields.readingType?.value || "",
    subject: fields.subject?.value || "",
    completed: fields.completed?.value || "",
  };
}

function score(record) {
  if (!record.title || !record.author) return 0;
  let total = Number(APP_CONFIG.scoring?.base || 10);
  if (record.readingType) total += Number(APP_CONFIG.scoring?.readingType || 30);
  if (record.subject) total += Number(APP_CONFIG.scoring?.subject || 30);
  if (record.completed === "yes") total += Number(APP_CONFIG.scoring?.completion || 50);
  return total;
}

function render() {
  if (!card) return;
  const count = Math.max(0, Math.min(LIMIT, Number(state.count || 0)));
  countLabel.textContent = String(count);
  progressBar.style.width = `${(count / LIMIT) * 100}%`;
  if (!state.studentKey) {
    card.dataset.state = "idle";
    remainingLabel.textContent = `每人每日最多提交 ${LIMIT} 本書。`;
    return;
  }
  if (count >= LIMIT) {
    card.dataset.state = "locked";
    remainingLabel.textContent = "今日已達 5 本上限；香港時間午夜後重設。";
    submitButton.disabled = true;
    submitButton.textContent = "今日已達 5 本上限";
    return;
  }
  card.dataset.state = count === LIMIT - 1 ? "warning" : "available";
  remainingLabel.textContent = `今日尚可提交 ${LIMIT - count} 本；紀錄只保存在此裝置。`;
  submitButton.disabled = false;
  submitButton.textContent = "提交閱讀紀錄";
}

function readCount(studentKey, day) {
  const value = Number(localStorage.getItem(countKey(studentKey, day)) || 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(LIMIT, value)) : 0;
}

function countKey(studentKey, day) { return `${COUNT_PREFIX}__${studentKey}__${day}`; }
function historyKey(studentKey) { return `${HISTORY_PREFIX}__${studentKey}`; }

function dateKey() {
  const parts = new Intl.DateTimeFormat("en", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function readJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; }
  catch { return fallback; }
}

function clean(value, maxLength) { return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength); }

function showToast(message, error = false) {
  if (!toastRegion) return;
  const item = document.createElement("div");
  item.className = `toast${error ? " error" : ""}`;
  item.textContent = message;
  toastRegion.append(item);
  setTimeout(() => item.remove(), 4200);
}
