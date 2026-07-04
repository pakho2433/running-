import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const COLLECTION = "dailyRecommendations";
const DEFAULT_PLATFORM_URL = "https://twghscysps.nblib.com";
const TEACHER_SESSION_KEY = "readingrun-teacher-session-v1";
const SCHOOL_TIME_ZONE = "Asia/Hong_Kong";

const state = {
  db: null,
  studentUnsubscribe: null,
  teacherRows: [],
  saving: false,
};

const studentUi = installStudentRecommendationCard();
observeStudentSession();
waitForTeacherDashboard();

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

function waitForTeacherDashboard() {
  const tryInstall = () => {
    const dashboard = document.querySelector(".teacher-dashboard-view");
    if (!dashboard || dashboard.querySelector("#teacherRecommendationManager")) return false;
    installTeacherManager(dashboard);
    return true;
  };

  if (tryInstall()) return;
  const observer = new MutationObserver(() => {
    if (tryInstall()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function installTeacherManager(dashboard) {
  const section = document.createElement("section");
  section.id = "teacherRecommendationManager";
  section.className = "teacher-recommendation-manager";
  section.innerHTML = `
    <div class="teacher-recommendation-heading">
      <div>
        <p>DAILY BOOK SCHEDULER</p>
        <h3>每天一本好書推介</h3>
        <span>預先安排未來多日的書本，學生登入後只會看到當日推介。</span>
      </div>
      <button class="teacher-secondary-button" id="teacherRecommendationReload" type="button">↻ 更新推介</button>
    </div>

    <form id="teacherRecommendationForm" class="teacher-recommendation-form">
      <input type="hidden" name="originalDateKey" />
      <label>
        <span>推介日期</span>
        <input name="dateKey" type="date" required />
      </label>
      <label>
        <span>書名</span>
        <input name="title" type="text" maxlength="120" required placeholder="輸入書名" />
      </label>
      <label>
        <span>作者</span>
        <input name="author" type="text" maxlength="120" required placeholder="輸入作者" />
      </label>
      <label class="teacher-recommendation-wide">
        <span>封面圖片網址</span>
        <input name="coverUrl" type="url" maxlength="500" placeholder="https://...（可留空）" />
      </label>
      <label class="teacher-recommendation-wide">
        <span>電子書平台連結</span>
        <input name="platformUrl" type="url" maxlength="500" required value="${DEFAULT_PLATFORM_URL}" />
      </label>
      <div class="teacher-recommendation-actions teacher-recommendation-wide">
        <button class="teacher-primary-button" type="submit">儲存每日推介</button>
        <button class="teacher-secondary-button" id="teacherRecommendationCancel" type="button">清除表格</button>
      </div>
    </form>

    <p id="teacherRecommendationStatus" class="teacher-recommendation-status" role="status"></p>

    <div class="teacher-recommendation-list-wrap">
      <table class="teacher-recommendation-table">
        <thead><tr><th>日期</th><th>封面</th><th>書名</th><th>作者</th><th>電子平台</th><th>操作</th></tr></thead>
        <tbody id="teacherRecommendationList"><tr><td colspan="6">登入後載入推介排程。</td></tr></tbody>
      </table>
    </div>
  `;

  const exportInfo = dashboard.querySelector(".teacher-export-info");
  if (exportInfo) exportInfo.insertAdjacentElement("beforebegin", section);
  else dashboard.append(section);

  const form = section.querySelector("#teacherRecommendationForm");
  const status = section.querySelector("#teacherRecommendationStatus");
  const list = section.querySelector("#teacherRecommendationList");

  form.elements.dateKey.value = schoolDateKey();
  form.addEventListener("submit", (event) => saveRecommendation(event, form, status, list));
  section.querySelector("#teacherRecommendationReload").addEventListener("click", () => loadRecommendations(status, list));
  section.querySelector("#teacherRecommendationCancel").addEventListener("click", () => resetRecommendationForm(form, status));

  const teacherModal = document.querySelector("#teacherCenterModal");
  new MutationObserver(() => {
    const dashboardVisible = !dashboard.classList.contains("is-hidden");
    if (dashboardVisible && teacherSessionValid()) loadRecommendations(status, list);
  }).observe(dashboard, { attributes: true, attributeFilter: ["class"] });
}

async function loadRecommendations(status, list) {
  if (!teacherSessionValid()) return;
  status.textContent = "正在載入推介排程……";
  status.dataset.state = "loading";
  try {
    const db = await getDatabase();
    const snapshot = await getDocs(collection(db, COLLECTION));
    state.teacherRows = snapshot.docs
      .map((item) => ({ dateKey: item.id, ...item.data() }))
      .sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)));
    renderRecommendationList(list, status);
  } catch (error) {
    console.error("Unable to load recommendations", error);
    status.textContent = "未能載入推介排程，請檢查 Firebase 權限。";
    status.dataset.state = "error";
  }
}

function renderRecommendationList(list, status) {
  list.replaceChildren();
  if (!state.teacherRows.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="6">尚未設定任何每日好書推介。</td>';
    list.append(row);
    status.textContent = "目前沒有推介排程。";
    status.dataset.state = "ready";
    return;
  }

  state.teacherRows.forEach((record) => {
    const row = document.createElement("tr");
    const coverUrl = safeHttpsUrl(record.coverUrl);
    const platformUrl = safeHttpsUrl(record.platformUrl) || DEFAULT_PLATFORM_URL;
    row.innerHTML = `
      <td>${escapeHtml(record.dateKey)}</td>
      <td>${coverUrl ? `<img class="teacher-recommendation-thumb" src="${escapeHtml(coverUrl)}" alt="" />` : "📚"}</td>
      <td>${escapeHtml(record.title || "")}</td>
      <td>${escapeHtml(record.author || "")}</td>
      <td><a href="${escapeHtml(platformUrl)}" target="_blank" rel="noopener noreferrer">開啟</a></td>
      <td class="teacher-recommendation-row-actions"></td>
    `;

    const actions = row.querySelector(".teacher-recommendation-row-actions");
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "編輯";
    editButton.addEventListener("click", () => editRecommendation(record));
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "刪除";
    deleteButton.className = "is-danger";
    deleteButton.addEventListener("click", () => removeRecommendation(record.dateKey, status, list));
    actions.append(editButton, deleteButton);
    list.append(row);
  });

  status.textContent = `已載入 ${state.teacherRows.length} 日推介排程。`;
  status.dataset.state = "ready";
}

async function saveRecommendation(event, form, status, list) {
  event.preventDefault();
  if (!teacherSessionValid() || state.saving) return;

  const dateKey = String(form.elements.dateKey.value || "");
  const title = clean(form.elements.title.value, 120);
  const author = clean(form.elements.author.value, 120);
  const coverUrl = safeOptionalUrl(form.elements.coverUrl.value);
  const platformUrl = safeHttpsUrl(form.elements.platformUrl.value);
  const originalDateKey = String(form.elements.originalDateKey.value || "");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !title || !author || !platformUrl) {
    status.textContent = "請輸入有效日期、書名、作者及 HTTPS 電子平台連結。";
    status.dataset.state = "error";
    return;
  }
  if (form.elements.coverUrl.value.trim() && !coverUrl) {
    status.textContent = "封面圖片網址必須是有效的 HTTPS 網址。";
    status.dataset.state = "error";
    return;
  }

  state.saving = true;
  setRecommendationFormBusy(form, true);
  status.textContent = "正在儲存推介……";
  status.dataset.state = "loading";

  try {
    const db = await getDatabase();
    await setDoc(doc(db, COLLECTION, dateKey), {
      dateKey,
      title,
      author,
      coverUrl: coverUrl || "",
      platformUrl,
      updatedAt: serverTimestamp(),
    });
    if (originalDateKey && originalDateKey !== dateKey) {
      await deleteDoc(doc(db, COLLECTION, originalDateKey));
    }
    resetRecommendationForm(form, status);
    status.textContent = `已儲存 ${dateKey} 的好書推介。`;
    status.dataset.state = "ready";
    await loadRecommendations(status, list);
  } catch (error) {
    console.error("Unable to save recommendation", error);
    status.textContent = "儲存失敗，請檢查 Firebase 權限及網絡。";
    status.dataset.state = "error";
  } finally {
    state.saving = false;
    setRecommendationFormBusy(form, false);
  }
}

