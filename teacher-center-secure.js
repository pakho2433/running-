import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js?teacher-secure=1";
import { browserSessionPersistence, getAuth, GoogleAuthProvider, setPersistence, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js?teacher-secure=1";
import { collection, deleteDoc, doc, getDoc, getDocs, getFirestore, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js?teacher-secure=1";
import { APP_CONFIG } from "./app-config.js";
import { firebaseConfig } from "./firebase-config.js";

const APP_NAME = "reading-run-teacher-secure";
const SHEETJS_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
const SCHOOL_DOMAIN = "@twghscysps.edu.hk";
const HOSTED_DOMAIN = "twghscysps.edu.hk";
const teacherApp = getApps().find((item) => item.name === APP_NAME) || initializeApp(firebaseConfig, APP_NAME);
const auth = getAuth(teacherApp);
const db = getFirestore(teacherApp);
const state = { authorized: false, profile: null, students: [], logs: [], recommendations: [], loading: false };
const ui = buildUi();
installEntryButtons();
bindEvents();

function installEntryButtons() {
  const targets = [document.querySelector(".login-card .privacy-note"), document.querySelector(".topbar-actions")];
  targets.forEach((target, index) => {
    if (!target || target.parentElement?.querySelector(".teacher-center-entry-secure")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "teacher-center-entry teacher-center-entry-secure";
    button.textContent = index === 0 ? "👩‍🏫 教師 Google 登入" : "📊 教師數據中心";
    button.addEventListener("click", openCenter);
    if (index === 0) target.insertAdjacentElement("beforebegin", button);
    else target.prepend(button);
  });
}

function buildUi() {
  const modal = document.createElement("div");
  modal.className = "teacher-center-modal is-hidden";
  modal.id = "teacherCenterSecureModal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.innerHTML = `
    <section class="teacher-center-dialog">
      <header class="teacher-center-header">
        <div><p class="teacher-center-kicker">SECURE TEACHER CENTRE</p><h2>教師數據中心</h2><p>使用 @twghscysps.edu.hk 學校 Google 帳戶登入。</p></div>
        <button class="teacher-center-close" type="button" aria-label="關閉">✕</button>
      </header>
      <section class="teacher-login-view">
        <form class="teacher-login-card teacher-secure-login-form">
          <div class="teacher-login-icon">🔐</div>
          <h3>教師 Google 帳戶登入</h3>
          <p>只允許 @twghscysps.edu.hk，並必須在 Firestore users/{uid} 設定 role: teacher。</p>
          <button class="teacher-primary-button" type="submit">使用學校 Google 登入</button>
          <p class="teacher-login-message" role="status"></p>
        </form>
      </section>
      <section class="teacher-dashboard-view is-hidden">
        <div class="teacher-dashboard-toolbar">
          <label><span>班別</span><select data-class-filter><option value="">全校</option>${APP_CONFIG.classrooms.map((room) => `<option value="${escapeHtml(room.id)}">${escapeHtml(room.name)}</option>`).join("")}</select></label>
          <label><span>開始日期</span><input data-start-date type="date" /></label>
          <label><span>結束日期</span><input data-end-date type="date" /></label>
          <button class="teacher-secondary-button" data-refresh type="button">↻ 更新</button>
          <button class="teacher-primary-button" data-export type="button">⬇ 匯出 Excel</button>
          <button class="teacher-danger-button" data-logout type="button">登出</button>
        </div>
        <p class="teacher-data-status" data-status role="status">尚未載入資料。</p>
        <div class="teacher-summary-grid"><article><span>學生</span><strong data-student-count>0</strong><small>人</small></article><article><span>閱讀紀錄</span><strong data-log-count>0</strong><small>本</small></article><article><span>總里數</span><strong data-distance-count>0</strong><small>里</small></article><article><span>活躍班別</span><strong data-class-count>0</strong><small>班</small></article></div>
        <section class="teacher-preview-section"><div class="teacher-preview-heading"><div><p>SECURE PREVIEW</p><h3>排行榜</h3></div><span>只供已核准教師查看</span></div><div class="teacher-table-wrap"><table><thead><tr><th>排名</th><th>班別</th><th>學生 ID</th><th>本數</th><th>里數</th></tr></thead><tbody data-ranking><tr><td colspan="5">尚未載入</td></tr></tbody></table></div></section>
        <section class="teacher-recommendation-manager"><div class="teacher-recommendation-heading"><div><p>DAILY BOOK</p><h3>每天一本好書推介</h3></div></div><form data-recommendation-form class="teacher-recommendation-form"><label><span>日期</span><input name="dateKey" type="date" required /></label><label><span>書名</span><input name="title" maxlength="120" required /></label><label><span>作者</span><input name="author" maxlength="120" required /></label><label class="teacher-recommendation-wide"><span>封面 HTTPS 網址</span><input name="coverUrl" type="url" maxlength="500" /></label><label class="teacher-recommendation-wide"><span>閱讀平台 HTTPS 網址</span><input name="platformUrl" type="url" maxlength="500" required value="https://twghscysps.nblib.com" /></label><div class="teacher-recommendation-actions teacher-recommendation-wide"><button class="teacher-primary-button" type="submit">儲存推介</button></div></form><p data-recommendation-status class="teacher-recommendation-status" role="status"></p><div class="teacher-recommendation-list-wrap"><table class="teacher-recommendation-table"><thead><tr><th>日期</th><th>書名</th><th>作者</th><th>操作</th></tr></thead><tbody data-recommendation-list><tr><td colspan="4">尚未載入</td></tr></tbody></table></div></section>
      </section>
    </section>`;
  document.body.append(modal);
  return { modal, close: modal.querySelector(".teacher-center-close"), loginView: modal.querySelector(".teacher-login-view"), dashboard: modal.querySelector(".teacher-dashboard-view"), loginForm: modal.querySelector(".teacher-secure-login-form"), loginMessage: modal.querySelector(".teacher-login-message"), classFilter: modal.querySelector("[data-class-filter]"), startDate: modal.querySelector("[data-start-date]"), endDate: modal.querySelector("[data-end-date]"), refresh: modal.querySelector("[data-refresh]"), exportButton: modal.querySelector("[data-export]"), logout: modal.querySelector("[data-logout]"), status: modal.querySelector("[data-status]"), studentCount: modal.querySelector("[data-student-count]"), logCount: modal.querySelector("[data-log-count]"), distanceCount: modal.querySelector("[data-distance-count]"), classCount: modal.querySelector("[data-class-count]"), ranking: modal.querySelector("[data-ranking]"), recommendationForm: modal.querySelector("[data-recommendation-form]"), recommendationStatus: modal.querySelector("[data-recommendation-status]"), recommendationList: modal.querySelector("[data-recommendation-list]") };
}

function bindEvents() {
  ui.close.addEventListener("click", closeCenter);
  ui.modal.addEventListener("click", (event) => { if (event.target === ui.modal) closeCenter(); });
  ui.loginForm.addEventListener("submit", loginTeacher);
  ui.refresh.addEventListener("click", loadData);
  ui.exportButton.addEventListener("click", exportExcel);
  ui.logout.addEventListener("click", logoutTeacher);
  ui.recommendationForm.addEventListener("submit", saveRecommendation);
  [ui.classFilter, ui.startDate, ui.endDate].forEach((element) => element.addEventListener("change", render));
}

async function openCenter() {
  ui.modal.classList.remove("is-hidden");
  document.body.classList.add("teacher-center-open");
  await restoreTeacher();
  if (state.authorized) { showDashboard(); await loadData(); }
  else showLogin();
}
function closeCenter() { ui.modal.classList.add("is-hidden"); document.body.classList.remove("teacher-center-open"); }

async function loginTeacher(event) {
  event.preventDefault();
  ui.loginMessage.textContent = "正在開啟學校 Google 登入……";
  try {
    await setPersistence(auth, browserSessionPersistence);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ hd: HOSTED_DOMAIN, prompt: "select_account" });
    const credential = await signInWithPopup(auth, provider);
    if (!isSchoolEmail(credential.user.email)) throw new Error("INVALID_DOMAIN");
    const profile = await readTeacherProfile(credential.user.uid);
    if (!profile) throw new Error("NOT_TEACHER");
    state.authorized = true;
    state.profile = profile;
    showDashboard();
    await loadData();
  } catch (error) {
    console.error(error);
    await signOut(auth).catch(() => {});
    state.authorized = false;
    ui.loginMessage.textContent = teacherLoginError(error);
  }
}

async function restoreTeacher() {
  if (typeof auth.authStateReady === "function") await auth.authStateReady();
  if (!auth.currentUser || !isSchoolEmail(auth.currentUser.email)) return;
  const profile = await readTeacherProfile(auth.currentUser.uid).catch(() => null);
  state.authorized = Boolean(profile);
  state.profile = profile;
  if (!profile) await signOut(auth).catch(() => {});
}
async function readTeacherProfile(uid) { const snapshot = await getDoc(doc(db, "users", uid)); const profile = snapshot.data() || {}; return profile.role === "teacher" && profile.active !== false ? profile : null; }
function showLogin() { ui.loginView.classList.remove("is-hidden"); ui.dashboard.classList.add("is-hidden"); }
function showDashboard() { ui.loginView.classList.add("is-hidden"); ui.dashboard.classList.remove("is-hidden"); ui.recommendationForm.elements.dateKey.value ||= schoolDateKey(); }
async function logoutTeacher() { await signOut(auth).catch(() => {}); state.authorized = false; state.profile = null; state.students = []; state.logs = []; state.recommendations = []; showLogin(); }

async function loadData() {
  if (!state.authorized || state.loading) return;
  state.loading = true;
  ui.status.textContent = "正在載入已授權資料……";
  try {
    const [students, logs, recommendations] = await Promise.all([getDocs(collection(db, "students")), getDocs(collection(db, "bookLogs")), getDocs(collection(db, "dailyRecommendations"))]);
    state.students = students.docs.map((item) => ({ id: item.id, ...item.data() }));
    state.logs = logs.docs.map((item) => ({ id: item.id, ...item.data() }));
    state.recommendations = recommendations.docs.map((item) => ({ dateKey: item.id, ...item.data() }));
    render();
    renderRecommendations();
    ui.status.textContent = `已安全載入 ${state.logs.length} 項閱讀紀錄。`;
  } catch (error) {
    console.error(error);
    ui.status.textContent = "資料載入失敗；請確認教師角色及 Firestore Rules 已部署。";
  } finally {
    state.loading = false;
  }
}

function filteredLogs() { const classId = ui.classFilter.value; const start = ui.startDate.value; const end = ui.endDate.value; return state.logs.filter((log) => { const date = String(log.submissionDateKey || log.readingDate || "").slice(0, 10); return (!classId || log.classId === classId) && (!start || date >= start) && (!end || date <= end); }); }
function render() { const logs = filteredLogs(); const studentIds = new Set(logs.map((item) => item.studentKey)); const classes = new Set(logs.map((item) => item.classId)); const distance = logs.reduce((sum, item) => sum + Number(item.distanceAwarded || 0), 0); ui.studentCount.textContent = String(studentIds.size || state.students.length); ui.logCount.textContent = String(logs.length); ui.distanceCount.textContent = new Intl.NumberFormat("zh-HK").format(distance); ui.classCount.textContent = String(classes.size); const ranking = state.students.filter((item) => !ui.classFilter.value || item.classId === ui.classFilter.value).sort((a, b) => Number(b.distance || 0) - Number(a.distance || 0)).slice(0, 50); ui.ranking.replaceChildren(...ranking.map((student, index) => { const row = document.createElement("tr"); row.innerHTML = `<td>${index + 1}</td><td>${escapeHtml(className(student.classId))}</td><td>${escapeHtml(student.studentId || "")}</td><td>${Number(student.booksCount || 0)}</td><td>${Number(student.distance || 0)}</td>`; return row; })); if (!ranking.length) ui.ranking.innerHTML = '<tr><td colspan="5">沒有符合條件的資料。</td></tr>'; }

async function saveRecommendation(event) { event.preventDefault(); if (!state.authorized) return; const form = ui.recommendationForm; const dateKey = String(form.elements.dateKey.value || ""); const title = clean(form.elements.title.value, 120); const author = clean(form.elements.author.value, 120); const coverUrl = safeHttps(form.elements.coverUrl.value, true); const platformUrl = safeHttps(form.elements.platformUrl.value, false); if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !title || !author || !platformUrl || coverUrl === null) { ui.recommendationStatus.textContent = "請輸入有效資料，所有網址必須使用 HTTPS。"; return; } try { await setDoc(doc(db, "dailyRecommendations", dateKey), { dateKey, title, author, coverUrl: coverUrl || "", platformUrl, updatedAt: serverTimestamp(), updatedBy: auth.currentUser.uid }, { merge: true }); ui.recommendationStatus.textContent = "推介已安全儲存。"; await loadData(); } catch (error) { console.error(error); ui.recommendationStatus.textContent = "儲存失敗，請確認教師權限。"; } }
function renderRecommendations() { const rows = [...state.recommendations].sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey))); ui.recommendationList.replaceChildren(...rows.map((record) => { const row = document.createElement("tr"); row.innerHTML = `<td>${escapeHtml(record.dateKey)}</td><td>${escapeHtml(record.title || "")}</td><td>${escapeHtml(record.author || "")}</td><td></td>`; const button = document.createElement("button"); button.type = "button"; button.className = "is-danger"; button.textContent = "刪除"; button.addEventListener("click", async () => { if (!confirm(`確定刪除 ${record.dateKey} 的推介？`)) return; await deleteDoc(doc(db, "dailyRecommendations", record.dateKey)); await loadData(); }); row.lastElementChild.append(button); return row; })); if (!rows.length) ui.recommendationList.innerHTML = '<tr><td colspan="4">尚未設定推介。</td></tr>'; }
async function exportExcel() { if (!state.authorized) return; ui.status.textContent = "正在製作 Excel……"; try { await loadScript(SHEETJS_URL); const XLSX = window.XLSX; const logs = filteredLogs().map((item) => ({ 日期: item.submissionDateKey || item.readingDate || "", 班別: className(item.classId), 學生ID: item.studentId || "", 書名: item.title || "", 作者: item.author || "", 類別: item.readingType || "", 科目: item.subject || "", 完成: item.completed === "yes" ? "是" : "否", 里數: Number(item.distanceAwarded || 0) })); const students = state.students.map((item) => ({ 班別: className(item.classId), 學生ID: item.studentId || "", 閱讀本數: Number(item.booksCount || 0), 閱讀里數: Number(item.distance || 0) })); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(logs), "閱讀紀錄"); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(students), "學生統計"); XLSX.writeFile(workbook, `reading-run-${schoolDateKey()}.xlsx`); ui.status.textContent = "Excel 已匯出。"; } catch (error) { console.error(error); ui.status.textContent = "Excel 匯出失敗。"; } }
function loadScript(src) { if (window.XLSX) return Promise.resolve(); return new Promise((resolve, reject) => { const script = document.createElement("script"); script.src = src; script.onload = resolve; script.onerror = reject; document.head.append(script); }); }
function teacherLoginError(error) { if (error?.message === "INVALID_DOMAIN") return "請使用 @twghscysps.edu.hk 學校 Google 帳戶。"; if (error?.message === "NOT_TEACHER") return "此 Google 帳戶沒有教師權限。"; if (error?.code === "auth/popup-closed-by-user") return "你已取消 Google 登入。"; return "教師 Google 登入失敗，請稍後再試。"; }
function isSchoolEmail(email) { return String(email || "").toLowerCase().endsWith(SCHOOL_DOMAIN); }
function className(id) { return APP_CONFIG.classrooms.find((item) => item.id === id)?.name || id || ""; }
function clean(value, length) { return String(value || "").trim().replace(/\s+/g, " ").slice(0, length); }
function safeHttps(value, optional) { const text = String(value || "").trim(); if (!text) return optional ? "" : null; try { const url = new URL(text); return url.protocol === "https:" ? url.href : null; } catch { return null; } }
function schoolDateKey() { return new Intl.DateTimeFormat("en-CA", { timeZone: APP_CONFIG.schoolTimeZone || "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character])); }
