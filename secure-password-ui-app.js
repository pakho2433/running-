import { APP_CONFIG } from "./app-config.js";
import { initialiseSecurity, loadTeacherDashboardData, loginStudent, loginTeacher, logoutStudent, restoreStudent, restoreTeacher, saveReading, schoolDateKey, scoreReading, subscribeStudent } from "./secure-data-service.js?v=20260709-teacher-1";

const $ = (selector) => document.querySelector(selector);
const dom = {
  loginScreen: $("#loginScreen"),
  appShell: $("#appShell"),
  teacherShell: $("#teacherShell"),
  loginForm: $("#loginForm"),
  loginRoleStudent: $("#loginRoleStudent"),
  loginRoleTeacher: $("#loginRoleTeacher"),
  studentLoginFields: $("#studentLoginFields"),
  teacherLoginFields: $("#teacherLoginFields"),
  loginClass: $("#loginClass"),
  studentId: $("#studentId"),
  teacherEmail: $("#teacherEmail"),
  loginPassword: $("#loginPassword"),
  loginButton: $("#loginButton"),
  loginMessage: $("#loginMessage"),
  logoutButton: $("#logoutButton"),
  teacherLogoutButton: $("#teacherLogoutButton"),
  teacherRefreshButton: $("#teacherRefreshButton"),
  teacherDownloadButton: $("#teacherDownloadButton"),
  teacherSyncStatus: $("#teacherSyncStatus"),
  teacherStatus: $("#teacherStatus"),
  teacherNameLabel: $("#teacherNameLabel"),
  teacherEmailLabel: $("#teacherEmailLabel"),
  teacherSummaryCards: $("#teacherSummaryCards"),
  teacherClassRows: $("#teacherClassRows"),
  teacherStudentRows: $("#teacherStudentRows"),
  schoolTitle: $("#schoolTitle"),
  syncStatus: $("#syncStatus"),
  currentStudentLabel: $("#currentStudentLabel"),
  currentClassLabel: $("#currentClassLabel"),
  bookForm: $("#bookForm"),
  readingDate: $("#readingDate"),
  bookTitle: $("#bookTitle"),
  bookAuthor: $("#bookAuthor"),
  readingType: $("#readingType"),
  bookSubject: $("#bookSubject"),
  readingCompleted: $("#readingCompleted"),
  scorePreview: $("#scorePreview"),
  bookSubmit: $(".submit-reading-button"),
  myBooksCount: $("#myBooksCount"),
  myDistance: $("#myDistance"),
  myLastBook: $("#myLastBook"),
  classroomGrid: $("#classroomGrid"),
  trackTitle: $("#trackTitle"),
  trackRunnerCount: $("#trackRunnerCount"),
  trackLeader: $("#trackLeader"),
  locationButtons: $("#locationButtons"),
  currentLocationLabel: $("#currentLocationLabel"),
  trackRange: $("#trackRange"),
  trackCanvas: $("#trackCanvas"),
  trackEmpty: $("#trackEmpty"),
  leaderboardClass: $("#leaderboardClass"),
  leaderboardList: $("#leaderboardList"),
  runnerList: $("#runnerList"),
  toastRegion: $("#toastRegion"),
};

const STAGE_DISTANCE = Number(APP_CONFIG.stageDistance || 1500);
const LOCATION_COUNT = Number(APP_CONFIG.trackLocations || 10);
const state = {
  loginRole: "student",
  user: null,
  teacher: null,
  teacherData: null,
  classmates: [],
  location: 0,
  saving: false,
  teacherLoading: false,
};
let track = null;
let trackLoadAttempted = false;

start().catch((error) => {
  console.error("Reading Run start failed", error);
  showLogin();
  loginMessage("系統啟動失敗，請重新整理。", true);
});

