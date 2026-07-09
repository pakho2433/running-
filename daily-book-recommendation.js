import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  doc,
  getFirestore,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const COLLECTION = "dailyRecommendations";
const DEFAULT_PLATFORM_URL = "https://twghscysps.nblib.com";
const SCHOOL_TIME_ZONE = "Asia/Hong_Kong";

const state = {
  db: null,
  studentUnsubscribe: null,
};

const studentUi = installStudentRecommendationCard();
observeStudentSession();

function installStudentRecommendationCard() {
  const contentArea = document.querySelector(".content-area");
  if (!contentArea) return null;

  const section = document.createElement("section");
  section.id = "dailyBookRecommendation";
  section.className = "daily-book-card is-hidden";
  section.setAttribute("aria-labelledby", "dailyBookTitle");
  section.innerHTML = `
    <div class="daily-book-cover-wrap">
      <img class="daily-book-cover" alt="今日好書封面" />
      <div class="daily-book-cover-fallback" aria-hidden="true">📚</div>
    </div>
    <div class="daily-book-content">
      <p class="daily-book-eyebrow">DAILY BOOK · 每天一本好書推介</p>
      <h2 id="dailyBookTitle">今日好書</h2>
      <p class="daily-book-author"></p>
      <p class="daily-book-notice">按下「我要閱讀」後會開啟學校電子書平台。學生需自行登入；本平台不會儲存或自動輸入電子書帳號及密碼。</p>
      <a class="daily-book-read-button" href="${DEFAULT_PLATFORM_URL}" target="_blank" rel="noopener noreferrer">📖 我要閱讀</a>
    </div>
  `;
  contentArea.prepend(section);

  const cover = section.querySelector(".daily-book-cover");
  cover.addEventListener("load", () => section.classList.add("has-cover"));
  cover.addEventListener("error", () => {
    section.classList.remove("has-cover");
    cover.removeAttribute("src");
  });

  return {
    section,
    cover,
    title: section.querySelector("#dailyBookTitle"),
    author: section.querySelector(".daily-book-author"),
    button: section.querySelector(".daily-book-read-button"),
  };
}

function observeStudentSession() {
  const appShell = document.querySelector("#appShell");
  if (!appShell || !studentUi) return;

  let lastVisible = null;
  const sync = () => {
    const visible = !appShell.classList.contains("is-hidden");
    if (visible === lastVisible) return;
    lastVisible = visible;
    if (visible) startTodayRecommendation();
    else stopTodayRecommendation();
  };

  new MutationObserver(sync).observe(appShell, {
    attributes: true,
    attributeFilter: ["class"],
  });
  sync();
  setInterval(() => {
    if (lastVisible) startTodayRecommendation(true);
  }, 60_000);
}

async function startTodayRecommendation(dateCheckOnly = false) {
  if (!studentUi) return;
  const today = schoolDateKey();
  if (dateCheckOnly && studentUi.section.dataset.dateKey === today) return;

  stopTodayRecommendation(false);
  studentUi.section.dataset.dateKey = today;

  try {
    const db = await getDatabase();
    state.studentUnsubscribe = onSnapshot(doc(db, COLLECTION, today), (snapshot) => {
      if (!snapshot.exists()) {
        studentUi.section.classList.add("is-hidden");
        return;
      }
      renderStudentRecommendation({ dateKey: snapshot.id, ...snapshot.data() });
    }, (error) => {
      console.error("Unable to load daily book recommendation", error);
      studentUi.section.classList.add("is-hidden");
    });
  } catch (error) {
    console.error(error);
    studentUi.section.classList.add("is-hidden");
  }
}

function stopTodayRecommendation(clear = true) {
  state.studentUnsubscribe?.();
  state.studentUnsubscribe = null;
  if (clear && studentUi) {
    studentUi.section.classList.add("is-hidden");
    delete studentUi.section.dataset.dateKey;
  }
}

function renderStudentRecommendation(record) {
  const platformUrl = safeHttpsUrl(record.platformUrl) || DEFAULT_PLATFORM_URL;
  const coverUrl = safeHttpsUrl(record.coverUrl);

  studentUi.title.textContent = record.title || "今日好書";
  studentUi.author.textContent = record.author ? `作者：${record.author}` : "作者：未提供";
  studentUi.button.href = platformUrl;
  studentUi.button.setAttribute("aria-label", `前往電子書平台閱讀《${record.title || "今日好書"}》`);

  studentUi.section.classList.remove("has-cover");
  if (coverUrl) {
    studentUi.cover.src = coverUrl;
    studentUi.cover.alt = `《${record.title || "今日好書"}》封面`;
  } else {
    studentUi.cover.removeAttribute("src");
  }
  studentUi.section.classList.remove("is-hidden");
}

async function getDatabase() {
  if (state.db) return state.db;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  if (!auth.currentUser) await signInAnonymously(auth);
  state.db = getFirestore(app);
  return state.db;
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

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}
