import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  getDocs,
  getFirestore,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { APP_CONFIG } from "./app-config.js";
import { firebaseConfig } from "./firebase-config.js";

const AUTH_SALT = "readingrun-teacher-v1";
const AUTH_HASH = "fc3e2e0e5559301295f1c67041b7bfc80be9663a30e2980695e1c863a0cba338";
const SESSION_KEY = "readingrun-teacher-session-v1";
const ATTEMPT_KEY = "readingrun-teacher-attempts-v1";
const SESSION_DURATION = 30 * 60 * 1000;
const LOCK_DURATION = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const SHEETJS_URL = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";

const classNameById = new Map(APP_CONFIG.classrooms.map((room) => [room.id, room.name]));
const state = {
  students: [],
  logs: [],
  loadedAt: 0,
  loading: false,
};

const ui = buildTeacherCenter();
installEntryButtons();
bindEvents();

function installEntryButtons() {
  const loginCard = document.querySelector(".login-card");
  if (loginCard && !loginCard.querySelector(".teacher-center-entry")) {
    const button = makeEntryButton("👩‍🏫 教師數據中心");
    button.classList.add("teacher-center-entry-login");
    loginCard.querySelector(".privacy-note")?.insertAdjacentElement("beforebegin", button);
  }

  const topbarActions = document.querySelector(".topbar-actions");
  if (topbarActions && !topbarActions.querySelector(".teacher-center-entry")) {
    const button = makeEntryButton("📊 教師數據中心");
    topbarActions.prepend(button);
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
          <p class="teacher-center-kicker">TEACHER DATA CENTRE</p>
          <h2 id="teacherCenterTitle">教師數據中心</h2>
          <p>查看全校閱讀統計，並匯出四個工作表的 Excel 報告。</p>
        </div>
        <button class="teacher-center-close" type="button" aria-label="關閉教師數據中心">✕</button>
      </header>

      <section class="teacher-login-view">
        <div class="teacher-login-card">
          <div class="teacher-login-icon" aria-hidden="true">🔐</div>
          <h3>教師登入</h3>
          <p>只有持有教師帳號的人員才可進入及匯出全校資料。</p>
          <form class="teacher-login-form">
            <label>
              <span>教師帳號</span>
              <input name="teacherUsername" type="text" autocomplete="username" maxlength="40" required />
            </label>
            <label>
              <span>密碼</span>
              <input name="teacherPassword" type="password" autocomplete="current-password" maxlength="80" required />
            </label>
            <button class="teacher-primary-button" type="submit">登入教師數據中心</button>
          </form>
          <p class="teacher-login-message" role="status"></p>
        </div>
      </section>

      <section class="teacher-dashboard-view is-hidden">
        <div class="teacher-dashboard-toolbar">
          <label>
            <span>班別</span>
            <select id="teacherClassFilter">
              <option value="">全校所有班別</option>
              ${APP_CONFIG.classrooms.map((room) => `<option value="${escapeHtml(room.id)}">${escapeHtml(room.name)}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>開始日期</span>
            <input id="teacherStartDate" type="date" />
          </label>
          <label>
            <span>結束日期</span>
            <input id="teacherEndDate" type="date" />
          </label>
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
          <div class="teacher-preview-heading">
            <div>
              <p>LIVE PREVIEW</p>
              <h3>全校閱讀排行榜預覽</h3>
            </div>
            <span>完整排行榜會包含在 Excel</span>
          </div>
          <div class="teacher-table-wrap">
            <table>
              <thead>
                <tr><th>排名</th><th>班別</th><th>學生 ID</th><th>閱讀本數</th><th>閱讀里數</th></tr>
              </thead>
              <tbody id="teacherLeaderboardPreview">
                <tr><td colspan="5">登入後載入資料。</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="teacher-export-info">
          <h3>Excel 會包含</h3>
          <div>
            <span>① 全校閱讀紀錄</span>
            <span>② 學生統計</span>
            <span>③ 班級統計</span>
            <span>④ 排行榜</span>
          </div>
        </section>
      </section>
    </section>
  `;
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
  ui.modal.addEventListener("click", (event) => {
    if (event.target === ui.modal) closeTeacherCenter();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !ui.modal.classList.contains("is-hidden")) closeTeacherCenter();
  });
  ui.loginForm.addEventListener("submit", handleTeacherLogin);
  ui.refreshButton.addEventListener("click", () => loadSchoolData(true));
  ui.exportButton.addEventListener("click", exportExcel);
  ui.logoutButton.addEventListener("click", logoutTeacher);
  [ui.classFilter, ui.startDate, ui.endDate].forEach((element) => {
    element.addEventListener("change", renderDashboard);
  });
}

function openTeacherCenter() {
  ui.modal.classList.remove("is-hidden");
  document.body.classList.add("teacher-center-open");
  if (teacherSessionValid()) {
    showDashboard();
    loadSchoolData(false);
  } else {
    showLogin();
  }
}

function closeTeacherCenter() {
  ui.modal.classList.add("is-hidden");
  document.body.classList.remove("teacher-center-open");
}

function showLogin() {
  ui.loginView.classList.remove("is-hidden");
  ui.dashboardView.classList.add("is-hidden");
  ui.loginMessage.textContent = lockMessage();
  setTimeout(() => ui.loginForm.elements.teacherUsername?.focus(), 50);
}

function showDashboard() {
  ui.loginView.classList.add("is-hidden");
  ui.dashboardView.classList.remove("is-hidden");
}

async function handleTeacherLogin(event) {
  event.preventDefault();
  const lockedUntil = currentLockUntil();
  if (lockedUntil > Date.now()) {
    ui.loginMessage.textContent = lockMessage();
    return;
  }

  const username = String(ui.loginForm.elements.teacherUsername.value || "").trim();
  const password = String(ui.loginForm.elements.teacherPassword.value || "");
  const digest = await sha256(`${AUTH_SALT}|${username}|${password}`);

  if (!constantTimeEqual(digest, AUTH_HASH)) {
    const attempts = recordFailedAttempt();
    ui.loginMessage.textContent = attempts.locked
      ? "登入失敗次數過多，請 5 分鐘後再試。"
      : `帳號或密碼不正確，尚餘 ${MAX_ATTEMPTS - attempts.count} 次機會。`;
    ui.loginForm.elements.teacherPassword.value = "";
    return;
  }

  clearFailedAttempts();
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    expiresAt: Date.now() + SESSION_DURATION,
  }));
  ui.loginForm.reset();
  ui.loginMessage.textContent = "";
  showDashboard();
  await loadSchoolData(true);
}

