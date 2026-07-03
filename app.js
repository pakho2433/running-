import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  collection,
  doc,
  enableIndexedDbPersistence,
  getDoc,
  getFirestore,
  increment,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { APP_CONFIG } from "./app-config.js";
import { firebaseConfig } from "./firebase-config.js";

const KEYS = {
  session: "reading-run-session-v1",
  demo: "reading-run-demo-students-v1",
  pending: "reading-run-pending-books-v1",
};

const $ = (selector) => document.querySelector(selector);
const dom = {
  loginScreen: $("#loginScreen"), appShell: $("#appShell"), loginForm: $("#loginForm"),
  loginClass: $("#loginClass"), studentId: $("#studentId"), loginButton: $("#loginButton"),
  loginMessage: $("#loginMessage"), logoutButton: $("#logoutButton"), schoolTitle: $("#schoolTitle"),
  syncStatus: $("#syncStatus"), currentStudentLabel: $("#currentStudentLabel"),
  currentClassLabel: $("#currentClassLabel"), bookForm: $("#bookForm"), bookTitle: $("#bookTitle"),
  myBooksCount: $("#myBooksCount"), myDistance: $("#myDistance"), myLastBook: $("#myLastBook"),
  classroomGrid: $("#classroomGrid"), trackTitle: $("#trackTitle"),
  trackRunnerCount: $("#trackRunnerCount"), trackLeader: $("#trackLeader"),
  trackCanvas: $("#trackCanvas"), trackEmpty: $("#trackEmpty"), runnerList: $("#runnerList"),
  toastRegion: $("#toastRegion"),
};

const state = {
  cloud: Object.values(firebaseConfig).every((value) => value && !String(value).startsWith("PASTE_YOUR_")),
  auth: null, db: null, user: null, students: [], unsubscribe: null,
  selectedClass: APP_CONFIG.classrooms[0]?.id, saving: false,
};
let track;

