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

const DEFAULT_CONFIG = {
  schoolName: "全校閱讀跑道",
  maxRunnersPerClass: 26,
  trackDistance: 25000,
  stageDistance: 400,
  trackLocations: 4,
  legacyDistancePerBook: 100,
  scoring: {
    base: 10,
    readingType: 30,
    subject: 30,
    completion: 50,
  },
  classrooms: Array.from({ length: 17 }, (_, index) => ({
    id: `C${String(index + 1).padStart(2, "0")}`,
    name: `課室 ${String(index + 1).padStart(2, "0")}`,
  })),
};

const CONFIG = {
  ...DEFAULT_CONFIG,
  ...APP_CONFIG,
  maxRunnersPerClass: positiveNumber(APP_CONFIG?.maxRunnersPerClass, DEFAULT_CONFIG.maxRunnersPerClass),
  trackDistance: positiveNumber(APP_CONFIG?.trackDistance, DEFAULT_CONFIG.trackDistance),
  stageDistance: positiveNumber(APP_CONFIG?.stageDistance, DEFAULT_CONFIG.stageDistance),
  trackLocations: Math.max(1, Math.round(positiveNumber(APP_CONFIG?.trackLocations, DEFAULT_CONFIG.trackLocations))),
  legacyDistancePerBook: positiveNumber(APP_CONFIG?.legacyDistancePerBook, DEFAULT_CONFIG.legacyDistancePerBook),
  scoring: {
    ...DEFAULT_CONFIG.scoring,
    ...(APP_CONFIG?.scoring || {}),
  },
  classrooms: Array.isArray(APP_CONFIG?.classrooms) && APP_CONFIG.classrooms.length
    ? APP_CONFIG.classrooms
    : DEFAULT_CONFIG.classrooms,
};

const KEYS = {
  session: "reading-run-session-v1",
  demo: "reading-run-demo-students-v1",
  pending: "reading-run-pending-books-v1",
};