function editRecommendation(record) {
  const form = document.querySelector("#teacherRecommendationForm");
  const status = document.querySelector("#teacherRecommendationStatus");
  if (!form) return;
  form.elements.originalDateKey.value = record.dateKey || "";
  form.elements.dateKey.value = record.dateKey || schoolDateKey();
  form.elements.title.value = record.title || "";
  form.elements.author.value = record.author || "";
  form.elements.coverUrl.value = record.coverUrl || "";
  form.elements.platformUrl.value = record.platformUrl || DEFAULT_PLATFORM_URL;
  status.textContent = `正在編輯 ${record.dateKey} 的推介。`;
  status.dataset.state = "ready";
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function removeRecommendation(dateKey, status, list) {
  if (!teacherSessionValid()) return;
  const confirmed = window.confirm(`確定刪除 ${dateKey} 的每日好書推介？`);
  if (!confirmed) return;
  status.textContent = "正在刪除推介……";
  status.dataset.state = "loading";
  try {
    const db = await getDatabase();
    await deleteDoc(doc(db, COLLECTION, dateKey));
    await loadRecommendations(status, list);
  } catch (error) {
    console.error("Unable to delete recommendation", error);
    status.textContent = "刪除失敗，請檢查 Firebase 權限。";
    status.dataset.state = "error";
  }
}

function resetRecommendationForm(form, status) {
  form.reset();
  form.elements.originalDateKey.value = "";
  form.elements.dateKey.value = schoolDateKey();
  form.elements.platformUrl.value = DEFAULT_PLATFORM_URL;
  if (status) {
    status.textContent = "";
    status.dataset.state = "";
  }
}

function setRecommendationFormBusy(form, busy) {
  [...form.elements].forEach((element) => {
    if (element.type !== "hidden") element.disabled = busy;
  });
}

async function getDatabase() {
  if (state.db) return state.db;
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  if (!auth.currentUser) await signInAnonymously(auth);
  state.db = getFirestore(app);
  return state.db;
}

function teacherSessionValid() {
  try {
    const session = JSON.parse(sessionStorage.getItem(TEACHER_SESSION_KEY) || "null");
    return Boolean(session?.expiresAt && Number(session.expiresAt) > Date.now());
  } catch {
    return false;
  }
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

function safeOptionalUrl(value) {
  const text = String(value || "").trim();
  return text ? safeHttpsUrl(text) : "";
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function clean(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[character]));
}
