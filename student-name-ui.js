import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, getFirestore, onSnapshot } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { APP_CONFIG } from "./app-config.js";
import { firebaseConfig } from "./firebase-config-v3.js";

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let stopProfile = null;

onAuthStateChanged(auth, (user) => {
  stopProfile?.();
  stopProfile = null;
  if (!user) return;

  stopProfile = onSnapshot(doc(db, "users", user.uid), (snapshot) => {
    const profile = snapshot.data() || {};
    if (profile.role !== "student" || profile.active !== true) return;

    const studentName = String(profile.displayAlias || "").trim();
    const studentId = String(profile.studentId || "").trim();
    const classId = String(profile.classId || "").trim();
    const className = APP_CONFIG.classrooms.find((room) => room.id === classId)?.name || classId;

    const nameLabel = document.querySelector("#currentStudentLabel");
    const classLabel = document.querySelector("#currentClassLabel");
    if (nameLabel) nameLabel.textContent = studentName || studentId || "學生";
    if (classLabel) classLabel.textContent = [className, studentId].filter(Boolean).join(" · ");

    const note = document.querySelector(".privacy-note");
    if (note) note.textContent = "Staging 測試版：登入後及班級龍虎榜會顯示測試學生姓名；請勿使用真實學生資料作測試。";
  }, (error) => {
    console.warn("Student display-name overlay could not read the profile", error);
  });
});