async function start() {
  setupPasswordLoginUi();
  if (dom.schoolTitle) dom.schoolTitle.textContent = APP_CONFIG.schoolName;
  if (dom.readingDate) dom.readingDate.value = schoolDateKey();
  bindEvents();
  showLogin();
  await initialiseSecurity();

  try {
    const restoredStudent = await restoreStudent();
    if (restoredStudent) return enter(restoredStudent, true);
  } catch (error) {
    console.warn("Restore student session failed", error);
    await logoutStudent();
  }

  try {
    const restoredTeacher = await restoreTeacher();
    if (restoredTeacher) return enterTeacher(restoredTeacher, true);
  } catch (error) {
    console.warn("Restore teacher session failed", error);
    await logoutStudent();
  }
}

function setupPasswordLoginUi() {
  if (dom.loginClass) {
    dom.loginClass.replaceChildren(...APP_CONFIG.classrooms.map((room) => makeOption(room.id, room.name)));
  }
  const intro = $(".login-intro");
  if (intro) intro.textContent = "請選擇登入身份，輸入帳戶資料。";
  const note = $(".privacy-note");
  if (note) note.textContent = "請妥善保管登入資料；每次開啟或重新整理網頁後均須重新登入。";
  setLoginRole(document.querySelector("input[name='loginRole']:checked")?.value || "student");
}

function bindEvents() {
  dom.loginRoleStudent?.addEventListener("change", () => setLoginRole("student"));
  dom.loginRoleTeacher?.addEventListener("change", () => setLoginRole("teacher"));
  dom.loginForm?.addEventListener("submit", handleLogin);
  dom.logoutButton?.addEventListener("click", handleLogout);
  dom.teacherLogoutButton?.addEventListener("click", handleLogout);
  dom.teacherRefreshButton?.addEventListener("click", () => refreshTeacherData());
  dom.teacherDownloadButton?.addEventListener("click", handleTeacherDownload);
  dom.bookForm?.addEventListener("input", updateScore);
  dom.bookForm?.addEventListener("change", updateScore);
  dom.bookForm?.addEventListener("submit", handleBook);
}

function setLoginRole(role) {
  state.loginRole = role === "teacher" ? "teacher" : "student";
  const teacherMode = state.loginRole === "teacher";
  dom.studentLoginFields?.classList.toggle("is-hidden", teacherMode);
  dom.teacherLoginFields?.classList.toggle("is-hidden", !teacherMode);
  [dom.loginClass, dom.studentId].forEach((item) => {
    if (!item) return;
    item.disabled = teacherMode;
    item.required = !teacherMode;
  });
  if (dom.teacherEmail) {
    dom.teacherEmail.disabled = !teacherMode;
    dom.teacherEmail.required = teacherMode;
  }
  if (dom.loginPassword) {
    dom.loginPassword.placeholder = teacherMode ? "教師密碼" : "最少 6 位";
    dom.loginPassword.value = "";
  }
  if (dom.loginButton) dom.loginButton.textContent = teacherMode ? "登入教師平台" : "安全登入";
  loginMessage("");
}

async function handleLogin(event) {
  event.preventDefault();
  const password = String(dom.loginPassword?.value || "").trim();
  if (state.loginRole === "teacher") {
    await handleTeacherLogin(password);
    return;
  }

  const classId = normalise(dom.loginClass?.value, 12);
  const studentId = normalise(dom.studentId?.value, 20);
  if (!classId || !studentId || password.length < 6) {
    loginMessage("請選擇課室，並輸入學生 ID 及最少 6 位登入密碼。", true);
    return;
  }
  loginBusy(true);
  loginMessage("正在登入……");
  try {
    const user = await loginStudent(classId, studentId, password);
    await enter(user, false);
  } catch (error) {
    console.error("Student password login failed", error);
    loginMessage(loginError(error), true);
  } finally {
    loginBusy(false);
  }
}

async function handleTeacherLogin(password) {
  const email = cleanEmail(dom.teacherEmail?.value);
  if (!email || password.length < 8) {
    loginMessage("請輸入教師電郵及最少 8 位密碼。", true);
    return;
  }
  loginBusy(true);
  loginMessage("正在登入教師平台……");
  try {
    const teacher = await loginTeacher(email, password);
    await enterTeacher(teacher, false);
  } catch (error) {
    console.error("Teacher password login failed", error);
    loginMessage(loginError(error), true);
  } finally {
    loginBusy(false);
  }
}

