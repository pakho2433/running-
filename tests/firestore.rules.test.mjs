import fs from "node:fs";
import path from "node:path";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore";

const PROJECT_ID = "demo-reading-run";
const SCHOOL_YEAR = "2026-2027";
const ARCHIVED_YEAR = "2025-2026";
const ROOT = path.resolve(import.meta.dirname, "..");
let testEnvironment;

before(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync(path.join(ROOT, "firestore.rules"), "utf8"),
    },
  });
});

beforeEach(async () => {
  await testEnvironment.clearFirestore();
  await seedFixtures();
});

after(async () => {
  await testEnvironment?.cleanup();
});

test("unauthenticated visitors cannot read student or recommendation data", async () => {
  const db = testEnvironment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(db, "publicStudents", `${SCHOOL_YEAR}__student-a`)));
  await assertFails(getDoc(doc(db, "dailyRecommendations", "2026-10-12")));
});

test("students can read only their own private profile and reading logs", async () => {
  const db = studentContext("student-a").firestore();
  await assertSucceeds(getDoc(doc(db, "users", "student-a")));
  await assertSucceeds(getDoc(doc(db, "students", `${SCHOOL_YEAR}__student-a`)));
  await assertSucceeds(getDoc(doc(db, "bookLogs", "log-a")));
  await assertFails(getDoc(doc(db, "users", "student-b")));
  await assertFails(getDoc(doc(db, "students", `${SCHOOL_YEAR}__student-b`)));
  await assertFails(getDoc(doc(db, "bookLogs", "log-b")));

  const ownHistory = query(
    collection(db, "bookLogs"),
    where("schoolYear", "==", SCHOOL_YEAR),
    where("studentKey", "==", `${SCHOOL_YEAR}__student-a`),
    where("authUid", "==", "student-a"),
    orderBy("createdAt", "desc"),
    limit(50),
  );
  await assertSucceeds(getDocs(ownHistory));
});

test("students can query only current-year public aliases in their own class", async () => {
  const db = studentContext("student-a").firestore();
  const ownClass = query(
    collection(db, "publicStudents"),
    where("schoolYear", "==", SCHOOL_YEAR),
    where("classId", "==", "C01"),
  );
  await assertSucceeds(getDocs(ownClass));
  await assertFails(getDoc(doc(db, "publicStudents", `${SCHOOL_YEAR}__student-c`)));
  await assertFails(getDoc(doc(db, "publicStudents", `${ARCHIVED_YEAR}__student-a`)));
});

test("students cannot write progress, public rankings, logs, roles or recommendations directly", async () => {
  const db = studentContext("student-a").firestore();
  await assertFails(setDoc(doc(db, "students", `${SCHOOL_YEAR}__student-a`), { distance: 999 }, { merge: true }));
  await assertFails(setDoc(doc(db, "publicStudents", `${SCHOOL_YEAR}__student-a`), { distance: 999 }, { merge: true }));
  await assertFails(setDoc(doc(db, "bookLogs", "forged"), { distanceAwarded: 120 }));
  await assertFails(setDoc(doc(db, "users", "student-a"), { role: "teacher" }, { merge: true }));
  await assertFails(setDoc(doc(db, "dailyRecommendations", "2026-10-13"), { title: "forged" }));
});

test("active current-year teachers can read current data but cannot write or read archived cohorts", async () => {
  const db = teacherContext().firestore();
  await assertSucceeds(getDoc(doc(db, "students", `${SCHOOL_YEAR}__student-a`)));
  await assertSucceeds(getDoc(doc(db, "bookLogs", "log-b")));
  await assertSucceeds(getDocs(query(
    collection(db, "students"),
    where("schoolYear", "==", SCHOOL_YEAR),
  )));
  await assertFails(getDocs(collection(db, "students")));
  await assertFails(getDoc(doc(db, "students", `${ARCHIVED_YEAR}__student-a`)));
  await assertFails(getDoc(doc(db, "publicStudents", `${ARCHIVED_YEAR}__student-a`)));
  await assertFails(getDoc(doc(db, "bookLogs", "log-old")));
  await assertFails(setDoc(doc(db, "students", `${SCHOOL_YEAR}__student-a`), { distance: 999 }, { merge: true }));
});