class TrackScene {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xccecff);
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);
    this.camera.position.set(0, 25, 43);
    this.camera.lookAt(0, 1.5, -38);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    container.append(this.renderer.domElement);
    this.runners = [];
    this.clock = new THREE.Clock();
    this.buildTrack();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.animate();
  }

  buildTrack() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x53735b, 2.3));
    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(15, 32, 22);
    sun.castShadow = true;
    this.scene.add(sun);

    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 190),
      new THREE.MeshStandardMaterial({ color: 0x70b75d, roughness: 1 }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(0, -0.25, -42);
    grass.receiveShadow = true;
    this.scene.add(grass);

    const road = new THREE.Mesh(
      new THREE.BoxGeometry(25, 0.45, 145),
      new THREE.MeshStandardMaterial({ color: 0xc65f48, roughness: 0.9 }),
    );
    road.position.set(0, 0, -43);
    road.receiveShadow = true;
    this.scene.add(road);

    for (let lane = 0; lane <= 8; lane += 1) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.04, 143),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      line.position.set(-12.25 + lane * 3.06, 0.25, -43);
      this.scene.add(line);
    }

    for (let marker = 0; marker <= 5; marker += 1) {
      const label = this.label(`${marker * 500}m`, "#173f5f", "rgba(255,255,255,.94)", 1.5);
      label.position.set(14.5, 1.7, 27 - marker * 27.8);
      this.scene.add(label);
    }

    const finish = new THREE.Group();
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 20; col += 1) {
        const tile = new THREE.Mesh(
          new THREE.BoxGeometry(1.23, 0.05, 0.65),
          new THREE.MeshBasicMaterial({ color: (row + col) % 2 ? 0xffffff : 0x182430 }),
        );
        tile.position.set(-11.68 + col * 1.23, 0.27, -112 + row * 0.65);
        finish.add(tile);
      }
    }
    this.scene.add(finish);
  }

  setStudents(students, currentKey) {
    this.runners.forEach((group) => {
      this.scene.remove(group);
      group.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((m) => m.dispose());
        else object.material?.dispose?.();
      });
    });
    this.runners = students.map((student, index) => {
      const runner = this.makeRunner(student, index, student.id === currentKey);
      this.scene.add(runner);
      return runner;
    });
  }

  makeRunner(student, index, isMe) {
    const group = new THREE.Group();
    const lane = index % 8;
    const pack = Math.floor(index / 8);
    const progress = Math.min(1, Number(student.distance || 0) / 2500);
    group.position.set(-10.7 + lane * 3.06, 0.35, 25.2 - progress * 134 - pack * 1.2);

    const colours = [0x176b87, 0xff7b54, 0x6a4c93, 0x2a9d8f, 0xe76f51, 0x3a86ff, 0x8a5a44, 0x5f6caf];
    const skin = new THREE.MeshStandardMaterial({ color: 0xf1bd8c, roughness: 0.9 });
    const shirt = new THREE.MeshStandardMaterial({ color: isMe ? 0xffb703 : colours[index % colours.length] });
    const shorts = new THREE.MeshStandardMaterial({ color: 0x23334d });
    const shoes = new THREE.MeshStandardMaterial({ color: 0xffffff });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 0.72, 5, 8), shirt);
    torso.position.y = 2.2;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 12), skin);
    head.position.y = 3.35;
    torso.castShadow = head.castShadow = true;
    group.add(torso, head);

    const leftArm = this.limb(0.17, 0.95, skin, 0.58, 2.55);
    const rightArm = this.limb(0.17, 0.95, skin, -0.58, 2.55);
    const leftLeg = this.limb(0.21, 1.18, shorts, 0.28, 1.38, shoes);
    const rightLeg = this.limb(0.21, 1.18, shorts, -0.28, 1.38, shoes);
    group.add(leftArm, rightArm, leftLeg, rightLeg);

    const label = this.label(
      `${student.studentId} · ${Number(student.booksCount || 0)}本`,
      isMe ? "#6b4900" : "#173f5f",
      isMe ? "#fff3bf" : "rgba(255,255,255,.94)",
      1.15,
    );
    label.position.set(0, 4.5, 0);
    group.add(label);
    group.userData = { phase: index * 0.7, baseY: group.position.y, torso, head, leftArm, rightArm, leftLeg, rightLeg };
    return group;
  }

  limb(width, length, material, x, y, footMaterial = null) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const limb = new THREE.Mesh(new THREE.CapsuleGeometry(width, length, 4, 7), material);
    limb.position.y = -length * 0.48;
    limb.castShadow = true;
    pivot.add(limb);
    if (footMaterial) {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.22, 0.72), footMaterial);
      foot.position.set(0, -length - 0.12, 0.15);
      pivot.add(foot);
    }
    return pivot;
  }

  label(text, textColor, backgroundColor, scale = 1) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = backgroundColor;
    roundedRect(ctx, 10, 14, 492, 132, 34);
    ctx.fill();
    ctx.fillStyle = textColor;
    ctx.font = "700 54px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 256, 82, 460);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.scale.set(4.6 * scale, 1.45 * scale, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  animate = () => {
    requestAnimationFrame(this.animate);
    const time = this.clock.getElapsedTime();
    this.runners.forEach((group) => {
      const d = group.userData;
      const swing = Math.sin(time * 7.5 + d.phase) * 0.75;
      d.leftArm.rotation.x = swing;
      d.rightArm.rotation.x = -swing;
      d.leftLeg.rotation.x = -swing * 0.78;
      d.rightLeg.rotation.x = swing * 0.78;
      group.position.y = d.baseY + Math.abs(Math.sin(time * 7.5 + d.phase)) * 0.1;
      d.torso.rotation.z = Math.sin(time * 3.7 + d.phase) * 0.035;
      d.head.rotation.y = Math.sin(time * 2.2 + d.phase) * 0.08;
    });
    this.renderer.render(this.scene, this.camera);
  };
}

async function boot() {
  track = new TrackScene(dom.trackCanvas);
  dom.schoolTitle.textContent = APP_CONFIG.schoolName;
  dom.loginClass.replaceChildren(...APP_CONFIG.classrooms.map((room) => option(room.id, room.name)));
  bindEvents();

  if (state.cloud) await connectFirebase();
  else {
    state.students = read(KEYS.demo, []);
    sync("error", "● 示範模式：尚未連接 Firebase");
  }

  const session = read(KEYS.session, null);
  if (session?.studentId && roomExists(session.classId)) await login(session.classId, session.studentId, true);
  else showLogin();
}

function bindEvents() {
  dom.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    dom.loginMessage.textContent = "";
    const id = normaliseId(dom.studentId.value);
    if (!id) return void (dom.loginMessage.textContent = "請輸入有效的學生 ID（英文字母或數字）。");
    dom.loginButton.disabled = true;
    try { await login(dom.loginClass.value, id); }
    catch (error) { console.error(error); dom.loginMessage.textContent = friendlyError(error); }
    finally { dom.loginButton.disabled = false; }
  });

  dom.logoutButton.addEventListener("click", () => {
    localStorage.removeItem(KEYS.session);
    state.user = null;
    showLogin();
  });

  dom.bookForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = dom.bookTitle.value.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!title || !state.user || state.saving) return;
    dom.bookTitle.value = "";
    await addBook(title);
  });

  addEventListener("online", () => state.cloud && flushPending());
}

