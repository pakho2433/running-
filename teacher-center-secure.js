import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  browserSessionPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { collection, getDocs, getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { APP_CONFIG } from "./app-config.js";
import { firebaseConfig } from "./firebase-config.js?secure=teacher-v1";

const TEACHER_USERNAME = "cys_lib01";
const TEACHER_EMAIL = "cys_lib01@twghscysps.edu.hk";
const SHEETJS_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
const classNameById = new Map(APP_CONFIG.classrooms.map((room) => [room.id, room.name]));

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const state = { students: [], logs: [], loadedAt: 0, loading: false };
const ui = buildTeacherCenter();

installEntryButtons();
bindEvents();
setPersistence(auth, browserSessionPersistence).catch(console.error);
onAuthStateChanged(auth, () => {
  if (!ui.modal.classList.contains("is-hidden")) syncView();
  window.dispatchEvent(new CustomEvent("teacher-auth-changed", { detail: { authenticated: isTeacher() } }));
});

function installEntryButtons() {
  const loginCard = document.querySelector(".login-card");
  if (loginCard && !loginCard.querySelector(".teacher-center-entry")) {
    const button = makeEntryButton("👩‍🏫 教師數據中心");
    button.classList.add("teacher-center-entry-login");
    loginCard.querySelector(".privacy-note")?.insertAdjacentElement("beforebegin", button);
  }
  const topbarActions = document.querySelector(".topbar-actions");
  if (topbarActions && !topbarActions.querySelector(".teacher-center-entry")) {
    topbarActions.prepend(makeEntryButton("📊 教師數據中心"));
  }
}

function makeEntryButton(text) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "teacher-center-entry";
  button.textContent = text;
  button.addEventListener("click", openTeacherCenter);
  return button;
}

function buildTeacherCenter() {
  const modal = document.createElement("div");
  modal.id = "teacherCenterModal";
  modal.className = "teacher-center-modal is-hidden";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "teacherCenterTitle");
  modal.innerHTML = `
    <section class="teacher-center-dialog">
      <header class="teacher-center-header">
        <div>
          <p class="teacher-center-kicker">SECURE TEACHER DATA CENTRE</p>
          <h2 id="teacherCenterTitle">教師數據中心</h2>
          <p>全校原始數據只會在 Firebase 驗證指定教師帳戶後載入。</p>
        </div>
        <button class="teacher-center-close" type="button" aria-label="關閉教師數據中心">✕</button>
      </header>
      <section class="teacher-login-view">
        <div class="teacher-login-card">
          <div class="teacher-login-icon" aria-hidden="true">🔐</div>
          <h3>Firebase 教師登入</h3>
          <p>請使用已在 Firebase Authentication 建立的指定教師帳戶。密碼不會儲存在網站程式碼。</p>
          <form class="teacher-login-form">
            <label><span>教師帳號</span><input name="teacherUsername" type="text" autocomplete="username" maxlength="80" required /></label>
            <label><span>密碼</span><input name="teacherPassword" type="password" autocomplete="current-password" maxlength="120" required /></label>
            <button class="teacher-primary-button" type="submit">安全登入</button>
          </form>
          <p class="teacher-login-message" role="status"></p>
        </div>
      </section>
      <section class="teacher-dashboard-view is-hidden">
        <div class="teacher-dashboard-toolbar">
          <label><span>班別</span><select id="teacherClassFilter"><option value="">全校所有班別</option>${APP_CONFIG.classrooms.map((room) => `<option value="${escapeHtml(room.id)}">${escapeHtml(room.name)}</option>`).join("")}</select></label>
          <label><span>開始日期</span><input id="teacherStartDate" type="date" /></label>
          <label><span>結束日期</span><input id="teacherEndDate" type="date" /></label>
          <button id="teacherRefreshButton" class="teacher-secondary-button" type="button">↻ 更新數據</button>
          <button id="teacherExportButton" class="teacher-primary-button" type="button">⬇ 匯出 Excel</button>
          <button id="teacherLogoutButton" class="teacher-danger-button" type="button">教師登出</button>
        </div>
        <div class="teacher-data-status" id="teacherDataStatus" role="status">尚未載入資料。</div>
        <div class="teacher-summary-grid">
          <article><span>已建立學生</span><strong id="teacherStudentCount">0</strong><small>人</small></article>
          <article><span>篩選期內紀錄</span><strong id="teacherRecordCount">0</strong><small>本</small></article>
          <article><span>篩選期內里數</span><strong id="teacherDistanceCount">0</strong><small>里</small></article>
          <article><span>活躍班別</span><strong id="teacherClassCount">0</strong><small>班</small></article>
        </div>
        <section class="teacher-preview-section">
          <div class="teacher-preview-heading"><div><p>SECURE PREVIEW</p><h3>全校閱讀排行榜預覽</h3></div><span>完整資料可匯出至 Excel</span></div>
          <div class="teacher-table-wrap"><table><thead><tr><th>排名</th><th>班別</th><th>學生 ID</th><th>閱讀本數</th><th>閱讀里數</th></tr></thead><tbody id="teacherLeaderboardPreview"><tr><td colspan="5">登入後載入資料。</td></tr></tbody></table></div>
        </section>
        <section class="teacher-export-info"><h3>Excel 會包含</h3><div><span>① 全校閱讀紀錄</span><span>② 學生統計</span><span>③ 班級統計</span><span>④ 排行榜</span></div></section>
      </section>
    </section>`;
  document.body.append(modal);
  return {
    modal,
    closeButton: modal.querySelector(".teacher-center-close"),
    loginView: modal.querySelector(".teacher-login-view"),
    loginForm: modal.querySelector(".teacher-login-form"),
    loginMessage: modal.querySelector(".teacher-login-message"),
    dashboardView: modal.querySelector(".teacher-dashboard-view"),
    classFilter: modal.querySelector("#teacherClassFilter"),
    startDate: modal.querySelector("#teacherStartDate"),
    endDate: modal.querySelector("#teacherEndDate"),
    refreshButton: modal.querySelector("#teacherRefreshButton"),
    exportButton: modal.querySelector("#teacherExportButton"),
    logoutButton: modal.querySelector("#teacherLogoutButton"),
    dataStatus: modal.querySelector("#teacherDataStatus"),
    studentCount: modal.querySelector("#teacherStudentCount"),
    recordCount: modal.querySelector("#teacherRecordCount"),
    distanceCount: modal.querySelector("#teacherDistanceCount"),
    classCount: modal.querySelector("#teacherClassCount"),
    leaderboardPreview: modal.querySelector("#teacherLeaderboardPreview"),
  };
}