test("a teacher token for another school year cannot read current data", async () => {
  const db = testEnvironment.authenticatedContext("teacher-a", {
    role: "teacher",
    teacher: true,
    schoolYear: ARCHIVED_YEAR,
  }).firestore();
  await assertFails(getDoc(doc(db, "students", `${SCHOOL_YEAR}__student-a`)));
  await assertFails(getDoc(doc(db, "bookLogs", "log-a")));
});

test("legacy profiles without the active school year receive no student access", async () => {
  const db = testEnvironment.authenticatedContext("legacy-student", { role: "student" }).firestore();
  await assertFails(getDoc(doc(db, "students", `${SCHOOL_YEAR}__legacy-student`)));
  await assertFails(getDoc(doc(db, "publicStudents", `${SCHOOL_YEAR}__student-a`)));
});

function studentContext(uid) {
  return testEnvironment.authenticatedContext(uid, {
    role: "student",
    schoolYear: SCHOOL_YEAR,
  });
}

function teacherContext() {
  return testEnvironment.authenticatedContext("teacher-a", {
    role: "teacher",
    teacher: true,
    schoolYear: SCHOOL_YEAR,
  });
}

async function seedFixtures() {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const writes = [
      ["users/student-a", studentProfile("student-a", "C01", "S0001")],
      ["users/student-b", studentProfile("student-b", "C01", "S0002")],
      ["users/student-c", studentProfile("student-c", "C02", "S0003")],
      ["users/legacy-student", { role: "student", active: true, classId: "C01", studentId: "OLD01" }],
      ["users/teacher-a", { role: "teacher", active: true, schoolYear: SCHOOL_YEAR }],
      [`students/${SCHOOL_YEAR}__student-a`, privateProgress("student-a", "C01", "S0001", SCHOOL_YEAR)],
      [`students/${SCHOOL_YEAR}__student-b`, privateProgress("student-b", "C01", "S0002", SCHOOL_YEAR)],
      [`students/${SCHOOL_YEAR}__student-c`, privateProgress("student-c", "C02", "S0003", SCHOOL_YEAR)],
      [`students/${SCHOOL_YEAR}__legacy-student`, privateProgress("legacy-student", "C01", "OLD01", SCHOOL_YEAR)],
      [`students/${ARCHIVED_YEAR}__student-a`, privateProgress("student-a", "C01", "S0001", ARCHIVED_YEAR)],
      [`publicStudents/${SCHOOL_YEAR}__student-a`, publicProgress("C01", "Blue Panda", SCHOOL_YEAR)],
      [`publicStudents/${SCHOOL_YEAR}__student-b`, publicProgress("C01", "Green Tiger", SCHOOL_YEAR)],
      [`publicStudents/${SCHOOL_YEAR}__student-c`, publicProgress("C02", "Red Fox", SCHOOL_YEAR)],
      [`publicStudents/${ARCHIVED_YEAR}__student-a`, publicProgress("C01", "Old Runner", ARCHIVED_YEAR)],
      ["bookLogs/log-a", readingLog("student-a", "C01", "S0001", SCHOOL_YEAR)],
      ["bookLogs/log-b", readingLog("student-b", "C01", "S0002", SCHOOL_YEAR)],
      ["bookLogs/log-old", readingLog("student-a", "C01", "S0001", ARCHIVED_YEAR)],
      ["dailyRecommendations/2026-10-12", { title: "A safe recommendation" }],
    ];
    await Promise.all(writes.map(([documentPath, data]) => setDoc(doc(db, documentPath), data)));
  });
}

function studentProfile(uid, classId, studentId) {
  return {
    role: "student",
    active: true,
    classId,
    studentId,
    schoolYear: SCHOOL_YEAR,
    studentKey: `${SCHOOL_YEAR}__${uid}`,
  };
}

function privateProgress(uid, classId, studentId, schoolYear) {
  return {
    authUid: uid,
    classId,
    studentId,
    schoolYear,
    booksCount: 1,
    distance: 120,
  };
}

function publicProgress(classId, displayAlias, schoolYear) {
  return { classId, displayAlias, schoolYear, booksCount: 1, distance: 120 };
}

function readingLog(uid, classId, studentId, schoolYear) {
  return {
    authUid: uid,
    classId,
    studentId,
    studentKey: `${schoolYear}__${uid}`,
    schoolYear,
    title: "Book",
    author: "Author",
    distanceAwarded: 120,
    createdAt: new Date("2026-10-12T04:00:00.000Z"),
  };
}
