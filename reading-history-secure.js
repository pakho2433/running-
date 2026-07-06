import { getApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js?history-secure=1";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js?history-secure=1";
import { collection, getDocs, getFirestore, query, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js?history-secure=1";

const SESSION_KEY = "reading-run-session-v1";
const button = document.querySelector("#readingBuddyButton");
const modal = document.querySelector("#readingHistoryModal");
const closeButton = document.querySelector("#readingHistoryClose");
const list = document.querySelector("#readingHistoryList");
const status = document.querySelector("#readingHistoryStatus");
const summary = document.querySelector("#readingHistorySummary");

button?.addEventListener("click", openHistory);
closeButton?.addEventListener("click", closeHistory);
modal?.addEventListener("click", (event) => { if (event.target === modal) closeHistory(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !modal?.classList.contains("is-hidden")) closeHistory(); });

async function openHistory() {
  modal.classList.remove("is-hidden");
  document.body.classList.add("history-open");
  list.replaceChildren();
  summary.textContent = "";
  status.textContent = "正在載入本人閱讀歷史……";
  try {
    const session = readSession();
    const auth = getAuth(getApp());
    if (!auth.currentUser || !session?.classId || !session?.studentId) throw new Error("請先安全登入學生帳戶。");
    const studentKey = `${session.classId}__${session.studentId}`;
    const snapshot = await getDocs(query(
      collection(getFirestore(getApp()), "bookLogs"),
      where("studentKey", "==", studentKey),
    ));
    const records = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => timeOf(b) - timeOf(a));
    render(records, session.studentId);
  } catch (error) {
    console.error(error);
    status.textContent = error?.message || "未能載入閱讀歷史。";
    status.classList.add("is-error");
  }
}

function closeHistory() {
  modal?.classList.add("is-hidden");
  document.body.classList.remove("history-open");
  button?.focus();
}

function render(records, studentId) {
  status.classList.remove("is-error");
  const distance = records.reduce((sum, item) => sum + Number(item.distanceAwarded || 0), 0);
  summary.textContent = `${studentId} · ${records.length} 本書 · ${number(distance)} 里`;
  status.textContent = records.length ? `已顯示 ${records.length} 項本人紀錄` : "暫時未有閱讀紀錄。";
  list.replaceChildren(...records.map((record, index) => card(record, index)));
}

function card(record, index) {
  const article = document.createElement("article");
  article.className = "history-record";
  const numberLabel = document.createElement("span");
  numberLabel.className = "history-record-number";
  numberLabel.textContent = String(index + 1);
  const body = document.createElement("div");
  body.className = "history-record-body";
  const heading = document.createElement("div");
  heading.className = "history-record-heading";
  const title = document.createElement("strong");
  title.textContent = record.title ? `《${record.title}》` : "未命名讀物";
  const distance = document.createElement("span");
  distance.className = "history-record-distance";
  distance.textContent = `+${number(record.distanceAwarded)} 里`;
  heading.append(title, distance);
  const author = document.createElement("p");
  author.className = "history-record-author";
  author.textContent = `作者：${record.author || "未填寫"}`;
  const meta = document.createElement("div");
  meta.className = "history-record-meta";
  [record.submissionDateKey || record.readingDate || "日期未填寫", record.readingType || "未選類別", record.subject || "未選科目", record.completed === "yes" ? "已完成" : "未完成"].forEach((text) => {
    const tag = document.createElement("span");
    tag.textContent = text;
    meta.append(tag);
  });
  body.append(heading, author, meta);
  article.append(numberLabel, body);
  return article;
}

function readSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}
function timeOf(record) {
  if (record.createdAt?.toMillis) return record.createdAt.toMillis();
  return Date.parse(record.clientCreatedAt || record.readingDate || "") || 0;
}
function number(value) { return new Intl.NumberFormat("zh-HK").format(Number(value || 0)); }
