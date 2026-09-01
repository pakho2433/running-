import process from "node:process";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const projectId = String(process.env.FIREBASE_PROJECT_ID || "").trim();
const confirmedProjectId = String(process.env.READING_RUN_CONFIRM_PROJECT || "").trim();
const schoolYear = String(process.env.READING_RUN_SCHOOL_YEAR || "2026-2027").trim();
const email = normaliseEmail(process.argv[2] || process.env.READING_RUN_LIBRARIAN_EMAIL || "");
const allowedDomains = String(process.env.READING_RUN_ALLOWED_TEACHER_DOMAINS || "")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);
const password = String(process.env.READING_RUN_LIBRARIAN_PASSWORD || "").trim();
const displayName = String(process.argv[3] || process.env.READING_RUN_LIBRARIAN_NAME || "Reading Run Librarian").trim();
const active = strictBoolean(process.env.READING_RUN_LIBRARIAN_ACTIVE, "READING_RUN_LIBRARIAN_ACTIVE", true);

if (!projectId) throw new Error("FIREBASE_PROJECT_ID is required; never rely on an implicit personal project");
if (confirmedProjectId !== projectId) throw new Error("READING_RUN_CONFIRM_PROJECT must exactly match FIREBASE_PROJECT_ID");
if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(projectId) || /book-running|pakho2433/iu.test(projectId)) {
  throw new Error("FIREBASE_PROJECT_ID must be a school-owned Google Cloud project");
}
assertConsecutiveSchoolYear(schoolYear);
if (schoolYear !== "2026-2027") {
  throw new Error("This release only supports READING_RUN_SCHOOL_YEAR=2026-2027; update and test the client, Functions and Rules contract before rollover");
}
if (!email) throw new Error("Librarian email is required");
if (!allowedDomains.length) throw new Error("READING_RUN_ALLOWED_TEACHER_DOMAINS is required");
if (!allowedDomains.some((domain) => email.endsWith(`@${domain}`))) throw new Error("Librarian email must use an approved school/TWGH domain");
if (password.length < 14) throw new Error("READING_RUN_LIBRARIAN_PASSWORD must be at least 14 characters");

if (!getApps().length) {
  initializeApp({ credential: applicationDefault(), projectId });
}

const auth = getAuth();
const db = getFirestore();
let action = "updated";
let userRecord;

try {
  userRecord = await auth.getUserByEmail(email);
  userRecord = await auth.updateUser(userRecord.uid, {
    password,
    displayName,
    emailVerified: true,
    disabled: !active,
  });
} catch (error) {
  if (error?.code !== "auth/user-not-found") throw error;
  userRecord = await auth.createUser({
    email,
    password,
    displayName,
    emailVerified: true,
    disabled: !active,
  });
  action = "created";
}

await auth.setCustomUserClaims(userRecord.uid, {
  role: "librarian",
  librarian: true,
  schoolYear,
});

await db.doc(`users/${userRecord.uid}`).set({
  role: "librarian",
  email,
  displayName,
  active,
  schoolYear,
  updatedAt: FieldValue.serverTimestamp(),
}, { merge: true });

console.log(`Librarian account ${action}.`);
console.log(`Email: ${email}`);
console.log(`UID: ${userRecord.uid}`);
console.log(`Project: ${projectId}`);
console.log("Password was supplied securely and is not printed. Require MFA before granting production access.");

function normaliseEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function strictBoolean(value, field, defaultValue) {
  if (value === undefined || value === null || String(value).trim() === "") return defaultValue;
  const normalised = String(value).trim().toLowerCase();
  if (normalised === "true") return true;
  if (normalised === "false") return false;
  throw new Error(`${field} must be true or false`);
}

function assertConsecutiveSchoolYear(value) {
  const match = /^(20\d{2})-(20\d{2})$/u.exec(value);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new Error("READING_RUN_SCHOOL_YEAR must use consecutive years such as 2026-2027");
  }
}