function bindEvents() {
  ui.closeButton.addEventListener("click", closeTeacherCenter);
  ui.modal.addEventListener("click", (event) => event.target === ui.modal && closeTeacherCenter());
  document.addEventListener("keydown", (event) => event.key === "Escape" && !ui.modal.classList.contains("is-hidden") && closeTeacherCenter());
  ui.loginForm.addEventListener("submit", handleLogin);
  ui.refreshButton.addEventListener("click", () => loadSchoolData(true));
  ui.exportButton.addEventListener("click", exportExcel);
  ui.logoutButton.addEventListener("click", async () => { await signOut(auth); clearDashboard(); showLogin(); });
  [ui.classFilter, ui.startDate, ui.endDate].forEach((element) => element.addEventListener("change", renderDashboard));
}

function openTeacherCenter() {
  ui.modal.classList.remove("is-hidden");
  document.body.classList.add("teacher-center-open");
  syncView();
}

function closeTeacherCenter() {
  ui.modal.classList.add("is-hidden");
  document.body.classList.remove("teacher-center-open");
}

function syncView() {
  if (isTeacher()) {
    showDashboard();
    loadSchoolData(false);
  } else showLogin();
}

function showLogin() {
  ui.loginView.classList.remove("is-hidden");
  ui.dashboardView.classList.add("is-hidden");
  ui.loginMessage.textContent = "";
  setTimeout(() => ui.loginForm.elements.teacherUsername?.focus(), 50);
}

function showDashboard() {
  ui.loginView.classList.add("is-hidden");
  ui.dashboardView.classList.remove("is-hidden");
}

