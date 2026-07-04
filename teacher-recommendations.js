import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const COLLECTION_NAME = "dailyRecommendations";
const TEACHER_SESSION_KEY = "readingrun-teacher-session-v1";
const DEFAULT_PLATFORM_URL = "https://twghscysps.nblib.com";
const SCHOOL_TIME_ZONE = "Asia/Hong_Kong";

const state = {
  recommendations: [],
  unsubscribe: null,
  editingDate: "",
  saving: false,
};

const dashboard = await waitForElement(".teacher-dashboard-view");
const panel = buildManagementPanel();
const ui = collectUi(panel);
bindEvents();
observeTeacherDashboard();

function buildManagementPanel() {
  const section = document.createElement("section");
  section.className = "teacher-recommendation-manager";
  section.setAttribute("aria-labelledby", "teacherRecommendationTitle");
  section.innerHTML = `
    <div class="teacher-recommendation-heading">
      <div>
        <p>DAILY BOOK RECOMMENDATION</p>
        <h3 id="teacherRecommendationTitle">每天一本好書推介</h3>
        <span>可預先安排未來多日的書籍。每個日期只會顯示一本推介。</span>
      </div>
      <button class="teacher-secondary-button teacher-recommendation-refresh" type="button">↻ 更新排程</button>
    </div>

    <div class="teacher-recommendation-layout">
      <form class="teacher-recommendation-form">
        <input name="originalDate" type="hidden" />
        <label>
          <span>推介日期 *</span>
          <input name="dateKey" type="date" required />
        </label>
        <label>
          <span>書名 *</span>
          <input name="title" type="text" maxlength="120" required placeholder="輸入書名" />
        </label>
        <label>
          <span>作者 *</span>
          <input name="author" type="text" maxlength="100" required placeholder="輸入作者名稱" />
        </label>
        <label>
          <span>封面圖片網址</span>
          <input name="coverUrl" type="url" maxlength="600" inputmode="url" placeholder="https://..." />
          <small>只接受 HTTPS 圖片網址；留空會顯示預設書本圖案。</small>
        </label>
        <label>
          <span>適合年級</span>
          <input name="grade" type="text" maxlength="40" placeholder="例如：小三至小六／全校" />
        </label>
        <label>
          <span>書籍簡介</span>
          <textarea name="summary" maxlength="600" rows="4" placeholder="簡單介紹書本內容"></textarea>
        </label>
        <label>
          <span>推介原因</span>
          <textarea name="reason" maxlength="500" rows="3" placeholder="為甚麼值得學生閱讀？"></textarea>
        </label>
        <label>
          <span>電子書平台連結 *</span>
          <input name="platformUrl" type="url" maxlength="600" inputmode="url" value="${DEFAULT_PLATFORM_URL}" required />
          <small>只接受學校電子書平台 twghscysps.nblib.com 的 HTTPS 連結。</small>
        </label>
        <label class="teacher-recommendation-published">
          <input name="published" type="checkbox" checked />
          <span>當日向學生公開顯示</span>
        </label>
        <div class="teacher-recommendation-form-actions">
          <button class="teacher-primary-button" type="submit">儲存推介</button>
          <button class="teacher-secondary-button teacher-recommendation-clear" type="button">清除表格</button>
        </div>
        <p class="teacher-recommendation-message" role="status"></p>
      </form>

      <div class="teacher-recommendation-list-wrap">
        <div class="teacher-recommendation-list-heading">
          <div>
            <strong>已安排推介</strong>
            <span>點選「編輯」可修改內容。</span>
          </div>
          <span class="teacher-recommendation-count">0 本</span>
        </div>
        <div class="teacher-recommendation-list" aria-live="polite">
          <p class="teacher-recommendation-empty">登入後載入排程。</p>
        </div>
      </div>
    </div>
  `;
  dashboard.append(section);
  return section;
}

function collectUi(section) {
  return {
    section,
    form: section.querySelector(".teacher-recommendation-form"),
    refresh: section.querySelector(".teacher-recommendation-refresh"),
    clear: section.querySelector(".teacher-recommendation-clear"),
    message: section.querySelector(".teacher-recommendation-message"),
    list: section.querySelector(".teacher-recommendation-list"),
    count: section.querySelector(".teacher-recommendation-count"),
  };
}

function bindEvents() {
  ui.form.addEventListener("submit", saveRecommendation);
  ui.refresh.addEventListener("click", subscribeRecommendations);
  ui.clear.addEventListener("click", resetForm);
}

function observeTeacherDashboard() {
  const observer = new MutationObserver(() => {
    if (!dashboard.classList.contains("is-hidden") && teacherSessionValid()) {
      subscribeRecommendations();
    }
  });
  observer.observe(dashboard, { attributes: true, attributeFilter: ["class"] });

  if (!dashboard.classList.contains("is-hidden") && teacherSessionValid()) {
    subscribeRecommendations();
  }
}