function logoutTeacher() {
  sessionStorage.removeItem(SESSION_KEY);
  state.students = [];
  state.logs = [];
  state.loadedAt = 0;
  clearDashboard();
  showLogin();
}

function teacherSessionValid() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
    if (!session?.expiresAt || Number(session.expiresAt) <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY);
      return false;
    }
    return true;
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
    return false;
  }
}

async function loadSchoolData(force) {
  if (!teacherSessionValid()) {
    showLogin();
    return;
  }
  if (state.loading) return;
  if (!force && state.loadedAt && Date.now() - state.loadedAt < 60_000) {
    renderDashboard();
    return;
  }

  state.loading = true;
  setBusy(true, "正在從 Firebase 載入全校資料……");

  try {
    const db = await getDatabase();
    const [studentsSnapshot, logsSnapshot] = await Promise.all([
      getDocs(collection(db, "students")),
      getDocs(collection(db, "bookLogs")),
    ]);
    state.students = studentsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    state.logs = logsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    state.loadedAt = Date.now();
    renderDashboard();
  } catch (error) {
    console.error("Teacher data load failed", error);
    ui.dataStatus.textContent = "未能載入全校數據，請檢查 Firebase 連線及權限。";
    ui.dataStatus.dataset.state = "error";
  } finally {
    state.loading = false;
    setBusy(false);
  }
}

function renderDashboard() {
  if (!teacherSessionValid()) {
    showLogin();
    return;
  }

  const report = buildReport();
  ui.studentCount.textContent = formatNumber(report.students.length);
  ui.recordCount.textContent = formatNumber(report.logs.length);
  ui.distanceCount.textContent = formatNumber(report.totalDistance);
  ui.classCount.textContent = formatNumber(report.activeClasses);
  ui.dataStatus.dataset.state = "ready";
  ui.dataStatus.textContent = `資料更新：${formatDateTime(new Date(state.loadedAt))}；目前篩選 ${report.logs.length} 筆閱讀紀錄。`;
  renderLeaderboardPreview(report.studentStats.slice(0, 10));
}

