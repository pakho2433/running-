import { APP_CONFIG } from "./app-config.js";
import { initialiseSecurity, loginStudent, logoutStudent, restoreStudent, saveReading, schoolDateKey, scoreReading, subscribeStudent } from "./secure-data-service.js";
import { SecureTrack } from "./secure-track.js";

const $ = (selector) => document.querySelector(selector);
const dom = {
  loginScreen: $("#loginScreen"), appShell: $("#appShell"), loginForm: $("#loginForm"), loginClass: $("#loginClass"), studentId: $("#studentId"), loginButton: $("#loginButton"), loginMessage: $("#loginMessage"), logoutButton: $("#logoutButton"), schoolTitle: $("#schoolTitle"), syncStatus: $("#syncStatus"), currentStudentLabel: $("#currentStudentLabel"), currentClassLabel: $("#currentClassLabel"), bookForm: $("#bookForm"), readingDate: $("#readingDate"), bookTitle: $("#bookTitle"), bookAuthor: $("#bookAuthor"), readingType: $("#readingType"), bookSubject: $("#bookSubject"), readingCompleted: $("#readingCompleted"), scorePreview: $("#scorePreview"), bookSubmit: $(".submit-reading-button"), myBooksCount: $("#myBooksCount"), myDistance: $("#myDistance"), myLastBook: $("#myLastBook"), classroomGrid: $("#classroomGrid"), trackTitle: $("#trackTitle"), trackRunnerCount: $("#trackRunnerCount"), trackLeader: $("#trackLeader"), locationButtons: $("#locationButtons"), currentLocationLabel: $("#currentLocationLabel"), trackRange: $("#trackRange"), trackCanvas: $("#trackCanvas"), trackEmpty: $("#trackEmpty"), leaderboardClass: $("#leaderboardClass"), leaderboardList: $("#leaderboardList"), runnerList: $("#runnerList"), toastRegion: $("#toastRegion"),
};

const STAGE_DISTANCE = Number(APP_CONFIG.stageDistance || 1500);
const LOCATION_COUNT = Number(APP_CONFIG.trackLocations || 10);
const state = { user: null, student: null, classmates: [], location: 0, saving: false };
let track;

start().catch((error) => {
  console.error(error);
  showLogin();
  loginMessage("系統啟動失敗，請重新整理。", true);
});

async function start() {
  setupGoogleLoginUi();
  track = new SecureTrack(dom.trackCanvas, STAGE_DISTANCE);
  dom.schoolTitle.textContent = APP_CONFIG.schoolName;
  dom.loginClass.replaceChildren(...APP_CONFIG.classrooms.map((room) => makeOption(room.id, room.name)));
  dom.readingDate.value = schoolDateKey();
  bindEvents();
  await initialiseSecurity();
  try {
    const restored = await restoreStudent();
    if (restored) return enter(restored, true);
  } catch (error) {
    console.warn(error);
    await logoutStudent();
  }
  showLogin();
}

function setupGoogleLoginUi() {
  const pin = $("#studentPin");
  pin?.closest("label")?.remove();
  const intro = $(".login-intro");
  if (intro) intro.textContent = "請選擇課室、輸入學生 ID，然後使用學校 Google 帳戶登入。";
  const note = $(".privacy-note");
  if (note) note.textContent = "只允許 @twghscysps.edu.hk Google 帳戶登入；身份仍會按學生 ID 核對。";
  dom.loginButton.textContent = "使用學校 Google 登入";
}

function bindEvents() {
  dom.loginForm.addEventListener("submit", handleLogin);
  dom.logoutButton.addEventListener("click", handleLogout);
  dom.bookForm.addEventListener("input", updateScore);
  dom.bookForm.addEventListener("change", updateScore);
  dom.bookForm.addEventListener("submit", handleBook);
}

async function handleLogin(event) {
  event.preventDefault();
  const classId = normalise(dom.loginClass.value, 12);
  const studentId = normalise(dom.studentId.value, 20);
  if (!classId || !studentId) return loginMessage("請先選擇課室並輸入學生 ID。", true);
  loginBusy(true);
  loginMessage("正在開啟學校 Google 登入……");
  try {
    const user = await loginStudent(classId, studentId);
    await enter(user, false);
  } catch (error) {
    console.error(error);
    loginMessage(loginError(error), true);
  } finally {
    loginBusy(false);
  }
}

async function enter(user, restored) {
  state.user = user;
  dom.loginClass.value = user.classId;
  dom.studentId.value = user.studentId;
  dom.loginScreen.classList.add("is-hidden");
  dom.appShell.classList.remove("is-hidden");
  sync("saved", "● 已使用學校 Google 帳戶登入");
  subscribeStudent(user, (student) => {
    state.student = student;
    state.location = locationFor(student?.distance || 0);
    render();
  }, (classmates) => {
    state.classmates = classmates;
    render();
  }, dataError);
  track.resize();
  if (!restored) toast(`歡迎回來，${user.studentId}！`);
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
  dom.bookSubmit.disabled = true;
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
    dom.bookSubmit.disabled = false;
  }
}