async function handleLogin(event) {
  event.preventDefault();
  const username = String(ui.loginForm.elements.teacherUsername.value || "").trim().toLowerCase();
  const password = String(ui.loginForm.elements.teacherPassword.value || "");
  if (![TEACHER_USERNAME, TEACHER_EMAIL].includes(username)) {
    ui.loginMessage.textContent = "教師帳號不正確。";
    return;
  }
  ui.loginMessage.textContent = "正在由 Firebase 驗證……";
  try {
    await setPersistence(auth, browserSessionPersistence);
    await signInWithEmailAndPassword(auth, TEACHER_EMAIL, password);
    if (!isTeacher()) throw new Error("NOT_AUTHORISED");
    ui.loginForm.reset();
    ui.loginMessage.textContent = "";
    showDashboard();
    await loadSchoolData(true);
  } catch (error) {
    console.error("Teacher sign-in failed", error);
    await signOut(auth).catch(() => {});
    ui.loginMessage.textContent = "登入失敗。請確認已在 Firebase Authentication 建立指定教師帳戶，並使用正確密碼。";
  }
}

function isTeacher() {
  return String(auth.currentUser?.email || "").toLowerCase() === TEACHER_EMAIL;
}

async function loadSchoolData(force) {
  if (!isTeacher() || state.loading) return;
  if (!force && state.loadedAt && Date.now() - state.loadedAt < 60_000) return renderDashboard();
  state.loading = true;
  setBusy(true, "正在安全載入全校資料……");
  try {
    const [studentsSnapshot, logsSnapshot] = await Promise.all([
      getDocs(collection(db, "students")),
      getDocs(collection(db, "bookLogs")),
    ]);
    state.students = studentsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    state.logs = logsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    state.loadedAt = Date.now();
    renderDashboard();
  } catch (error) {
    console.error("Secure teacher data load failed", error);
    ui.dataStatus.dataset.state = "error";
    ui.dataStatus.textContent = "未能載入資料。請部署最新 Firestore Rules 並確認教師 Firebase 帳戶。";
  } finally {
    state.loading = false;
    setBusy(false);
  }
}

function buildReport() {
  const selectedClass = ui.classFilter.value;
  const startDate = ui.startDate.value;
  const endDate = ui.endDate.value;
  const students = state.students.filter((student) => !selectedClass || student.classId === selectedClass);
  const logs = state.logs.filter((record) => !selectedClass || record.classId === selectedClass).filter((record) => {
    const date = recordDateKey(record);
    if (startDate && (!date || date < startDate)) return false;
    if (endDate && (!date || date > endDate)) return false;
    return true;
  }).sort((a, b) => recordTimestamp(b) - recordTimestamp(a));

  const stats = new Map();
  students.forEach((student) => stats.set(studentKeyOf(student), studentStat(student)));
  logs.forEach((record) => {
    const key = record.studentKey || `${record.classId || ""}__${record.studentId || ""}`;
    if (!stats.has(key)) stats.set(key, studentStat(record));
    const item = stats.get(key);
    item.filteredBooks += 1;
    item.filteredDistance += numberValue(record.distanceAwarded);
    if (record.completed === "yes") item.completedBooks += 1;
    const timestamp = recordTimestamp(record);
    if (timestamp >= item.lastTimestamp) {
      item.lastTimestamp = timestamp;
      item.lastDate = recordDateKey(record);
      item.lastBook = record.title || "";
    }
  });

  const studentStats = [...stats.values()].sort(compareStudents);
  const classStats = APP_CONFIG.classrooms.filter((room) => !selectedClass || room.id === selectedClass).map((room) => {
    const members = studentStats.filter((student) => student.classId === room.id);
    const active = members.filter((student) => student.filteredBooks > 0);
    const books = active.reduce((sum, student) => sum + student.filteredBooks, 0);
    const distance = active.reduce((sum, student) => sum + student.filteredDistance, 0);
    return {
      className: room.name,
      registered: students.filter((student) => student.classId === room.id).length,
      active: active.length,
      books,
      distance,
      completed: active.reduce((sum, student) => sum + student.completedBooks, 0),
      averageBooks: active.length ? books / active.length : 0,
      averageDistance: active.length ? distance / active.length : 0,
    };
  });

  const rankingRows = [];
  studentStats.filter((student) => student.filteredBooks > 0).slice(0, 20).forEach((student, index) => rankingRows.push({ type: "全校 TOP 20", rank: index + 1, ...student }));
  APP_CONFIG.classrooms.forEach((room) => studentStats.filter((student) => student.classId === room.id && student.filteredBooks > 0).slice(0, 5).forEach((student, index) => rankingRows.push({ type: `${room.name} 班 TOP 5`, rank: index + 1, ...student })));

  return {
    selectedClass, startDate, endDate, students, logs, studentStats, classStats, rankingRows,
    totalDistance: logs.reduce((sum, record) => sum + numberValue(record.distanceAwarded), 0),
    activeClasses: new Set(logs.map((record) => record.classId).filter(Boolean)).size,
  };
}

