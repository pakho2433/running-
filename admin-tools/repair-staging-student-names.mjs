import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const STAGING_PROJECT = "scysps-reading-stg-20260818-a";
const SCHOOL_YEAR = "2026-2027";
const SCHOOL_CODE = "scysps";

// ASCII-only source representation on purpose: names are decoded from Unicode
// escapes by Node.js at runtime, avoiding terminal/CSV locale corruption.
const ROSTER = Object.freeze([
  ["C01", "TEST001", "\u9673\u6085\u6674"],
  ["C01", "TEST002", "\u674e\u4fca\u7199"],
  ["C01", "TEST003", "\u9ec3\u82b7\u6674"],
  ["C01", "TEST004", "\u5f35\u5b87\u8ed2"],
  ["C01", "TEST005", "\u6797\u51f1\u6674"],
  ["C01", "TEST006", "\u4f55\u5b50\u8b19"],
  ["C01", "TEST007", "\u6881\u8a60\u6069"],
  ["C01", "TEST008", "\u5433\u67cf\u9716"],
  ["C01", "TEST009", "\u5468\u66c9\u5f64"],
  ["C01", "TEST010", "\u912d\u777f\u5e0c"],
  ["C01", "TEST011", "\u694a\u6a02\u7464"],
  ["C01", "TEST012", "\u8521\u627f\u8ed2"],
  ["C01", "TEST013", "\u99ae\u53ef\u5d50"],
  ["C01", "TEST014", "\u7f85\u5e0c\u7136"],
  ["C01", "TEST015", "\u66fe\u6893\u6674"],
  ["C01", "TEST016", "\u8449\u6d69\u7136"],
  ["C01", "TEST017", "\u8a31\u5fc3\u598d"],
  ["C01", "TEST018", "\u8b1d\u5353\u8b19"],
  ["C01", "TEST019", "\u90ed\u6620\u5f64"],
  ["C01", "TEST020", "\u8607\u6587\u8ed2"],
  ["C01", "TEST021", "\u9127\u82ca\u745c"],
  ["C01", "TEST022", "\u5f6d\u6a02\u8a00"],
  ["C01", "TEST023", "\u76e7\u4fca\u7199"],
  ["C01", "TEST024", "\u65b9\u7a4e\u7433"],
  ["C01", "TEST025", "\u4f0d\u7693\u5929"],
  ["C01", "TEST026", "\u83ab\u5b50\u6674"],
  ["C02", "TEST101", "\u9673\u67cf\u8a00"],
  ["C02", "TEST102", "\u674e\u6b23\u598d"],
  ["C02", "TEST103", "\u9ec3\u4fca\u7693"],
  ["C02", "TEST104", "\u5f35\u6a02\u6674"],
  ["C02", "TEST105", "\u6797\u5b50\u745c"],
  ["C02", "TEST106", "\u4f55\u6893\u8b19"],
  ["C02", "TEST107", "\u6881\u601d\u7a4e"],
  ["C02", "TEST108", "\u5433\u627f\u5e0c"],
  ["C02", "TEST109", "\u5468\u51f1\u7433"],
  ["C02", "TEST110", "\u912d\u6d69\u5b87"],
  ["C02", "TEST111", "\u694a\u82b7\u6674"],
  ["C02", "TEST112", "\u8521\u6a02\u8ed2"],
  ["C02", "TEST113", "\u99ae\u8a60\u6069"],
  ["C02", "TEST114", "\u7f85\u4fca\u7136"],
  ["C02", "TEST115", "\u66fe\u7a4e\u5f64"],
  ["C02", "TEST116", "\u8449\u6587\u5e0c"],
  ["C02", "TEST117", "\u8a31\u6893\u6674"],
  ["C02", "TEST118", "\u8b1d\u6d69\u7136"],
  ["C02", "TEST119", "\u90ed\u6620\u5e0c"],
  ["C02", "TEST120", "\u8607\u601d\u598d"],
  ["C02", "TEST121", "\u9127\u67cf\u8b19"],
  ["C02", "TEST122", "\u5f6d\u53ef\u6674"],
  ["C02", "TEST123", "\u76e7\u5b50\u8ed2"],
  ["C02", "TEST124", "\u65b9\u6a02\u7464"],
  ["C02", "TEST125", "\u4f0d\u4fca\u5e0c"],
  ["C02", "TEST126", "\u83ab\u5fc3\u598d"],
]);

