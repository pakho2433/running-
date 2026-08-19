import process from "node:process";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const STAGING_PROJECT = "scysps-reading-stg-20260818-a";
const SCHOOL_YEAR = "2026-2027";
const SCHOOL_CODE = "scysps";
const CLASS_ID = "C01";
const STUDENT_ID = "TEST001";
const DISPLAY_NAME = "陳悅晴";

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
const email = `${SCHOOL_CODE}.${SCHOOL_YEAR.replace(/[^0-9]/g, "")}.${CLASS_ID}.${STUDENT_ID}@students.readingrun.invalid`.toLowerCase();
const user = await auth.getUserByEmail(email);
const studentKey = `${SCHOOL_YEAR}__${user.uid}`;
const [profileSnapshot, studentSnapshot, publicSnapshot] = await db.getAll(
  db.doc(`users/${user.uid}`),
  db.doc(`students/${studentKey}`),
  db.doc(`publicStudents/${studentKey}`),
);

if (!profileSnapshot.exists || !studentSnapshot.exists || !publicSnapshot.exists) {
  throw new Error("SAFETY STOP: TEST001 Auth/Firestore records are incomplete.");
}
const profile = profileSnapshot.data();
if (
  profile?.role !== "student"
  || profile?.active !== true
  || profile?.classId !== CLASS_ID
  || profile?.studentId !== STUDENT_ID
  || profile?.schoolYear !== SCHOOL_YEAR
  || profile?.studentKey !== studentKey
) {
  throw new Error("SAFETY STOP: TEST001 identity fields do not match the expected staging account.");
}

const batch = db.batch();
const update = { displayAlias: DISPLAY_NAME, updatedAt: FieldValue.serverTimestamp() };
batch.set(profileSnapshot.ref, update, { merge: true });
batch.set(studentSnapshot.ref, update, { merge: true });
batch.set(publicSnapshot.ref, update, { merge: true });
await batch.commit();

console.log(`Updated ${STUDENT_ID} display name to ${DISPLAY_NAME} in staging.`);
console.log(`Student key: ${studentKey}`);
