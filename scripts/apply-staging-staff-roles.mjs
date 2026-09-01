import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERSION = "20260901-staff-roles-1";

function replaceRegexOnce(source, regex, replacement, label) {
  const matches = [...source.matchAll(new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`))];
  if (matches.length !== 1) throw new Error(`${label}: expected 1 match, found ${matches.length}.`);
  return source.replace(regex, replacement);
}

function replaceTextOnce(source, search, replacement, label) {
  const count = source.split(search).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}.`);
  return source.replace(search, replacement);
}

async function patch(relativePath, transform) {
  const filePath = path.join(root, relativePath);
  const source = await readFile(filePath, "utf8");
  const next = transform(source);
  if (next !== source) await writeFile(filePath, next, "utf8");
  console.log(`✓ staff-role patch: ${relativePath}`);
}

await patch("dist/index.html", (source) => {
  if (!source.includes('id="loginRoleLibrarian"')) {
    source = replaceTextOnce(
      source,
      '<label><input id="loginRoleStudent" type="radio" name="loginRole" value="student" checked /><span>學生</span></label>\n          <label><input id="loginRoleTeacher" type="radio" name="loginRole" value="teacher" /><span>教師</span></label>',
      '<label><input id="loginRoleStudent" type="radio" name="loginRole" value="student" checked /><span>學生</span></label>\n          <label><input id="loginRoleTeacher" type="radio" name="loginRole" value="teacher" /><span>全校教師</span></label>\n          <label><input id="loginRoleLibrarian" type="radio" name="loginRole" value="librarian" /><span>圖書管理員</span></label>',
      "three login roles",
    );
    source = source.replace("<span>教師電郵</span><input id=\"teacherEmail\"", "<span>職員電郵</span><input id=\"teacherEmail\"");
  }

  source = source.replace(
    '<div><p class="eyebrow">TEACHER DASHBOARD</p><h1>全校閱讀數據</h1></div>',
    '<div><p id="staffDashboardEyebrow" class="eyebrow">SCHOOL READING MONITOR</p><h1 id="staffDashboardTitle">全校閱讀監察</h1></div>',
  );
  source = source.replace(
    '<button id="teacherDownloadButton" class="primary-button" type="button">下載全年 CSV</button>',
    '<button id="teacherDownloadButton" class="primary-button is-hidden" type="button">下載全年 CSV</button>',
  );
  source = source.replace(
    '<div><p class="panel-label">教師帳戶</p><strong id="teacherNameLabel">—</strong><span id="teacherEmailLabel">—</span></div>',
    '<div><p id="staffAccountLabel" class="panel-label">教師帳戶</p><strong id="teacherNameLabel">—</strong><span id="teacherEmailLabel">—</span></div>',
  );
  source = source.replace(
    '<tr><th>課室</th><th>學生 ID</th><th>書本</th><th>里數</th><th>最近書本</th><th>今日</th><th>日期</th></tr>',
    '<tr><th>課室</th><th>學生姓名</th><th>學生 ID</th><th>書本</th><th>里數</th><th>最近書本</th><th>最近閱讀日</th><th>持續閱讀</th></tr>',
  );
  source = source.replace(/\.\/app-stage\.js\?v=[^\"']+/g, `./app-stage.js?v=${VERSION}`);
  return source;
});

await patch("dist/teacher-dashboard.css", (source) => {
  source = source.replace("grid-template-columns: 1fr 1fr;", "grid-template-columns: repeat(3, minmax(0, 1fr));");
  source = source.replace("grid-template-columns: repeat(4, minmax(0, 1fr));", "grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));");
  return source;
});

await patch("dist/app-stage.js", (source) => source.replace(
  /\.\/secure-password-ui-app\.js\?v=[^\"']+/g,
  `./secure-password-ui-app.js?v=${VERSION}`,
));

await patch("dist/secure-data-service.js", (source) => {
  source = replaceRegexOnce(
    source,
    /export async function loginTeacher\(email, password\) \{[\s\S]*?\n\}\n\nexport async function restoreStudent/,
    `export async function loginTeacher(email, password, expectedRole = "teacher") {
  const role = expectedRole === "librarian" ? "librarian" : "teacher";
  const safeEmail = String(email || "").trim().toLowerCase();
  const safePassword = String(password || "").trim();
  if (!safeEmail || safePassword.length < TEACHER_PASSWORD_MIN_LENGTH) {
    throw new Error("MISSING_TEACHER_LOGIN_FIELDS");
  }
  try {
    const credential = await signInWithEmailAndPassword(auth, safeEmail, safePassword);
    return await authoriseTeacher(credential.user, role);
  } catch (error) {
    await signOut(auth).catch(() => {});
    console.warn(\`${'${role}'} sign-in was rejected\`, error?.code || error?.message || error);
    throw new Error(role === "librarian" ? "LIBRARIAN_LOGIN_FAILED" : "TEACHER_LOGIN_FAILED");
  }
}

export async function restoreStudent`,
    "role-aware staff login",
  );

  source = replaceRegexOnce(
    source,
    /export async function restoreTeacher\(\) \{[\s\S]*?\n\}\n\nasync function authoriseStudent/,
    `export async function restoreTeacher() {
  const session = readSession();
  if (!["teacher", "librarian"].includes(session?.role) || session?.schoolYear !== SCHOOL_YEAR) return null;
  if (!auth.currentUser || session?.studentKey) return null;
  return authoriseTeacher(auth.currentUser, session.role);
}

async function authoriseStudent`,
    "role-aware staff restore",
  );

  source = replaceRegexOnce(
    source,
    /async function authoriseTeacher\(user\) \{[\s\S]*?\n\}\n\nasync function ensureTeacher\(\) \{[\s\S]*?\n\}\n\nexport function subscribeStudent/,
    `async function authoriseTeacher(user, expectedRole = "teacher") {
  const role = expectedRole === "librarian" ? "librarian" : "teacher";
  const token = await getIdTokenResult(user, true);
  const profileSnapshot = await getDoc(doc(db, "users", user.uid));
  const profile = profileSnapshot.data() || {};
  const privilegeClaim = role === "librarian" ? token.claims?.librarian : token.claims?.teacher;
  if (
    privilegeClaim !== true
    || token.claims?.role !== role
    || String(token.claims?.schoolYear || "") !== SCHOOL_YEAR
    || profile.role !== role
    || profile.active !== true
    || String(profile.schoolYear || "") !== SCHOOL_YEAR
  ) {
    cachedTeacherAuthorisation = null;
    await signOut(auth).catch(() => {});
    throw new Error(role === "librarian" ? "LIBRARIAN_LOGIN_FAILED" : "TEACHER_LOGIN_FAILED");
  }
  const teacher = {
    uid: user.uid,
    role,
    schoolYear: SCHOOL_YEAR,
    email: user.email || profile.email || "",
    displayName: profile.displayName || profile.name || (role === "librarian" ? "圖書管理員" : "教師"),
  };
  cachedTeacherAuthorisation = {
    uid: user.uid,
    role,
    schoolYear: SCHOOL_YEAR,
    teacher,
  };
  writeSession({ role, schoolYear: SCHOOL_YEAR });
  return teacher;
}

async function ensureTeacher() {
  if (!auth.currentUser) throw new Error("TEACHER_NOT_SIGNED_IN");
  const session = readSession();
  if (!["teacher", "librarian"].includes(session?.role) || session?.schoolYear !== SCHOOL_YEAR) {
    throw new Error("TEACHER_NOT_SIGNED_IN");
  }
  if (
    cachedTeacherAuthorisation?.uid === auth.currentUser.uid
    && cachedTeacherAuthorisation.schoolYear === SCHOOL_YEAR
    && cachedTeacherAuthorisation.role === session.role
  ) {
    return cachedTeacherAuthorisation.teacher;
  }
  return authoriseTeacher(auth.currentUser, session.role);
}

export function subscribeStudent`,
    "role-aware staff authorisation",
  );

  source = replaceTextOnce(
    source,
    `export async function loadTeacherLogsPage(options = {}) {
  await ensureTeacher();
  return requestTeacherLogsPage(options);
}`,
    `export async function loadTeacherLogsPage(options = {}) {
  const staff = await ensureTeacher();
  if (staff.role !== "librarian") throw new Error("LIBRARIAN_REQUIRED");
  return requestTeacherLogsPage(options);
}`,
    "librarian-only log export client guard",
  );

  source = replaceTextOnce(
    source,
    `    lastAuthor: String(data.lastAuthor || ""),
    dailyBooksCount: Number(data.dailyBooksCount || 0),`,
    `    lastAuthor: String(data.lastAuthor || ""),
    lastReadingDate: String(data.lastReadingDate || ""),
    dailyBooksCount: Number(data.dailyBooksCount || 0),`,
    "last reading date in staff dashboard",
  );

  return source;
});

await patch("dist/secure-password-ui-app.js", (source) => {
  source = source.replace(/\.\/secure-data-service\.js\?v=[^\"']+/g, `./secure-data-service.js?v=${VERSION}`);
  source = replaceTextOnce(
    source,
    '  loginRoleTeacher: $("#loginRoleTeacher"),',
    '  loginRoleTeacher: $("#loginRoleTeacher"),\n  loginRoleLibrarian: $("#loginRoleLibrarian"),',
    "librarian login DOM",
  );
  source = replaceTextOnce(
    source,
    '  dom.loginRoleTeacher?.addEventListener("change", () => setLoginRole("teacher"));',
    '  dom.loginRoleTeacher?.addEventListener("change", () => setLoginRole("teacher"));\n  dom.loginRoleLibrarian?.addEventListener("change", () => setLoginRole("librarian"));',
    "librarian login event",
  );

  source = replaceRegexOnce(
    source,
    /function setLoginRole\(role\) \{[\s\S]*?\n\}\n\nasync function handleLogin/,
    `function setLoginRole(role) {
  state.loginRole = role === "librarian" ? "librarian" : role === "teacher" ? "teacher" : "student";
  const staffMode = state.loginRole !== "student";
  dom.studentLoginFields?.classList.toggle("is-hidden", staffMode);
  dom.teacherLoginFields?.classList.toggle("is-hidden", !staffMode);
  [dom.loginClass, dom.studentId].forEach((item) => {
    if (!item) return;
    item.disabled = staffMode;
    item.required = !staffMode;
  });
  if (dom.teacherEmail) {
    dom.teacherEmail.disabled = !staffMode;
    dom.teacherEmail.required = staffMode;
  }
  if (dom.loginPassword) {
    const minimum = staffMode
      ? Number(APP_CONFIG.teacherPasswordMinLength || 14)
      : Number(APP_CONFIG.studentPasswordMinLength || 12);
    const roleName = state.loginRole === "librarian" ? "圖書管理員" : "教師";
    dom.loginPassword.placeholder = staffMode ? \`最少 ${'${minimum}'} 位${'${roleName}'}密碼\` : \`最少 ${'${minimum}'} 位\`;
    dom.loginPassword.minLength = minimum;
    dom.loginPassword.value = "";
  }
  if (dom.loginButton) {
    dom.loginButton.textContent = state.loginRole === "librarian"
      ? "登入圖書管理平台"
      : state.loginRole === "teacher" ? "登入全校教師平台" : "安全登入";
  }
  loginMessage("");
}

async function handleLogin`,
    "three-role login mode",
  );

  source = source.replace(
    '  if (state.loginRole === "teacher") {\n    await handleTeacherLogin(password);',
    '  if (state.loginRole === "teacher" || state.loginRole === "librarian") {\n    await handleTeacherLogin(password);',
  );

  source = replaceRegexOnce(
    source,
    /async function handleTeacherLogin\(password\) \{[\s\S]*?\n\}\n\nasync function enter\(/,
    `async function handleTeacherLogin(password) {
  const email = cleanEmail(dom.teacherEmail?.value);
  const minimum = Number(APP_CONFIG.teacherPasswordMinLength || 14);
  const roleName = state.loginRole === "librarian" ? "圖書管理員" : "教師";
  if (!email || password.length < minimum) {
    loginMessage(\`請輸入${'${roleName}'}電郵及最少 ${'${minimum}'} 位密碼。\`, true);
    return;
  }
  loginBusy(true);
  loginMessage(\`正在登入${'${roleName}'}平台……\`);
  try {
    const teacher = await loginTeacher(email, password, state.loginRole);
    await enterTeacher(teacher, false);
  } catch (error) {
    console.error(\`${'${roleName}'} password login failed\`, error);
    loginMessage(loginError(error), true);
  } finally {
    loginBusy(false);
  }
}

async function enter(`,
    "role-aware staff login handler",
  );

  source = replaceRegexOnce(
    source,
    /async function enterTeacher\(teacher, restored\) \{[\s\S]*?\n\}\n\nasync function ensureTrack/,
    `async function enterTeacher(teacher, restored) {
  state.teacher = teacher;
  state.user = null;
  state.classmates = [];
  const librarian = teacher.role === "librarian";
  dom.loginScreen?.classList.add("is-hidden");
  dom.appShell?.classList.add("is-hidden");
  dom.teacherShell?.classList.remove("is-hidden");
  dom.teacherDownloadButton?.classList.toggle("is-hidden", !librarian);
  if (dom.teacherDownloadButton) dom.teacherDownloadButton.disabled = !librarian;
  const dashboardEyebrow = $("#staffDashboardEyebrow");
  const dashboardTitle = $("#staffDashboardTitle");
  const accountLabel = $("#staffAccountLabel");
  if (dashboardEyebrow) dashboardEyebrow.textContent = librarian ? "LIBRARY ADMIN ANALYTICS" : "SCHOOL READING MONITOR";
  if (dashboardTitle) dashboardTitle.textContent = librarian ? "圖書管理員｜全校數據分析" : "全校教師｜閱讀監察";
  if (accountLabel) accountLabel.textContent = librarian ? "圖書管理員帳戶" : "教師帳戶";
  if (dom.teacherNameLabel) dom.teacherNameLabel.textContent = teacher.displayName || (librarian ? "圖書管理員" : "教師");
  if (dom.teacherEmailLabel) dom.teacherEmailLabel.textContent = teacher.email || "";
  teacherStatus("saved", "● 已登入", librarian
    ? "圖書管理員平台已登入；可分析及匯出全校數據。"
    : "全校教師平台已登入；可查看 17 班閱讀里數及持續閱讀情況。");
  await refreshTeacherData();
  if (!restored) toast(\`${'${librarian ? "圖書管理員" : "教師"}'}平台已登入：${'${teacher.displayName || teacher.email}'}\`);
}

async function ensureTrack`,
    "role-aware staff dashboard",
  );

  source = source.replace(
    `async function handleTeacherDownload() {
  if (!state.teacher || state.teacherLoading) return;`,
    `async function handleTeacherDownload() {
  if (!state.teacher || state.teacherLoading) return;
  if (state.teacher.role !== "librarian") {
    toast("全年數據匯出只限已授權圖書管理員。", true);
    return;
  }`,
  );

  source = replaceRegexOnce(
    source,
    /function renderTeacherDashboard\(data\) \{[\s\S]*?\n\}\n\nfunction renderMetricCards/,
    `function renderTeacherDashboard(data) {
  const students = data.students || [];
  const totalBooks = students.reduce((sum, item) => sum + item.booksCount, 0);
  const totalDistance = students.reduce((sum, item) => sum + item.distance, 0);
  const activeStudents = students.filter((item) => item.booksCount > 0 || item.distance > 0).length;
  const recentReaders = students.filter((item) => daysSinceReading(item.lastReadingDate) <= 7).length;
  const followUp = students.filter((item) => {
    const days = daysSinceReading(item.lastReadingDate);
    return days === null || days > 14;
  }).length;
  renderMetricCards([
    ["學生總數", students.length, "已建立帳戶"],
    ["有閱讀紀錄", activeStudents, "名學生"],
    ["7日內有閱讀", recentReaders, "名學生"],
    ["需跟進", followUp, "未開始／逾14日"],
    ["全校書本", totalBooks, "本"],
    ["全校里數", totalDistance, "里"],
  ]);
  renderClassRows(classSummary(students));
  renderStudentRows(students);
}

function renderMetricCards`,
    "reading continuity metrics",
  );

  source = replaceRegexOnce(
    source,
    /function renderStudentRows\(students\) \{[\s\S]*?\n\}\n\nfunction classSummary/,
    `function renderStudentRows(students) {
  if (!dom.teacherStudentRows) return;
  dom.teacherStudentRows.replaceChildren(...students.map((student) => {
    const tr = document.createElement("tr");
    [
      roomName(student.classId),
      student.displayAlias || "—",
      student.studentId,
      student.booksCount,
      student.distance,
      student.lastBook || "—",
      student.lastReadingDate || "—",
      readingContinuity(student),
    ].forEach((value) => tr.append(td(value)));
    return tr;
  }));
}

function daysSinceReading(dateKey) {
  const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(String(dateKey || ""));
  const today = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(schoolDateKey());
  if (!match || !today) return null;
  const then = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const now = Date.UTC(Number(today[1]), Number(today[2]) - 1, Number(today[3]));
  return Math.max(0, Math.floor((now - then) / 86400000));
}

function readingContinuity(student) {
  const days = daysSinceReading(student.lastReadingDate);
  if (days === null) return Number(student.booksCount || 0) > 0 ? "日期待更新" : "未開始";
  if (days <= 7) return "持續閱讀";
  if (days <= 14) return `需留意（${'${days}'}日）`;
  return `需跟進（${'${days}'}日）`;
}

function classSummary`,
    "student continuity rows",
  );

  return source;
});

await patch("functions/index.js", (source) => {
  if (!source.includes("requireActiveLibrarian")) {
    source = replaceTextOnce(
      source,
      "    await requireActiveTeacher(uid, request.auth?.token || {});",
      "    await requireActiveLibrarian(uid, request.auth?.token || {});",
      "librarian-only export callable",
    );
    source = replaceRegexOnce(
      source,
      /async function requireActiveTeacher\(uid, token\) \{[\s\S]*?\n\}\n\nfunction validateExistingStudent/,
      `async function requireActiveLibrarian(uid, token) {
  if (
    token.librarian !== true
    || token.role !== "librarian"
    || token.schoolYear !== SCHOOL_YEAR
  ) {
    throw new HttpsError("permission-denied", "Librarian permission is required.");
  }
  const snapshot = await db.doc(\`users/${'${uid}'}\`).get();
  const profile = snapshot.data();
  if (
    !snapshot.exists
    || profile?.role !== "librarian"
    || profile?.active !== true
    || profile?.schoolYear !== SCHOOL_YEAR
  ) {
    throw new HttpsError("permission-denied", "Librarian account is not active.");
  }
}

function validateExistingStudent`,
      "librarian server authorisation",
    );
  }
  return source;
});

await patch("firestore.rules", (source) => {
  if (!source.includes("function isLibrarian()")) {
    const teacherBlock = `    function isTeacher() {
      return profileExists()
        && request.auth.token.teacher == true
        && request.auth.token.role == "teacher"
        && request.auth.token.schoolYear == "2026-2027"
        && profile().role == "teacher"
        && profile().active == true
        && profile().schoolYear == "2026-2027";
    }
`;
    const staffBlock = `${teacherBlock}
    function isLibrarian() {
      return profileExists()
        && request.auth.token.librarian == true
        && request.auth.token.role == "librarian"
        && request.auth.token.schoolYear == "2026-2027"
        && profile().role == "librarian"
        && profile().active == true
        && profile().schoolYear == "2026-2027";
    }

    function isStaff() {
      return isTeacher() || isLibrarian();
    }
`;
    source = replaceTextOnce(source, teacherBlock, staffBlock, "librarian firestore role");
    source = source.replace(
      'allow read: if (isTeacher() && resource.data.schoolYear == "2026-2027")',
      'allow read: if (isStaff() && resource.data.schoolYear == "2026-2027")',
    );
    source = source.replace(
      'allow read: if (isTeacher() && resource.data.schoolYear == "2026-2027")',
      'allow read: if (isStaff() && resource.data.schoolYear == "2026-2027")',
    );
    source = source.replace(
      'allow read: if (isTeacher() && resource.data.schoolYear == "2026-2027")',
      'allow read: if (isLibrarian() && resource.data.schoolYear == "2026-2027")',
    );
  }
  if ((source.match(/isStaff\(\) && resource\.data\.schoolYear/g) || []).length !== 2) {
    throw new Error("Firestore staff read policy was not applied to students and publicStudents exactly twice.");
  }
  if ((source.match(/isLibrarian\(\) && resource\.data\.schoolYear/g) || []).length !== 1) {
    throw new Error("Firestore librarian-only bookLogs policy was not applied exactly once.");
  }
  return source;
});

console.log("✅ Applied staging staff roles: student unchanged; teachers monitor all 17 classes; librarians alone can export detailed school data.");
