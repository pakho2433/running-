const buddyButton = document.querySelector("#readingBuddyButton");
const modal = document.querySelector("#readingHistoryModal");
const closeButton = document.querySelector("#readingHistoryClose");
const list = document.querySelector("#readingHistoryList");
const status = document.querySelector("#readingHistoryStatus");
const summary = document.querySelector("#readingHistorySummary");
const SESSION_KEY = "reading-run-session-v1";
const HISTORY_PREFIX = "reading-run-local-history-v1";

if (buddyButton && modal && closeButton && list && status && summary) {
  buddyButton.addEventListener("click", openHistory);
  closeButton.addEventListener("click", closeHistory);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeHistory();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("is-hidden")) closeHistory();
  });
}

function openHistory() {
  modal.classList.remove("is-hidden");
  document.body.classList.add("history-open");
  closeButton.focus();
  status.classList.remove("is-error");
  summary.textContent = "";
  list.replaceChildren();

  const session = readJson(SESSION_KEY, null);
  if (!session?.classId || !session?.studentId) {
    status.textContent = "請先登入學生帳戶。";
    status.classList.add("is-error");
    return;
  }

  const studentKey = `${session.classId}__${session.studentId}`;
  const records = readJson(`${HISTORY_PREFIX}__${studentKey}`, [])
    .slice()
    .sort((a, b) => recordTime(b) - recordTime(a));
  renderHistory(records, session.studentId);
}

function closeHistory() {
  modal.classList.add("is-hidden");
  document.body.classList.remove("history-open");
  buddyButton.focus();
}

function renderHistory(records, studentId) {
  status.classList.remove("is-error");
  if (!records.length) {
    status.textContent = "此裝置暫時未有閱讀紀錄。提交第一本書後，紀錄會顯示在這裏。";
    summary.textContent = `${studentId} · 0 本書`;
    return;
  }

  const totalDistance = records.reduce((sum, record) => sum + Number(record.distanceAwarded || 0), 0);
  summary.textContent = `${studentId} · ${records.length} 本書 · 共獲 ${formatNumber(totalDistance)} 里`;
  status.textContent = `已顯示此裝置保存的 ${records.length} 項紀錄`;

  const fragment = document.createDocumentFragment();
  records.forEach((record, index) => fragment.append(makeHistoryCard(record, index)));
  list.replaceChildren(fragment);
}

function makeHistoryCard(record, index) {
  const article = document.createElement("article");
  article.className = "history-record";

  const number = document.createElement("span");
  number.className = "history-record-number";
  number.textContent = String(index + 1);

  const body = document.createElement("div");
  body.className = "history-record-body";

  const heading = document.createElement("div");
  heading.className = "history-record-heading";

  const title = document.createElement("strong");
  title.textContent = record.title ? `《${record.title}》` : "未命名讀物";

  const distance = document.createElement("span");
  distance.className = "history-record-distance";
  distance.textContent = `+${formatNumber(record.distanceAwarded)} 里`;
  heading.append(title, distance);

  const author = document.createElement("p");
  author.className = "history-record-author";
  author.textContent = `作者：${record.author || "未填寫"}`;

  const meta = document.createElement("div");
  meta.className = "history-record-meta";
  [
    displayDate(record),
    record.readingType || "未選讀物類別",
    record.subject || "未選科目",
    record.completed === "yes" ? "已完成" : "未完成／未選擇",
  ].forEach((text) => {
    const tag = document.createElement("span");
    tag.textContent = text;
    meta.append(tag);
  });

  body.append(heading, author, meta);
  article.append(number, body);
  return article;
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function recordTime(record) {
  const clientTime = Date.parse(record.clientCreatedAt || "");
  if (Number.isFinite(clientTime)) return clientTime;
  const readingTime = Date.parse(record.readingDate || "");
  return Number.isFinite(readingTime) ? readingTime : 0;
}

function displayDate(record) {
  const source = record.readingDate || record.clientCreatedAt || "";
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return "日期未填寫";
  return new Intl.DateTimeFormat("zh-HK", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatNumber(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat("zh-HK").format(Number.isFinite(number) ? number : 0);
}
