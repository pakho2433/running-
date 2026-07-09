import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(process.argv[2] || path.join(__dirname, "users.generated.csv"));
const schoolCode = String(process.env.READING_RUN_SCHOOL_CODE || "scysps").toLowerCase().replace(/[^a-z0-9-]/g, "");
const studentsPerClass = positiveInteger(process.env.STUDENTS_PER_CLASS, 26);
const pinLength = Math.max(6, positiveInteger(process.env.PIN_LENGTH, 8));
const prefix = String(process.env.STUDENT_ID_PREFIX || "S").toUpperCase().replace(/[^A-Z0-9]/g, "") || "S";

const classes = [
  ["C01", "1A"],
  ["C02", "1B"],
  ["C03", "2A"],
  ["C04", "2B"],
  ["C05", "2C"],
  ["C06", "3A"],
  ["C07", "3B"],
  ["C08", "3C"],
  ["C09", "4A"],
  ["C10", "4B"],
  ["C11", "4C"],
  ["C12", "5A"],
  ["C13", "5B"],
  ["C14", "5C"],
  ["C15", "6A"],
  ["C16", "6B"],
  ["C17", "6C"],
];

const rows = [["role", "classId", "studentId", "email", "pin", "active", "className"]];

for (const [classId, className] of classes) {
  for (let number = 1; number <= studentsPerClass; number += 1) {
    const studentId = `${prefix}${String(number).padStart(4, "0")}`;
    const email = `${schoolCode}.${classId}.${studentId}@students.readingrun.invalid`;
    rows.push(["student", classId, studentId, email, randomPin(pinLength), "true", className]);
  }
}

fs.writeFileSync(outputPath, `${rows.map(toCsvLine).join("\n")}\n`, "utf8");
console.log(`Created ${rows.length - 1} student accounts at ${outputPath}`);
console.log("Do not commit real generated PINs to GitHub. Keep this CSV private and import it into Firebase from your computer.");

function randomPin(length) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "";
  for (let i = 0; i < length; i += 1) {
    value += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return value;
}

function toCsvLine(values) {
  return values.map((value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(",");
}

function positiveInteger(value, fallback) {
  const number = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
