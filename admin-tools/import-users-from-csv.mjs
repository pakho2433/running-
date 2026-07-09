import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.resolve(process.argv[2] || path.join(__dirname, "users.csv"));
const serviceAccountPath = path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, "service-account.json"));
const schoolCode = String(process.env.READING_RUN_SCHOOL_CODE || "scysps").toLowerCase().replace(/[^a-z0-9-]/g, "");

if (!fs.existsSync(csvPath)) throw new Error(`CSV not found: ${csvPath}`);
if (!fs.existsSync(serviceAccountPath)) throw new Error(`Service account JSON not found: ${serviceAccountPath}`);

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"))) });
}

const auth = getAuth();
const db = getFirestore();
const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
const summary = { created: 0, updated: 0, failed: 0 };

for (const [index, row] of rows.entries()) {
  try {
    const role = normalise(row.role || "student").toLowerCase();
    const classId = normalise(row.classId).toUpperCase();
    const studentId = normalise(row.studentId).toUpperCase();
    const active = String(row.active ?? "true").trim().toLowerCase() !== "false";
    const password = String(row.pin || row.password || "").trim();
    const email = role === "student"
      ? String(row.email || `${schoolCode}.${classId}.${studentId}@students.readingrun.invalid`).trim().toLowerCase()
      : String(row.email || "").trim().toLowerCase();

    if (!["student", "teacher"].includes(role)) throw new Error("role must be student or teacher");
    if (!email) throw new Error("email is required");
    if (password.length < 6) throw new Error("pin/password must be at least 6 characters");
    if (role === "student" && (!classId || !studentId)) throw new Error("student requires classId and studentId");

    let userRecord;
    let action = "updated";
    try {
      userRecord = await auth.getUserByEmail(email);
      userRecord = await auth.updateUser(userRecord.uid, { password, disabled: !active });
      summary.updated += 1;
    } catch (error) {
      if (error?.code !== "auth/user-not-found") throw error;
      userRecord = await auth.createUser({ email, password, emailVerified: role === "student", disabled: !active });
      action = "created";
      summary.created += 1;
    }

    await db.doc(`users/${userRecord.uid}`).set({
      role,
      classId: role === "student" ? classId : "",
      studentId: role === "student" ? studentId : "",
      email,
      active,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    if (role === "student") {
      const studentKey = `${classId}__${studentId}`;
      const studentRef = db.doc(`students/${studentKey}`);
      const publicRef = db.doc(`publicStudents/${studentKey}`);
      const existing = await studentRef.get();
      if (!existing.exists) {
        await studentRef.set({
          classId,
          studentId,
          booksCount: 0,
          distance: 0,
          lastBook: "",
          lastAuthor: "",
          dailyBooksCount: 0,
          dailyDateKey: "",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
      const data = existing.exists ? existing.data() : { booksCount: 0, distance: 0 };
      await publicRef.set({
        classId,
        studentId,
        booksCount: Number(data.booksCount || 0),
        distance: Number(data.distance || 0),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    console.log(`[${index + 1}/${rows.length}] ${action}: ${role} ${email}`);
  } catch (error) {
    summary.failed += 1;
    console.error(`[${index + 1}/${rows.length}] failed: ${error.message}`);
  }
}

console.log(`Done. Created: ${summary.created}; updated: ${summary.updated}; failed: ${summary.failed}.`);
if (summary.failed) process.exitCode = 1;

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
}

function splitCsvLine(line) {
  const result = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && quoted && line[i + 1] === '"') {
      value += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      result.push(value);
      value = "";
    } else {
      value += ch;
    }
  }
  result.push(value);
  return result.map((item) => item.trim());
}

function normalise(value) {
  return String(value || "").trim().replace(/[^A-Za-z0-9_@.\-]/g, "");
}
