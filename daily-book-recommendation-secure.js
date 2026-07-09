import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { doc, getFirestore, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const DEFAULT_PLATFORM_URL = "https://twghscysps.nblib.com";
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const contentArea = document.querySelector(".content-area");
const appShell = document.querySelector("#appShell");
let unsubscribe = null;
let currentDate = "";

const ui = contentArea ? installCard() : null;

if (ui && appShell) {
  const sync = () => {
    const visible = !appShell.classList.contains("is-hidden");
    if (!visible) return stop();
    const dateKey = schoolDateKey();
    if (dateKey !== currentDate) start(dateKey);
  };
  new MutationObserver(sync).observe(appShell, { attributes: true, attributeFilter: ["class"] });
  setInterval(sync, 60_000);
  sync();
}

function installCard() {
  const section = document.createElement("section");
  section.id = "dailyBookRecommendation";
  section.className = "daily-book-card is-hidden";
  section.innerHTML = `
    <div class="daily-book-cover-wrap"><img class="daily-book-cover" alt="今日好書封面" /><div class="daily-book-cover-fallback">📚</div></div>
    <div class="daily-book-content">
      <p class="daily-book-eyebrow">DAILY BOOK · 每天一本好書推介</p>
      <h2>今日好書</h2><p class="daily-book-author"></p>
      <p class="daily-book-notice">按下「我要閱讀」後會開啟學校電子書平台。學生需自行登入；本平台不會儲存或自動輸入電子書帳號及密碼。</p>
      <a class="daily-book-read-button" href="${DEFAULT_PLATFORM_URL}" target="_blank" rel="noopener noreferrer">📖 我要閱讀</a>
    </div>`;
  contentArea.prepend(section);
  const cover = section.querySelector("img");
  cover.addEventListener("load", () => section.classList.add("has-cover"));
  cover.addEventListener("error", () => {
    section.classList.remove("has-cover");
    cover.removeAttribute("src");
  });
  return {
    section,
    cover,
    title: section.querySelector("h2"),
    author: section.querySelector(".daily-book-author"),
    button: section.querySelector("a"),
  };
}

function start(dateKey) {
  stop(false);
  currentDate = dateKey;
  unsubscribe = onSnapshot(doc(db, "dailyRecommendations", dateKey), (snapshot) => {
    if (!snapshot.exists()) {
      ui.section.classList.add("is-hidden");
      return;
    }
    const record = snapshot.data() || {};
    const platformUrl = safeHttps(record.platformUrl) || DEFAULT_PLATFORM_URL;
    const coverUrl = safeHttps(record.coverUrl);
    ui.title.textContent = record.title || "今日好書";
    ui.author.textContent = record.author ? `作者：${record.author}` : "作者：未提供";
    ui.button.href = platformUrl;
    ui.button.setAttribute("aria-label", `前往閱讀《${record.title || "今日好書"}》`);
    if (coverUrl) {
      ui.cover.src = coverUrl;
      ui.cover.alt = `《${record.title || "今日好書"}》封面`;
    } else {
      ui.cover.removeAttribute("src");
    }
    ui.section.classList.remove("is-hidden");
  }, (error) => {
    console.error("Daily recommendation read failed", error);
    ui.section.classList.add("is-hidden");
  });
}

function stop(clear = true) {
  unsubscribe?.();
  unsubscribe = null;
  if (clear && ui) ui.section.classList.add("is-hidden");
}

function safeHttps(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function schoolDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
