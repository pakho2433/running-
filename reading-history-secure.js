import { getApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, getDocs, getFirestore, limit, orderBy, query, startAfter, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { APP_CONFIG } from "./app-config.js";

const SESSION_KEY = "reading-run-session-v2";
const PAGE_SIZE = Math.min(50, Math.max(1, Number(APP_CONFIG.historyPageSize || 50)));
const button = document.querySelector("#readingBuddyButton");
const modal = document.querySelector("#readingHistoryModal");
const closeButton = document.querySelector("#readingHistoryClose");
const loadMoreButton = document.querySelector("#readingHistoryLoadMore");
const list = document.querySelector("#readingHistoryList");
const status = document.querySelector("#readingHistoryStatus");
const summary = document.querySelector("#readingHistorySummary");

let records = [];
let lastDocument = null;
let hasMore = false;
let loading = false;

button?.addEventListener("click", openHistory);
closeButton?.addEventListener("click", closeHistory);
loadMoreButton?.addEventListener("click", () => loadPage(false));
modal?.addEventListener("click", (event) => { if (event.target === modal) closeHistory(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !modal?.classList.contains("is-hidden")) closeHistory(); });

async function openHistory() {
  modal.classList.remove("is-hidden");
  document.body.classList.add("history-open");
  records = [];
  lastDocument = null;
  hasMore = false;
  list.replaceChildren();
  summary.textContent = "";
  status.classList.remove("is-error");
  loadMoreButton?.classList.add("is-hidden");
  await loadPage(true);
}

async function loadPage(reset) {
  if (loading || (!reset && !hasMore)) return;
  loading = true;
  if (loadMoreButton) loadMoreButton.disabled = true;
  status.textContent = reset ? "正在載入本學年閱讀紀錄……" : "正在載入更多紀錄……";
  try {
    const session = readSession();
    const auth = getAuth(getApp());
    if (
      !auth.currentUser
      || session?.role !== "student"
      || session?.schoolYear !== APP_CONFIG.schoolYear
      || !session?.studentKey
    ) {
      throw new Error("請先安全登入學生帳戶。");
    }

    const constraints = [
      where("studentKey", "==", session.studentKey),
      where("schoolYear", "==", APP_CONFIG.schoolYear),
      where("authUid", "==", auth.currentUser.uid),
      orderBy("createdAt", "desc"),
      limit(PAGE_SIZE),
    ];
    if (!reset && lastDocument) constraints.splice(4, 0, startAfter(lastDocument));
    const snapshot = await getDocs(query(
      collection(getFirestore(getApp()), "bookLogs"),
      ...constraints,
    ));
    const page = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    records = reset ? page : [...records, ...page];
    lastDocument = snapshot.docs[snapshot.docs.length - 1] || lastDocument;
    hasMore = snapshot.size === PAGE_SIZE;
    render(records);
  } catch (error) {
    console.error("Reading history load failed", error);
    status.textContent = error?.code === "permission-denied"
      ? "未獲授權讀取閱讀紀錄，請重新登入。"
      : (error?.message || "未能載入閱讀紀錄。");
    status.classList.add("is-error");
    hasMore = false;
  } finally {
    loading = false;
    if (loadMoreButton) {
      loadMoreButton.disabled = false;
      loadMoreButton.classList.toggle("is-hidden", !hasMore);
    }
  }
}

function closeHistory() {
  modal?.classList.add("is-hidden");
  document.body.classList.remove("history-open");
  button?.focus();
}

function render(items) {
  status.classList.remove("is-error");
  const distance = items.reduce((sum, item) => sum + Number(item.distanceAwarded || 0), 0);
  summary.textContent = `${APP_CONFIG.schoolYear} · 已載入 ${items.length} 本書 · ${number(distance)} 里`;
  if (!items.length) status.textContent = "本學年尚未有閱讀紀錄。";
  else status.textContent = hasMore ? `已載入最近 ${items.length} 項；可繼續載入。` : `已載入全部 ${items.length} 項紀錄。`;
  list.replaceChildren(...items.map((record, index) => card(record, index)));
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
  title.textContent = record.title ? `《${record.title}》` : "未命名書本";
  const distance = document.createElement("span");
  distance.className = "history-record-distance";
  distance.textContent = `+${number(record.distanceAwarded)} 里`;
  heading.append(title, distance);
  const author = document.createElement("p");
  author.className = "history-record-author";
  author.textContent = `作者：${record.author || "未有資料"}`;
  const meta = document.createElement("div");
  meta.className = "history-record-meta";
  [
    record.submissionDateKey || record.readingDate || "日期未有資料",
    record.readingType || "未選讀物類別",
    record.subject || "未選科目",
    record.completed === "yes" ? "已完成" : "未完成",
  ].forEach((text) => {
    const tag = document.createElement("span");
    tag.textContent = text;
    meta.append(tag);
  });
  body.append(heading, author, meta);
  article.append(numberLabel, body);
  return article;
}

function readSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}

function number(value) { return new Intl.NumberFormat("zh-HK").format(Number(value || 0)); }