function renderDashboard() {
  if (!isTeacher()) return showLogin();
  const report = buildReport();
  ui.studentCount.textContent = formatNumber(report.students.length);
  ui.recordCount.textContent = formatNumber(report.logs.length);
  ui.distanceCount.textContent = formatNumber(report.totalDistance);
  ui.classCount.textContent = formatNumber(report.activeClasses);
  ui.dataStatus.dataset.state = "ready";
  ui.dataStatus.textContent = `安全資料更新：${formatDateTime(new Date(state.loadedAt))}；目前篩選 ${report.logs.length} 筆紀錄。`;
  renderLeaderboard(report.studentStats.filter((student) => student.filteredBooks > 0).slice(0, 10));
}

function renderLeaderboard(rows) {
  ui.leaderboardPreview.replaceChildren();
  if (!rows.length) {
    ui.leaderboardPreview.innerHTML = '<tr><td colspan="5">所選範圍暫時未有閱讀紀錄。</td></tr>';
    return;
  }
  rows.forEach((student, index) => {
    const row = document.createElement("tr");
    [index + 1, student.className, student.studentId, formatNumber(student.filteredBooks), formatNumber(student.filteredDistance)].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.append(cell);
    });
    ui.leaderboardPreview.append(row);
  });
}

async function exportExcel() {
  if (!isTeacher()) return showLogin();
  if (!state.loadedAt) await loadSchoolData(true);
  if (!state.loadedAt) return;
  setBusy(true, "正在建立 Excel……");
  try {
    const XLSX = await loadSheetJs();
    const report = buildReport();
    const workbook = XLSX.utils.book_new();
    appendSheet(XLSX, workbook, "全校閱讀紀錄", report.logs.map((record) => ({
      班別: classNameById.get(record.classId) || record.classId || "未分類",
      學生ID: excelText(record.studentId), 閱讀日期: record.readingDate || recordDateKey(record), 書名: excelText(record.title), 作者: excelText(record.author),
      讀物類別: record.readingType || "未選擇", 科目: record.subject || "未選擇", 是否完成: record.completed === "yes" ? "是" : "否／未選擇",
      獲得里數: numberValue(record.distanceAwarded), 提交時間: formatRecordDateTime(record),
    })), [12,14,13,28,22,14,12,12,12,20]);
    appendSheet(XLSX, workbook, "學生統計", report.studentStats.map((student) => ({
      班別: student.className, 學生ID: excelText(student.studentId), 篩選期內本數: student.filteredBooks, 篩選期內里數: student.filteredDistance,
      已完成本數: student.completedBooks, 累計閱讀本數: student.cumulativeBooks, 累計閱讀里數: student.cumulativeDistance,
      最近閱讀日期: student.lastDate, 最近書籍: excelText(student.lastBook),
    })), [10,14,14,14,14,14,14,14,24]);
    appendSheet(XLSX, workbook, "班級統計", report.classStats.map((item) => ({
      班別: item.className, 已建立學生數: item.registered, 活躍學生數: item.active, 閱讀總本數: item.books, 閱讀總里數: item.distance,
      已完成本數: item.completed, 活躍學生平均本數: round(item.averageBooks), 活躍學生平均里數: round(item.averageDistance),
    })), [10,14,14,14,14,14,16,16]);
    appendSheet(XLSX, workbook, "排行榜", report.rankingRows.map((item) => ({
      排行榜: item.type, 排名: item.rank, 班別: item.className, 學生ID: excelText(item.studentId), 閱讀本數: item.filteredBooks, 閱讀里數: item.filteredDistance,
    })), [18,10,10,14,14,14]);
    const classPart = report.selectedClass ? classNameById.get(report.selectedClass) : "全校";
    const datePart = report.startDate || report.endDate ? `${report.startDate || "開始"}_至_${report.endDate || "現在"}` : "全部日期";
    XLSX.writeFile(workbook, `東華三院周演森小學_悅讀千里號_${classPart}_${datePart}_${todayKey()}.xlsx`, { compression: true });
    ui.dataStatus.textContent = "Excel 已安全匯出。";
  } catch (error) {
    console.error(error);
    ui.dataStatus.dataset.state = "error";
    ui.dataStatus.textContent = "Excel 匯出失敗，請檢查網絡。";
  } finally { setBusy(false); }
}

