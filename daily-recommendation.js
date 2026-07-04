import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getFirestore, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const COLLECTION_NAME = "dailyRecommendations";
const SCHOOL_TIME_ZONE = "Asia/Hong_Kong";
const DEFAULT_PLATFORM_URL = "https://twghscysps.nblib.com";

const appShell = document.querySelector("#appShell");
const contentArea = document.querySelector(".content-area");

const state = {
  dateKey: schoolDateKey(),
  unsubscribe: null,
  recommendation: null,
  loading: true,
};

let section;
let cover;
let dateLabel;
let titleLabel;
let authorLabel;
let gradeLabel;
let summaryLabel;
let reasonLabel;
let actionLink;
let statusLabel;

if (appShell && contentArea) {
  buildRecommendationSection();
  subscribeToToday();
  new MutationObserver(renderVisibility).observe(appShell, {
    attributes: true,
    attributeFilter: ["class"],
  });
  setInterval(checkDateChange, 30_000);
}

function buildRecommendationSection() {
  section = document.createElement("section");
  section.className = "daily-recommendation-section";
  section.setAttribute("aria-labelledby", "dailyRecommendationTitle");
  section.innerHTML = `
    <div class="daily-recommendation-ribbon">📚 每天一本好書推介</div>
    <div class="daily-recommendation-card">
      <div class="daily-recommendation-cover-wrap">
        <img class="daily-recommendation-cover" alt="今日推介書本封面" loading="lazy" />
        <div class="daily-recommendation-cover-fallback" aria-hidden="true">
          <span>📖</span>
          <strong>今日好書</strong>
        </div>
      </div>
      <div class="daily-recommendation-content">
        <div class="daily-recommendation-heading">
          <div>
            <p class="daily-recommendation-date"></p>
            <h2 id="dailyRecommendationTitle">正在載入今日好書……</h2>
            <p class="daily-recommendation-author"></p>
          </div>
          <span class="daily-recommendation-grade"></span>
        </div>
        <p class="daily-recommendation-summary"></p>
        <div class="daily-recommendation-reason-wrap">
          <strong>✨ 推介原因</strong>
          <p class="daily-recommendation-reason"></p>
        </div>
        <a class="daily-recommendation-action" href="${DEFAULT_PLATFORM_URL}" target="_blank" rel="noopener noreferrer">
          <strong>📖 我要閱讀</strong>
          <span>前往電子書平台閱讀 ↗</span>
        </a>
        <p class="daily-recommendation-note">按下後會在新分頁開啟電子書平台。學生需自行登入；本平台不會儲存電子書帳號或密碼。</p>
        <p class="daily-recommendation-status" role="status"></p>
      </div>
    </div>
  `;

  const overview = contentArea.querySelector(".overview-section");
  contentArea.insertBefore(section, overview || contentArea.firstChild);

  cover = section.querySelector(".daily-recommendation-cover");
  dateLabel = section.querySelector(".daily-recommendation-date");
  titleLabel = section.querySelector("#dailyRecommendationTitle");
  authorLabel = section.querySelector(".daily-recommendation-author");
  gradeLabel = section.querySelector(".daily-recommendation-grade");
  summaryLabel = section.querySelector(".daily-recommendation-summary");
  reasonLabel = section.querySelector(".daily-recommendation-reason");
  actionLink = section.querySelector(".daily-recommendation-action");
  statusLabel = section.querySelector(".daily-recommendation-status");

  cover.addEventListener("load", () => {
    section.classList.add("has-cover");
  });
  cover.addEventListener("error", () => {
    section.classList.remove("has-cover");
    cover.removeAttribute("src");
  });
  renderVisibility();
}

async function subscribeToToday() {
  state.unsubscribe?.();
  state.unsubscribe = null;
  state.loading = true;
  renderRecommendation();

  try {
    const db = await getDatabase();
    const reference = doc(db, COLLECTION_NAME, state.dateKey);
    state.unsubscribe = onSnapshot(reference, (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : null;
      state.recommendation = data?.published === false ? null : data;
      state.loading = false;
      renderRecommendation();
    }, (error) => {
      console.error("Unable to load daily recommendation", error);
      state.recommendation = null;
      state.loading = false;
      renderRecommendation("暫時未能載入今日推介，請稍後再試。");
    });
  } catch (error) {
    console.error(error);
    state.recommendation = null;
    state.loading = false;
    renderRecommendation("暫時未能連接今日推介。");
  }
}

function renderRecommendation(errorMessage = "") {
  if (!section) return;
  const recommendation = state.recommendation;
  dateLabel.textContent = formatDate(state.dateKey);
  section.classList.toggle("is-empty", !recommendation);

  if (state.loading) {
    titleLabel.textContent = "正在載入今日好書……";
    authorLabel.textContent = "";
    gradeLabel.textContent = "";
    summaryLabel.textContent = "請稍候片刻。";
    reasonLabel.textContent = "";
    actionLink.classList.add("is-disabled");
    actionLink.setAttribute("aria-disabled", "true");
    statusLabel.textContent = "";
    setCover("");
    return;
  }

  if (!recommendation) {
    titleLabel.textContent = "今日好書尚未設定";
    authorLabel.textContent = "老師設定後會在這裡顯示書名及作者。";
    gradeLabel.textContent = "";
    summaryLabel.textContent = "你仍可前往學校電子書平台自由選書閱讀。";
    reasonLabel.textContent = "培養每日閱讀習慣，探索更多有趣知識。";
    actionLink.href = DEFAULT_PLATFORM_URL;
    actionLink.classList.remove("is-disabled");
    actionLink.removeAttribute("aria-disabled");
    statusLabel.textContent = errorMessage;
    setCover("");
    return;
  }

  titleLabel.textContent = cleanText(recommendation.title, 120) || "今日好書";
  authorLabel.textContent = recommendation.author
    ? `作者：${cleanText(recommendation.author, 100)}`
    : "作者：未有資料";
  gradeLabel.textContent = cleanText(recommendation.grade, 40) || "全校適讀";
  summaryLabel.textContent = cleanText(recommendation.summary, 600) || "歡迎登入電子書平台了解這本好書。";
  reasonLabel.textContent = cleanText(recommendation.reason, 500) || "今天一起閱讀一本好書！";
  actionLink.href = safePlatformUrl(recommendation.platformUrl);
  actionLink.classList.remove("is-disabled");
  actionLink.removeAttribute("aria-disabled");
  statusLabel.textContent = "";
  setCover(recommendation.coverUrl);
}

function setCover(value) {
  const url = safeImageUrl(value);
  section.classList.remove("has-cover");
  if (!url) {
    cover.removeAttribute("src");
    return;
  }
  cover.src = url;
}

function renderVisibility() {
  if (!section || !appShell) return;
  section.classList.toggle("is-login-hidden", appShell.classList.contains("is-hidden"));
}

function checkDateChange() {
  const nextDateKey = schoolDateKey();
  if (nextDateKey === state.dateKey) return;
  state.dateKey = nextDateKey;
  state.recommendation = null;
  subscribeToToday();
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

function formatDate(dateKey) {
  const date = new Date(`${dateKey}T00:00:00+08:00`);
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: SCHOOL_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function safePlatformUrl(value) {
  try {
    const url = new URL(String(value || DEFAULT_PLATFORM_URL));
    const allowedHost = url.hostname === "twghscysps.nblib.com";
    return url.protocol === "https:" && allowedHost ? url.href : DEFAULT_PLATFORM_URL;
  } catch {
    return DEFAULT_PLATFORM_URL;
  }
}

function safeImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function cleanText(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}