const $ = (selector) => document.querySelector(selector);
const dom = {
  loginScreen: $("#loginScreen"),
  appShell: $("#appShell"),
  loginForm: $("#loginForm"),
  loginClass: $("#loginClass"),
  studentId: $("#studentId"),
  loginButton: $("#loginButton"),
  loginMessage: $("#loginMessage"),
  logoutButton: $("#logoutButton"),
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

const state = {
  cloud: Object.values(firebaseConfig).every((value) => value && !String(value).startsWith("PASTE_YOUR_")),
  auth: null,
  db: null,
  user: null,
  students: [],
  unsubscribe: null,
  selectedClass: CONFIG.classrooms[0]?.id,
  selectedLocation: 0,
  saving: false,
};

let track;

class TrackScene {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xccecff);
    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);
    this.camera.position.set(0, 24, 42);
    this.camera.lookAt(0, 1.5, -40);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    container.append(this.renderer.domElement);
    this.runners = [];
    this.markers = [];
    this.currentLocation = 0;
    this.clock = new THREE.Clock();
    this.buildTrack();
    this.setLocation(0);
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

    const startLine = new THREE.Mesh(
      new THREE.BoxGeometry(24.6, 0.05, 0.6),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    );
    startLine.position.set(0, 0.27, 19.5);
    this.scene.add(startLine);

    const finish = new THREE.Group();
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 20; col += 1) {
        const tile = new THREE.Mesh(
          new THREE.BoxGeometry(1.23, 0.05, 0.65),
          new THREE.MeshBasicMaterial({ color: (row + col) % 2 ? 0xffffff : 0x182430 }),
        );
        tile.position.set(-11.68 + col * 1.23, 0.27, -106 + row * 0.65);
        finish.add(tile);
      }
    }
    this.scene.add(finish);
  }

  setLocation(locationIndex) {
    this.currentLocation = clampLocation(locationIndex);
    this.markers.forEach((marker) => {
      this.scene.remove(marker);
      marker.material?.map?.dispose?.();
      marker.material?.dispose?.();
    });
    this.markers = [];

    const start = locationStart(this.currentLocation);
    for (let marker = 0; marker <= 4; marker += 1) {
      const distance = start + Math.round((CONFIG.stageDistance * marker) / 4);
      const label = this.label(`${formatNumber(distance)}里`, "#173f5f", "rgba(255,255,255,.95)", 1.18);
      label.position.set(14.5, 1.75, 20 - marker * 31.2);
      this.scene.add(label);
      this.markers.push(label);
    }

    const placeLabel = this.label(
      `地方 ${this.currentLocation + 1}`,
      "#ffffff",
      "rgba(15,76,92,.94)",
      1.08,
    );
    placeLabel.position.set(-14.6, 3.1, 18);
    this.scene.add(placeLabel);
    this.markers.push(placeLabel);
  }

  setStudents(students, currentKey, locationIndex) {
    this.setLocation(locationIndex);
    this.runners.forEach((group) => {
      this.scene.remove(group);
      group.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material?.dispose?.();
      });
    });

    this.runners = students.map((student, index) => {
      const runner = this.makeRunner(student, index, student.id === currentKey, this.currentLocation);
      this.scene.add(runner);
      return runner;
    });
  }

  makeRunner(student, index, isMe, locationIndex) {
    const group = new THREE.Group();
    const lane = index % 8;
    const pack = Math.floor(index / 8);
    const distance = Number(student.distance || 0);
    const start = locationStart(locationIndex);
    const rawProgress = (distance - start) / CONFIG.stageDistance;
    const progress = Math.max(0, Math.min(1, rawProgress));
    group.position.set(-10.7 + lane * 3.06, 0.35, 17.5 - progress * 121 - pack * 1.3);

    const colours = [0x176b87, 0xff7b54, 0x6a4c93, 0x2a9d8f, 0xe76f51, 0x3a86ff, 0x8a5a44, 0x5f6caf];
    const skin = new THREE.MeshStandardMaterial({ color: 0xf1bd8c, roughness: 0.9 });
    const shirt = new THREE.MeshStandardMaterial({ color: isMe ? 0xffb703 : colours[index % colours.length] });
    const shorts = new THREE.MeshStandardMaterial({ color: 0x23334d });
    const shoes = new THREE.MeshStandardMaterial({ color: 0xffffff });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.54, 0.82, 5, 8), shirt);
    torso.position.y = 2.35;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 12), skin);
    head.position.y = 3.58;
    torso.castShadow = head.castShadow = true;
    group.add(torso, head);

    const leftArm = this.limb(0.18, 1.02, skin, 0.64, 2.72);
    const rightArm = this.limb(0.18, 1.02, skin, -0.64, 2.72);
    const leftLeg = this.limb(0.22, 1.25, shorts, 0.3, 1.48, shoes);
    const rightLeg = this.limb(0.22, 1.25, shorts, -0.3, 1.48, shoes);
    group.add(leftArm, rightArm, leftLeg, rightLeg);

    const label = this.label(
      `${student.studentId} · ${formatNumber(distance)}里`,
      isMe ? "#6b4900" : "#173f5f",
      isMe ? "#fff3bf" : "rgba(255,255,255,.95)",
      1.02,
    );
    label.position.set(0, 4.85, 0);
    group.add(label);
    group.userData = {
      phase: index * 0.7,
      baseY: group.position.y,
      torso,
      head,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
    };
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
    const context = canvas.getContext("2d");
    context.fillStyle = backgroundColor;
    roundedRect(context, 10, 14, 492, 132, 34);
    context.fill();
    context.fillStyle = textColor;
    context.font = "700 54px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 256, 82, 460);
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
      const data = group.userData;
      const swing = Math.sin(time * 7.5 + data.phase) * 0.75;
      data.leftArm.rotation.x = swing;
      data.rightArm.rotation.x = -swing;
      data.leftLeg.rotation.x = -swing * 0.78;
      data.rightLeg.rotation.x = swing * 0.78;
      group.position.y = data.baseY + Math.abs(Math.sin(time * 7.5 + data.phase)) * 0.1;
      data.torso.rotation.z = Math.sin(time * 3.7 + data.phase) * 0.035;
      data.head.rotation.y = Math.sin(time * 2.2 + data.phase) * 0.08;
    });
    this.renderer.render(this.scene, this.camera);
  };
}

