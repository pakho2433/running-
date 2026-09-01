import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const args = process.argv.slice(2);
const valueAfter = (flag, fallback = "") => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const projectId = valueAfter("--project", process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "");
const schoolYear = valueAfter("--school-year", "2026-2027");
const dryRun = args.includes("--dry-run");
if (!projectId) throw new Error("Use --project <firebase-project-id>.");
if (!/^\d{4}-\d{4}$/.test(schoolYear)) throw new Error("Invalid --school-year.");

initializeApp({ credential: applicationDefault(), projectId });
const db = getFirestore();

const snapshot = await db.collection("bookLogs")
  .where("schoolYear", "==", schoolYear)
  .select("studentKey", "authUid", "readingDate", "distanceAwarded")
  .get();

const byStudent = new Map();
for (const document of snapshot.docs) {
  const data = document.data() || {};
  const studentKey = String(data.studentKey || (data.authUid ? `${schoolYear}__${data.authUid}` : ""));
  const date = String(data.readingDate || "");
  if (!studentKey || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
  const distance = Number(data.distanceAwarded || 0);
  if (!byStudent.has(studentKey)) byStudent.set(studentKey, { distance: {} });
  const row = byStudent.get(studentKey);
  row.distance[date] = Number(row.distance[date] || 0) + (Number.isFinite(distance) && distance > 0 ? distance : 0);
}

console.log(`Found ${snapshot.size} reading logs across ${byStudent.size} students for ${schoolYear}.`);
if (dryRun) {
  console.log("Dry run only; no student documents were changed.");
  process.exit(0);
}

const entries = [...byStudent.entries()];
for (let offset = 0; offset < entries.length; offset += 400) {
  const batch = db.batch();
  entries.slice(offset, offset + 400).forEach(([studentKey, row]) => {
    batch.set(db.doc(`students/${studentKey}`), {
      dailyDistanceByDate: row.distance,
      analyticsBackfilledAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });
  await batch.commit();
  console.log(`Updated ${Math.min(offset + 400, entries.length)} / ${entries.length} student analytics documents.`);
}
console.log("✅ Librarian daily analytics backfill complete.");