function render() {
  if (!state.user) return;
  const student = state.student || {};
  const ranked = [...state.classmates].sort(compare).slice(0, APP_CONFIG.maxRunnersPerClass || 26);
  const visible = ranked.filter((item) => locationFor(item.distance) === state.location);
  const rangeStart = state.location * STAGE_DISTANCE;
  const rangeEnd = rangeStart + STAGE_DISTANCE;
  dom.currentStudentLabel.textContent = state.user.studentId;
  dom.currentClassLabel.textContent = roomName(state.user.classId);
  dom.myBooksCount.textContent = number(student.booksCount);
  dom.myDistance.textContent = number(student.distance);
  dom.myLastBook.textContent = student.lastBook ? `《${student.lastBook}》${student.lastAuthor ? `｜${student.lastAuthor}` : ""}` : "尚未提交";
  renderClassCard();
  dom.trackTitle.textContent = `${roomName(state.user.classId)} 跑道`;
  dom.trackRunnerCount.textContent = String(visible.length);
  dom.trackLeader.textContent = ranked[0]?.studentId || "—";
  dom.currentLocationLabel.textContent = `地方 ${state.location + 1} · ${number(rangeStart)}–${number(rangeEnd)} 里`;
  dom.trackRange.textContent = `${number(rangeStart)}–${number(rangeEnd)} 里`;
  dom.trackEmpty.classList.toggle("is-hidden", visible.length > 0);
  renderLocations(ranked);
  renderRanking(ranked.slice(0, 5));
  renderRunnerList(visible);
  track.setStudents(visible, state.user.key, state.location);
}

function renderClassCard() {
  const total = state.classmates.reduce((sum, item) => sum + Number(item.distance || 0), 0);
  const classCard = document.createElement("button");
  classCard.type = "button";
  classCard.className = "classroom-card is-active";
  classCard.innerHTML = `<span class="classroom-name">${escapeHtml(roomName(state.user.classId))}</span><span class="classroom-meta"><span><strong>${state.classmates.length}</strong><br>名學生</span><span><strong>${number(total)}</strong><br>總里數</span></span>`;
  dom.classroomGrid.replaceChildren(classCard);
}

function renderLocations(students) {
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
  dom.leaderboardClass.textContent = roomName(state.user.classId);
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
  dom.runnerList.replaceChildren(...students.map((student, index) => {
    const item = document.createElement("div");
    item.className = `runner-chip${student.id === state.user.key ? " is-me" : ""}`;
    item.innerHTML = `<span>${index === 0 ? "🏆 " : ""}${escapeHtml(student.studentId)}</span><small>${number(student.booksCount)} 本 · ${number(student.distance)} 里</small>`;
    return item;
  }));
}

function readRecord() {
  return {
    readingDate: dom.readingDate.value || schoolDateKey(),
    title: clean(dom.bookTitle.value, 80),
    author: clean(dom.bookAuthor.value, 80),
    readingType: dom.readingType.value || "",
    subject: dom.bookSubject.value || "",
    completed: dom.readingCompleted.value || "",
  };
}

function clearForm() {
  dom.readingDate.value = schoolDateKey();
  dom.bookTitle.value = "";
  dom.bookAuthor.value = "";
  dom.readingType.value = "";
  dom.bookSubject.value = "";
  dom.readingCompleted.value = "";
  updateScore();
}

function updateScore() { dom.scorePreview.textContent = String(scoreReading(readRecord())); }
function showLogin() { dom.appShell.classList.add("is-hidden"); dom.loginScreen.classList.remove("is-hidden"); sync("idle", "● 等待學校 Google 登入"); }
function loginBusy(value) { [dom.loginClass, dom.studentId, dom.loginButton].forEach((item) => { if (item) item.disabled = value; }); }
function loginMessage(text, error = false) { dom.loginMessage.textContent = text; dom.loginMessage.dataset.state = error ? "error" : "loading"; }
function dataError(error) { console.error(error); sync("error", "● 權限或同步失敗"); toast("未能讀取資料，請重新登入。", true); }
function loginError(error) { if (error?.message === "INVALID_DOMAIN") return "請使用 @twghscysps.edu.hk 學校 Google 帳戶登入。"; if (error?.message === "PROFILE_MISMATCH") return "Google 帳戶與班別或學生 ID 不符。"; if (error?.code === "auth/popup-closed-by-user") return "你已取消 Google 登入。"; return "暫時未能登入，請檢查 Google 帳戶及網絡。"; }
function locationFor(distance) { return Math.max(0, Math.min(LOCATION_COUNT - 1, Math.floor(Number(distance || 0) / STAGE_DISTANCE))); }
function compare(a, b) { return Number(b.distance || 0) - Number(a.distance || 0) || Number(b.booksCount || 0) - Number(a.booksCount || 0); }
function normalise(value, limit) { return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, limit); }
function clean(value, limit) { return String(value || "").trim().replace(/\s+/g, " ").slice(0, limit); }
function roomName(id) { return APP_CONFIG.classrooms.find((room) => room.id === id)?.name || id; }
function number(value) { return new Intl.NumberFormat("zh-HK").format(Number(value || 0)); }
function makeOption(value, text) { const item = document.createElement("option"); item.value = value; item.textContent = text; return item; }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character])); }
function sync(status, text) { dom.syncStatus.dataset.state = status; dom.syncStatus.textContent = text; }
function toast(text, error = false) { const item = document.createElement("div"); item.className = `toast${error ? " error" : ""}`; item.textContent = text; dom.toastRegion.append(item); setTimeout(() => item.remove(), 4000); }