function studentStat(source) {
  return {
    studentKey: source.studentKey || studentKeyOf(source), classId: source.classId || "", className: classNameById.get(source.classId) || source.classId || "未分類",
    studentId: source.studentId || "", filteredBooks: 0, filteredDistance: 0, completedBooks: 0,
    cumulativeBooks: numberValue(source.booksCount), cumulativeDistance: numberValue(source.distance), lastDate: "", lastBook: source.lastBook || "", lastTimestamp: 0,
  };
}

function studentKeyOf(source) { return source.id || source.studentKey || `${source.classId || ""}__${source.studentId || ""}`; }
function compareStudents(a, b) { return b.filteredDistance - a.filteredDistance || b.filteredBooks - a.filteredBooks || a.className.localeCompare(b.className, "zh-Hant") || a.studentId.localeCompare(b.studentId, "zh-Hant"); }
function recordDateKey(record) { if (record.readingDate) return normaliseDate(record.readingDate); if (record.submissionDateKey) return normaliseDate(record.submissionDateKey); const time = recordTimestamp(record); return time ? dateKey(new Date(time)) : ""; }
function recordTimestamp(record) { if (record.createdAt?.toMillis) return record.createdAt.toMillis(); if (record.createdAt?.seconds) return Number(record.createdAt.seconds) * 1000; const client = Date.parse(record.clientCreatedAt || ""); return Number.isFinite(client) ? client : 0; }
function formatRecordDateTime(record) { const time = recordTimestamp(record); return time ? formatDateTime(new Date(time)) : ""; }
function normaliseDate(value) { const match = String(value || "").replaceAll("/", "-").match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); return match ? `${match[1]}-${match[2].padStart(2,"0")}-${match[3].padStart(2,"0")}` : ""; }
function dateKey(date) { const parts = new Intl.DateTimeFormat("en", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
function todayKey() { return dateKey(new Date()).replaceAll("-", ""); }
function formatDateTime(date) { return new Intl.DateTimeFormat("zh-HK", { timeZone: "Asia/Hong_Kong", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(date); }
function numberValue(value) { const number = Number(value || 0); return Number.isFinite(number) ? number : 0; }
function formatNumber(value) { return new Intl.NumberFormat("zh-HK", { maximumFractionDigits: 2 }).format(numberValue(value)); }
function round(value) { return Math.round(numberValue(value) * 100) / 100; }
function excelText(value) { const text = String(value || ""); return /^[=+\-@]/.test(text) ? `'${text}` : text; }
function escapeHtml(value) { return String(value || "").replace(/[&<>'"]/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[char])); }
function appendSheet(XLSX, workbook, name, rows, widths) { const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ 提示: "所選範圍暫時未有資料" }]); sheet["!cols"] = widths.map((wch) => ({ wch })); XLSX.utils.book_append_sheet(workbook, sheet, name); }
function setBusy(busy, message = "") { ui.refreshButton.disabled = busy; ui.exportButton.disabled = busy; if (message) ui.dataStatus.textContent = message; ui.dataStatus.dataset.state = busy ? "loading" : ui.dataStatus.dataset.state; }
function clearDashboard() { state.students = []; state.logs = []; state.loadedAt = 0; ui.studentCount.textContent = "0"; ui.recordCount.textContent = "0"; ui.distanceCount.textContent = "0"; ui.classCount.textContent = "0"; ui.leaderboardPreview.innerHTML = '<tr><td colspan="5">登入後載入資料。</td></tr>'; }
function loadSheetJs() { if (window.XLSX) return Promise.resolve(window.XLSX); return new Promise((resolve, reject) => { const script = document.createElement("script"); script.src = SHEETJS_URL; script.async = true; script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error("SheetJS unavailable")); script.onerror = reject; document.head.append(script); }); }
