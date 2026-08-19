import process from "node:process";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const STAGING_PROJECT = "scysps-reading-stg-20260818-a";
const SCHOOL_YEAR = "2026-2027";
const OLD_SCHOOL_CODE = "scysps";
const NEW_SCHOOL_CODE = "twghscysps";
const DOMAIN = "students.readingrun.invalid";

const projectId = String(process.env.FIREBASE_PROJECT_ID || "").trim();
const confirmation = String(process.env.READING_RUN_CONFIRM_PROJECT || "").trim();
if (projectId !== STAGING_PROJECT || confirmation !== STAGING_PROJECT) {
  throw new Error(`SAFETY STOP: this script only runs against ${STAGING_PROJECT}.`);
}

if (!getApps().length) {
  initializeApp({ credential: applicationDefault(), projectId });
}
const auth = getAuth();
const db = getFirestore();

const roster = [
  ...Array.from({ length: 25 }, (_, index) => ["C01", `TEST${String(index + 2).padStart(3, "0")}`]),
  ...Array.from({ length: 26 }, (_, index) => ["C02", `TEST${101 + index}`]),
];
if (roster.length !== 51) throw new Error("SAFETY STOP: expected exactly 51 new staging students.");

function authEmail(schoolCode, classId, studentId) {
  const yearToken = SCHOOL_YEAR.replace(/[^0-9]/g, "");
  return `${schoolCode}.${yearToken}.${classId}.${studentId}@${DOMAIN}`.toLowerCase();
}

async function getUserOrNull(email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  }
}

const states = [];
for (const [classId, studentId] of roster) {
  const oldEmail = authEmail(OLD_SCHOOL_CODE, classId, studentId);
  const newEmail = authEmail(NEW_SCHOOL_CODE, classId, studentId);
  const [oldUser, newUser] = await Promise.all([
    getUserOrNull(oldEmail),
    getUserOrNull(newEmail),
  ]);

  if (!oldUser && !newUser) {
    throw new Error(`SAFETY STOP: neither old nor new Auth account exists for ${studentId}.`);
  }
  if (oldUser && newUser && oldUser.uid !== newUser.uid) {
    throw new Error(`SAFETY STOP: destination email already belongs to a different Auth user for ${studentId}.`);
  }

  const user = newUser || oldUser;
  const studentKey = `${SCHOOL_YEAR}__${user.uid}`;
  const [profileSnapshot, studentSnapshot] = await db.getAll(
    db.doc(`users/${user.uid}`),
    db.doc(`students/${studentKey}`),
  );
  if (!profileSnapshot.exists || !studentSnapshot.exists) {
    throw new Error(`SAFETY STOP: incomplete Firestore state for ${studentId}.`);
  }
  const profile = profileSnapshot.data();
  const student = studentSnapshot.data();
  if (
    profile?.role !== "student"
    || profile?.active !== true
    || profile?.classId !== classId
    || profile?.studentId !== studentId
    || profile?.schoolYear !== SCHOOL_YEAR
    || profile?.studentKey !== studentKey
    || student?.classId !== classId
    || student?.studentId !== studentId
    || student?.schoolYear !== SCHOOL_YEAR
    || student?.studentKey !== studentKey
    || student?.authUid !== user.uid
  ) {
    throw new Error(`SAFETY STOP: identity mismatch for ${studentId}.`);
  }

  states.push({
    classId,
    studentId,
    oldEmail,
    newEmail,
    uid: user.uid,
    alreadyMigrated: Boolean(newUser && !oldUser),
    profileRef: profileSnapshot.ref,
    studentRef: studentSnapshot.ref,
  });
}

console.log(`Read-only preflight passed for ${states.length} staging students.`);
let migrated = 0;
let already = 0;
for (const state of states) {
  if (state.alreadyMigrated) {
    const batch = db.batch();
    const update = { email: state.newEmail, updatedAt: FieldValue.serverTimestamp() };
    batch.set(state.profileRef, update, { merge: true });
    batch.set(state.studentRef, update, { merge: true });
    await batch.commit();
    already += 1;
    console.log(`[already] ${state.studentId} -> ${state.newEmail}`);
    continue;
  }

  await auth.updateUser(state.uid, { email: state.newEmail });
  try {
    const batch = db.batch();
    const update = { email: state.newEmail, updatedAt: FieldValue.serverTimestamp() };
    batch.set(state.profileRef, update, { merge: true });
    batch.set(state.studentRef, update, { merge: true });
    await batch.commit();
  } catch (error) {
    await auth.updateUser(state.uid, { email: state.oldEmail }).catch(() => {});
    throw error;
  }
  migrated += 1;
  console.log(`[migrated] ${state.studentId} -> ${state.newEmail}`);
}

console.log(`Done. Migrated: ${migrated}; already correct: ${already}; failed: 0.`);
console.log("UIDs, passwords, names, classes, reading logs and progress were not changed.");