function buildReport() {
  const selectedClass = ui.classFilter.value;
  const startDate = ui.startDate.value;
  const endDate = ui.endDate.value;

  const students = state.students.filter((student) => !selectedClass || student.classId === selectedClass);
  const logs = state.logs
    .filter((record) => !selectedClass || record.classId === selectedClass)
    .filter((record) => {
      const dateKey = recordDateKey(record);
      if (startDate && (!dateKey || dateKey < startDate)) return false;
      if (endDate && (!dateKey || dateKey > endDate)) return false;
      return true;
    })
    .sort((a, b) => recordTimestamp(b) - recordTimestamp(a));

  const statsByStudent = new Map();
  students.forEach((student) => {
    const key = studentKeyOf(student);
    statsByStudent.set(key, makeStudentStat(student));
  });

  logs.forEach((record) => {
    const key = record.studentKey || `${record.classId || ""}__${record.studentId || ""}`;
    if (!statsByStudent.has(key)) statsByStudent.set(key, makeStudentStat(record));
    const stat = statsByStudent.get(key);
    stat.filteredBooks += 1;
    stat.filteredDistance += numberValue(record.distanceAwarded);
    if (record.completed === "yes") stat.completedBooks += 1;
    const timestamp = recordTimestamp(record);
    if (timestamp >= stat.lastTimestamp) {
      stat.lastTimestamp = timestamp;
      stat.lastDate = recordDateKey(record);
      stat.lastBook = record.title || "";
    }
  });

  const studentStats = [...statsByStudent.values()].sort(compareStudentStats);
  const classStats = buildClassStats(students, studentStats, selectedClass);
  const activeClasses = new Set(logs.map((record) => record.classId).filter(Boolean)).size;
  const totalDistance = logs.reduce((sum, record) => sum + numberValue(record.distanceAwarded), 0);

  return {
    selectedClass,
    startDate,
    endDate,
    students,
    logs,
    studentStats,
    classStats,
    activeClasses,
    totalDistance,
    rankingRows: buildRankingRows(studentStats),
  };
}

function makeStudentStat(source) {
  return {
    studentKey: source.studentKey || studentKeyOf(source),
    classId: source.classId || "",
    className: classNameById.get(source.classId) || source.classId || "未分類",
    studentId: source.studentId || "",
    filteredBooks: 0,
    filteredDistance: 0,
    completedBooks: 0,
    cumulativeBooks: numberValue(source.booksCount),
    cumulativeDistance: numberValue(source.distance),
    lastDate: "",
    lastBook: source.lastBook || "",
    lastTimestamp: 0,
  };
}

function buildClassStats(students, studentStats, selectedClass) {
  const rooms = selectedClass
    ? APP_CONFIG.classrooms.filter((room) => room.id === selectedClass)
    : APP_CONFIG.classrooms;

  return rooms.map((room) => {
    const registered = students.filter((student) => student.classId === room.id).length;
    const members = studentStats.filter((student) => student.classId === room.id);
    const active = members.filter((student) => student.filteredBooks > 0);
    const books = active.reduce((sum, student) => sum + student.filteredBooks, 0);
    const distance = active.reduce((sum, student) => sum + student.filteredDistance, 0);
    const completed = active.reduce((sum, student) => sum + student.completedBooks, 0);
    return {
      classId: room.id,
      className: room.name,
      registered,
      active: active.length,
      books,
      distance,
      completed,
      averageBooks: active.length ? books / active.length : 0,
      averageDistance: active.length ? distance / active.length : 0,
    };
  });
}

function buildRankingRows(studentStats) {
  const rows = [];
  studentStats.slice(0, 20).forEach((student, index) => {
    rows.push({ type: "全校 TOP 20", rank: index + 1, ...student });
  });

  APP_CONFIG.classrooms.forEach((room) => {
    studentStats
      .filter((student) => student.classId === room.id && student.filteredBooks > 0)
      .slice(0, 5)
      .forEach((student, index) => {
        rows.push({ type: `${room.name} 班 TOP 5`, rank: index + 1, ...student });
      });
  });
  return rows;
}

function renderLeaderboardPreview(rows) {
  ui.leaderboardPreview.replaceChildren();
  const activeRows = rows.filter((student) => student.filteredBooks > 0);
  if (!activeRows.length) {
    const row = document.createElement("tr");
    row.innerHTML = '<td colspan="5">所選範圍暫時未有閱讀紀錄。</td>';
    ui.leaderboardPreview.append(row);
    return;
  }

  activeRows.forEach((student, index) => {
    const row = document.createElement("tr");
    [
      index + 1,
      student.className,
      student.studentId,
      formatNumber(student.filteredBooks),
      formatNumber(student.filteredDistance),
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.append(cell);
    });
    ui.leaderboardPreview.append(row);
  });
}