async function enter(user, restored) {
  state.user = user;
  state.teacher = null;
  dom.loginScreen?.classList.add("is-hidden");
  dom.teacherShell?.classList.add("is-hidden");
  dom.appShell?.classList.remove("is-hidden");
  sync("saved", "● 已登入");
  await ensureTrack();
  subscribeStudent(user, (student) => {
    state.student = student;
    state.location = locationFor(student?.distance || 0);
    render();
  }, (classmates) => {
    state.classmates = classmates;
    render();
  }, dataError);
  track?.resize?.();
  if (!restored) toast(`歡迎回來，${user.studentId}！`);
}

async function enterTeacher(teacher, restored) {
  state.teacher = teacher;
  state.user = null;
  state.classmates = [];
  dom.loginScreen?.classList.add("is-hidden");
  dom.appShell?.classList.add("is-hidden");
  dom.teacherShell?.classList.remove("is-hidden");
  if (dom.teacherNameLabel) dom.teacherNameLabel.textContent = teacher.displayName || "教師";
  if (dom.teacherEmailLabel) dom.teacherEmailLabel.textContent = teacher.email || "";
  teacherStatus("saved", "● 已登入", "教師平台已登入。");
  await refreshTeacherData();
  if (!restored) toast(`教師平台已登入：${teacher.displayName || teacher.email}`);
}

async function ensureTrack() {
  if (track || trackLoadAttempted || !dom.trackCanvas) return;
  trackLoadAttempted = true;
  try {
    const { SecureTrack } = await import("./secure-track.js?v=20260709-password-login-1");
    track = new SecureTrack(dom.trackCanvas, STAGE_DISTANCE);
  } catch (error) {
    console.error("3D track failed to load, login remains available", error);
    if (dom.trackEmpty) {
      dom.trackEmpty.classList.remove("is-hidden");
      dom.trackEmpty.textContent = "3D 跑道暫時未能載入，但仍可提交閱讀紀錄。";
    }
  }
}

async function handleLogout() {
  await logoutStudent();
  state.user = null;
  state.teacher = null;
  state.student = null;
  state.classmates = [];
  location.reload();
}

async function handleBook(event) {
  event.preventDefault();
  if (!state.user || state.saving) return;
  if (!navigator.onLine) return toast("為保障每日上限，請連接網絡後再提交。", true);
  const record = readRecord();
  if (!record.title || !record.author) return toast("請輸入書本名稱及作者名稱。", true);
  state.saving = true;
  if (dom.bookSubmit) dom.bookSubmit.disabled = true;
  sync("saving", "● 安全儲存中");
  try {
    const result = await saveReading(state.user, record);
    clearForm();
    sync("saved", "● 已安全儲存");
    toast(`《${record.title}》已記錄，今日 ${result.count} / ${APP_CONFIG.dailyBookLimit || 5} 本。`);
  } catch (error) {
    console.error(error);
    sync("error", "● 儲存失敗");
    toast(error?.message === "DAILY_LIMIT" ? "今日已達 5 本上限。" : "未能儲存，請稍後再試。", true);
  } finally {
    state.saving = false;
    if (dom.bookSubmit) dom.bookSubmit.disabled = false;
  }
}

async function refreshTeacherData() {
  if (!state.teacher || state.teacherLoading) return;
  teacherBusy(true);
  teacherStatus("saving", "● 讀取中", "正在讀取全校學生數據……");
  try {
    const data = await loadTeacherDashboardData();
    state.teacherData = data;
    renderTeacherDashboard(data);
    teacherStatus("saved", "● 已同步", `已讀取 ${number(data.students.length)} 名學生。`);
  } catch (error) {
    console.error("Teacher dashboard load failed", error);
    teacherStatus("error", "● 讀取失敗", teacherError(error));
    toast("教師數據讀取失敗，請重新登入。", true);
  } finally {
    teacherBusy(false);
  }
}