async function subscribeRecommendations() {
  if (!teacherSessionValid()) {
    setMessage("請先登入教師數據中心。", true);
    return;
  }

  state.unsubscribe?.();
  state.unsubscribe = null;
  ui.list.replaceChildren(makeStatus("正在載入好書排程……"));

  try {
    const db = await getDatabase();
    state.unsubscribe = onSnapshot(collection(db, COLLECTION_NAME), (snapshot) => {
      state.recommendations = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderRecommendationList();
    }, (error) => {
      console.error("Unable to load recommendation schedule", error);
      ui.list.replaceChildren(makeStatus("未能載入排程，請檢查 Firebase 權限。", true));
    });
  } catch (error) {
    console.error(error);
    ui.list.replaceChildren(makeStatus("未能連接好書排程資料。", true));
  }
}

async function saveRecommendation(event) {
  event.preventDefault();
  if (!teacherSessionValid()) {
    setMessage("教師登入已逾時，請重新登入。", true);
    return;
  }
  if (state.saving) return;

  const formData = new FormData(ui.form);
  const dateKey = cleanText(formData.get("dateKey"), 10);
  const originalDate = cleanText(formData.get("originalDate"), 10);
  const title = cleanText(formData.get("title"), 120);
  const author = cleanText(formData.get("author"), 100);
  const coverUrl = cleanText(formData.get("coverUrl"), 600);
  const grade = cleanText(formData.get("grade"), 40);
  const summary = cleanText(formData.get("summary"), 600);
  const reason = cleanText(formData.get("reason"), 500);
  const platformUrl = cleanText(formData.get("platformUrl"), 600);
  const published = formData.get("published") === "on";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !title || !author) {
    setMessage("請填寫有效日期、書名及作者。", true);
    return;
  }
  if (coverUrl && !safeImageUrl(coverUrl)) {
    setMessage("封面圖片必須使用 HTTPS 網址。", true);
    return;
  }
  const safePlatform = safePlatformUrl(platformUrl);
  if (!safePlatform) {
    setMessage("電子書連結必須屬於 twghscysps.nblib.com。", true);
    return;
  }

  state.saving = true;
  toggleFormBusy(true);
  setMessage("正在儲存推介……");

  try {
    const db = await getDatabase();
    await setDoc(doc(db, COLLECTION_NAME, dateKey), {
      dateKey,
      title,
      author,
      coverUrl: coverUrl ? safeImageUrl(coverUrl) : "",
      grade,
      summary,
      reason,
      platformUrl: safePlatform,
      published,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    if (originalDate && originalDate !== dateKey) {
      await deleteDoc(doc(db, COLLECTION_NAME, originalDate));
    }

    setMessage(`已儲存 ${formatDate(dateKey)} 的好書推介。`);
    resetForm(false);
  } catch (error) {
    console.error("Unable to save recommendation", error);
    setMessage("儲存失敗，請檢查網絡及 Firebase 權限。", true);
  } finally {
    state.saving = false;
    toggleFormBusy(false);
  }
}

function renderRecommendationList() {
  ui.list.replaceChildren();
  const items = sortRecommendations(state.recommendations);
  ui.count.textContent = `${items.length} 本`;

  if (!items.length) {
    ui.list.append(makeStatus("尚未安排任何每日好書。"));
    return;
  }

  items.forEach((item) => {
    const article = document.createElement("article");
    article.className = "teacher-recommendation-item";
    if (item.dateKey === todayKey()) article.classList.add("is-today");
    if (item.published === false) article.classList.add("is-unpublished");

    const coverWrap = document.createElement("div");
    coverWrap.className = "teacher-recommendation-item-cover";
    const imageUrl = safeImageUrl(item.coverUrl);
    if (imageUrl) {
      const image = document.createElement("img");
      image.src = imageUrl;
      image.alt = `${cleanText(item.title, 120)}封面`;
      image.loading = "lazy";
      image.onerror = () => {
        image.remove();
        coverWrap.textContent = "📖";
      };
      coverWrap.append(image);
    } else {
      coverWrap.textContent = "📖";
    }

    const details = document.createElement("div");
    details.className = "teacher-recommendation-item-details";
    const date = document.createElement("span");
    date.className = "teacher-recommendation-item-date";
    date.textContent = `${formatDate(item.dateKey || item.id)}${item.dateKey === todayKey() ? " · 今日" : ""}`;
    const title = document.createElement("strong");
    title.textContent = cleanText(item.title, 120) || "未命名書籍";
    const author = document.createElement("small");
    author.textContent = `作者：${cleanText(item.author, 100) || "未填寫"}`;
    const meta = document.createElement("small");
    meta.textContent = `${cleanText(item.grade, 40) || "全校適讀"} · ${item.published === false ? "未公開" : "已公開"}`;
    details.append(date, title, author, meta);

    const actions = document.createElement("div");
    actions.className = "teacher-recommendation-item-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "teacher-secondary-button";
    editButton.textContent = "編輯";
    editButton.addEventListener("click", () => editRecommendation(item));
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "teacher-danger-button";
    deleteButton.textContent = "刪除";
    deleteButton.addEventListener("click", () => deleteRecommendation(item));
    actions.append(editButton, deleteButton);

    article.append(coverWrap, details, actions);
    ui.list.append(article);
  });
}

function editRecommendation(item) {
  ui.form.elements.originalDate.value = item.dateKey || item.id || "";
  ui.form.elements.dateKey.value = item.dateKey || item.id || "";
  ui.form.elements.title.value = item.title || "";
  ui.form.elements.author.value = item.author || "";
  ui.form.elements.coverUrl.value = item.coverUrl || "";
  ui.form.elements.grade.value = item.grade || "";
  ui.form.elements.summary.value = item.summary || "";
  ui.form.elements.reason.value = item.reason || "";
  ui.form.elements.platformUrl.value = safePlatformUrl(item.platformUrl) || DEFAULT_PLATFORM_URL;
  ui.form.elements.published.checked = item.published !== false;
  state.editingDate = item.dateKey || item.id || "";
  setMessage(`正在編輯 ${formatDate(state.editingDate)} 的推介。`);
  ui.form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function deleteRecommendation(item) {
  if (!teacherSessionValid()) {
    setMessage("教師登入已逾時，請重新登入。", true);
    return;
  }
  const dateKey = item.dateKey || item.id;
  const title = cleanText(item.title, 120) || "這本書";
  if (!window.confirm(`確定刪除 ${formatDate(dateKey)} 的《${title}》推介？`)) return;

  try {
    const db = await getDatabase();
    await deleteDoc(doc(db, COLLECTION_NAME, dateKey));
    if (state.editingDate === dateKey) resetForm(false);
    setMessage("推介已刪除。")
  } catch (error) {
    console.error("Unable to delete recommendation", error);
    setMessage("刪除失敗，請檢查網絡及 Firebase 權限。", true);
  }
}

function resetForm(clearMessage = true) {
  ui.form.reset();
  ui.form.elements.originalDate.value = "";
  ui.form.elements.dateKey.value = todayKey();
  ui.form.elements.platformUrl.value = DEFAULT_PLATFORM_URL;
  ui.form.elements.published.checked = true;
  state.editingDate = "";
  if (clearMessage) setMessage("");
}

function toggleFormBusy(busy) {
  [...ui.form.elements].forEach((element) => {
    element.disabled = busy;
  });
  ui.refresh.disabled = busy;
}

function setMessage(message, error = false) {
  ui.message.textContent = message;
  ui.message.dataset.state = error ? "error" : "ready";
}

function makeStatus(message, error = false) {
  const paragraph = document.createElement("p");
  paragraph.className = `teacher-recommendation-empty${error ? " is-error" : ""}`;
  paragraph.textContent = message;
  return paragraph;
}

function sortRecommendations(items) {
  const today = todayKey();
  const future = items.filter((item) => (item.dateKey || item.id) >= today)
    .sort((a, b) => String(a.dateKey || a.id).localeCompare(String(b.dateKey || b.id)));
  const past = items.filter((item) => (item.dateKey || item.id) < today)
    .sort((a, b) => String(b.dateKey || b.id).localeCompare(String(a.dateKey || a.id)));
  return [...future, ...past];
}

function teacherSessionValid() {
  try {
    const session = JSON.parse(sessionStorage.getItem(TEACHER_SESSION_KEY) || "null");
    return Boolean(session?.expiresAt && Number(session.expiresAt) > Date.now());
  } catch {
    return false;
  }
}

async function getDatabase() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  if (!auth.currentUser) await signInAnonymously(auth);
  return getFirestore(app);
}

function todayKey() {
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) return "未設定日期";
  const date = new Date(`${dateKey}T00:00:00+08:00`);
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: SCHOOL_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function safePlatformUrl(value) {
  try {
    const url = new URL(String(value || DEFAULT_PLATFORM_URL));
    return url.protocol === "https:" && url.hostname === "twghscysps.nblib.com" ? url.href : "";
  } catch {
    return "";
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

function waitForElement(selector) {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (!element) return;
      observer.disconnect();
      resolve(element);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

resetForm();