async function exportExcel() {
  if (!teacherSessionValid()) {
    showLogin();
    return;
  }
  if (!state.loadedAt) await loadSchoolData(true);
  if (!state.loadedAt) return;

  setBusy(true, "正在建立 Excel 檔案……");
  try {
    const XLSX = await loadSheetJs();
    const report = buildReport();
    const workbook = XLSX.utils.book_new();
    workbook.Props = {
      Title: "東華三院周演森小學-26/27悅讀千里號閱讀統計",
      Subject: "全校閱讀數據",
      Author: "教師數據中心",
      CreatedDate: new Date(),
    };

    appendSheet(XLSX, workbook, "全校閱讀紀錄", readingRecordRows(report.logs), [12, 14, 13, 28, 22, 14, 12, 12, 12, 20]);
    appendSheet(XLSX, workbook, "學生統計", studentStatisticRows(report.studentStats), [10, 14, 14, 14, 14, 14, 14, 14, 14, 26]);
    appendSheet(XLSX, workbook, "班級統計", classStatisticRows(report.classStats), [10, 14, 14, 14, 14, 14, 16, 16]);
    appendSheet(XLSX, workbook, "排行榜", rankingRows(report.rankingRows), [18, 10, 10, 14, 14, 14]);

    const classPart = report.selectedClass ? classNameById.get(report.selectedClass) : "全校";
    const datePart = report.startDate || report.endDate
      ? `${report.startDate || "開始"}_至_${report.endDate || "現在"}`
      : "全部日期";
    const filename = `東華三院周演森小學_悅讀千里號_${classPart}_${datePart}_${todayKey()}.xlsx`;
    XLSX.writeFile(workbook, filename, { compression: true });
    ui.dataStatus.dataset.state = "ready";
    ui.dataStatus.textContent = `Excel 已匯出：${filename}`;
  } catch (error) {
    console.error("Excel export failed", error);
    ui.dataStatus.dataset.state = "error";
    ui.dataStatus.textContent = "Excel 匯出失敗，請檢查網絡後再試。";
  } finally {
    setBusy(false);
  }
}

function readingRecordRows(logs) {
  return logs.map((record) => ({
    班別: classNameById.get(record.classId) || record.classId || "未分類",
    學生ID: excelText(record.studentId),
    閱讀日期: record.readingDate || recordDateKey(record),
    書名: excelText(record.title),
    作者: excelText(record.author),
    讀物類別: record.readingType || "未選擇",
    科目: record.subject || "未選擇",
    是否完成: record.completed === "yes" ? "是" : "否／未選擇",
    獲得里數: numberValue(record.distanceAwarded),
    提交時間: formatRecordDateTime(record),
  }));
}

function studentStatisticRows(studentStats) {
  return studentStats.map((student) => ({
    班別: student.className,
    學生ID: excelText(student.studentId),
    篩選期內本數: student.filteredBooks,
    篩選期內里數: student.filteredDistance,
    已完成本數: student.completedBooks,
    累計閱讀本數: student.cumulativeBooks,
    累計閱讀里數: student.cumulativeDistance,
    最近閱讀日期: student.lastDate,
    最近書籍: excelText(student.lastBook),
    學生資料鍵: excelText(student.studentKey),
  }));
}

function classStatisticRows(classStats) {
  return classStats.map((item) => ({
    班別: item.className,
    已建立學生數: item.registered,
    活躍學生數: item.active,
    閱讀總本數: item.books,
    閱讀總里數: item.distance,
    已完成本數: item.completed,
    活躍學生平均本數: round(item.averageBooks),
    活躍學生平均里數: round(item.averageDistance),
  }));
}

function rankingRows(rows) {
  return rows.map((item) => ({
    排行榜: item.type,
    排名: item.rank,
    班別: item.className,
    學生ID: excelText(item.studentId),
    閱讀本數: item.filteredBooks,
    閱讀里數: item.filteredDistance,
  }));
}