async function handleTeacherDownload() {
  if (!state.teacher || state.teacherLoading) return;
  teacherBusy(true);
  teacherStatus("saving", "● 準備 Excel", "正在整理全校閱讀紀錄……");
  try {
    const data = await loadTeacherDashboardData({ includeLogs: true });
    state.teacherData = data;
    renderTeacherDashboard(data);
    downloadWorkbook(data);
    teacherStatus("saved", "● 已下載", `已下載 ${number(data.students.length)} 名學生及 ${number(data.logs.length)} 項閱讀紀錄。`);
  } catch (error) {
    console.error("Teacher export failed", error);
    teacherStatus("error", "● 下載失敗", teacherError(error));
    toast("Excel 下載失敗，請稍後再試。", true);
  } finally {
    teacherBusy(false);
  }
}

function renderTeacherDashboard(data) {
  const students = data.students || [];
  const logs = data.logs || [];
  const totalBooks = students.reduce((sum, item) => sum + item.booksCount, 0);
  const totalDistance = students.reduce((sum, item) => sum + item.distance, 0);
  const activeStudents = students.filter((item) => item.booksCount > 0 || item.distance > 0).length;
  renderMetricCards([
    ["學生總數", students.length, "已建立帳戶"],
    ["有閱讀紀錄", activeStudents, "名學生"],
    ["全校書本", totalBooks, "本"],
    ["全校里數", totalDistance, "里"],
  ]);
  renderClassRows(classSummary(students, logs));
  renderStudentRows(students);
}

function renderMetricCards(metrics) {
  if (!dom.teacherSummaryCards) return;
  dom.teacherSummaryCards.replaceChildren(...metrics.map(([label, value, unit]) => {
    const card = document.createElement("article");
    card.className = "teacher-metric";
    const span = document.createElement("span");
    span.textContent = label;
    const strong = document.createElement("strong");
    strong.textContent = number(value);
    const small = document.createElement("small");
    small.textContent = unit;
    card.append(span, strong, small);
    return card;
  }));
}

function renderClassRows(rows) {
  if (!dom.teacherClassRows) return;
  dom.teacherClassRows.replaceChildren(...rows.map((row) => {
    const tr = document.createElement("tr");
    [row.name, row.students, row.activeStudents, row.books, row.distance, row.logs].forEach((value) => tr.append(td(value)));
    return tr;
  }));
}

function renderStudentRows(students) {
  if (!dom.teacherStudentRows) return;
  dom.teacherStudentRows.replaceChildren(...students.map((student) => {
    const tr = document.createElement("tr");
    [
      roomName(student.classId),
      student.studentId,
      student.booksCount,
      student.distance,
      student.lastBook || "—",
      student.dailyBooksCount ? `${student.dailyBooksCount} / ${APP_CONFIG.dailyBookLimit || 5}` : "0",
      student.dailyDateKey || "—",
    ].forEach((value) => tr.append(td(value)));
    return tr;
  }));
}

function classSummary(students, logs = []) {
  const knownIds = APP_CONFIG.classrooms.map((room) => room.id);
  const extraIds = [...new Set(students.map((item) => item.classId).filter((id) => id && !knownIds.includes(id)))].sort();
  const ids = [...knownIds, ...extraIds];
  return ids.map((classId) => {
    const classStudents = students.filter((item) => item.classId === classId);
    const classLogs = logs.filter((item) => item.classId === classId);
    const books = classStudents.reduce((sum, item) => sum + item.booksCount, 0);
    const distance = classStudents.reduce((sum, item) => sum + item.distance, 0);
    return {
      classId,
      name: roomName(classId),
      students: classStudents.length,
      activeStudents: classStudents.filter((item) => item.booksCount > 0 || item.distance > 0).length,
      books,
      distance,
      logs: classLogs.length,
    };
  });
}

