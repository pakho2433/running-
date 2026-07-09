import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceAccountPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, "service-account.json"));
const email = normaliseEmail(process.argv[2] || process.env.READING_RUN_TEACHER_EMAIL || "scysps.teacher@teachers.readingrun.invalid");
const password = String(process.argv[3] || process.env.READING_RUN_TEACHER_PASSWORD || generatePassword()).trim();
const displayName = String(process.argv[4] || process.env.READING_RUN_TEACHER_NAME || "Reading Run Teacher").trim();
const active = String(process.env.READING_RUN_TEACHER_ACTIVE ?? "true").trim().toLowerCase() !== "false";

if (!fs.existsSync(serviceAccountPath)) throw new Error(`Service account JSON not found: ${serviceAccountPath}`);
if (!email) throw new Error("Teacher email is required");
if (password.length < 8) throw new Error("Teacher password must be at least 8 characters");

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"))) });
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
  ...(userRecord.customClaims || {}),
  role: "teacher",
  teacher: true,
});

await db.doc(`users/${userRecord.uid}`).set({
  role: "teacher",
  email,
  displayName,
  active,
  updatedAt: FieldValue.serverTimestamp(),
}, { merge: true });

console.log(`Teacher account ${action}.`);
console.log(`Email: ${email}`);
console.log(`Password: ${password}`);
console.log(`UID: ${userRecord.uid}`);

function normaliseEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(18);
  const body = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `RR-${body}`;
}