async function connectFirebase() {
  const app = initializeApp(firebaseConfig);
  state.auth = getAuth(app);
  state.db = getFirestore(app);
  try { await enableIndexedDbPersistence(state.db); } catch (error) {
    if (!["failed-precondition", "unimplemented"].includes(error?.code)) console.warn(error);
  }
  sync("saving", "● 連接雲端中");
  await signInAnonymously(state.auth);
  sync("saved", "● 已連接雲端");
  state.unsubscribe = onSnapshot(collection(state.db, "students"), (snapshot) => {
    state.students = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderAll();
    sync("saved", "● 已自動儲存");
  }, (error) => {
    console.error(error);
    sync("error", "● 雲端同步失敗");
    toast("未能讀取雲端資料，請檢查 Firestore Rules。", true);
  });
  await flushPending();
}

async function login(classId, rawId, restored = false) {
  const studentId = normaliseId(rawId);
  if (!roomExists(classId) || !studentId) throw new Error("INVALID_LOGIN");
  if (state.cloud && !state.auth?.currentUser) await signInAnonymously(state.auth);

  state.user = { classId, studentId, key: `${classId}__${studentId}` };
  state.selectedClass = classId;
  write(KEYS.session, { classId, studentId });

  if (state.cloud) {
    sync("saving", "● 載入進度中");
    const ref = doc(state.db, "students", state.user.key);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await setDoc(ref, { classId, studentId, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      await setDoc(ref, { classId, studentId, booksCount: 0, distance: 0, lastBook: "", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    }
  } else if (!state.students.some((student) => student.id === state.user.key)) {
    state.students.push({ id: state.user.key, classId, studentId, booksCount: 0, distance: 0, lastBook: "" });
    write(KEYS.demo, state.students);
  }

  dom.loginClass.value = classId;
  dom.studentId.value = studentId;
  dom.loginScreen.classList.add("is-hidden");
  dom.appShell.classList.remove("is-hidden");
  track.resize();
  renderAll();
  if (!restored) toast(`歡迎回來，${studentId}！`);
}

async function addBook(title) {
  const event = {
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    classId: state.user.classId, studentId: state.user.studentId, studentKey: state.user.key,
    title, createdAt: new Date().toISOString(),
  };
  state.saving = true;
  sync("saving", "● 儲存中");
  applyBook(event);
  try {
    if (state.cloud) {
      await commit(event);
      removePending(event.id);
      sync("saved", "● 已自動儲存");
    } else {
      write(KEYS.demo, state.students);
      sync("error", "● 已儲存在本機（未連接 Firebase）");
    }
    toast(`《${title}》已記錄，向前跑 ${APP_CONFIG.distancePerBook} 米！`);
  } catch (error) {
    console.error(error);
    queue(event);
    sync("error", "● 已離線暫存，連線後補交");
    toast("網絡暫時中斷，紀錄已保留在此裝置。", true);
  } finally { state.saving = false; }
}

async function commit(event) {
  const studentRef = doc(state.db, "students", event.studentKey);
  const logRef = doc(state.db, "bookLogs", event.id);
  await runTransaction(state.db, async (tx) => {
    if ((await tx.get(logRef)).exists()) return;
    tx.set(logRef, { classId: event.classId, studentId: event.studentId, studentKey: event.studentKey, title: event.title, clientCreatedAt: event.createdAt, createdAt: serverTimestamp() });
    tx.set(studentRef, { classId: event.classId, studentId: event.studentId, booksCount: increment(1), distance: increment(APP_CONFIG.distancePerBook), lastBook: event.title, updatedAt: serverTimestamp() }, { merge: true });
  });
}

async function flushPending() {
  const items = read(KEYS.pending, []);
  if (!state.cloud || !items.length || !navigator.onLine) return;
  sync("saving", `● 補交 ${items.length} 項紀錄`);
  const failed = [];
  for (const item of items) {
    try { await commit(item); } catch (error) { console.error(error); failed.push(item); }
  }
  write(KEYS.pending, failed);
  sync(failed.length ? "error" : "saved", failed.length ? "● 部分紀錄待同步" : "● 已自動儲存");
}

function applyBook(event) {
  const index = state.students.findIndex((student) => student.id === event.studentKey);
  if (index >= 0) state.students[index] = { ...state.students[index], booksCount: Number(state.students[index].booksCount || 0) + 1, distance: Number(state.students[index].distance || 0) + APP_CONFIG.distancePerBook, lastBook: event.title };
  else state.students.push({ id: event.studentKey, classId: event.classId, studentId: event.studentId, booksCount: 1, distance: APP_CONFIG.distancePerBook, lastBook: event.title });
  renderAll();
}

function renderAll() {
  if (state.user) {
    const student = state.students.find((item) => item.id === state.user.key);
    dom.currentStudentLabel.textContent = state.user.studentId;
    dom.currentClassLabel.textContent = room(state.user.classId)?.name || state.user.classId;
    dom.myBooksCount.textContent = number(student?.booksCount);
    dom.myDistance.textContent = number(student?.distance);
    dom.myLastBook.textContent = student?.lastBook || "尚未提交";
  }

  dom.classroomGrid.replaceChildren(...APP_CONFIG.classrooms.map((classroom) => {
    const students = inClass(classroom.id);
    const total = students.reduce((sum, student) => sum + Number(student.distance || 0), 0);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `classroom-card${state.selectedClass === classroom.id ? " is-active" : ""}`;
    button.innerHTML = `<span class="classroom-name">${escape(classroom.name)}</span><span class="classroom-meta"><span><strong>${students.length}</strong><br>名學生</span><span><strong>${number(total)}</strong><br>總米數</span></span>`;
    button.onclick = () => {
      state.selectedClass = classroom.id;
      renderAll();
      $(".track-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    return button;
  }));

  const selected = inClass(state.selectedClass)
    .sort((a, b) => Number(b.distance || 0) - Number(a.distance || 0) || String(a.studentId).localeCompare(String(b.studentId)))
    .slice(0, APP_CONFIG.maxRunnersPerClass);
  dom.trackTitle.textContent = `${room(state.selectedClass)?.name || state.selectedClass} 跑道`;
  dom.trackRunnerCount.textContent = String(selected.length);
  dom.trackLeader.textContent = selected[0]?.studentId || "—";
  dom.trackEmpty.classList.toggle("is-hidden", selected.length > 0);
  track.setStudents(selected, state.user?.key);
  dom.runnerList.replaceChildren(...selected.map((student, index) => {
    const item = document.createElement("div");
    item.className = `runner-chip${student.id === state.user?.key ? " is-me" : ""}`;
    item.innerHTML = `<span>${index === 0 ? "🏆 " : ""}${escape(student.studentId || "學生")}</span><small>${number(student.booksCount)} 本 · ${number(student.distance)} 米</small>`;
    return item;
  }));
}

function showLogin() {
  dom.appShell.classList.add("is-hidden");
  dom.loginScreen.classList.remove("is-hidden");
  dom.loginMessage.textContent = state.cloud ? "" : "目前是示範模式；完成 Firebase 設定後才可跨裝置同步。";
  setTimeout(() => dom.studentId.focus(), 0);
}

function queue(event) {
  const items = read(KEYS.pending, []);
  if (!items.some((item) => item.id === event.id)) items.push(event);
  write(KEYS.pending, items);
}
function removePending(id) { write(KEYS.pending, read(KEYS.pending, []).filter((item) => item.id !== id)); }
function inClass(classId) { return state.students.filter((student) => student.classId === classId); }
function room(id) { return APP_CONFIG.classrooms.find((item) => item.id === id); }
function roomExists(id) { return Boolean(room(id)); }
function normaliseId(value) { return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 20); }
function number(value) { return new Intl.NumberFormat("zh-HK").format(Number(value || 0)); }
function option(value, text) { const element = document.createElement("option"); element.value = value; element.textContent = text; return element; }
function sync(status, text) { dom.syncStatus.dataset.state = status; dom.syncStatus.textContent = text; }
function read(key, fallback) { try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function escape(value) { return String(value ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
function friendlyError(error) {
  if (error?.message === "INVALID_LOGIN") return "課室或學生 ID 不正確。";
  if (error?.code === "auth/operation-not-allowed") return "請先在 Firebase Authentication 啟用匿名登入。";
  if (error?.code === "permission-denied") return "Firestore 權限不足，請部署 firestore.rules。";
  return "未能登入，請檢查網絡及 Firebase 設定。";
}
function toast(message, error = false) {
  const item = document.createElement("div");
  item.className = `toast${error ? " error" : ""}`;
  item.textContent = message;
  dom.toastRegion.append(item);
  setTimeout(() => item.remove(), 3600);
}
function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

boot().catch((error) => {
  console.error(error);
  dom.loginMessage.textContent = "系統啟動失敗，請重新整理頁面。";
});
