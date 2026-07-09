import { APP_CONFIG } from "./app-config.js";
import { initialiseSecurity, loginStudent, logoutStudent, restoreStudent, saveReading, schoolDateKey, scoreReading, subscribeStudent } from "./secure-data-service.js?v=20260709-secure-login-3";

const $ = (selector) => document.querySelector(selector);
const dom = {
  loginScreen: $("#loginScreen"), appShell: $("#appShell"), loginForm: $("#loginForm"), loginClass: $("#loginClass"), studentId: $("#studentId"), loginPassword: $("#loginPassword"), loginButton: $("#loginButton"), loginMessage: $("#loginMessage"), logoutButton: $("#logoutButton"), schoolTitle: $("#schoolTitle"), syncStatus: $("#syncStatus"), currentStudentLabel: $("#currentStudentLabel"), currentClassLabel: $("#currentClassLabel"), bookForm: $("#bookForm"), readingDate: $("#readingDate"), bookTitle: $("#bookTitle"), bookAuthor: $("#bookAuthor"), readingType: $("#readingType"), bookSubject: $("#bookSubject"), readingCompleted: $("#readingCompleted"), scorePreview: $("#scorePreview"), bookSubmit: $(".submit-reading-button"), myBooksCount: $("#myBooksCount"), myDistance: $("#myDistance"), myLastBook: $("#myLastBook"), classroomGrid: $("#classroomGrid"), trackTitle: $("#trackTitle"), trackRunnerCount: $("#trackRunnerCount"), trackLeader: $("#trackLeader"), locationButtons: $("#locationButtons"), currentLocationLabel: $("#currentLocationLabel"), trackRange: $("#trackRange"), trackCanvas: $("#trackCanvas"), trackEmpty: $("#trackEmpty"), leaderboardClass: $("#leaderboardClass"), leaderboardList: $("#leaderboardList"), runnerList: $("#runnerList"), toastRegion: $("#toastRegion"),
};

const STAGE_DISTANCE = Number(APP_CONFIG.stageDistance || 1500);
const LOCATION_COUNT = Number(APP_CONFIG.trackLocations || 10);
const state = { user: null, student: null, classmates: [], location: 0, saving: false };
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
    const restored = await restoreStudent();
    if (restored) return enter(restored, true);
  } catch (error) {
    console.warn("Restore student session failed", error);
    await logoutStudent();
  }
}

function setupPasswordLoginUi() {
  if (dom.loginClass) {
    dom.loginClass.replaceChildren(...APP_CONFIG.classrooms.map((room) => makeOption(room.id, room.name)));
  }
  const intro = $(".login-intro");
  if (intro) intro.textContent = "請選擇課室，輸入學生 ID 及登入密碼。";
  const note = $(".privacy-note");
  if (note) note.textContent = "學生密碼由教師派發；每次開啟或重新整理網頁後均須重新登入。";
  if (dom.loginButton) dom.loginButton.textContent = "安全登入";
}

function bindEvents() {
  dom.loginForm?.addEventListener("submit", handleLogin);
  dom.logoutButton?.addEventListener("click", handleLogout);
  dom.bookForm?.addEventListener("input", updateScore);
  dom.bookForm?.addEventListener("change", updateScore);
  dom.bookForm?.addEventListener("submit", handleBook);
}

async function handleLogin(event) {
  event.preventDefault();
  const classId = normalise(dom.loginClass?.value, 12);
  const studentId = normalise(dom.studentId?.value, 20);
  const password = String(dom.loginPassword?.value || "").trim();
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

async function enter(user, restored) {
  state.user = user;
  dom.loginScreen?.classList.add("is-hidden");
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
function showLogin() { dom.appShell?.classList.add("is-hidden"); dom.loginScreen?.classList.remove("is-hidden"); sync("idle", "● 等待登入"); }
function loginBusy(value) { [dom.loginClass, dom.studentId, dom.loginPassword, dom.loginButton].forEach((item) => { if (item) item.disabled = value; }); }
function loginMessage(text, error = false) { if (dom.loginMessage) { dom.loginMessage.textContent = text; dom.loginMessage.dataset.state = error ? "error" : "loading"; } }
function dataError(error) { console.error(error); sync("error", "● 權限或同步失敗"); toast("未能讀取資料，請重新登入。", true); }
function loginError(error) { if (error?.message === "MISSING_LOGIN_FIELDS") return "請輸入課室、學生 ID 及最少 6 位密碼。"; if (error?.message === "STUDENT_ID_NOT_FOUND" || error?.code === "auth/user-not-found") return "未有此 ID，請檢查班別及學生 ID。"; if (error?.message === "PASSWORD_INCORRECT" || error?.code === "auth/invalid-credential" || error?.code === "auth/wrong-password") return "密碼不正確，請重新輸入。"; if (error?.message === "PROFILE_MISMATCH") return "帳戶身份與學生 ID 或班別不符，請聯絡教師。"; if (error?.code === "auth/operation-not-allowed") return "Firebase 尚未啟用 Email/Password 登入。"; return "暫時未能登入，請檢查網絡或帳戶設定。"; }
function locationFor(distance) { return Math.max(0, Math.min(LOCATION_COUNT - 1, Math.floor(Number(distance || 0) / STAGE_DISTANCE))); }
function compare(a, b) { return Number(b.distance || 0) - Number(a.distance || 0) || Number(b.booksCount || 0) - Number(a.booksCount || 0); }
function normalise(value, limit) { return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, limit); }
function clean(value, limit) { return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit); }
function roomName(id) { return APP_CONFIG.classrooms.find((room) => room.id === id)?.name || id; }
function number(value) { return new Intl.NumberFormat("zh-HK").format(Number(value || 0)); }
function makeOption(value, text) { const item = document.createElement("option"); item.value = value; item.textContent = text; return item; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character])); }
function sync(status, text) { if (dom.syncStatus) { dom.syncStatus.dataset.state = status; dom.syncStatus.textContent = text; } }
function toast(text, error = false) { if (!dom.toastRegion) return; const item = document.createElement("div"); item.className = `toast${error ? " error" : ""}`; item.textContent = text; dom.toastRegion.append(item); setTimeout(() => item.remove(), 4000); }