function downloadWorkbook(data) {
  const students = data.students || [];
  const logs = data.logs || [];
  const classRows = classSummary(students, logs);
  const workbook = workbookXml([
    {
      name: "班級統計",
      rows: [
        ["課室", "學生人數", "有閱讀紀錄學生", "總書本", "總里數", "閱讀紀錄數"],
        ...classRows.map((row) => [row.name, row.students, row.activeStudents, row.books, row.distance, row.logs]),
      ],
    },
    {
      name: "學生總覽",
      rows: [
        ["課室", "學生ID", "總書本", "總里數", "最近書本", "最近作者", "今日本數", "今日日期", "更新時間"],
        ...students.map((student) => [
          roomName(student.classId),
          student.studentId,
          student.booksCount,
          student.distance,
          student.lastBook,
          student.lastAuthor,
          student.dailyBooksCount,
          student.dailyDateKey,
          timestampText(student.updatedAt),
        ]),
      ],
    },
    {
      name: "閱讀紀錄",
      rows: [
        ["提交日期", "閱讀日期", "課室", "學生ID", "書名", "作者", "讀物類別", "科目", "完成閱讀", "獲得里數", "每日序號", "建立時間"],
        ...logs.map((log) => [
          log.submissionDateKey,
          log.readingDate,
          roomName(log.classId),
          log.studentId,
          log.title,
          log.author,
          log.readingType,
          log.subject,
          log.completed === "yes" ? "是" : "否",
          log.distanceAwarded,
          log.dailySequence,
          timestampText(log.createdAt) || log.clientCreatedAt,
        ]),
      ],
    },
  ]);
  const blob = new Blob([workbook], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `reading-run-school-data-${schoolDateKey()}.xls`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function workbookXml(sheets) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <Styles>
  <Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#dce7ef" ss:Pattern="Solid"/></Style>
 </Styles>
 ${sheets.map(sheetXml).join("\n")}
</Workbook>`;
}

function sheetXml(sheet) {
  return `<Worksheet ss:Name="${escapeXml(sheet.name.slice(0, 31))}">
  <Table>
   ${sheet.rows.map((row, index) => `<Row>${row.map((value) => cellXml(value, index === 0)).join("")}</Row>`).join("\n   ")}
  </Table>
 </Worksheet>`;
}

function cellXml(value, header = false) {
  const numberValue = Number(value);
  const numeric = typeof value === "number" && Number.isFinite(numberValue);
  const style = header ? ' ss:StyleID="Header"' : "";
  const type = numeric ? "Number" : "String";
  const text = numeric ? String(numberValue) : escapeXml(excelSafeText(value));
  return `<Cell${style}><Data ss:Type="${type}">${text}</Data></Cell>`;
}

function excelSafeText(value) {
  const text = String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function render() {
  if (!state.user) return;
  const student = state.student || {};
  const ranked = [...state.classmates].sort(compare).slice(0, APP_CONFIG.maxRunnersPerClass || 26);
  const visible = ranked.filter((item) => locationFor(item.distance) === state.location);
  const rangeStart = state.location * STAGE_DISTANCE;
  const rangeEnd = rangeStart + STAGE_DISTANCE;
  if (dom.currentStudentLabel) dom.currentStudentLabel.textContent = state.user.studentId;
  if (dom.currentClassLabel) dom.currentClassLabel.textContent = roomName(state.user.classId);
  if (dom.myBooksCount) dom.myBooksCount.textContent = number(student.booksCount);
  if (dom.myDistance) dom.myDistance.textContent = number(student.distance);
  if (dom.myLastBook) dom.myLastBook.textContent = student.lastBook ? `《${student.lastBook}》${student.lastAuthor ? `｜${student.lastAuthor}` : ""}` : "尚未提交";
  renderClassCard();
  if (dom.trackTitle) dom.trackTitle.textContent = `${roomName(state.user.classId)} 跑道`;
  if (dom.trackRunnerCount) dom.trackRunnerCount.textContent = String(visible.length);
  if (dom.trackLeader) dom.trackLeader.textContent = ranked[0]?.studentId || "—";
  if (dom.currentLocationLabel) dom.currentLocationLabel.textContent = `地方 ${state.location + 1} · ${number(rangeStart)}–${number(rangeEnd)} 里`;
  if (dom.trackRange) dom.trackRange.textContent = `${number(rangeStart)}–${number(rangeEnd)} 里`;
  dom.trackEmpty?.classList.toggle("is-hidden", visible.length > 0 && Boolean(track));
  renderLocations(ranked);
  renderRanking(ranked.slice(0, 5));
  renderRunnerList(visible);
  track?.setStudents?.(visible, state.user.key, state.location);
}

function renderClassCard() {
  if (!dom.classroomGrid) return;
  const total = state.classmates.reduce((sum, item) => sum + Number(item.distance || 0), 0);
  const classCard = document.createElement("button");
  classCard.type = "button";
  classCard.className = "classroom-card is-active";
  classCard.innerHTML = `<span class="classroom-name">${escapeHtml(roomName(state.user.classId))}</span><span class="classroom-meta"><span><strong>${state.classmates.length}</strong><br>名學生</span><span><strong>${number(total)}</strong><br>總里數</span></span>`;
  dom.classroomGrid.replaceChildren(classCard);
}

function renderLocations(students) {
  if (!dom.locationButtons) return;
  dom.locationButtons.replaceChildren(...Array.from({ length: LOCATION_COUNT }, (_, index) => {
    const start = index * STAGE_DISTANCE;
    const count = students.filter((item) => locationFor(item.distance) === index).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `location-card${index === state.location ? " is-active" : ""}`;
    button.innerHTML = `<strong>地方 ${index + 1}</strong><small>${number(start)}–${number(start + STAGE_DISTANCE)} 里</small><span class="location-count">${count} 人</span>`;
    button.addEventListener("click", () => { state.location = index; render(); });
    return button;
  }));
}

function renderRanking(students) {
  if (!dom.leaderboardList) return;
  if (dom.leaderboardClass) dom.leaderboardClass.textContent = roomName(state.user.classId);
  if (!students.length) {
    dom.leaderboardList.innerHTML = '<li class="leaderboard-empty">這個課室尚未有閱讀紀錄。</li>';
    return;
  }
  dom.leaderboardList.replaceChildren(...students.map((student, index) => {
    const item = document.createElement("li");
    item.className = "leaderboard-item";
    item.innerHTML = `<span class="leaderboard-rank">${["🥇", "🥈", "🥉", "4", "5"][index]}</span><span class="leaderboard-student">${escapeHtml(student.studentId)}</span><span class="leaderboard-distance">${number(student.distance)} 里</span>`;
    return item;
  }));
}

function renderRunnerList(students) {
  if (!dom.runnerList) return;
  dom.runnerList.replaceChildren(...students.map((student, index) => {
    const item = document.createElement("div");
    item.className = `runner-chip${student.id === state.user.key ? " is-me" : ""}`;
    item.innerHTML = `<span>${index === 0 ? "🏆 " : ""}${escapeHtml(student.studentId)}</span><small>${number(student.booksCount)} 本 · ${number(student.distance)} 里</small>`;
    return item;
  }));
}

function readRecord() {
  return {
    readingDate: dom.readingDate?.value || schoolDateKey(),
    title: clean(dom.bookTitle?.value, 80),
    author: clean(dom.bookAuthor?.value, 80),
    readingType: dom.readingType?.value || "",
    subject: dom.bookSubject?.value || "",
    completed: dom.readingCompleted?.value || "",
  };
}

function clearForm() {
  if (dom.readingDate) dom.readingDate.value = schoolDateKey();
  if (dom.bookTitle) dom.bookTitle.value = "";
  if (dom.bookAuthor) dom.bookAuthor.value = "";
  if (dom.readingType) dom.readingType.value = "";
  if (dom.bookSubject) dom.bookSubject.value = "";
  if (dom.readingCompleted) dom.readingCompleted.value = "";
  updateScore();
}

function updateScore() { if (dom.scorePreview) dom.scorePreview.textContent = String(scoreReading(readRecord())); }
function showLogin() { dom.appShell?.classList.add("is-hidden"); dom.teacherShell?.classList.add("is-hidden"); dom.loginScreen?.classList.remove("is-hidden"); sync("idle", "● 等待登入"); }
function loginBusy(value) {
  const teacherMode = state.loginRole === "teacher";
  [dom.loginRoleStudent, dom.loginRoleTeacher, dom.loginPassword, dom.loginButton].forEach((item) => { if (item) item.disabled = value; });
  [dom.loginClass, dom.studentId].forEach((item) => {
    if (!item) return;
    item.disabled = value || teacherMode;
    item.required = !teacherMode;
  });
  if (dom.teacherEmail) {
    dom.teacherEmail.disabled = value || !teacherMode;
    dom.teacherEmail.required = teacherMode;
  }
}
function teacherBusy(value) { state.teacherLoading = value; [dom.teacherRefreshButton, dom.teacherDownloadButton].forEach((item) => { if (item) item.disabled = value; }); }
function loginMessage(text, error = false) { if (dom.loginMessage) { dom.loginMessage.textContent = text; dom.loginMessage.dataset.state = error ? "error" : "loading"; } }
function teacherStatus(status, badge, text) { if (dom.teacherSyncStatus) { dom.teacherSyncStatus.dataset.state = status; dom.teacherSyncStatus.textContent = badge; } if (dom.teacherStatus) { dom.teacherStatus.textContent = text || ""; dom.teacherStatus.dataset.state = status; } }
function dataError(error) { console.error(error); sync("error", "● 權限或同步失敗"); toast("未能讀取資料，請重新登入。", true); }
function loginError(error) { if (error?.message === "MISSING_LOGIN_FIELDS") return "請輸入課室、學生 ID 及最少 6 位密碼。"; if (error?.message === "MISSING_TEACHER_LOGIN_FIELDS") return "請輸入教師電郵及最少 8 位密碼。"; if (error?.message === "STUDENT_ID_NOT_FOUND" || error?.code === "auth/user-not-found") return "未有此 ID，請檢查班別及學生 ID。"; if (error?.message === "PASSWORD_INCORRECT" || error?.code === "auth/invalid-credential" || error?.code === "auth/wrong-password") return "密碼不正確，請重新輸入。"; if (error?.message === "PROFILE_MISMATCH") return "帳戶身份與學生 ID 或班別不符，請聯絡教師。"; if (error?.message === "TEACHER_PROFILE_MISMATCH") return "此帳戶未啟用教師權限，請檢查帳戶設定。"; if (error?.code === "auth/operation-not-allowed") return "Firebase 尚未啟用 Email/Password 登入。"; return "暫時未能登入，請檢查網絡或帳戶設定。"; }
function teacherError(error) { if (error?.message === "TEACHER_PROFILE_MISMATCH") return "此帳戶未啟用教師權限。"; if (error?.code === "permission-denied") return "教師帳戶未獲授權讀取全校資料。"; return "未能讀取教師數據，請檢查網絡或重新登入。"; }
function locationFor(distance) { return Math.max(0, Math.min(LOCATION_COUNT - 1, Math.floor(Number(distance || 0) / STAGE_DISTANCE))); }
function compare(a, b) { return Number(b.distance || 0) - Number(a.distance || 0) || Number(b.booksCount || 0) - Number(a.booksCount || 0); }
function normalise(value, limit) { return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, limit); }
function clean(value, limit) { return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit); }
function cleanEmail(value) { return String(value || "").trim().toLowerCase().slice(0, 120); }
function roomName(id) { return APP_CONFIG.classrooms.find((room) => room.id === id)?.name || id; }
function number(value) { return new Intl.NumberFormat("zh-HK").format(Number(value || 0)); }
function makeOption(value, text) { const item = document.createElement("option"); item.value = value; item.textContent = text; return item; }
function td(value) { const cell = document.createElement("td"); cell.textContent = typeof value === "number" ? number(value) : String(value ?? ""); return cell; }
function timestampText(value) { if (typeof value?.toDate === "function") return value.toDate().toISOString().replace("T", " ").slice(0, 19); if (typeof value?.toMillis === "function") return new Date(value.toMillis()).toISOString().replace("T", " ").slice(0, 19); return String(value || ""); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character])); }
function escapeXml(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&apos;", '"': "&quot;" }[character])); }
function sync(status, text) { if (dom.syncStatus) { dom.syncStatus.dataset.state = status; dom.syncStatus.textContent = text; } }
function toast(text, error = false) { if (!dom.toastRegion) return; const item = document.createElement("div"); item.className = `toast${error ? " error" : ""}`; item.textContent = text; dom.toastRegion.append(item); setTimeout(() => item.remove(), 4000); }