async function boot() {
  assertRequiredElements();
  track = new TrackScene(dom.trackCanvas);
  dom.schoolTitle.textContent = CONFIG.schoolName;
  dom.loginClass.replaceChildren(...CONFIG.classrooms.map((roomItem) => option(roomItem.id, roomItem.name)));
  resetReadingForm();
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
    if (!id) {
      dom.loginMessage.textContent = "請輸入有效的學生 ID（英文字母或數字）。";
      return;
    }
    dom.loginButton.disabled = true;
    try {
      await login(dom.loginClass.value, id);
    } catch (error) {
      console.error(error);
      dom.loginMessage.textContent = friendlyError(error);
    } finally {
      dom.loginButton.disabled = false;
    }
  });

  dom.logoutButton.addEventListener("click", () => {
    localStorage.removeItem(KEYS.session);
    state.user = null;
    showLogin();
  });

  dom.bookForm.addEventListener("input", updateScorePreview);
  dom.bookForm.addEventListener("change", updateScorePreview);
  dom.bookForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.user || state.saving) return;

    const record = readReadingForm();
    const distanceAwarded = scoreReading(record);
    if (!record.title || !record.author || distanceAwarded <= 0) {
      toast("請輸入書本名稱及作者名稱。", true);
      return;
    }

    await addBook(record, distanceAwarded);
    resetReadingForm();
  });

  addEventListener("online", () => state.cloud && flushPending());
}

