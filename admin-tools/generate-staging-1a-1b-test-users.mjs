import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// STAGING TEST DATA ONLY. All display names below are fictional.
// 1A total = existing TEST001 + 25 generated accounts.
// 1B total = 26 generated accounts.
const TEST001 = Object.freeze({ classId: "C01", studentId: "TEST001", displayAlias: "陳悅晴" });

const CLASS_1A = Object.freeze([
  ["TEST002", "李俊熙"], ["TEST003", "黃芷晴"], ["TEST004", "張宇軒"], ["TEST005", "林凱晴"],
  ["TEST006", "何子謙"], ["TEST007", "梁詠恩"], ["TEST008", "吳柏霖"], ["TEST009", "周曉彤"],
  ["TEST010", "鄭睿希"], ["TEST011", "楊樂瑤"], ["TEST012", "蔡承軒"], ["TEST013", "馮可嵐"],
  ["TEST014", "羅希然"], ["TEST015", "曾梓晴"], ["TEST016", "葉浩然"], ["TEST017", "許心妍"],
  ["TEST018", "謝卓謙"], ["TEST019", "郭映彤"], ["TEST020", "蘇文軒"], ["TEST021", "鄧芊瑜"],
  ["TEST022", "彭樂言"], ["TEST023", "盧俊熙"], ["TEST024", "方穎琳"], ["TEST025", "伍皓天"],
  ["TEST026", "莫子晴"],
]);

const CLASS_1B = Object.freeze([
  ["TEST101", "陳柏言"], ["TEST102", "李欣妍"], ["TEST103", "黃俊皓"], ["TEST104", "張樂晴"],
  ["TEST105", "林子瑜"], ["TEST106", "何梓謙"], ["TEST107", "梁思穎"], ["TEST108", "吳承希"],
  ["TEST109", "周凱琳"], ["TEST110", "鄭浩宇"], ["TEST111", "楊芷晴"], ["TEST112", "蔡樂軒"],
  ["TEST113", "馮詠恩"], ["TEST114", "羅俊然"], ["TEST115", "曾穎彤"], ["TEST116", "葉文希"],
  ["TEST117", "許梓晴"], ["TEST118", "謝浩然"], ["TEST119", "郭映希"], ["TEST120", "蘇思妍"],
  ["TEST121", "鄧柏謙"], ["TEST122", "彭可晴"], ["TEST123", "盧子軒"], ["TEST124", "方樂瑤"],
  ["TEST125", "伍俊希"], ["TEST126", "莫心妍"],
]);

const outputDir = path.dirname(fileURLToPath(import.meta.url));
const importPath = path.join(outputDir, "staging-1a-1b-users.private.csv");
const loginSheetPath = path.join(outputDir, "staging-1a-1b-login-sheet.private.csv");
const existingTest001Password = String(process.env.READING_RUN_TEST001_PASSWORD || "").trim();

if (!existingTest001Password) {
  throw new Error("READING_RUN_TEST001_PASSWORD is required so the private admin login sheet includes TEST001.");
}

const generated = [
  ...CLASS_1A.map(([studentId, displayAlias]) => makeStudent("C01", studentId, displayAlias)),
  ...CLASS_1B.map(([studentId, displayAlias]) => makeStudent("C02", studentId, displayAlias)),
];

if (generated.length !== 51 || CLASS_1A.length !== 25 || CLASS_1B.length !== 26) {
  throw new Error("Unexpected staging roster size.");
}

const importHeader = ["role", "classId", "studentId", "email", "pin", "displayAlias", "active"];
const importRows = generated.map((student) => [
  "student", student.classId, student.studentId, "", student.password, student.displayAlias, "true",
]);

const loginHeader = ["class", "classId", "studentId", "studentName", "password", "note"];
const loginRows = [
  ["1A", TEST001.classId, TEST001.studentId, TEST001.displayAlias, existingTest001Password, "existing staging account"],
  ...generated.map((student) => [
    student.classId === "C01" ? "1A" : "1B",
    student.classId,
    student.studentId,
    student.displayAlias,
    student.password,
    "staging test account",
  ]),
];

fs.writeFileSync(importPath, csv([importHeader, ...importRows]), { encoding: "utf8", mode: 0o600 });
fs.writeFileSync(loginSheetPath, csv([loginHeader, ...loginRows]), { encoding: "utf8", mode: 0o600 });

console.log("Created private staging files (not for GitHub):");
console.log(`- Import CSV: ${importPath}`);
console.log(`- Admin login sheet: ${loginSheetPath}`);
console.log("Roster target: 1A = TEST001 + 25 new = 26; 1B = 26 new.");
console.log("Passwords are unique and only stored in the private local CSV files above.");

function makeStudent(classId, studentId, displayAlias) {
  return Object.freeze({
    classId,
    studentId,
    displayAlias,
    password: `Rr26!${randomBytes(10).toString("base64url")}`,
  });
}

function csv(rows) {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}