if (ROSTER.length !== 52) throw new Error("SAFETY STOP: roster must contain exactly 52 students.");

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

const verified = [];
for (const [classId, studentId, displayAlias] of ROSTER) {
  const email = `${SCHOOL_CODE}.${SCHOOL_YEAR.replace(/[^0-9]/g, "")}.${classId}.${studentId}@students.readingrun.invalid`.toLowerCase();
  const user = await auth.getUserByEmail(email);
  const studentKey = `${SCHOOL_YEAR}__${user.uid}`;
  const [profileSnapshot, studentSnapshot, publicSnapshot] = await db.getAll(
    db.doc(`users/${user.uid}`),
    db.doc(`students/${studentKey}`),
    db.doc(`publicStudents/${studentKey}`),
  );

  if (!profileSnapshot.exists || !studentSnapshot.exists || !publicSnapshot.exists) {
    throw new Error(`SAFETY STOP: incomplete Firestore state for ${studentId}.`);
  }
  const profile = profileSnapshot.data();
  if (
    profile?.role !== "student"
    || profile?.active !== true
    || profile?.classId !== classId
    || profile?.studentId !== studentId
    || profile?.schoolYear !== SCHOOL_YEAR
    || profile?.studentKey !== studentKey
  ) {
    throw new Error(`SAFETY STOP: identity mismatch for ${studentId}.`);
  }
  verified.push({ displayAlias, profileSnapshot, studentSnapshot, publicSnapshot });
}

// Nothing is written until all 52 identities have passed the read-only checks.
const batch = db.batch();
for (const item of verified) {
  const update = { displayAlias: item.displayAlias, updatedAt: FieldValue.serverTimestamp() };
  batch.set(item.profileSnapshot.ref, update, { merge: true });
  batch.set(item.studentSnapshot.ref, update, { merge: true });
  batch.set(item.publicSnapshot.ref, update, { merge: true });
}
await batch.commit();
console.log(`Updated displayAlias for ${verified.length} staging students. Passwords and progress were not changed.`);

// Repair the private local admin sheet too, preserving every existing password.
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const loginSheetPath = path.join(moduleDirectory, "staging-1a-1b-login-sheet.private.csv");
if (fs.existsSync(loginSheetPath)) {
  const rows = parseCsv(fs.readFileSync(loginSheetPath, "utf8"));
  const rosterById = new Map(ROSTER.map(([classId, studentId, displayAlias]) => [studentId, { classId, displayAlias }]));
  const repaired = rows.map((row) => {
    const expected = rosterById.get(row.studentId);
    if (!expected || row.classId !== expected.classId) return row;
    return { ...row, studentName: expected.displayAlias };
  });
  const header = ["class", "classId", "studentId", "studentName", "password", "note"];
  const body = [header, ...repaired.map((row) => header.map((key) => row[key] ?? ""))]
    .map((row) => row.map(csvCell).join(","))
    .join("\n") + "\n";
  fs.writeFileSync(loginSheetPath, body, "utf8");
  const excelPath = path.join(os.homedir(), "Reading-Run-Staging-Admin-Accounts.csv");
  fs.writeFileSync(excelPath, `\uFEFF${body}`, "utf8");
  console.log(`Repaired private login sheet: ${loginSheetPath}`);
  console.log(`Rebuilt Excel-friendly admin copy: ${excelPath}`);
}

function parseCsv(text) {
  const lines = String(text || "").replace(/^\uFEFF/u, "").split(/\r?\n/u).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function splitCsvLine(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}