async function connectFirebase() {
  const app = initializeApp(firebaseConfig);
  state.auth = getAuth(app);
  state.db = getFirestore(app);
  try {
    await enableIndexedDbPersistence(state.db);
  } catch (error) {
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
    const reference = doc(state.db, "students", state.user.key);
    const existing = await getDoc(reference);
    if (existing.exists()) {
      const data = existing.data();
      state.selectedLocation = locationForDistance(data.distance);
      await setDoc(reference, { classId, studentId, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      state.selectedLocation = 0;
      await setDoc(reference, {
        classId,
        studentId,
        booksCount: 0,
        distance: 0,
        lastBook: "",
        lastAuthor: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } else {
    const existing = state.students.find((student) => student.id === state.user.key);
    if (existing) {
      state.selectedLocation = locationForDistance(existing.distance);
    } else {
      state.selectedLocation = 0;
      state.students.push({
        id: state.user.key,
        classId,
        studentId,
        booksCount: 0,
        distance: 0,
        lastBook: "",
        lastAuthor: "",
      });
      write(KEYS.demo, state.students);
    }
  }

  dom.loginClass.value = classId;
  dom.studentId.value = studentId;
  dom.loginScreen.classList.add("is-hidden");
  dom.appShell.classList.remove("is-hidden");
  track.resize();
  renderAll();
  if (!restored) toast(`歡迎回來，${studentId}！`);
}

async function addBook(record, distanceAwarded) {
  const event = {
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    classId: state.user.classId,
    studentId: state.user.studentId,
    studentKey: state.user.key,
    ...record,
    distanceAwarded,
    createdAt: new Date().toISOString(),
  };

  state.saving = true;
  dom.bookSubmit.disabled = true;
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
    toast(`《${record.title}》已記錄，向前跑 ${distanceAwarded} 里！`);
  } catch (error) {
    console.error(error);
    queue(event);
    sync("error", "● 已離線暫存，連線後補交");
    toast("網絡暫時中斷，紀錄已保留在此裝置。", true);
  } finally {
    state.saving = false;
    dom.bookSubmit.disabled = false;
  }
}

async function commit(event) {
  const distanceAwarded = eventDistance(event);
  const studentRef = doc(state.db, "students", event.studentKey);
  const logRef = doc(state.db, "bookLogs", event.id);
  await runTransaction(state.db, async (transaction) => {
    if ((await transaction.get(logRef)).exists()) return;
    transaction.set(logRef, {
      classId: event.classId,
      studentId: event.studentId,
      studentKey: event.studentKey,
      readingDate: event.readingDate || "",
      title: event.title || "",
      author: event.author || "",
      readingType: event.readingType || "",
      subject: event.subject || "",
      completed: event.completed || "",
      distanceAwarded,
      clientCreatedAt: event.createdAt || "",
      createdAt: serverTimestamp(),
    });
    transaction.set(studentRef, {
      classId: event.classId,
      studentId: event.studentId,
      booksCount: increment(1),
      distance: increment(distanceAwarded),
      lastBook: event.title || "",
      lastAuthor: event.author || "",
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
}

async function flushPending() {
  const items = read(KEYS.pending, []);
  if (!state.cloud || !items.length || !navigator.onLine) return;
  sync("saving", `● 補交 ${items.length} 項紀錄`);
  const failed = [];
  for (const item of items) {
    try {
      await commit(item);
    } catch (error) {
      console.error(error);
      failed.push(item);
    }
  }
  write(KEYS.pending, failed);
  sync(failed.length ? "error" : "saved", failed.length ? "● 部分紀錄待同步" : "● 已自動儲存");
}

function applyBook(event) {
  const distanceAwarded = eventDistance(event);
  const index = state.students.findIndex((student) => student.id === event.studentKey);
  let newDistance = distanceAwarded;

  if (index >= 0) {
    newDistance = Number(state.students[index].distance || 0) + distanceAwarded;
    state.students[index] = {
      ...state.students[index],
      booksCount: Number(state.students[index].booksCount || 0) + 1,
      distance: newDistance,
      lastBook: event.title || "",
      lastAuthor: event.author || "",
    };
  } else {
    state.students.push({
      id: event.studentKey,
      classId: event.classId,
      studentId: event.studentId,
      booksCount: 1,
      distance: newDistance,
      lastBook: event.title || "",
      lastAuthor: event.author || "",
    });
  }

  if (event.studentKey === state.user?.key) {
    state.selectedLocation = locationForDistance(newDistance);
  }
  renderAll();
}

function renderAll() {
  if (!state.user) return;

  const currentStudent = state.students.find((item) => item.id === state.user.key);
  dom.currentStudentLabel.textContent = state.user.studentId;
  dom.currentClassLabel.textContent = room(state.user.classId)?.name || state.user.classId;
  dom.myBooksCount.textContent = formatNumber(currentStudent?.booksCount);
  dom.myDistance.textContent = formatNumber(currentStudent?.distance);
  dom.myLastBook.textContent = currentStudent?.lastBook
    ? `《${currentStudent.lastBook}》${currentStudent.lastAuthor ? `｜${currentStudent.lastAuthor}` : ""}`
    : "尚未提交";

  dom.classroomGrid.replaceChildren(...CONFIG.classrooms.map((classroom) => {
    const students = inClass(classroom.id);
    const total = students.reduce((sum, student) => sum + Number(student.distance || 0), 0);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `classroom-card${state.selectedClass === classroom.id ? " is-active" : ""}`;
    button.innerHTML = `<span class="classroom-name">${escapeHtml(classroom.name)}</span><span class="classroom-meta"><span><strong>${students.length}</strong><br>名學生</span><span><strong>${formatNumber(total)}</strong><br>總里數</span></span>`;
    button.onclick = () => {
      state.selectedClass = classroom.id;
      state.selectedLocation = 0;
      renderAll();
      $(".track-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    return button;
  }));

  const rankedStudents = inClass(state.selectedClass).sort(compareStudents);
  const selectedStudents = rankedStudents.slice(0, CONFIG.maxRunnersPerClass);
  const visibleStudents = selectedStudents.filter((student) => isInLocation(student.distance, state.selectedLocation));
  const selectedRoomName = room(state.selectedClass)?.name || state.selectedClass;
  const range = locationRange(state.selectedLocation);

  dom.trackTitle.textContent = `${selectedRoomName} 跑道`;
  dom.trackRunnerCount.textContent = String(visibleStudents.length);
  dom.trackLeader.textContent = rankedStudents[0]?.studentId || "—";
  dom.currentLocationLabel.textContent = `地方 ${state.selectedLocation + 1} · ${formatNumber(range.start)}–${formatNumber(range.end)} 里`;
  dom.trackRange.textContent = `${formatNumber(range.start)}–${formatNumber(range.end)} 里`;
  dom.trackEmpty.textContent = `地方 ${state.selectedLocation + 1}（${formatNumber(range.start)}–${formatNumber(range.end)} 里）暫時未有學生。`;
  dom.trackEmpty.classList.toggle("is-hidden", visibleStudents.length > 0);

  renderLocationButtons(selectedStudents);
  track.setStudents(visibleStudents, state.user.key, state.selectedLocation);
  renderLeaderboard(rankedStudents.slice(0, 5), selectedRoomName);

  dom.runnerList.replaceChildren(...visibleStudents.map((student, index) => {
    const item = document.createElement("div");
    item.className = `runner-chip${student.id === state.user.key ? " is-me" : ""}`;
    item.innerHTML = `<span>${index === 0 ? "🏃 " : ""}${escapeHtml(student.studentId || "學生")}</span><small>${formatNumber(student.booksCount)} 本 · ${formatNumber(student.distance)} 里</small>`;
    return item;
  }));
}

function renderLocationButtons(students) {
  const buttons = Array.from({ length: CONFIG.trackLocations }, (_, index) => {
    const range = locationRange(index);
    const count = students.filter((student) => isInLocation(student.distance, index)).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `location-card${state.selectedLocation === index ? " is-active" : ""}`;
    button.setAttribute("aria-pressed", String(state.selectedLocation === index));
    button.innerHTML = `
      <strong>地方 ${index + 1}</strong>
      <small>${formatNumber(range.start)}–${formatNumber(range.end)} 里</small>
      <span class="location-count">${count} 名學生</span>
      <span class="location-go">前往</span>
    `;
    button.onclick = () => {
      state.selectedLocation = index;
      renderAll();
      dom.trackCanvas.scrollIntoView({ behavior: "smooth", block: "center" });
    };
    return button;
  });
  dom.locationButtons.replaceChildren(...buttons);
}

function renderLeaderboard(students, className) {
  dom.leaderboardClass.textContent = className;
  if (!students.length) {
    const empty = document.createElement("li");
    empty.className = "leaderboard-empty";
    empty.textContent = "這個課室尚未有閱讀紀錄。";
    dom.leaderboardList.replaceChildren(empty);
    return;
  }

  const medals = ["🥇", "🥈", "🥉", "4", "5"];
  dom.leaderboardList.replaceChildren(...students.map((student, index) => {
    const item = document.createElement("li");
    item.className = "leaderboard-item";
    item.innerHTML = `
      <span class="leaderboard-rank">${medals[index]}</span>
      <span class="leaderboard-student">${escapeHtml(student.studentId || "學生")}</span>
      <span class="leaderboard-distance">${formatNumber(student.distance)} 里</span>
    `;
    return item;
  }));
}

function readReadingForm() {
  return {
    readingDate: dom.readingDate.value || "",
    title: cleanText(dom.bookTitle.value, 80),
    author: cleanText(dom.bookAuthor.value, 80),
    readingType: dom.readingType.value || "",
    subject: dom.bookSubject.value || "",
    completed: dom.readingCompleted.value || "",
  };
}

function resetReadingForm() {
  dom.readingDate.value = todayForInput();
  dom.bookTitle.value = "";
  dom.bookAuthor.value = "";
  dom.readingType.value = "";
  dom.bookSubject.value = "";
  dom.readingCompleted.value = "";
  updateScorePreview();
}

function updateScorePreview() {
  const score = scoreReading(readReadingForm());
  dom.scorePreview.textContent = String(score);
}

function scoreReading(record) {
  if (!record.title || !record.author) return 0;
  let score = finiteScore(CONFIG.scoring.base, 10);
  if (record.readingType) score += finiteScore(CONFIG.scoring.readingType, 30);
  if (record.subject) score += finiteScore(CONFIG.scoring.subject, 30);
  if (record.completed) score += finiteScore(CONFIG.scoring.completion, 50);
  return score;
}

function eventDistance(event) {
  const value = Number(event?.distanceAwarded);
  if (Number.isFinite(value) && value >= 0) return value;
  return CONFIG.legacyDistancePerBook;
}

function locationStart(index) {
  return clampLocation(index) * CONFIG.stageDistance;
}

function locationRange(index) {
  const start = locationStart(index);
  return { start, end: start + CONFIG.stageDistance };
}

function locationForDistance(value) {
  const distance = Math.max(0, Number(value || 0));
  return clampLocation(Math.floor(distance / CONFIG.stageDistance));
}

function isInLocation(value, index) {
  const distance = Math.max(0, Number(value || 0));
  const locationIndex = clampLocation(index);
  const range = locationRange(locationIndex);
  if (locationIndex === CONFIG.trackLocations - 1) return distance >= range.start;
  return distance >= range.start && distance < range.end;
}

function clampLocation(index) {
  return Math.max(0, Math.min(CONFIG.trackLocations - 1, Number(index) || 0));
}

function compareStudents(a, b) {
  return Number(b.distance || 0) - Number(a.distance || 0)
    || Number(b.booksCount || 0) - Number(a.booksCount || 0)
    || String(a.studentId || "").localeCompare(String(b.studentId || ""));
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

function removePending(id) {
  write(KEYS.pending, read(KEYS.pending, []).filter((item) => item.id !== id));
}

function inClass(classId) {
  return state.students.filter((student) => student.classId === classId);
}

function room(id) {
  return CONFIG.classrooms.find((item) => item.id === id);
}

function roomExists(id) {
  return Boolean(room(id));
}

function normaliseId(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 20);
}

function cleanText(value, maxLength) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function formatNumber(value) {
  const numeric = Number(value);
  return new Intl.NumberFormat("zh-HK").format(Number.isFinite(numeric) ? numeric : 0);
}

function option(value, text) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = text;
  return element;
}

function sync(status, text) {
  dom.syncStatus.dataset.state = status;
  dom.syncStatus.textContent = text;
}

function read(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  }[character]));
}

function todayForInput() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

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

function roundedRect(context, x, y, width, height, radius) {
  const adjustedRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + adjustedRadius, y);
  context.arcTo(x + width, y, x + width, y + height, adjustedRadius);
  context.arcTo(x + width, y + height, x, y + height, adjustedRadius);
  context.arcTo(x, y + height, x, y, adjustedRadius);
  context.arcTo(x, y, x + width, y, adjustedRadius);
  context.closePath();
}

function positiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function finiteScore(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
}

function assertRequiredElements() {
  const missing = Object.entries(dom).filter(([, element]) => !element).map(([name]) => name);
  if (missing.length) throw new Error(`Missing DOM elements: ${missing.join(", ")}`);
}

boot().catch((error) => {
  console.error(error);
  if (dom.loginMessage) dom.loginMessage.textContent = "系統啟動失敗，請重新整理頁面。";
});