function appendSheet(XLSX, workbook, name, rows, widths) {
  const safeRows = rows.length ? rows : [{ 提示: "所選範圍暫時未有資料" }];
  const sheet = XLSX.utils.json_to_sheet(safeRows);
  sheet["!cols"] = widths.map((width) => ({ wch: width }));
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

function setBusy(busy, message = "") {
  ui.refreshButton.disabled = busy;
  ui.exportButton.disabled = busy;
  if (message) ui.dataStatus.textContent = message;
  ui.dataStatus.dataset.state = busy ? "loading" : ui.dataStatus.dataset.state;
}

function clearDashboard() {
  ui.studentCount.textContent = "0";
  ui.recordCount.textContent = "0";
  ui.distanceCount.textContent = "0";
  ui.classCount.textContent = "0";
  ui.dataStatus.textContent = "尚未載入資料。";
  ui.leaderboardPreview.innerHTML = '<tr><td colspan="5">登入後載入資料。</td></tr>';
}

async function getDatabase() {
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  if (!auth.currentUser) await signInAnonymously(auth);
  return getFirestore(app);
}

function loadSheetJs() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-sheetjs="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.XLSX), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = SHEETJS_URL;
    script.async = true;
    script.dataset.sheetjs = "true";
    script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error("SheetJS unavailable"));
    script.onerror = reject;
    document.head.append(script);
  });
}

function recordFailedAttempt() {
  const current = readAttempts();
  const count = current.lockedUntil > Date.now() ? current.count : current.count + 1;
  const locked = count >= MAX_ATTEMPTS;
  const next = {
    count: locked ? MAX_ATTEMPTS : count,
    lockedUntil: locked ? Date.now() + LOCK_DURATION : 0,
  };
  localStorage.setItem(ATTEMPT_KEY, JSON.stringify(next));
  return { ...next, locked };
}

function readAttempts() {
  try {
    const value = JSON.parse(localStorage.getItem(ATTEMPT_KEY) || "null");
    if (!value) return { count: 0, lockedUntil: 0 };
    if (value.lockedUntil && value.lockedUntil <= Date.now()) {
      clearFailedAttempts();
      return { count: 0, lockedUntil: 0 };
    }
    return { count: Number(value.count || 0), lockedUntil: Number(value.lockedUntil || 0) };
  } catch {
    return { count: 0, lockedUntil: 0 };
  }
}

function clearFailedAttempts() {
  localStorage.removeItem(ATTEMPT_KEY);
}

function currentLockUntil() {
  return readAttempts().lockedUntil;
}

function lockMessage() {
  const remaining = currentLockUntil() - Date.now();
  if (remaining <= 0) return "";
  return `登入暫時鎖定，請約 ${Math.ceil(remaining / 60_000)} 分鐘後再試。`;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return mismatch === 0;
}

function studentKeyOf(source) {
  return source.id || source.studentKey || `${source.classId || ""}__${source.studentId || ""}`;
}

function compareStudentStats(a, b) {
  return b.filteredDistance - a.filteredDistance
    || b.filteredBooks - a.filteredBooks
    || a.className.localeCompare(b.className, "zh-Hant")
    || a.studentId.localeCompare(b.studentId, "zh-Hant");
}

function recordDateKey(record) {
  if (record.readingDate) return normalizeDateKey(record.readingDate);
  if (record.submissionDateKey) return normalizeDateKey(record.submissionDateKey);
  const timestamp = recordTimestamp(record);
  return timestamp ? dateKeyInHongKong(new Date(timestamp)) : "";
}

function recordTimestamp(record) {
  if (record.createdAt?.toMillis) return record.createdAt.toMillis();
  if (record.createdAt?.seconds) return Number(record.createdAt.seconds) * 1000;
  const client = Date.parse(record.clientCreatedAt || "");
  if (Number.isFinite(client)) return client;
  const reading = Date.parse(record.readingDate || "");
  return Number.isFinite(reading) ? reading : 0;
}

function formatRecordDateTime(record) {
  const timestamp = recordTimestamp(record);
  return timestamp ? formatDateTime(new Date(timestamp)) : "";
}

function formatDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function dateKeyInHongKong(date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeDateKey(value) {
  const text = String(value || "").trim().replaceAll("/", "-");
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : "";
}

function todayKey() {
  return dateKeyInHongKong(new Date()).replaceAll("-", "");
}

function numberValue(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function round(value) {
  return Math.round(numberValue(value) * 100) / 100;
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-HK", { maximumFractionDigits: 2 }).format(numberValue(value));
}

function excelText(value) {
  const text = String(value || "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
